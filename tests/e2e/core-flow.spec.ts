import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { removeTestEvent } from '../../scripts/test-cleanup';
const slug = `browser-test-${randomUUID()}`;
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let eventId: string;
let questionId: string;
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('E2E requires a dedicated test DATABASE_URL');
  const e = await db.query('INSERT INTO events(slug,title) VALUES($1,$2) RETURNING id', [
    slug,
    'Browser verification',
  ]);
  eventId = e.rows[0].id;
  const a = await db.query(
    "INSERT INTO audiences(event_id,key,label) VALUES($1,'student','Студенты') RETURNING id",
    [eventId],
  );
  const q = await db.query(
    "INSERT INTO questions(event_id,title,status) VALUES($1,'Что важно в будущей работе?','open') RETURNING id",
    [eventId],
  );
  questionId = q.rows[0].id;
  await db.query(
    'INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',
    [eventId, questionId, a.rows[0].id],
  );
});
test.afterAll(async () => {
  try {
    if (eventId) await removeTestEvent(db, eventId);
  } finally {
    await db.end();
  }
});
test('phone response appears on live screen; reload retains quota and pause disables input', async ({
  page,
  context,
}) => {
  await page.goto(`/e/${slug}/student`);
  await expect(page.getByRole('heading', { name: 'Что важно в будущей работе?' })).toBeVisible();
  const screen = await context.newPage();
  await screen.setViewportSize({ width: 1920, height: 1080 });
  await screen.goto(`/e/${slug}/screen`);
  await expect(screen.getByRole('img', { name: 'QR-код для группы: Студенты' })).toBeVisible();
  await expect(screen.locator('svg.cloud text')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Ваш ответ' }).fill('Надёжная команда');
  const started = Date.now();
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByRole('status')).toContainText('Ответ принят');
  await expect(page.getByText('Осталось ответов: 2.', { exact: false })).toBeVisible();
  await expect(screen.locator('svg.cloud text')).toHaveCount(1, { timeout: 6000 });
  await expect(screen.locator('svg.cloud text')).toContainText('надежная команда');
  console.log(`Live update latency (${test.info().project.name}): ${Date.now() - started} ms`);
  expect(await screen.locator('body').evaluate((el) => el.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.reload();
  await expect(page.getByText('Осталось ответов: 2.', { exact: false })).toBeVisible();
  expect(await page.locator('body').evaluate((el) => el.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await db.query("UPDATE questions SET status='paused',revision=revision+1 WHERE id=$1", [
    questionId,
  ]);
  await expect(page.getByText('Опрос на паузе.', { exact: false })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Отправить' })).toHaveCount(0);
});
