import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { removeTestEvent } from '../../scripts/test-cleanup';
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let id: string, q: string, slug: string;
test.beforeAll(async () => {
  slug = `visual-${randomUUID()}`;
  id = (
    await db.query(
      "INSERT INTO events(slug,title,public_audience_key) VALUES($1,'Диалог о будущем','student') RETURNING id",
      [slug],
    )
  ).rows[0].id;
  const a = (
    await db.query(
      "INSERT INTO audiences(event_id,key,label) VALUES($1,'student','Студенты') RETURNING id",
      [id],
    )
  ).rows[0].id;
  q = (
    await db.query(
      "INSERT INTO questions(event_id,title,status) VALUES($1,'Что вы ожидаете от будущей работы?','open') RETURNING id",
      [id],
    )
  ).rows[0].id;
  await db.query(
    'INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',
    [id, q, a],
  );
});
test.afterAll(async () => {
  if (id) await removeTestEvent(db, id);
  await db.end();
});
test('one permanent QR, automatic salary grouping and projector composition at target resolutions', async ({
  browser,
  page,
}, testInfo) => {
  await page.goto(`/e/${slug}/screen`);
  const qr = page.getByRole('img', { name: 'QR-код для группы: Студенты' });
  await expect(qr).toBeVisible();
  const qrSource = await qr.getAttribute('src');
  for (const word of ['ЗП', 'зарплата', 'заработная плата', 'з/п', 'оплата труда']) {
    const context = await browser.newContext({ baseURL: 'http://localhost:3138' });
    const phone = await context.newPage();
    await phone.goto(`/e/${slug}/student`);
    await phone.getByRole('textbox', { name: 'Ваш ответ' }).fill(word);
    await phone.getByRole('button', { name: 'Отправить' }).click();
    await expect(phone.getByRole('status')).toContainText('Ответ принят');
    await context.close();
  }
  await expect(page.locator('svg.cloud text')).toHaveCount(1);
  await expect(page.locator('svg.cloud text title')).toHaveText('зарплата: 5');
  expect(await qr.getAttribute('src')).toBe(qrSource);
  // Add realistic independent categories through the same public submission API.
  const phrases = [
    'гибкий график',
    'стабильность',
    'обучение',
    'карьера',
    'отпуск',
    'интересные задачи',
    'уважение',
    'здоровье',
    'страхование',
    'баланс жизни',
    'современные технологии',
    'наставник',
    'самостоятельность',
    'удобный офис',
    'новые знакомства',
    'профессионализм',
    'творчество',
    'путешествия',
    'практика',
    'премии',
    'выходные',
    'поддержка',
    'честность',
    'доверие',
    'ответственность',
    'безопасность',
    'свобода',
    'результат',
    'мотивация',
    'инновации',
    'комфорт',
    'развитие',
  ];
  for (const text of phrases) {
    const request = await browser.newContext({ baseURL: 'http://localhost:3138' });
    await request.request.get(`/api/public/events/${slug}/student`);
    const response = await request.request.post(`/api/public/events/${slug}/student/submissions`, {
      headers: { Origin: 'http://localhost:3138' },
      data: { questionId: q, text, idempotencyKey: randomUUID() },
    });
    expect(response.ok(), await response.text()).toBe(true);
    await request.close();
  }
  await expect(page.locator('.answer-stat strong')).toHaveText('37');
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.body.scrollWidth <= innerWidth))
      .toBe(true);
    const overlaps = await page.locator('svg.cloud text').evaluateAll((nodes) => {
      const boxes = nodes.map((n) => (n as SVGGraphicsElement).getBBox());
      return boxes.some((a, i) =>
        boxes.some(
          (b, j) =>
            j > i &&
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y,
        ),
      );
    });
    expect(overlaps).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`projector-${width}.png`), fullPage: true });
  }
  const phone = await browser.newContext({
    baseURL: 'http://localhost:3138',
    viewport: { width: 390, height: 844 },
  });
  const form = await phone.newPage();
  await form.goto(`/e/${slug}/student`);
  await expect(form.getByRole('textbox')).toBeVisible();
  await form.screenshot({ path: testInfo.outputPath('participant-390.png'), fullPage: true });
  await phone.close();
});
