import type { PoolClient } from 'pg';
import { database } from '@/db/client';
import { normalizeWord } from './normalize';
import { HttpError } from './http';
import type { ParticipantState, Question, ScreenState } from './contracts';

type QueryClient = Pick<PoolClient, 'query'>;
type Context = {
  event_id: string;
  title: string;
  slug: string;
  audience_id: string;
  audience_key: string;
  label: string;
};
async function context(
  slug: string,
  audience: string,
  client: QueryClient = database(),
): Promise<Context> {
  const result = await client.query<Context>(
    `SELECT e.id event_id,e.title,e.slug,a.id audience_id,a.key audience_key,a.label FROM events e JOIN audiences a ON a.event_id=e.id WHERE e.slug=$1 AND a.key=$2 AND NOT e.archived`,
    [slug, audience],
  );
  if (!result.rows[0]) throw new HttpError(404, 'Мероприятие или группа не найдены.');
  return result.rows[0];
}
async function activeQuestion(
  ctx: Context,
  client: QueryClient = database(),
): Promise<Question | null> {
  const r = await client.query<Question>(
    `SELECT q.id,q.title,q.status,q.max_answers "maxAnswers",q.max_length "maxLength",q.revision::integer FROM questions q JOIN question_audiences qa ON qa.question_id=q.id WHERE qa.audience_id=$1 AND qa.active`,
    [ctx.audience_id],
  );
  return r.rows[0] ?? null;
}
export async function participantState(
  slug: string,
  audience: string,
  hash: string,
): Promise<ParticipantState> {
  const ctx = await context(slug, audience);
  const question = await activeQuestion(ctx);
  const count = question
    ? await database().query(
        `SELECT count(*)::int n FROM submissions s JOIN participants p ON p.id=s.participant_id WHERE s.question_id=$1 AND p.event_id=$2 AND p.cookie_hash=$3`,
        [question.id, ctx.event_id, hash],
      )
    : null;
  return {
    event: { title: ctx.title, slug: ctx.slug },
    audience: { key: ctx.audience_key, label: ctx.label },
    question,
    remaining: question ? Math.max(0, question.maxAnswers - (count?.rows[0]?.n || 0)) : 0,
  };
}
export async function submit(
  slug: string,
  audience: string,
  hash: string,
  input: { questionId: string; text: string; idempotencyKey: string },
) {
  const key = normalizeWord(input.text);
  if (!/[\p{L}\p{N}]/u.test(key)) throw new HttpError(400, 'Напишите слово или короткую фразу.');
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    const ctx = await context(slug, audience, client);
    // Question lock serializes state transitions, quota checks and revision increments.
    const qr = await client.query(
      `SELECT q.* FROM questions q JOIN question_audiences qa ON qa.question_id=q.id WHERE q.id=$1 AND q.event_id=$2 AND qa.audience_id=$3 FOR UPDATE OF q`,
      [input.questionId, ctx.event_id, ctx.audience_id],
    );
    const q = qr.rows[0];
    if (!q) throw new HttpError(409, 'Вопрос изменился. Обновите страницу.');
    await client.query(
      `INSERT INTO participants(event_id,cookie_hash) VALUES($1,$2) ON CONFLICT(event_id,cookie_hash) DO NOTHING`,
      [ctx.event_id, hash],
    );
    const p = await client.query(
      `SELECT id FROM participants WHERE event_id=$1 AND cookie_hash=$2 FOR UPDATE`,
      [ctx.event_id, hash],
    );
    const participant = p.rows[0].id;
    const previous = await client.query(
      `SELECT id,canonical_key,audience_id FROM submission_requests WHERE question_id=$1 AND participant_id=$2 AND idempotency_key=$3`,
      [q.id, participant, input.idempotencyKey],
    );
    let duplicate = false;
    if (previous.rows[0]) {
      if (
        previous.rows[0].canonical_key !== key ||
        previous.rows[0].audience_id !== ctx.audience_id
      )
        throw new HttpError(409, 'Ключ повтора уже использован для другого ответа.');
      duplicate = true;
    } else {
      const membership = await client.query(
        'SELECT active FROM question_audiences WHERE question_id=$1 AND audience_id=$2',
        [q.id, ctx.audience_id],
      );
      if (!membership.rows[0]?.active || q.status !== 'open')
        throw new HttpError(409, 'Приём ответов приостановлен или вопрос изменился.');
      if (Array.from(key).length > q.max_length)
        throw new HttpError(400, `Не больше ${q.max_length} символов.`);
      const existing = await client.query(
        'SELECT id FROM submissions WHERE question_id=$1 AND participant_id=$2 AND canonical_key=$3',
        [q.id, participant, key],
      );
      if (existing.rowCount) duplicate = true;
      else {
        const count = await client.query(
          'SELECT count(*)::int n FROM submissions WHERE question_id=$1 AND participant_id=$2',
          [q.id, participant],
        );
        if (count.rows[0].n >= q.max_answers)
          throw new HttpError(409, 'Вы уже отправили максимальное число ответов.');
        await client.query(
          `INSERT INTO submissions(event_id,question_id,audience_id,participant_id,original_text,canonical_key,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [ctx.event_id, q.id, ctx.audience_id, participant, input.text, key, input.idempotencyKey],
        );
        await client.query('UPDATE questions SET revision=revision+1 WHERE id=$1', [q.id]);
      }
    }
    if (!previous.rowCount)
      await client.query(
        'INSERT INTO submission_requests(question_id,participant_id,audience_id,idempotency_key,canonical_key) VALUES($1,$2,$3,$4,$5)',
        [q.id, participant, ctx.audience_id, input.idempotencyKey, key],
      );
    const count = await client.query(
      'SELECT count(*)::int n FROM submissions WHERE question_id=$1 AND participant_id=$2',
      [q.id, participant],
    );
    await client.query('COMMIT');
    return { accepted: true, duplicate, remaining: Math.max(0, q.max_answers - count.rows[0].n) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function screenState(slug: string): Promise<ScreenState> {
  const client = await database().connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const e = await client.query(
      'SELECT id,title,slug FROM events WHERE slug=$1 AND NOT archived',
      [slug],
    );
    if (!e.rows[0]) throw new HttpError(404, 'Мероприятие не найдено.');
    const event = e.rows[0];
    const groups = await client.query(
      'SELECT id,key,label FROM audiences WHERE event_id=$1 ORDER BY key',
      [event.id],
    );
    const result: ScreenState = { title: event.title, slug, revision: '', audiences: [] };
    for (const a of groups.rows) {
      const q = await activeQuestion({ audience_id: a.id } as Context, client);
      const rows = q
        ? await client.query(
            `SELECT canonical_key text,count(*)::int count FROM submissions WHERE question_id=$1 AND audience_id=$2 AND approved GROUP BY canonical_key ORDER BY count DESC,canonical_key LIMIT 80`,
            [q.id, a.id],
          )
        : null;
      const totals = q
        ? await client.query(
            `SELECT count(*)::int answers,count(DISTINCT participant_id)::int participants FROM submissions WHERE question_id=$1 AND audience_id=$2 AND approved`,
            [q.id, a.id],
          )
        : null;
      result.audiences.push({
        key: a.key,
        label: a.label,
        question: q,
        words: rows?.rows || [],
        answerCount: totals?.rows[0]?.answers || 0,
        participantCount: totals?.rows[0]?.participants || 0,
      });
    }
    result.revision = JSON.stringify(
      result.audiences.map((a) => [
        a.key,
        a.label,
        a.question?.id,
        a.question?.revision,
        a.question?.status,
        a.question?.title,
      ]),
    );
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
