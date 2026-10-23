import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createAdmin, digest } from '../../src/lib/admin/auth';
import { createEvent, eventCommand, getEvent } from '../../src/lib/admin/events';
import { removeTestEvent } from '../../scripts/test-cleanup';
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const login = `mod-browser-${randomUUID()}`,
  password = randomUUID() + randomUUID();
let admin: string, eventId: string, slug: string;
test.beforeAll(async () => {
  admin = (await createAdmin(login, password)).id;
  slug = `mod-browser-${randomUUID()}`;
  eventId = (await createEvent('Модерация и сравнение', slug)).id;
  await eventCommand(eventId, { action: 'addAudience', key: 'partners', label: 'Партнёры' });
  const e = await getEvent(eventId);
  await eventCommand(eventId, {
    action: 'addQuestion',
    title: 'Что важно?',
    audienceIds: e.audiences.map((a) => a.id),
    maxAnswers: 3,
    maxLength: 120,
  });
  await eventCommand(eventId, {
    action: 'activate',
    questionId: (await getEvent(eventId)).questions[0].id,
  });
});
test.afterAll(async () => {
  if (eventId) await removeTestEvent(db, eventId);
  if (admin) await db.query('DELETE FROM admins WHERE id=$1', [admin]);
  await db.query('DELETE FROM login_limits WHERE key=$1', [`login:${digest(login)}`]);
  await db.end();
});
test('moderation hides and restores literal HTML, CSV downloads and comparison keeps groups separate', async ({
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
  await page
    .getByRole('checkbox', { name: 'Новые ответы показывать только после одобрения' })
    .check();
  await page.getByRole('button', { name: 'Сохранить правила', exact: true }).click();
  await expect(page.getByText('Сохранено. Экран проектора обновится автоматически.')).toBeVisible();
  const phone = await context.newPage();
  await phone.goto(`/e/${slug}/all`);
  const payload = '<img src=x onerror=alert(1)>';
  await phone.getByRole('textbox', { name: 'Ваш ответ', exact: true }).fill(payload);
  await phone.getByRole('button', { name: 'Отправить', exact: false }).click();
  await expect(phone.getByRole('status')).toContainText('Ответ принят');
  const screen = await context.newPage();
  await screen.goto(`/e/${slug}/screen`);
  await expect(screen.getByRole('img', { name: payload + ': 1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Обновить ответы', exact: true }).click();
  await expect(page.getByText(payload, { exact: true })).toBeVisible();
  expect(await page.locator('img[onerror]').count()).toBe(0);
  await page.getByRole('button', { name: 'Одобрить / вернуть', exact: true }).click();
  await expect(screen.getByRole('img', { name: payload + ': 1', exact: true })).toBeVisible();
  expect(await screen.locator('img[onerror]').count()).toBe(0);
  await page.getByRole('button', { name: 'Скрыть', exact: true }).click();
  await expect(screen.getByRole('img', { name: payload + ': 1', exact: true })).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'CSV: все исходные ответы', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/answers\.csv$/);
  await screen.getByRole('button', { name: 'Сравнить группы', exact: true }).click();
  await expect(screen.getByRole('heading', { name: 'Участники', exact: true })).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Партнёры', exact: true })).toBeVisible();
  expect(
    await screen.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
