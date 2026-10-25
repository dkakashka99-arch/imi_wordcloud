import { afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { database } from '../../src/db/client';
import { createEvent, eventCommand, getEvent } from '../../src/lib/admin/events';
import { moderate, moderationState, exportAnswers } from '../../src/lib/admin/moderation';
import { screenState, submit } from '../../src/lib/polls';
import { removeTestEvent } from '../../scripts/test-cleanup';
const ids: string[] = [];
afterAll(async () => {
  for (const id of ids) await removeTestEvent(database(), id);
  await database().end();
});
async function fixture() {
  const slug = `mod-${randomUUID()}`;
  const { id } = await createEvent('Модерация', slug);
  ids.push(id);
  const event = await getEvent(id);
  await eventCommand(id, {
    action: 'addQuestion',
    title: 'Что важно?',
    audienceIds: [event.audiences[0].id],
    maxAnswers: 3,
    maxLength: 120,
  });
  const q = (await getEvent(id)).questions[0].id;
  await eventCommand(id, { action: 'activate', questionId: q });
  return { id, slug, q };
}
const answer = (questionId: string, text: string) => ({
  questionId,
  text,
  idempotencyKey: randomUUID(),
});
it('merges aliases, hides/restores, applies stop rules retroactively and preserves source text', async () => {
  const f = await fixture();
  await submit(f.slug, 'all', 'a', answer(f.q, 'ЗП'));
  await submit(f.slug, 'all', 'b', answer(f.q, 'зарплата'));
  await moderate(f.id, f.q, {
    action: 'rules',
    premoderation: false,
    stopWords: [],
    aliases: [{ source: 'зп', target: 'зарплата' }],
  });
  expect((await screenState(f.slug)).audiences[0].words).toEqual([{ text: 'зарплата', count: 2 }]);
  let m = await moderationState(f.id, f.q);
  const source = m.submissions.find((s) => s.originalText === 'ЗП')!;
  expect(source.canonicalKey).toBe('зп');
  await moderate(f.id, f.q, { action: 'visibility', submissionId: source.id, approved: false });
  expect((await screenState(f.slug)).audiences[0].answerCount).toBe(1);
  await moderate(f.id, f.q, { action: 'visibility', submissionId: source.id, approved: true });
  await moderate(f.id, f.q, {
    action: 'rules',
    premoderation: false,
    stopWords: ['зарплата'],
    aliases: [{ source: 'зп', target: 'зарплата' }],
  });
  expect((await screenState(f.slug)).audiences[0].words).toEqual([]);
  await expect(submit(f.slug, 'all', 'c', answer(f.q, 'ЗП'))).rejects.toMatchObject({
    status: 400,
  });
  await moderate(f.id, f.q, { action: 'rules', premoderation: false, stopWords: [], aliases: [] });
  expect((await screenState(f.slug)).audiences[0].answerCount).toBe(2);
  m = await moderationState(f.id, f.q);
  expect(m.submissions.find((s) => s.id === source.id)?.originalText).toBe('ЗП');
});
it('keeps premoderated answers off public aggregates, including HTML, then publishes escaped text data', async () => {
  const f = await fixture();
  await moderate(f.id, f.q, { action: 'rules', premoderation: true, stopWords: [], aliases: [] });
  const text = '<img src=x onerror=alert(1)>';
  await expect(submit(f.slug, 'all', 'xss', answer(f.q, text))).rejects.toMatchObject({
    status: 400,
  });
  // Existing imported rows still need safe moderation/export after stricter input validation.
  await submit(f.slug, 'all', 'xss', answer(f.q, 'legacy-html'));
  await database().query(
    'UPDATE submissions SET original_text=$2,canonical_key=$2 WHERE question_id=$1',
    [f.q, text],
  );
  expect((await screenState(f.slug)).audiences[0].words).toEqual([]);
  const m = await moderationState(f.id, f.q);
  expect(m.submissions[0]).toMatchObject({ originalText: text, approved: false });
  await moderate(f.id, f.q, {
    action: 'visibility',
    submissionId: m.submissions[0].id,
    approved: true,
  });
  expect((await screenState(f.slug)).audiences[0].words[0].count).toBe(1);
  const other = await fixture();
  await expect(
    moderate(other.id, f.q, {
      action: 'visibility',
      submissionId: m.submissions[0].id,
      approved: false,
    }),
  ).rejects.toMatchObject({ status: 404 });
});
it('exports originals, hidden rows, formula-safe cells and correct visible alias frequencies', async () => {
  const f = await fixture();
  for (const [i, text] of ['=1+1', ' ЗП ', 'зарплата', 'мир;"команда"'].entries())
    await submit(f.slug, 'all', `csv-${i}`, answer(f.q, text));
  await moderate(f.id, f.q, {
    action: 'rules',
    premoderation: false,
    stopWords: [],
    aliases: [{ source: 'зп', target: 'зарплата' }],
  });
  const raw = await exportAnswers(f.id, f.q);
  expect(raw.startsWith('\uFEFF')).toBe(true);
  expect(raw).toContain('"\'=1+1"');
  expect(raw).toContain('" ЗП "');
  expect(raw).toContain('"мир;""команда"""');
  const counts = await exportAnswers(f.id, f.q, true);
  expect(counts).toContain('"зарплата";"false";"2"');
  const m = await moderationState(f.id, f.q);
  await moderate(f.id, f.q, {
    action: 'visibility',
    submissionId: m.submissions.find((s) => s.originalText === 'зарплата')!.id,
    approved: false,
  });
  expect(await exportAnswers(f.id, f.q, true)).toContain('"зарплата";"false";"1"');
  expect(await exportAnswers(f.id, f.q)).toContain('"зарплата"');
});
it('isolates rehearsal copies and labels test answers without changing live data', async () => {
  const f = await fixture();
  await submit(f.slug, 'all', 'real', answer(f.q, 'живой'));
  const clone = await eventCommand(f.id, {
    action: 'duplicate',
    title: 'Репетиция',
    slug: `demo-${randomUUID()}`,
    rehearsal: true,
  });
  ids.push(clone.id);
  const demo = await getEvent(clone.id);
  expect(demo.rehearsal).toBe(true);
  expect(demo.questions[0].answerCount).toBe(0);
  await eventCommand(clone.id, { action: 'activate', questionId: demo.questions[0].id });
  await submit(demo.slug, 'all', 'real', answer(demo.questions[0].id, 'тестовый'));
  expect((await moderationState(clone.id, demo.questions[0].id)).submissions[0].isDemo).toBe(true);
  expect((await screenState(demo.slug)).rehearsal).toBe(true);
  expect((await screenState(f.slug)).audiences[0].words).toEqual([{ text: 'живой', count: 1 }]);
});
