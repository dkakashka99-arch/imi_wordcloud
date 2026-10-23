import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { removeTestEvent } from '../../scripts/test-cleanup';
import { randomUUID } from 'node:crypto';
import { database } from '../../src/db/client';
import { participantState, screenState, submit } from '../../src/lib/polls';
if (!process.env.DATABASE_URL)
  throw new Error('Integration requires a dedicated test DATABASE_URL');
const slug = `test-${randomUUID()}`;
let eventId: string;
let questionId: string;
let otherQuestion: string;
beforeAll(async () => {
  const db = database();
  const e = await db.query('INSERT INTO events(slug,title) VALUES($1,$2) RETURNING id', [
    slug,
    'Integration test',
  ]);
  eventId = e.rows[0].id;
  for (const key of ['student', 'employer']) {
    const a = await db.query(
      'INSERT INTO audiences(event_id,key,label) VALUES($1,$2,$2) RETURNING id',
      [eventId, key],
    );
    const q = await db.query(
      `INSERT INTO questions(event_id,title,status) VALUES($1,$2,'open') RETURNING id`,
      [eventId, `Test ${key}`],
    );
    await db.query(
      'INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',
      [eventId, q.rows[0].id, a.rows[0].id],
    );
    if (key === 'student') questionId = q.rows[0].id;
    else otherQuestion = q.rows[0].id;
  }
});
afterAll(async () => {
  if (eventId) await removeTestEvent(database(), eventId);
  await database().end();
});
const answer = (text: string, question = questionId, idempotencyKey = randomUUID()) => ({
  text,
  questionId: question,
  idempotencyKey,
});
describe('transactional poll service', () => {
  it('preserves original text while merging normalized frequency', async () => {
    await submit(slug, 'student', 'first', answer('  ЗАРПЛАТА  '));
    await submit(slug, 'student', 'second', answer('зарплата'));
    const state = await screenState(slug);
    expect(state.audiences.find((a) => a.key === 'student')?.words).toContainEqual({
      text: 'зарплата',
      count: 2,
    });
    const raw = await database().query(
      'SELECT original_text FROM submissions WHERE question_id=$1 ORDER BY created_at',
      [questionId],
    );
    expect(raw.rows[0].original_text).toBe('  ЗАРПЛАТА  ');
  });
  it('deduplicates simultaneous identical POSTs', async () => {
    const payload = answer('команда');
    const results = await Promise.all(
      Array.from({ length: 12 }, () => submit(slug, 'student', 'retry-user', payload)),
    );
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    await expect(
      submit(slug, 'student', 'retry-user', { ...payload, text: 'другое' }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('records request keys even for a repeated canonical answer', async () => {
    await submit(slug, 'student', 'ledger-user', answer('развитие'));
    const payload = answer('РАЗВИТИЕ');
    expect((await submit(slug, 'student', 'ledger-user', payload)).duplicate).toBe(true);
    await expect(
      submit(slug, 'student', 'ledger-user', { ...payload, text: 'новый' }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('enforces three distinct answers under concurrency', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        submit(slug, 'student', 'quota-user', answer(`качество ${i}`)),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect((await participantState(slug, 'student', 'quota-user')).remaining).toBe(0);
  });
  it('isolates audiences and rejects cross-group question IDs', async () => {
    await expect(submit(slug, 'employer', 'cross-group', answer('ошибка'))).rejects.toMatchObject({
      status: 409,
    });
    await submit(slug, 'employer', 'company', answer('ответственность', otherQuestion));
    const state = await screenState(slug);
    expect(state.audiences.find((a) => a.key === 'employer')?.words).toEqual([
      { text: 'ответственность', count: 1 },
    ]);
    expect(JSON.stringify(state)).not.toContain('cookie_hash');
    expect(JSON.stringify(state)).not.toContain('original_text');
  });
  it('rejects paused/new writes but allows safe successful request replay', async () => {
    const payload = answer('доверие');
    await submit(slug, 'student', 'pause-user', payload);
    await database().query(`UPDATE questions SET status='paused' WHERE id=$1`, [questionId]);
    await expect(
      submit(slug, 'student', 'pause-user', answer('стабильность')),
    ).rejects.toMatchObject({ status: 409 });
    expect((await submit(slug, 'student', 'pause-user', payload)).duplicate).toBe(true);
    await database().query(`UPDATE questions SET status='open' WHERE id=$1`, [questionId]);
    expect((await submit(slug, 'student', 'pause-user', answer('стабильность'))).accepted).toBe(
      true,
    );
  });
  it('keeps hidden answers out of aggregates and preserves originals', async () => {
    await database().query(
      `UPDATE submissions SET approved=false WHERE question_id=$1 AND canonical_key='зарплата'`,
      [questionId],
    );
    expect(
      (await screenState(slug)).audiences
        .find((a) => a.key === 'student')
        ?.words.some((w) => w.text === 'зарплата'),
    ).toBe(false);
    expect(
      (
        await database().query(
          `SELECT count(*)::int n FROM submissions WHERE question_id=$1 AND canonical_key='зарплата'`,
          [questionId],
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it('does not accept a second active question for an audience', async () => {
    const a = await database().query('SELECT id FROM audiences WHERE event_id=$1 LIMIT 1', [
      eventId,
    ]);
    const q = await database().query(
      `INSERT INTO questions(event_id,title) VALUES($1,'Another') RETURNING id`,
      [eventId],
    );
    const connection = await database().connect();
    try {
      await connection.query('BEGIN');
      await expect(
        connection.query(
          'INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',
          [eventId, q.rows[0].id, a.rows[0].id],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await connection.query('ROLLBACK');
    } finally {
      connection.release();
    }
  });
});
