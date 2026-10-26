import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('../../src/lib/semantic/admission', async (load) => ({
  ...(await load<typeof import('../../src/lib/semantic/admission')>()),
  analyzeAnswer: vi.fn(),
}));
import { analyzeAnswer } from '../../src/lib/semantic/admission';
import { database } from '../../src/db/client';
import { submit, screenState } from '../../src/lib/polls';
import { eventCommand, listEvents } from '../../src/lib/admin/events';
const slug = `admission-${randomUUID()}`;
let eventId: string, questionId: string;
beforeAll(async () => {
  const db = database();
  eventId = (
    await db.query('INSERT INTO events(slug,title) VALUES($1,$2) RETURNING id', [
      slug,
      'Admission test',
    ])
  ).rows[0].id;
  const audience = (
    await db.query(
      "INSERT INTO audiences(event_id,key,label) VALUES($1,'all','Все') RETURNING id",
      [eventId],
    )
  ).rows[0].id;
  questionId = (
    await db.query(
      "INSERT INTO questions(event_id,title,status,max_answers) VALUES($1,'Что важно в работе?','open',3) RETURNING id",
      [eventId],
    )
  ).rows[0].id;
  await db.query(
    'INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',
    [eventId, questionId, audience],
  );
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await database().query('DELETE FROM events WHERE id=$1', [eventId]);
  await database().end();
});
const input = (text: string) => ({ questionId, text, idempotencyKey: randomUUID() });
describe('admission, family metadata and event lifecycle', () => {
  it('publishes corrected equivalent words once with shared family', async () => {
    vi.stubEnv('GIGACHAT_ENABLED', 'true');
    vi.mocked(analyzeAnswer).mockResolvedValue({
      verdict: 'allow',
      canonical: 'хороший коллектив',
      family: 'люди',
    });
    await submit(slug, 'all', 'person-a', input('good team'));
    await submit(slug, 'all', 'person-b', input('хорошый колектив'));
    const state = await screenState(slug);
    expect(state.audiences[0].words).toEqual([
      { text: 'хороший коллектив', count: 2, family: 'люди' },
    ]);
  });
  it('does not consume quota or publish rejected lists and unsafe answers', async () => {
    vi.stubEnv('GIGACHAT_ENABLED', 'true');
    for (const verdict of ['multiple', 'unsafe', 'irrelevant'] as const) {
      vi.mocked(analyzeAnswer).mockResolvedValue({ verdict, canonical: 'ответ', family: 'тема' });
      await expect(
        submit(slug, 'all', 'person-a', input('другой ответ ' + verdict)),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect((await screenState(slug)).audiences[0].answerCount).toBe(2);
  });
  it('fails closed on provider failure and on disabled production AI', async () => {
    vi.stubEnv('GIGACHAT_ENABLED', 'true');
    vi.mocked(analyzeAnswer).mockRejectedValue(new Error('timeout'));
    await expect(submit(slug, 'all', 'person-a', input('новый ответ'))).rejects.toMatchObject({
      status: 503,
    });
    vi.stubEnv('GIGACHAT_ENABLED', 'false');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(submit(slug, 'all', 'person-a', input('новый ответ'))).rejects.toMatchObject({
      status: 503,
    });
    expect((await screenState(slug)).audiences[0].answerCount).toBe(2);
  });
  it('requires matching title then clears votes, participants, aliases and analysis', async () => {
    await expect(
      eventCommand(eventId, { action: 'clearAnswers', confirmTitle: 'wrong' }),
    ).rejects.toMatchObject({ status: 409 });
    await eventCommand(eventId, { action: 'clearAnswers', confirmTitle: 'Admission test' });
    expect((await screenState(slug)).audiences[0].answerCount).toBe(0);
    for (const table of ['participants', 'submissions'])
      expect(
        (
          await database().query(`SELECT count(*)::int n FROM ${table} WHERE event_id=$1`, [
            eventId,
          ])
        ).rows[0].n,
      ).toBe(0);
    for (const table of ['submission_requests', 'word_aliases', 'answer_analysis'])
      expect(
        (
          await database().query(`SELECT count(*)::int n FROM ${table} WHERE question_id=$1`, [
            questionId,
          ])
        ).rows[0].n,
      ).toBe(0);
  });
  it('deletes populated events and removes them from list and public routes', async () => {
    vi.stubEnv('GIGACHAT_ENABLED', 'true');
    vi.mocked(analyzeAnswer).mockResolvedValue({
      verdict: 'allow',
      canonical: 'зарплата',
      family: 'доход',
    });
    await submit(slug, 'all', 'person-a', input('pay'));
    await eventCommand(eventId, { action: 'deleteEvent', confirmTitle: 'Admission test' });
    expect((await listEvents()).some((e) => e.id === eventId)).toBe(false);
    await expect(screenState(slug)).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await database().query('SELECT count(*)::int n FROM answer_analysis WHERE question_id=$1', [
          questionId,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
});
