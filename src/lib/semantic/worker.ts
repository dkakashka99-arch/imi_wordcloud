import { z } from 'zod';
import { database } from '@/db/client';
import { AiError, gigaClient, semanticModelPreference, type GigaClient } from '@/lib/ai/client';
import { sensitive } from '@/lib/ai/validation';
import { deterministicCategory, RULE_VERSION } from './rules';
import { classify } from './classifier';

const resultSchema = z
  .object({
    matches: z
      .array(
        z.object({
          source: z.string(),
          target: z.string(),
          relation: z.enum(['synonym', 'abbreviation', 'spelling']),
        }),
      )
      .max(12),
  })
  .strict();
export type SemanticMatch = z.infer<typeof resultSchema>['matches'][number];
export function validateMatches(value: unknown, sources: string[], candidates: string[]) {
  const parsed = resultSchema.parse(value);
  const seen = new Set<string>();
  for (const match of parsed.matches) {
    if (
      !sources.includes(match.source) ||
      !candidates.includes(match.target) ||
      match.source === match.target ||
      seen.has(match.source)
    )
      throw new AiError('invalid_response');
    seen.add(match.source);
  }
  // A target must stay canonical: no chains/cycles, including within this batch.
  if (parsed.matches.some((m) => seen.has(m.target))) throw new AiError('invalid_response');
  return parsed.matches;
}

