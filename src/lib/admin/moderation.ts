import { z } from 'zod';
import { database } from '@/db/client';
import { HttpError } from '@/lib/http';
import { normalizeWord } from '@/lib/normalize';
const word = z.string().min(1).max(240);
export const moderationInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('retrySemantic') }).strict(),
  z
    .object({ action: z.literal('visibility'), submissionId: z.uuid(), approved: z.boolean() })
    .strict(),
  z
    .object({
      action: z.literal('rules'),
      premoderation: z.boolean(),
      stopWords: z.array(word).max(200),
      aliases: z.array(z.object({ source: word, target: word }).strict()).max(200),
    })
    .strict(),
]);
export type ModerationCommand = z.infer<typeof moderationInput>;
export type ModerationState = {
  premoderation: boolean;
  stopWords: string[];
  aliases: { source: string; target: string }[];
  semantic: { pending: number; review: number; errors: number };
  total: number;
  page: number;
  submissions: {
    id: string;
    originalText: string;
    canonicalKey: string;
    audience: string;
    approved: boolean;
    isDemo: boolean;
    createdAt: string;
  }[];
};
export function normalizeRules(input: Extract<ModerationCommand, { action: 'rules' }>) {
  const clean = (s: string) => {
    const n = normalizeWord(s);
    if (!/[\p{L}\p{N}]/u.test(n) || Array.from(n).length > 120)
      throw new HttpError(
        400,
        'Правило должно содержать слово или короткую фразу до 120 символов.',
      );
    return n;
  };
  const aliases = input.aliases.map((a) => ({ source: clean(a.source), target: clean(a.target) }));
  const sources = new Set(aliases.map((a) => a.source));
  if (
    sources.size !== aliases.length ||
    aliases.some((a) => a.source === a.target || sources.has(a.target))
  )
    throw new HttpError(
      400,
      'Укажите уникальные исходные слова и конечные названия без цепочек и циклов.',
    );
  return { stopWords: [...new Set(input.stopWords.map(clean))], aliases };
}
export async function moderationState(
  eventId: string,
  questionId: string,
  page = 0,
): Promise<ModerationState> {
  const c = await database().connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const q = await c.query('SELECT premoderation FROM questions WHERE event_id=$1 AND id=$2', [
      eventId,
      questionId,
    ]);
    if (!q.rowCount) throw new HttpError(404, 'Вопрос не найден.');
    const stops = await c.query('SELECT word FROM stop_words WHERE question_id=$1 ORDER BY word', [
      questionId,
    ]);
    const aliases = await c.query(
      'SELECT source,target FROM word_aliases WHERE question_id=$1 ORDER BY source',
      [questionId],
    );
    const count = await c.query(
      'SELECT count(*)::int total FROM submissions WHERE question_id=$1',
      [questionId],
    );
    const rows = await c.query(
      `SELECT s.id,s.original_text "originalText",s.canonical_key "canonicalKey",a.label audience,s.approved,s.is_demo "isDemo",s.created_at "createdAt" FROM submissions s JOIN audiences a ON a.id=s.audience_id WHERE s.question_id=$1 ORDER BY s.created_at DESC,s.id DESC LIMIT 100 OFFSET $2`,
      [questionId, page * 100],
    );
    const queue = await c.query(
      "SELECT count(*) FILTER(WHERE status='pending')::int pending,count(*) FILTER(WHERE status='review')::int review,count(*) FILTER(WHERE error IS NOT NULL)::int errors FROM semantic_queue WHERE question_id=$1",
      [questionId],
    );
    await c.query('COMMIT');
    return {
      semantic: queue.rows[0],
      premoderation: q.rows[0].premoderation,
      stopWords: stops.rows.map((x) => x.word),
      aliases: aliases.rows,
      total: count.rows[0].total,
      page,
      submissions: rows.rows,
    };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function moderate(eventId: string, questionId: string, input: ModerationCommand) {
  const rules = input.action === 'rules' ? normalizeRules(input) : null;
  const c = await database().connect();
  try {
    await c.query('BEGIN');
    const e = await c.query('SELECT archived FROM events WHERE id=$1 FOR UPDATE', [eventId]);
    if (!e.rowCount) throw new HttpError(404, 'Мероприятие не найдено.');
    if (e.rows[0].archived) throw new HttpError(409, 'Сначала восстановите мероприятие.');
    const q = await c.query('SELECT id FROM questions WHERE event_id=$1 AND id=$2 FOR UPDATE', [
      eventId,
      questionId,
    ]);
    if (!q.rowCount) throw new HttpError(404, 'Вопрос не найден.');
    if (input.action === 'retrySemantic') {
      await c.query(
        "UPDATE semantic_queue SET status='pending',available_at=now(),error=NULL WHERE question_id=$1 AND status IN('pending','review')",
        [questionId],
      );
    } else if (input.action === 'visibility') {
      const s = await c.query(
        'UPDATE submissions SET approved=$3 WHERE question_id=$1 AND id=$2 RETURNING id',
        [questionId, input.submissionId, input.approved],
      );
      if (!s.rowCount) throw new HttpError(404, 'Ответ не найден.');
    } else if (rules) {
      await c.query('DELETE FROM stop_words WHERE question_id=$1', [questionId]);
      await c.query(
        "INSERT INTO semantic_history(question_id,source,target,method,version) SELECT question_id,source,source,'manual-reset','organizer-v1' FROM word_aliases WHERE question_id=$1",
        [questionId],
      );
      await c.query('DELETE FROM word_aliases WHERE question_id=$1', [questionId]);
      for (const word of rules.stopWords)
        await c.query('INSERT INTO stop_words(question_id,word) VALUES($1,$2)', [questionId, word]);
      for (const a of rules.aliases) {
        await c.query('INSERT INTO word_aliases(question_id,source,target) VALUES($1,$2,$3)', [
          questionId,
          a.source,
          a.target,
        ]);
        await c.query(
          "INSERT INTO semantic_history(question_id,source,target,method,version) VALUES($1,$2,$3,'manual','organizer-v1')",
          [questionId, a.source, a.target],
        );
      }
      await c.query('UPDATE questions SET premoderation=$2 WHERE id=$1', [
        questionId,
        input.premoderation,
      ]);
    }
    await c.query(
      'UPDATE questions SET revision=revision+1,semantic_revision=semantic_revision+1 WHERE id=$1',
      [questionId],
    );
    await c.query('COMMIT');
    return { saved: true };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
// Always quote cells; prefix spreadsheet expressions even when preceded by whitespace.
export function csvCell(value: unknown) {
  let s = String(value ?? '');
  if (/^[\s\uFEFF]*[=+@-]/u.test(s) || /^[\t\r\n]/u.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export async function exportAnswers(eventId: string, questionId: string, aggregate = false) {
  const c = await database().connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const q = await c.query('SELECT id FROM questions WHERE event_id=$1 AND id=$2', [
      eventId,
      questionId,
    ]);
    if (!q.rowCount) throw new HttpError(404, 'Вопрос не найден.');
    const count = await c.query('SELECT count(*)::int n FROM submissions WHERE question_id=$1', [
      questionId,
    ]);
    if (count.rows[0].n > 50000)
      throw new HttpError(
        413,
        'Вопрос слишком большой для экспорта. Обратитесь к администратору сервера.',
      );
    const rows = aggregate
      ? await c.query(
          `SELECT a.label,COALESCE(wa.target,s.canonical_key) word,s.is_demo,count(*)::int count FROM submissions s JOIN audiences a ON a.id=s.audience_id LEFT JOIN word_aliases wa ON wa.question_id=s.question_id AND wa.source=s.canonical_key WHERE s.question_id=$1 AND s.approved AND NOT EXISTS(SELECT 1 FROM stop_words sw WHERE sw.question_id=s.question_id AND sw.word IN(s.canonical_key,COALESCE(wa.target,s.canonical_key))) GROUP BY a.label,a.id,COALESCE(wa.target,s.canonical_key),s.is_demo ORDER BY a.label,count DESC,word`,
          [questionId],
        )
      : await c.query(
          `SELECT s.id,a.label,s.original_text,s.canonical_key,COALESCE(wa.target,s.canonical_key) word,s.approved,s.is_demo,s.created_at FROM submissions s JOIN audiences a ON a.id=s.audience_id LEFT JOIN word_aliases wa ON wa.question_id=s.question_id AND wa.source=s.canonical_key WHERE s.question_id=$1 ORDER BY s.created_at,s.id`,
          [questionId],
        );
    const headers = aggregate
      ? ['Группа', 'Слово', 'Репетиция', 'Частота']
      : [
          'ID ответа',
          'Группа',
          'Исходный ответ',
          'Нормализованный ответ',
          'Алиас',
          'Одобрен',
          'Репетиция',
          'Дата UTC',
        ];
    const lines = rows.rows.map((r) =>
      aggregate
        ? [r.label, r.word, r.is_demo, r.count]
        : [
            r.id,
            r.label,
            r.original_text,
            r.canonical_key,
            r.word,
            r.approved,
            r.is_demo,
            new Date(r.created_at).toISOString(),
          ],
    );
    await c.query('COMMIT');
    return (
      '\uFEFF' + [headers, ...lines].map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n'
    );
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
