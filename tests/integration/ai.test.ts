import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { database } from '../../src/db/client';
import { createAdmin } from '../../src/lib/admin/auth';
import { createEvent, eventCommand, getEvent } from '../../src/lib/admin/events';
import { submit, screenState } from '../../src/lib/polls';
import { aiState, startAnalysis, reviewAnalysis } from '../../src/lib/ai/jobs';
import { AiError } from '../../src/lib/ai/client';
import { removeTestEvent } from '../../scripts/test-cleanup';
const ids: string[] = [];
let admin: string;
beforeAll(async () => {
  admin = (await createAdmin(`ai-${randomUUID()}`, randomUUID() + randomUUID())).id;
});
afterAll(async () => {
  for (const id of ids) await removeTestEvent(database(), id);
  if (admin) await database().query('DELETE FROM admins WHERE id=$1', [admin]);
  await database().end();
});
async function fixture(words = ['доход', 'зарплата']) {
  const slug = `ai-${randomUUID()}`;
  const { id } = await createEvent('AI test', slug);
  ids.push(id);
  const e = await getEvent(id);
  await eventCommand(id, {
    action: 'addQuestion',
    title: 'Что важно?',
    audienceIds: [e.audiences[0].id],
    maxAnswers: 3,
    maxLength: 120,
  });
  const q = (await getEvent(id)).questions[0].id;
  await eventCommand(id, { action: 'activate', questionId: q });
  for (const word of words)
    await submit(slug, 'all', randomUUID(), {
      questionId: q,
      text: word,
      idempotencyKey: randomUUID(),
    });
  return { id, q, slug };
}
const generator = (result: unknown) => ({
  model: async () => 'GigaChat-2',
  generate: async () => ({ model: 'GigaChat-2', usage: { total_tokens: 12 }, result }),
});
async function age() {
  // Only this file's test-owned records; does not modify real jobs.
  await database().query(
    "UPDATE ai_jobs SET created_at=now()-interval '2 minutes' WHERE question_id IN(SELECT id FROM questions WHERE event_id=ANY($1::uuid[]))",
    [ids],
  );
}
it('keeps suggestions pending, caches generation, approves/rejects per item and retains originals', async () => {
  const f = await fixture(['доход', 'зарплата', 'коллектив', 'команда']);
  const state = await aiState(f.id, f.q, 'aliases');
  let calls = 0;
  const mock = generator({
    suggestions: [
      {
        source: ['доход', 'зарплата'],
        suggestedCanonical: 'зарплата',
        reason: 'Похожие ответы',
        confidence: 0.8,
      },
      {
        source: ['коллектив', 'команда'],
        suggestedCanonical: 'команда',
        reason: 'Похожие ответы',
        confidence: 0.7,
      },
    ],
  });
  const client = {
    ...mock,
    generate: async () => {
      calls++;
      return mock.generate();
    },
  };
  const command = {
    action: 'start' as const,
    kind: 'aliases' as const,
    words: state.snapshot.words.map((w) => w.text),
    consent: true as const,
  };
  const job = await startAnalysis(f.id, f.q, admin, command, client);
  expect(calls).toBe(1);
  expect((await screenState(f.slug)).audiences[0].words).toHaveLength(4);
  expect((await startAnalysis(f.id, f.q, admin, command, client)).id).toBe(job.id);
  expect(calls).toBe(1);
  await reviewAnalysis(f.id, f.q, { action: 'decision', jobId: job.id!, index: 0, accept: true });
  await reviewAnalysis(f.id, f.q, { action: 'decision', jobId: job.id!, index: 1, accept: false });
  expect((await screenState(f.slug)).audiences[0].words).toContainEqual({
    text: 'зарплата',
    count: 2,
  });
  expect((await screenState(f.slug)).audiences[0].words).toContainEqual({
    text: 'коллектив',
    count: 1,
  });
  const sources = await database().query(
    'SELECT original_text FROM submissions WHERE question_id=$1',
    [f.q],
  );
  expect(sources.rows.map((r) => r.original_text).sort()).toEqual(
    ['доход', 'зарплата', 'коллектив', 'команда'].sort(),
  );
  await expect(
    reviewAnalysis(f.id, f.q, { action: 'decision', jobId: job.id!, index: 0, accept: true }),
  ).rejects.toMatchObject({ status: 409 });
  await age();
});
it('filters obvious personal data and hides only explicitly approved moderation suggestions', async () => {
  const f = await fixture([
    'спам',
    'команда',
    'name@example.com',
    '+7 999 111-22-33',
    'Иван Иванов',
  ]);
  const state = await aiState(f.id, f.q);
  expect(state.snapshot.words.map((w) => w.text).sort()).toEqual(['команда', 'спам']);
  expect(state.snapshot.omitted).toBe(3);
  const job = await startAnalysis(
    f.id,
    f.q,
    admin,
    { action: 'start', kind: 'moderation', words: ['спам', 'команда'], consent: true },
    generator({ suggestions: [{ word: 'спам', reason: 'Проверить уместность' }] }),
  );
  expect((await screenState(f.slug)).audiences[0].words).toContainEqual({ text: 'спам', count: 1 });
  await reviewAnalysis(f.id, f.q, { action: 'decision', jobId: job.id!, index: 0, accept: true });
  expect((await screenState(f.slug)).audiences[0].words).not.toContainEqual({
    text: 'спам',
    count: 1,
  });
  await age();
});
it('publishes validated summary only by approval, withdraws it and invalidates on new answers', async () => {
  const f = await fixture();
  const points = Array.from({ length: 3 }, () => ({
    text: 'Среди ответов встречается доход. Данных для обобщения мало.',
    evidence: [{ word: 'доход', group: 1, count: 1 }],
  }));
  const job = await startAnalysis(
    f.id,
    f.q,
    admin,
    { action: 'start', kind: 'summary', words: ['доход', 'зарплата'], consent: true },
    generator({ points }),
  );
  expect((await screenState(f.slug)).audiences[0].summary).toBeNull();
  await reviewAnalysis(f.id, f.q, { action: 'publish', jobId: job.id! });
  expect((await screenState(f.slug)).audiences[0].summary?.points).toHaveLength(3);
  await reviewAnalysis(f.id, f.q, { action: 'unpublish' });
  expect((await screenState(f.slug)).audiences[0].summary).toBeNull();
  await expect(
    reviewAnalysis(f.id, f.q, { action: 'publish', jobId: job.id! }),
  ).rejects.toMatchObject({ status: 409 });
  await age();
  const fresh = await startAnalysis(
    f.id,
    f.q,
    admin,
    { action: 'start', kind: 'summary', words: ['доход', 'зарплата'], consent: true },
    generator({ points }),
  );
  await reviewAnalysis(f.id, f.q, { action: 'publish', jobId: fresh.id! });
  await submit(f.slug, 'all', randomUUID(), {
    questionId: f.q,
    text: 'рост',
    idempotencyKey: randomUUID(),
  });
  expect((await screenState(f.slug)).audiences[0].summary).toBeNull();
  await age();
});
it('stores safe failure status, rejects fabricated output and keeps public flow working', async () => {
  for (const failure of ['quota', 'invalid_response'] as const) {
    const f = await fixture();
    const mock = generator({ suggestions: [{ word: 'выдумка', reason: 'нет' }] });
    if (failure === 'quota')
      mock.generate = async () => {
        throw new AiError('quota');
      };
    const job = await startAnalysis(
      f.id,
      f.q,
      admin,
      { action: 'start', kind: 'moderation', words: ['доход', 'зарплата'], consent: true },
      mock,
    );
    const state = await aiState(f.id, f.q);
    expect(state.jobs.find((j) => j.id === job.id)).toMatchObject({
      status: 'failed',
      error: failure,
    });
    await submit(f.slug, 'all', randomUUID(), {
      questionId: f.q,
      text: 'команда',
      idempotencyKey: randomUUID(),
    });
    expect((await screenState(f.slug)).audiences[0].answerCount).toBe(3);
    await age();
  }
});
it('rejects changed snapshots, foreign question targets and duplicate word selections', async () => {
  const f = await fixture(),
    foreign = await fixture();
  const job = await startAnalysis(
    f.id,
    f.q,
    admin,
    { action: 'start', kind: 'moderation', words: ['доход', 'зарплата'], consent: true },
    generator({ suggestions: [{ word: 'доход', reason: 'Проверить' }] }),
  );
  await expect(
    reviewAnalysis(foreign.id, f.q, { action: 'discard', jobId: job.id! }),
  ).rejects.toMatchObject({ status: 404 });
  await submit(f.slug, 'all', randomUUID(), {
    questionId: f.q,
    text: 'рост',
    idempotencyKey: randomUUID(),
  });
  await expect(
    reviewAnalysis(f.id, f.q, { action: 'decision', jobId: job.id!, index: 0, accept: true }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    startAnalysis(
      foreign.id,
      foreign.q,
      admin,
      { action: 'start', kind: 'aliases', words: ['доход', 'доход'], consent: true },
      generator({ suggestions: [] }),
    ),
  ).rejects.toMatchObject({ status: 409 });
  await age();
});
it.skipIf(process.env.DB_POOL_MAX === '1')(
  'serializes model calls across DB connections while participant submissions remain independent',
  async () => {
    const f = await fixture();
    let release!: () => void, started!: () => void;
    const entered = new Promise<void>((r) => {
        started = r;
      }),
      barrier = new Promise<void>((r) => {
        release = r;
      });
    const mock = {
      model: async () => 'GigaChat-2',
      generate: async () => {
        started();
        await barrier;
        return { model: 'GigaChat-2', usage: null, result: { suggestions: [] } };
      },
    };
    const pending = startAnalysis(
      f.id,
      f.q,
      admin,
      { action: 'start', kind: 'aliases', words: ['доход', 'зарплата'], consent: true },
      mock,
    );
    try {
      await entered;
      await expect(
        startAnalysis(
          f.id,
          f.q,
          admin,
          { action: 'start', kind: 'aliases', words: ['доход', 'зарплата'], consent: true },
          mock,
        ),
      ).rejects.toMatchObject({ status: 429 });
      await submit(f.slug, 'all', randomUUID(), {
        questionId: f.q,
        text: 'независимость',
        idempotencyKey: randomUUID(),
      });
      expect((await screenState(f.slug)).audiences[0].answerCount).toBe(3);
    } finally {
      release();
      await pending;
    }
    await age();
  },
);