export async function semanticTick(
  generator?: Pick<GigaClient, 'model' | 'generate'>,
  onlyQuestionId?: string,
) {
  if (!generator && process.env.GIGACHAT_ENABLED !== 'true') return;
  const c = await database().connect();
  let locked = false;
  let questionId: string | undefined;
  let sources: string[] = [];
  try {
    // Same global budget as organizer AI tasks; no concurrent provider bursts.
    locked = (await c.query('SELECT pg_try_advisory_lock(714021,4) locked')).rows[0].locked;
    if (!locked) return;
    const first = await c.query(
      `SELECT sq.question_id,q.title,q.semantic_revision FROM semantic_queue sq JOIN questions q ON q.id=sq.question_id JOIN events e ON e.id=q.event_id WHERE sq.status='pending' AND sq.available_at<=now() AND NOT e.archived AND ($1::uuid IS NULL OR sq.question_id=$1) ORDER BY sq.available_at LIMIT 1`,
      [onlyQuestionId || null],
    );
    if (!first.rowCount) return;
    const question = first.rows[0];
    questionId = question.question_id;
    const batch = await c.query(
      `SELECT source FROM semantic_queue WHERE question_id=$1 AND status='pending' AND available_at<=now() ORDER BY available_at LIMIT 12`,
      [questionId],
    );
    sources = batch.rows.map((r) => r.source).filter((s) => !sensitive(s));
    const excluded = batch.rows.map((r) => r.source).filter((s) => sensitive(s));
    if (excluded.length)
      await c.query(
        "UPDATE semantic_queue SET status='review',error='sensitive_input' WHERE question_id=$1 AND source=ANY($2::text[])",
        [questionId, excluded],
      );
    if (!sources.length) return;
    // Existing answers are backfilled by migration. Apply known rules without provider work.
    await c.query('BEGIN');
    const lockedQuestion = (
      await c.query('SELECT title,semantic_revision FROM questions WHERE id=$1 FOR UPDATE', [
        questionId,
      ])
    ).rows[0];
    question.title = lockedQuestion.title;
    question.semantic_revision = lockedQuestion.semantic_revision;
    const knownSources: string[] = [];
    for (const source of sources) {
      const known = await c.query(
        'SELECT 1 FROM word_aliases WHERE question_id=$1 AND source=$2 UNION ALL SELECT 1 FROM semantic_history WHERE question_id=$1 AND source=$2 LIMIT 1',
        [questionId, source],
      );
      let target = deterministicCategory(question.title, source);
      if (!known.rowCount && !target) continue;
      if (!known.rowCount && target) {
        target =
          (
            await c.query('SELECT target FROM word_aliases WHERE question_id=$1 AND source=$2', [
              questionId,
              target,
            ])
          ).rows[0]?.target || target;
        if (source !== target) {
          await c.query(
            'INSERT INTO word_aliases(question_id,source,target) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
            [questionId, source, target],
          );
          await c.query(
            'INSERT INTO semantic_history(question_id,source,target,method,version) SELECT question_id,source,$3,$4,$5 FROM word_aliases WHERE question_id=$1 AND target=$2',
            [questionId, source, target, 'dictionary-flatten', RULE_VERSION],
          );
          await c.query('UPDATE word_aliases SET target=$3 WHERE question_id=$1 AND target=$2', [
            questionId,
            source,
            target,
          ]);
        }
        await c.query(
          'INSERT INTO semantic_history(question_id,source,target,method,version) VALUES($1,$2,$3,$4,$5)',
          [questionId, source, target, 'dictionary', RULE_VERSION],
        );
      }
      knownSources.push(source);
    }
    if (knownSources.length) {
      await c.query(
        "UPDATE semantic_queue SET status='completed',error=NULL WHERE question_id=$1 AND source=ANY($2::text[])",
        [questionId, knownSources],
      );
      await c.query('UPDATE questions SET revision=revision+1 WHERE id=$1', [questionId]);
    }
    await c.query('COMMIT');
    sources = sources.filter((source) => !knownSources.includes(source));
    if (!sources.length) return;
    // Lease survives restart. The advisory lock prevents another live worker stealing it.
    await c.query(
      `UPDATE semantic_queue SET available_at=now()+interval '2 minutes',attempts=attempts+1 WHERE question_id=$1 AND source=ANY($2::text[])`,
      [questionId, sources],
    );
    const rows = await c.query(
      `SELECT COALESCE(wa.target,s.canonical_key) text,count(*) n FROM submissions s LEFT JOIN word_aliases wa ON wa.question_id=s.question_id AND wa.source=s.canonical_key WHERE s.question_id=$1 AND s.approved AND s.original_text !~ '^[А-ЯЁ][а-яё]+[[:space:]]+[А-ЯЁ][а-яё]+' GROUP BY 1 ORDER BY n DESC, text LIMIT 150`,
      [questionId],
    );
    const candidates: string[] = rows.rows.map((r) => r.text).filter((s) => !sensitive(s));
    const ai = generator || gigaClient(),
      model = await ai.model(generator ? undefined : semanticModelPreference());
    const classification = await classify(ai, model, question.title, sources, candidates);
    const { matches } = classification;
    console.info(
      JSON.stringify({
        event: 'semantic_validation',
        rejected: classification.rejected,
        accepted: matches.length,
      }),
    );
    await c.query('BEGIN');
    const current = await c.query(
      'SELECT semantic_revision,title FROM questions WHERE id=$1 FOR UPDATE',
      [questionId],
    );
    if (
      current.rows[0]?.semantic_revision !== question.semantic_revision ||
      current.rows[0]?.title !== question.title
    ) {
      await c.query('ROLLBACK');
      return;
    }
    for (const match of matches) {
      const targetAlias = await c.query(
        'SELECT 1 FROM word_aliases WHERE question_id=$1 AND source=$2',
        [questionId, match.target],
      );
      if (targetAlias.rowCount) continue;
      const inserted = await c.query(
        'INSERT INTO word_aliases(question_id,source,target) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING source',
        [questionId, match.source, match.target],
      );
      if (inserted.rowCount) {
        await c.query(
          'INSERT INTO semantic_history(question_id,source,target,method,version) SELECT question_id,source,$3,$4,$5 FROM word_aliases WHERE question_id=$1 AND target=$2',
          [questionId, match.source, match.target, 'gigachat-flatten', model],
        );
        await c.query('UPDATE word_aliases SET target=$3 WHERE question_id=$1 AND target=$2', [
          questionId,
          match.source,
          match.target,
        ]);
        await c.query(
          'INSERT INTO semantic_history(question_id,source,target,method,version) VALUES($1,$2,$3,$4,$5)',
          [questionId, match.source, match.target, 'gigachat-double-validation', model],
        );
      }
    }
    await c.query(
      `UPDATE semantic_queue SET status='review',error='no_equivalent',error_detail=NULL WHERE question_id=$1 AND source=ANY($2::text[])`,
      [questionId, sources],
    );
    await c.query(
      `UPDATE semantic_queue SET status='completed',error=NULL,error_detail=NULL WHERE question_id=$1 AND source IN(SELECT source FROM word_aliases WHERE question_id=$1)`,
      [questionId],
    );
    if (classification.affected.length)
      await c.query(
        "UPDATE semantic_queue SET status=CASE WHEN attempts<3 THEN 'pending' ELSE 'review' END,error='invalid_mapping',error_detail='PAIR_VALIDATION',available_at=now()+make_interval(secs=>LEAST(900,20*power(2,LEAST(attempts,5)))) WHERE question_id=$1 AND source=ANY($2::text[]) AND status!='completed'",
        [questionId, classification.affected],
      );
    await c.query('UPDATE questions SET revision=revision+1 WHERE id=$1', [questionId]);
    await c.query('COMMIT');
    console.info(
      JSON.stringify({
        event: 'semantic_batch',
        count: sources.length,
        merged: matches.length,
        model,
      }),
    );
  } catch (error) {
    await c.query('ROLLBACK').catch(() => {});
    const code =
      error instanceof AiError
        ? error.code
        : error instanceof z.ZodError
          ? 'invalid_response'
          : 'processing';
    const detail =
      error instanceof AiError
        ? error.detail
        : error instanceof z.ZodError
          ? 'RESULT_SCHEMA'
          : 'WORKER';
    const temporary = ['quota', 'unavailable', 'network', 'timeout', 'authorization'].includes(
      code,
    );
    const limit = temporary ? 6 : 3;
    if (questionId && sources.length)
      await c
        .query(
          `UPDATE semantic_queue SET error=$3,error_detail=$4,status=CASE WHEN attempts<$5 THEN 'pending' ELSE 'review' END,available_at=now()+make_interval(secs=>LEAST(900,20*power(2,LEAST(attempts,5)))) WHERE question_id=$1 AND source=ANY($2::text[]) AND status='pending'`,
          [questionId, sources, code, detail, limit],
        )
        .catch(() => {});
    console.warn(
      JSON.stringify({
        event: 'semantic_retry',
        code,
        detail,
        temporary,
        limit,
      }),
    );
  } finally {
    if (locked) await c.query('SELECT pg_advisory_unlock(714021,4)').catch(() => {});
    c.release();
  }
}

export function startSemanticWorker() {
  const runtime = globalThis as typeof globalThis & { semanticWorkerStarted?: boolean };
  if (runtime.semanticWorkerStarted) return;
  runtime.semanticWorkerStarted = true;
  const tick = async () => {
    try {
      await semanticTick();
    } catch {
      console.warn('Semantic worker unavailable; queue retained');
    }
    setTimeout(tick, 2000).unref();
  };
  setTimeout(tick, 2000).unref();
}
