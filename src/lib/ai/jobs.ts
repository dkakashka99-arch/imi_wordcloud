import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { database } from '@/db/client';
import { HttpError } from '@/lib/http';
import { AiError, aiConfig, availability, gigaClient, type GigaClient } from './client';
import { prompt, responseSchema, sensitive, validateResult } from './validation';
import {
  aliasResult,
  moderationResult,
  summaryResult,
  type AiCommand,
  type AiJob,
  type AiState,
  type Snapshot,
  type TaskKind,
} from './contracts';
const columns = `id,kind,model,status,revision::float8,review_revision::float8 "reviewRevision",snapshot,result,decisions,usage,error,created_at "createdAt",finished_at "finishedAt"`;
async function question(c: PoolClient, eventId: string, questionId: string, lock = false) {
  const e = await c.query(`SELECT archived FROM events WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [
    eventId,
  ]);
  if (!e.rowCount) throw new HttpError(404, 'Мероприятие не найдено.');
  const q = await c.query(
    `SELECT revision::float8,ai_summary,ai_summary_revision::float8 FROM questions WHERE event_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`,
    [eventId, questionId],
  );
  if (!q.rowCount) throw new HttpError(404, 'Вопрос не найден.');
  if (lock && e.rows[0].archived) throw new HttpError(409, 'Сначала восстановите мероприятие.');
  return { archived: e.rows[0].archived, ...q.rows[0] };
}
async function snapshot(
  c: PoolClient,
  eventId: string,
  questionId: string,
  maxWords: number,
  kind: TaskKind = 'moderation',
): Promise<Snapshot> {
  const q = await question(c, eventId, questionId);
  const groups = await c.query('SELECT id,label FROM audiences WHERE event_id=$1 ORDER BY key', [
    eventId,
  ]);
  const indexes = new Map(groups.rows.map((g, i) => [g.id, i + 1]));
  const rows = await c.query(
    `SELECT COALESCE(wa.target,s.canonical_key) text,s.audience_id,count(*)::int count,bool_or(s.original_text ~ '^[А-ЯЁ][а-яё]+[[:space:]]+[А-ЯЁ][а-яё]+([[:space:]]|$)') named FROM submissions s LEFT JOIN word_aliases wa ON wa.question_id=s.question_id AND wa.source=s.canonical_key WHERE s.question_id=$1 AND ($2::boolean OR (s.approved AND NOT EXISTS(SELECT 1 FROM stop_words sw WHERE sw.question_id=s.question_id AND sw.word IN(s.canonical_key,COALESCE(wa.target,s.canonical_key))))) GROUP BY COALESCE(wa.target,s.canonical_key),s.audience_id ORDER BY count DESC,text LIMIT 3001`,
    [questionId, kind === 'moderation'],
  );
  if (rows.rowCount === 3001)
    throw new HttpError(413, 'Слишком много разных ответов для одного AI-анализа.');
  const words = new Map<
    string,
    { text: string; count: number; groups: { group: number; count: number }[]; named: boolean }
  >();
  for (const r of rows.rows) {
    let w = words.get(r.text);
    if (!w) {
      w = { text: r.text, count: 0, groups: [], named: false };
      words.set(r.text, w);
    }
    w.count += r.count;
    w.named ||= r.named;
    w.groups.push({ group: indexes.get(r.audience_id)!, count: r.count });
  }
  const safe = [...words.values()]
    .filter((w) => !w.named && !sensitive(w.text))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'ru'))
    .slice(0, maxWords)
    .map(({ text, count, groups }) => ({
      text,
      count,
      groups: groups.sort((a, b) => a.group - b.group),
    }));
  return {
    revision: q.revision,
    words: safe,
    groups: groups.rows.map((g, i) => ({ group: i + 1, label: g.label })),
    omitted: words.size - safe.length,
    totalWords: words.size,
  };
}
export async function aiState(
  eventId: string,
  questionId: string,
  kind: TaskKind = 'moderation',
): Promise<AiState> {
  const c = await database().connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const q = await question(c, eventId, questionId);
    const max = Number(process.env.GIGACHAT_MAX_INPUT_WORDS || 150);
    const data = await snapshot(
      c,
      eventId,
      questionId,
      Number.isInteger(max) && max > 0 && max <= 300 ? max : 150,
      kind,
    );
    const jobs = await c.query<AiJob>(
      `SELECT ${columns} FROM ai_jobs WHERE question_id=$1 ORDER BY created_at DESC,id DESC LIMIT 12`,
      [questionId],
    );
    const usage = await c.query(
      `SELECT COALESCE(sum(COALESCE((usage->>'total_tokens')::bigint,0)),0)::float8 n FROM ai_jobs WHERE question_id=$1`,
      [questionId],
    );
    await c.query('COMMIT');
    return {
      ...availability(),
      snapshot: data,
      jobs: jobs.rows,
      published: !!q.ai_summary && q.ai_summary_revision === q.revision,
      totalTokens: usage.rows[0].n,
    };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
type Generator = Pick<GigaClient, 'model' | 'generate'>;
export async function startAnalysis(
  eventId: string,
  questionId: string,
  adminId: string,
  cmd: Extract<AiCommand, { action: 'start' }>,
  testClient?: Generator,
) {
  // A test double is injected explicitly by integration tests, never by configuration/HTTP.
  const config = testClient ? { maxWords: 150 } : aiConfig();
  const client = testClient ?? gigaClient();
  const c = await database().connect();
  let locked = false,
    jobId: string | undefined;
  try {
    const lock = await c.query('SELECT pg_try_advisory_lock(714021,4) locked');
    locked = lock.rows[0].locked;
    if (!locked) throw new HttpError(429, 'Другой AI-анализ уже выполняется. Повторите позже.');
    const q = await question(c, eventId, questionId);
    if (q.archived) throw new HttpError(409, 'Сначала восстановите мероприятие.');
    // Once the global session lock is available, no previous owner is still generating.
    await c.query(
      `UPDATE ai_jobs SET status='failed',error='interrupted',finished_at=now() WHERE status='running'`,
    );
    const model = await client.model();
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    let data: Snapshot;
    try {
      data = await snapshot(c, eventId, questionId, config.maxWords, cmd.kind);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
    const selected = new Set(cmd.words);
    if (
      selected.size !== cmd.words.length ||
      cmd.words.some((w) => !data.words.some((v) => v.text === w))
    )
      throw new HttpError(409, 'Список ответов изменился. Обновите данные и проверьте слова.');
    data.words = data.words.filter((w) => selected.has(w.text));
    data.omitted = data.totalWords - data.words.length;
    if (!data.words.length) throw new HttpError(400, 'Нет слов для анализа.');
    const cache = createHash('sha256')
      .update(JSON.stringify([questionId, data.revision, cmd.kind, model, data.words]))
      .digest('hex');
    const cached = await c.query(
      "SELECT id FROM ai_jobs WHERE question_id=$1 AND cache_key=$2 AND status='completed' ORDER BY created_at DESC LIMIT 1",
      [questionId, cache],
    );
    if (cached.rowCount) return { id: cached.rows[0].id, cached: true };
    const rate = await c.query(
      `SELECT count(*)::int n FROM ai_jobs WHERE created_at>now()-interval '1 minute'`,
    );
    const recent = await c.query(
      `SELECT id FROM ai_jobs WHERE question_id=$1 AND created_at>now()-interval '20 seconds' LIMIT 1`,
      [questionId],
    );
    if (rate.rows[0].n >= 6 || recent.rowCount)
      throw new HttpError(429, 'Слишком частые AI-запросы. Подождите минуту.');
    const created = await c.query(
      `INSERT INTO ai_jobs(question_id,admin_id,kind,model,status,revision,review_revision,cache_key,snapshot) VALUES($1,$2,$3,$4,'running',$5,$5,$6,$7::jsonb) RETURNING id`,
      [questionId, adminId, cmd.kind, model, data.revision, cache, JSON.stringify(data)],
    );
    jobId = created.rows[0].id;
    // No event/question transaction or row lock is held during the external request.
    const output = await client.generate(
      model,
      prompt(cmd.kind),
      { words: data.words },
      responseSchema(cmd.kind),
    );
    const result = validateResult(cmd.kind, output.result, data);
    await c.query(
      `UPDATE ai_jobs SET status='completed',result=$2::jsonb,usage=$3::jsonb,finished_at=now() WHERE id=$1`,
      [jobId, JSON.stringify(result), JSON.stringify(output.usage)],
    );
    return { id: jobId, cached: false };
  } catch (e) {
    if (jobId) {
      await c.query(`UPDATE ai_jobs SET status='failed',error=$2,finished_at=now() WHERE id=$1`, [
        jobId,
        e instanceof AiError ? e.code : 'unavailable',
      ]);
      return { id: jobId, cached: false };
    }
    if (e instanceof AiError)
      throw new HttpError(
        e.code === 'quota' ? 429 : 503,
        'ИИ временно недоступен. Опрос продолжает работать.',
      );
    throw e;
  } finally {
    let broken = false;
    try {
      if (locked) await c.query('SELECT pg_advisory_unlock(714021,4)');
    } catch {
      broken = true;
    } finally {
      c.release(broken);
    }
  }
}
export async function reviewAnalysis(
  eventId: string,
  questionId: string,
  cmd: Exclude<AiCommand, { action: 'start' }>,
) {
  const c = await database().connect();
  try {
    await c.query('BEGIN');
    const q = await question(c, eventId, questionId, true);
    if (cmd.action === 'unpublish') {
      await c.query(
        'UPDATE questions SET ai_summary=NULL,ai_summary_revision=NULL,revision=revision+1 WHERE id=$1',
        [questionId],
      );
      await c.query('COMMIT');
      return { saved: true };
    }
    const r = await c.query<AiJob>(
      `SELECT ${columns} FROM ai_jobs WHERE id=$1 AND question_id=$2 FOR UPDATE`,
      [cmd.jobId, questionId],
    );
    const job = r.rows[0];
    if (!job) throw new HttpError(404, 'AI-задание не найдено.');
    if (cmd.action === 'discard') {
      await c.query(
        "UPDATE questions SET ai_summary=NULL,ai_summary_revision=NULL,revision=revision+1 WHERE id=$1 AND ai_summary->>'jobId'=$2",
        [questionId, job.id],
      );
      await c.query(`UPDATE ai_jobs SET status='discarded' WHERE id=$1 AND status<>'running'`, [
        job.id,
      ]);
      await c.query('COMMIT');
      return { saved: true };
    }
    if (job.status !== 'completed' || job.reviewRevision !== q.revision)
      throw new HttpError(409, 'Данные изменились после анализа. Запустите новый анализ.');
    let changed = false;
    if (cmd.action === 'publish') {
      if (job.kind !== 'summary') throw new HttpError(400, 'Это не резюме.');
      const result = summaryResult.parse(job.result);
      await c.query(
        'UPDATE questions SET ai_summary=$2::jsonb,revision=revision+1,ai_summary_revision=revision+1 WHERE id=$1',
        [
          questionId,
          JSON.stringify({
            points: result.points,
            groups: job.snapshot.groups,
            model: job.model,
            analyzedAt: job.finishedAt,
            jobId: job.id,
          }),
        ],
      );
      changed = true;
    } else {
      if (job.decisions[String(cmd.index)]) throw new HttpError(409, 'Решение уже принято.');
      if (job.kind === 'summary')
        throw new HttpError(400, 'Для резюме используйте публикацию целиком.');
      if (job.kind === 'aliases') {
        const suggestion = aliasResult.parse(job.result).suggestions[cmd.index];
        if (!suggestion) throw new HttpError(400, 'Предложение не найдено.');
        if (cmd.accept) {
          const aliases = await c.query(
            'SELECT source,target FROM word_aliases WHERE question_id=$1',
            [questionId],
          );
          // Existing aliases that resolve to a merged word must be flattened as well.
          for (const a of aliases.rows) {
            if (suggestion.source.includes(a.target))
              await c.query(
                'UPDATE word_aliases SET target=$3 WHERE question_id=$1 AND source=$2',
                [questionId, a.source, suggestion.suggestedCanonical],
              );
          }
          for (const word of suggestion.source) {
            if (word === suggestion.suggestedCanonical) continue;
            await c.query(
              'INSERT INTO word_aliases(question_id,source,target) VALUES($1,$2,$3) ON CONFLICT(question_id,source) DO UPDATE SET target=EXCLUDED.target',
              [questionId, word, suggestion.suggestedCanonical],
            );
          }
          changed = true;
        }
      } else {
        const suggestion = moderationResult.parse(job.result).suggestions[cmd.index];
        if (!suggestion) throw new HttpError(400, 'Предложение не найдено.');
        if (cmd.accept) {
          await c.query(
            `UPDATE submissions s SET approved=false WHERE s.question_id=$1 AND COALESCE((SELECT wa.target FROM word_aliases wa WHERE wa.question_id=s.question_id AND wa.source=s.canonical_key),s.canonical_key)=$2`,
            [questionId, suggestion.word],
          );
          changed = true;
        }
      }
      await c.query('UPDATE ai_jobs SET decisions=decisions||$2::jsonb WHERE id=$1', [
        job.id,
        JSON.stringify({ [cmd.index]: cmd.accept ? 'accepted' : 'rejected' }),
      ]);
      if (changed)
        await c.query('UPDATE questions SET revision=revision+1 WHERE id=$1', [questionId]);
    }
    if (changed)
      await c.query('UPDATE ai_jobs SET review_revision=$2 WHERE id=$1', [job.id, q.revision + 1]);
    await c.query('COMMIT');
    return { saved: true };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
