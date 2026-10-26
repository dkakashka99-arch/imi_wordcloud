import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createAdmin, digest } from '../../src/lib/admin/auth';
import { removeTestEvent } from '../../scripts/test-cleanup';
const login = `browser-${randomUUID()}`,
  password = randomUUID() + randomUUID();
const slug = `managed-${randomUUID()}`;
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const events: string[] = [];
let adminId: string;
test.beforeAll(async () => {
  adminId = (await createAdmin(login, password)).id;
});
test.afterAll(async () => {
  for (const id of events) await removeTestEvent(db, id);
  if (adminId) await db.query('DELETE FROM admins WHERE id=$1', [adminId]);
  await db.query('DELETE FROM login_limits WHERE key=$1', [`login:${digest(login)}`]);
  await db.end();
});
test('organizer creates, conducts, closes, archives and duplicates an event; logout revokes access', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.request.get('/api/admin/events')).status()).toBe(401);
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мероприятия', exact: true })).toBeVisible();
  const title = 'Встреча партнёров';
  await page.getByLabel('Название мероприятия', { exact: true }).fill(title);
  await page.getByLabel('Адрес мероприятия (необязательно)', { exact: true }).fill(slug);
  await page.getByRole('button', { name: 'Создать мероприятие', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  events.push(id);
  const group = page.getByRole('form', { name: 'Новая группа', exact: true });
  await group.getByLabel('Название группы', { exact: true }).fill('Партнёры');
  await group.getByLabel('Код группы для ссылки', { exact: true }).fill('partners');
  await group.getByRole('button', { name: 'Добавить группу', exact: true }).click();
  await expect(page.getByRole('link', { name: 'QR PNG' })).toHaveCount(2);
  async function addQuestion(title: string) {
    const form = page.getByRole('form', { name: 'Новый вопрос', exact: true });
    await form.getByLabel('Текст вопроса', { exact: true }).fill(title);
    await form.getByRole('checkbox', { name: 'Участники', exact: true }).uncheck();
    await form.getByRole('checkbox', { name: 'Партнёры', exact: true }).check();
    await form.getByRole('button', { name: 'Добавить вопрос', exact: true }).click();
    await expect(page.getByRole('article', { name: title, exact: true })).toBeVisible();
  }
  await addQuestion('Что важно для команды?');
  let card = page.getByRole('article', { name: 'Что важно для команды?', exact: true });
  await card.getByRole('button', { name: 'Запустить вопрос', exact: true }).click();
  await expect(card.getByText('Приём ответов', { exact: false })).toBeVisible();
  const phone = await context.newPage();
  await phone.goto(`/e/${slug}/partners`);
  await expect(
    phone.getByRole('heading', { name: 'Что важно для команды?', exact: true }),
  ).toBeVisible();
  await phone.getByRole('textbox', { name: 'Ваш ответ', exact: true }).fill('Доверие');
  await phone.getByRole('button', { name: 'Отправить', exact: false }).click();
  await expect(phone.getByRole('status')).toContainText('Ответ принят');
  await card.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(phone.getByText('Опрос на паузе.', { exact: false })).toBeVisible({
    timeout: 15000,
  });
  await card.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await phone.reload();
  await expect(phone.getByText('Осталось ответов: 2.', { exact: false })).toBeVisible();
  await phone
    .getByRole('textbox', { name: 'Ваш ответ', exact: true })
    .fill('Черновик предыдущего вопроса');
  await addQuestion('Что нужно улучшить?');
  card = page.getByRole('article', { name: 'Что нужно улучшить?', exact: true });
  await card.getByRole('button', { name: 'Запустить вопрос', exact: true }).click();
  await expect(
    phone.getByRole('heading', { name: 'Что нужно улучшить?', exact: true }),
  ).toBeVisible({ timeout: 15000 });
  expect(new URL(phone.url()).pathname).toBe(`/e/${slug}/partners`);
  await expect(phone.getByRole('textbox', { name: 'Ваш ответ', exact: true })).toHaveValue('');
  await card.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(card.getByText('Завершён', { exact: false })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Архивировать мероприятие', exact: true }).click();
  await expect(page.getByText('Мероприятие в архиве.', { exact: false })).toBeVisible();
  await expect(phone.getByRole('alert')).toBeVisible({ timeout: 15000 });
  await expect(phone.getByRole('textbox', { name: 'Ваш ответ', exact: true })).toHaveCount(0);
  await page.getByText('Название и копия мероприятия', { exact: true }).click();
  const copyForm = page.getByRole('form', { name: 'Копия мероприятия', exact: true });
  await copyForm.getByLabel('Название копии', { exact: true }).fill('Повторная встреча');
  await copyForm.getByLabel('Адрес копии (необязательно)', { exact: true }).fill(`copy-${slug}`);
  await copyForm.getByRole('button', { name: 'Создать копию мероприятия', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Повторная встреча', exact: true })).toBeVisible();
  const copyId = new URL(page.url()).pathname.split('/').at(-1)!;
  events.push(copyId);
  const copy = await (await page.request.get(`/api/admin/events/${copyId}`)).json();
  expect(copy.questions).toHaveLength(2);
  expect(
    copy.questions.every(
      (q: { status: string; answerCount: number; active: boolean }) =>
        q.status === 'draft' && q.answerCount === 0 && !q.active,
    ),
  ).toBe(true);
  await page.goto(`/admin/events/${id}`);
  await page.getByRole('button', { name: 'Восстановить из архива', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Архивировать мероприятие', exact: true }),
  ).toBeVisible();
  const original = await (await page.request.get(`/api/admin/events/${id}`)).json();
  expect(original.archived).toBe(false);
  expect(
    original.questions.reduce((n: number, q: { answerCount: number }) => n + q.answerCount, 0),
  ).toBe(1);
  expect(await page.locator('body').evaluate((el) => el.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.request.get('/api/admin/events')).status()).toBe(401);
  await page.goto(`/admin/events/${id}`);
  await expect(page).toHaveURL(/\/admin\/login$/);
});
