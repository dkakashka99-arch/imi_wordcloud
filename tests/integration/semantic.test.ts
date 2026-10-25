import { afterAll, afterEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { database } from '../../src/db/client';
import { createEvent, eventCommand, getEvent } from '../../src/lib/admin/events';
import { moderate } from '../../src/lib/admin/moderation';
import { submit, screenState } from '../../src/lib/polls';
import { semanticTick } from '../../src/lib/semantic/worker';
import { AiError } from '../../src/lib/ai/client';
import { removeTestEvent } from '../../scripts/test-cleanup';
const ids: string[] = [];
afterEach(async () => {
  for (const id of ids.splice(0)) await removeTestEvent(database(), id);
});
afterAll(async () => {
  await database().end();
});
async function fixture() {
  const slug = `semantic-${randomUUID()}`;
  const { id } = await createEvent('Семантическая проверка', slug);
  ids.push(id);
  const event = await getEvent(id);
  await eventCommand(id, {
    action: 'addQuestion',
    title: 'Что вы ожидаете от будущей работы?',
    audienceIds: [event.audiences[0].id],
    maxAnswers: 3,
    maxLength: 60,
  });
  const q = (await getEvent(id)).questions[0].id;
  await eventCommand(id, { action: 'activate', questionId: q });
  const send = (text: string) =>
    submit(slug, 'all', randomUUID(), { questionId: q, text, idempotencyKey: randomUUID() });
  return { id, slug, q, send };
}
it('automatically groups five salary and three remote variants and preserves all originals and votes', async () => {
  const f = await fixture();
  const words = [
    'ЗП',
    'з/п',
    'зарплата',
    'заработная плата',
    'оплата труда',
    'удаленка',
    'работа из дома',
    'дистанционная работа',
    'отпуск',
    'карьера',
    'обучение',
  ];
  for (const word of words) await f.send(word);
  const state = (await screenState(f.slug)).audiences[0];
  expect(state.answerCount).toBe(11);
  expect(state.words).toContainEqual({ text: 'зарплата', count: 5 });
  expect(state.words).toContainEqual({ text: 'удаленная работа', count: 3 });
  for (const word of ['отпуск', 'карьера', 'обучение'])
    expect(state.words).toContainEqual({ text: word, count: 1 });
  expect(
    (
      await database().query(
        'SELECT original_text FROM submissions WHERE question_id=$1 ORDER BY created_at',
        [f.q],
      )
    ).rows.map((r) => r.original_text),
  ).toEqual(words);
  await moderate(f.id, f.q, { action: 'rules', premoderation: false, stopWords: [], aliases: [] });
  await f.send('ЗП');
  // Organizer undo is durable: dictionary never silently reinstates an audited override.
  expect((await screenState(f.slug)).audiences[0].words).toContainEqual({ text: 'зп', count: 2 });
  await removeTestEvent(database(), f.id);
  ids.splice(ids.indexOf(f.id), 1);
});
it('keeps POST independent of model quota errors, retries retained queue and applies verified matches without losing votes', async () => {
  const f = await fixture();
  await f.send('зарплата');
  await f.send('платят хорошо');
  const failing = {
    model: async () => {
      throw new AiError('quota');
    },
    generate: async () => {
      throw new Error('must not run');
    },
  };
  await semanticTick(failing);
  const queued = await database().query('SELECT * FROM semantic_queue WHERE question_id=$1', [f.q]);
  expect(queued.rows[0]).toMatchObject({ status: 'pending', error: 'quota' });
  await f.send('отпуск');
  await f.send('достойная оплата');
  await database().query('INSERT INTO word_aliases(question_id,source,target) VALUES($1,$2,$3)', [
    f.q,
    'достойная оплата',
    'платят хорошо',
  ]);
  await database().query('UPDATE semantic_queue SET available_at=now() WHERE question_id=$1', [
    f.q,
  ]);
  await semanticTick({
    model: async () => 'fixture-model',
    generate: async (_model, _prompt, input) => {
      const data = input as {
        sources?: { id: string; text: string }[];
        candidates?: { id: string; text: string }[];
        proposals?: unknown[];
      };
      const matches = data.proposals?.map((p) => {
        const m = p as { source: string; target: string; relation: string };
        return { source: m.source, target: m.target, relation: m.relation };
      }) || [
        {
          source: data.sources!.find((s) => s.text === 'платят хорошо')!.id,
          target: data.candidates!.find((s) => s.text === 'зарплата')!.id,
          relation: 'synonym',
        },
      ];
      return { result: { matches }, usage: null, model: 'fixture-model' };
    },
  });
  const state = (await screenState(f.slug)).audiences[0];
  expect(state.answerCount).toBe(4);
  expect(state.words).toContainEqual({ text: 'зарплата', count: 3 });
  expect(state.words).toContainEqual({ text: 'отпуск', count: 1 });
  expect(
    (
      await database().query('SELECT method,version FROM semantic_history WHERE question_id=$1', [
        f.q,
      ])
    ).rows,
  ).toContainEqual({ method: 'gigachat-double-validation', version: 'fixture-model' });
});
it('terminates repeated malformed provider results and preserves later submissions', async () => {
  const f = await fixture();
  await f.send('непонятный вариант');
  for (let attempt = 0; attempt < 5; attempt++) {
    await database().query('UPDATE semantic_queue SET available_at=now() WHERE question_id=$1', [
      f.q,
    ]);
    await semanticTick({
      model: async () => 'fixture',
      generate: async () => {
        throw new AiError('invalid_response', 'CONTENT_JSON');
      },
    });
  }
  expect(
    (
      await database().query(
        'SELECT status,error,error_detail,attempts FROM semantic_queue WHERE question_id=$1',
        [f.q],
      )
    ).rows,
  ).toEqual([
    { status: 'review', error: 'invalid_response', error_detail: 'CONTENT_JSON', attempts: 3 },
  ]);
  await f.send('ещё ответ');
  expect((await screenState(f.slug)).audiences[0].answerCount).toBe(2);
});
it('commits independently verified valid pairs despite an invalid mapping and is idempotent', async () => {
  const f = await fixture();
  for (const word of ['навигация', 'навигацич', 'навегацыя']) await f.send(word);
  let stage = 0;
  await semanticTick({
    model: async () => 'fixture',
    generate: async (_model, _prompt, input) => {
      const data = input as {
        sources?: { id: string; text: string }[];
        candidates?: { id: string; text: string }[];
        proposals?: { source: string; target: string; relation: string }[];
      };
      const matches =
        stage++ === 0
          ? [
              {
                source: data.sources!.find((s) => s.text === 'навигацич')!.id,
                target: data.candidates!.find((s) => s.text === 'навигация')!.id,
                relation: 'spelling',
              },
              {
                source: data.sources!.find((s) => s.text === 'навегацыя')!.id,
                target: 'invented',
                relation: 'spelling',
              },
            ]
          : data.proposals!.map(({ source, target, relation }) => ({ source, target, relation }));
      return { model: 'fixture', usage: null, result: { matches } };
    },
  });
  const state = (await screenState(f.slug)).audiences[0];
  expect(state.answerCount).toBe(3);
  expect(state.words).toContainEqual({ text: 'навигация', count: 2 });
  expect(
    (
      await database().query(
        'SELECT status,error FROM semantic_queue WHERE question_id=$1 AND source=$2',
        [f.q, 'навегацыя'],
      )
    ).rows[0],
  ).toEqual({ status: 'pending', error: 'invalid_mapping' });
  await semanticTick({
    model: async () => {
      throw new Error('No due work');
    },
    generate: async () => {
      throw new Error('No due work');
    },
  });
  expect(
    (await database().query('SELECT count(*)::int n FROM word_aliases WHERE question_id=$1', [f.q]))
      .rows[0].n,
  ).toBe(1);
  expect(
    (await database().query('SELECT count(*)::int n FROM submissions WHERE question_id=$1', [f.q]))
      .rows[0].n,
  ).toBe(3);
});
