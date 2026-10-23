import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createAdmin, digest } from '../../src/lib/admin/auth';
import { createEvent, eventCommand, getEvent } from '../../src/lib/admin/events';
import { submit } from '../../src/lib/polls';
import { startAnalysis } from '../../src/lib/ai/jobs';
import { removeTestEvent } from '../../scripts/test-cleanup';
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const login = `ai-browser-${randomUUID()}`,
  password = randomUUID() + randomUUID();
let admin: string, eventId: string, questionId: string, slug: string;
test.beforeAll(async () => {
  admin = (await createAdmin(login, password)).id;
  slug = `ai-browser-${randomUUID()}`;
  eventId = (await createEvent('AI-помощник', slug)).id;
  const e = await getEvent(eventId);
  await eventCommand(eventId, {
    action: 'addQuestion',
    title: 'Что важно?',
    audienceIds: [e.audiences[0].id],
    maxAnswers: 3,
    maxLength: 120,
  });
  questionId = (await getEvent(eventId)).questions[0].id;
  await eventCommand(eventId, { action: 'activate', questionId });
  for (const text of ['доход', 'зарплата'])
    await submit(slug, 'all', randomUUID(), { questionId, text, idempotencyKey: randomUUID() });
  // Mock only the model, preserving the actual snapshot, database, auth, review API and UI.
  await startAnalysis(
    eventId,
    questionId,
    admin,
    { action: 'start', kind: 'aliases', words: ['доход', 'зарплата'], consent: true },
    {
      model: async () => 'GigaChat-2-test',
      generate: async () => ({
        model: 'GigaChat-2-test',
        usage: { total_tokens: 10 },
        result: {
          suggestions: [
            {
              source: ['доход', 'зарплата'],
              suggestedCanonical: 'зарплата',
              reason: 'Похожие понятия',
              confidence: 0.8,
            },
          ],
        },
      }),
    },
  );
});
test.afterAll(async () => {
  if (eventId) await removeTestEvent(db, eventId);
  if (admin) await db.query('DELETE FROM admins WHERE id=$1', [admin]);
  await db.query('DELETE FROM login_limits WHERE key=$1', [`login:${digest(login)}`]);
  await db.end();
});
test('organizer explicitly applies AI aliases and publishes a summary which expires on a new answer', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await page.goto('/admin/login');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(`/admin/events/${eventId}`);
  await page.getByRole('button', { name: 'Модерация и экспорт', exact: true }).click();
  const panel = page.getByRole('region', { name: 'GigaChat помощник' });
  await expect(panel.getByText('доход, зарплата → зарплата', { exact: true })).toBeVisible();
  const screen = await context.newPage();
  await screen.setViewportSize({ width: 1920, height: 1080 });
  await screen.goto(`/e/${slug}/screen`);
  await expect(
    screen.getByRole('img', { name: 'доход: 1; зарплата: 1', exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Применить алиас', exact: true }).click();
  await expect(screen.getByRole('img', { name: 'зарплата: 2', exact: true })).toBeVisible();
  await db.query("UPDATE ai_jobs SET created_at=now()-interval '2 minutes' WHERE question_id=$1", [
    questionId,
  ]);
  const points = Array.from({ length: 3 }, () => ({
    text: 'В этой небольшой выборке встречается зарплата.',
    evidence: [{ word: 'зарплата', group: 1, count: 2 }],
  }));
  await startAnalysis(
    eventId,
    questionId,
    admin,
    { action: 'start', kind: 'summary', words: ['зарплата'], consent: true },
    {
      model: async () => 'GigaChat-2-test',
      generate: async () => ({
        model: 'GigaChat-2-test',
        usage: { total_tokens: 15 },
        result: { points },
      }),
    },
  );
  await panel.getByRole('button', { name: 'Обновить AI-задания', exact: true }).click();
  await expect(
    panel.getByText('В этой небольшой выборке встречается зарплата.', { exact: true }),
  ).toHaveCount(3);
  await expect(
    screen.getByRole('heading', { name: 'Итоги · одобрено организатором', exact: true }),
  ).toHaveCount(0);
  await panel
    .getByRole('button', { name: 'Одобрить и показать резюме на проекторе', exact: true })
    .click();
  await expect(
    screen.getByRole('heading', { name: 'Итоги · одобрено организатором', exact: true }),
  ).toBeVisible();
  const phone = await context.newPage();
  await phone.goto(`/e/${slug}/all`);
  await phone.getByRole('textbox', { name: 'Ваш ответ', exact: true }).fill('развитие');
  await phone.getByRole('button', { name: 'Отправить', exact: false }).click();
  await expect(phone.getByRole('status')).toContainText('Ответ принят');
  await expect(
    screen.getByRole('heading', { name: 'Итоги · одобрено организатором', exact: true }),
  ).toHaveCount(0);
  expect(await page.locator('body').evaluate((e) => e.scrollWidth <= window.innerWidth)).toBe(true);
});
