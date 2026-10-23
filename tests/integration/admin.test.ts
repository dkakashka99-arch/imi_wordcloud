import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { database } from '../../src/db/client';
import {
  createAdmin,
  loginAdmin,
  sessionAdmin,
  revokeSession,
  consumeLoginLimit,
  digest,
} from '../../src/lib/admin/auth';
import { createEvent, eventCommand, getEvent } from '../../src/lib/admin/events';
import { participantState, screenState, submit } from '../../src/lib/polls';
import { removeTestEvent } from '../../scripts/test-cleanup';
const ids: string[] = [];
const login = `test-${randomUUID()}`;
const password = randomUUID() + randomUUID();
let adminId: string;
beforeAll(async () => {
  adminId = (await createAdmin(login, password)).id;
});
afterAll(async () => {
  for (const id of ids) await removeTestEvent(database(), id);
  if (adminId) await database().query('DELETE FROM admins WHERE id=$1', [adminId]);
  await database().query('DELETE FROM login_limits WHERE key=ANY($1::text[])', [
    [`test-rate-${login}`, `login:${digest(login)}`],
  ]);
  await database().end();
});
async function fixture() {
  const slug = `admin-test-${randomUUID()}`;
  const { id } = await createEvent('Test event', slug);
  ids.push(id);
  let e = await getEvent(id);
  await eventCommand(id, {
    action: 'addQuestion',
    title: 'Первый вопрос',
    audienceIds: [e.audiences[0].id],
    maxAnswers: 3,
    maxLength: 60,
  });
  e = await getEvent(id);
  return { id, slug, event: e, question: e.questions[0], audience: e.audiences[0] };
}
const answer = (questionId: string, text: string) => ({
  questionId,
  text,
  idempotencyKey: randomUUID(),
});
describe('administrator sessions and transactional event management', () => {
  it('stores only a token digest and supports expiry, disable and logout', async () => {
    await expect(loginAdmin(login, 'incorrect')).rejects.toMatchObject({ status: 401 });
    const result = await loginAdmin(login, password);
    expect((await sessionAdmin(result.token))?.id).toBe(adminId);
    const stored = await database().query(
      'SELECT token_hash FROM admin_sessions WHERE admin_id=$1',
      [adminId],
    );
    expect(stored.rows[0].token_hash).not.toBe(result.token);
    await database().query('UPDATE admins SET active=false WHERE id=$1', [adminId]);
    expect(await sessionAdmin(result.token)).toBe(null);
    await database().query('UPDATE admins SET active=true WHERE id=$1', [adminId]);
    await database().query(
      "UPDATE admin_sessions SET expires_at=now()-interval '1 second' WHERE admin_id=$1",
      [adminId],
    );
    expect(await sessionAdmin(result.token)).toBe(null);
    const fresh = await loginAdmin(login, password);
    await revokeSession(fresh.token);
    expect(await sessionAdmin(fresh.token)).toBe(null);
    expect(await sessionAdmin('forged')).toBe(null);
  });
  it('limits repeated login attempts in PostgreSQL', async () => {
    const key = `test-rate-${login}`;
    for (let i = 0; i < 3; i++) await consumeLoginLimit(key, 3, 60);
    await expect(consumeLoginLimit(key, 3, 60)).rejects.toMatchObject({ status: 429 });
    await database().query(
      "UPDATE login_limits SET reset_at=now()-interval '1 second' WHERE key=$1",
      [key],
    );
    await expect(consumeLoginLimit(key, 3, 60)).resolves.toBeUndefined();
  });
  it('switches questions for the same permanent link and preserves answered questions', async () => {
    const f = await fixture();
    await eventCommand(f.id, { action: 'activate', questionId: f.question.id });
    await submit(f.slug, 'all', 'switch-user', answer(f.question.id, 'коллектив'));
    await eventCommand(f.id, {
      action: 'addQuestion',
      title: 'Второй вопрос',
      audienceIds: [f.audience.id],
      maxAnswers: 3,
      maxLength: 60,
    });
    let e = await getEvent(f.id);
    const second = e.questions.find((q) => q.title === 'Второй вопрос')!;
    await eventCommand(f.id, { action: 'move', questionId: second.id, direction: 'up' });
    expect((await getEvent(f.id)).questions[0].id).toBe(second.id);
    await eventCommand(f.id, { action: 'activate', questionId: second.id });
    expect((await participantState(f.slug, 'all', 'switch-user')).question?.id).toBe(second.id);
    await expect(
      submit(f.slug, 'all', 'late-user', answer(f.question.id, 'старый ответ')),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      eventCommand(f.id, { action: 'deleteQuestion', questionId: f.question.id }),
    ).rejects.toMatchObject({ status: 409 });
    await eventCommand(f.id, { action: 'activate', questionId: f.question.id });
    expect((await screenState(f.slug)).audiences[0].words).toEqual([
      { text: 'коллектив', count: 1 },
    ]);
    e = await getEvent(f.id);
    expect(e.questions.find((q) => q.id === f.question.id)?.answerCount).toBe(1);
    await eventCommand(f.id, { action: 'status', questionId: f.question.id, status: 'paused' });
    await expect(
      submit(f.slug, 'all', 'paused', answer(f.question.id, 'нет')),
    ).rejects.toMatchObject({ status: 409 });
    await eventCommand(f.id, { action: 'status', questionId: f.question.id, status: 'open' });
    await submit(f.slug, 'all', 'after-pause', answer(f.question.id, 'да'));
  });
  it('archives without data loss and copies structure without answers or active questions', async () => {
    const f = await fixture();
    await eventCommand(f.id, { action: 'activate', questionId: f.question.id });
    await submit(f.slug, 'all', 'archive-user', answer(f.question.id, 'рост'));
    await eventCommand(f.id, { action: 'archive', archived: true });
    await expect(screenState(f.slug)).rejects.toMatchObject({ status: 404 });
    await expect(submit(f.slug, 'all', 'late', answer(f.question.id, 'нет'))).rejects.toMatchObject(
      { status: 404 },
    );
    const clone = await eventCommand(f.id, {
      action: 'duplicate',
      title: 'Copy',
      slug: `copy-${randomUUID()}`,
    });
    ids.push(clone.id);
    const copy = await getEvent(clone.id);
    expect(copy.questions).toHaveLength(1);
    expect(copy.questions[0]).toMatchObject({ status: 'draft', active: false, answerCount: 0 });
    expect(copy.audiences[0].key).toBe('all');
    await eventCommand(f.id, { action: 'archive', archived: false });
    expect((await participantState(f.slug, 'all', 'archive-user')).question?.status).toBe('closed');
    await eventCommand(f.id, { action: 'activate', questionId: f.question.id });
    expect((await screenState(f.slug)).audiences[0].words).toEqual([{ text: 'рост', count: 1 }]);
  });
  it('prevents cross-event targets, removal of answered groups and destructive limit changes', async () => {
    const f = await fixture(),
      foreign = await fixture();
    await expect(
      eventCommand(f.id, {
        action: 'addQuestion',
        title: 'Bad',
        audienceIds: [foreign.audience.id],
        maxAnswers: 3,
        maxLength: 60,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      eventCommand(f.id, { action: 'activate', questionId: foreign.question.id }),
    ).rejects.toMatchObject({ status: 404 });
    await eventCommand(f.id, { action: 'activate', questionId: f.question.id });
    for (const text of ['один', 'два', 'три'])
      await submit(f.slug, 'all', 'quota', answer(f.question.id, text));
    await expect(
      eventCommand(f.id, {
        action: 'editQuestion',
        questionId: f.question.id,
        title: 'Edited',
        audienceIds: [f.audience.id],
        maxAnswers: 1,
        maxLength: 60,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await eventCommand(f.id, { action: 'addAudience', key: 'custom', label: 'Своя группа' });
    const other = (await getEvent(f.id)).audiences.find((a) => a.key === 'custom')!;
    await expect(
      eventCommand(f.id, {
        action: 'editQuestion',
        questionId: f.question.id,
        title: 'Edited',
        audienceIds: [other.id],
        maxAnswers: 3,
        maxLength: 60,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      eventCommand(f.id, { action: 'deleteAudience', audienceId: f.audience.id }),
    ).rejects.toMatchObject({ status: 409 });
    await eventCommand(f.id, { action: 'editAudience', audienceId: other.id, label: 'Партнёры' });
    expect((await getEvent(f.id)).audiences.find((a) => a.id === other.id)?.label).toBe('Партнёры');
  });
  it('serializes archive and simultaneous submissions without losing accepted data', async () => {
    const f = await fixture();
    await eventCommand(f.id, { action: 'activate', questionId: f.question.id });
    const outcomes = await Promise.allSettled([
      ...Array.from({ length: 12 }, (_, i) =>
        submit(f.slug, 'all', `racer-${i}`, answer(f.question.id, 'надёжность')),
      ),
      eventCommand(f.id, { action: 'archive', archived: true }),
    ]);
    expect(outcomes[12].status).toBe('fulfilled');
    const accepted = outcomes.slice(0, 12).filter((x) => x.status === 'fulfilled').length;
    await eventCommand(f.id, { action: 'archive', archived: false });
    await eventCommand(f.id, { action: 'activate', questionId: f.question.id });
    expect((await getEvent(f.id)).questions[0].answerCount).toBe(accepted);
  });
});
