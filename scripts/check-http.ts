import { removeTestEvent } from './test-cleanup';
import { cp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
const origin = 'http://localhost:3137';
const slug = `http-test-${randomUUID()}`;
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
await cp('.next/static', '.next/standalone/.next/static', { recursive: true });
function startServer() {
  return spawn(process.execPath, ['.next/standalone/server.js'], {
    env: {
      ...process.env,
      APP_ORIGIN: origin,
      HOSTNAME: '127.0.0.1',
      PORT: '3137',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}
let server = startServer();
async function stopServer() {
  server.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    if (server.exitCode !== null) resolve();
    else server.once('exit', () => resolve());
  });
}
async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${origin}/api/ready`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server did not become ready');
}
let eventId: string | undefined;
try {
  const e = await db.query('INSERT INTO events(slug,title) VALUES($1,$2) RETURNING id', [
    slug,
    'HTTP integration',
  ]);
  eventId = e.rows[0].id;
  const a = await db.query(
    `INSERT INTO audiences(event_id,key,label) VALUES($1,'all','Все') RETURNING id`,
    [eventId],
  );
  const q = await db.query(
    `INSERT INTO questions(event_id,title,status) VALUES($1,'Что важно?','open') RETURNING id`,
    [eventId],
  );
  await db.query(
    'INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',
    [eventId, q.rows[0].id, a.rows[0].id],
  );
  await waitReady();
  const base = `${origin}/api/public/events/${slug}/all`;
  const state = await fetch(base);
  assert.equal(state.status, 200);
  assert.equal(state.headers.get('cache-control'), 'no-store');
  const cookie = state.headers.get('set-cookie')?.split(';')[0];
  assert(cookie);
  const data = await state.json();
  assert.equal(data.remaining, 3);
  const payload = {
    questionId: data.question.id,
    text: 'Надёжная команда',
    idempotencyKey: randomUUID(),
  };
  const post = (body: unknown = payload, from = origin) =>
    fetch(`${base}/submissions`, {
      method: 'POST',
      headers: { Origin: from, 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });
  assert.equal((await post(payload, 'https://untrusted.example')).status, 403);
  assert.equal((await post({ ...payload, unexpected: true })).status, 400);
  const first = await post();
  assert.equal(first.status, 200);
  assert.equal((await first.json()).remaining, 2);
  const repeated = await post();
  assert.equal((await repeated.json()).duplicate, true);
  const snapshot = await (await fetch(`${origin}/api/public/events/${slug}/screen`)).json();
  assert.deepEqual(snapshot.audiences[0].words, [{ text: 'надежная команда', count: 1 }]);
  assert(!JSON.stringify(snapshot).includes('original_text'));
  assert(!JSON.stringify(snapshot).includes('participant_id'));
  const qr = await fetch(`${base}/qr`);
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get('content-type'), 'image/svg+xml');
  assert((await qr.text()).includes('<svg'));
  const page = await fetch(`${origin}/e/${slug}/screen`);
  assert.equal(page.status, 200);
  assert((await page.text()).includes('облако слов'));
  await stopServer();
  server = startServer();
  await waitReady();
  const restored = await (await fetch(`${origin}/api/public/events/${slug}/screen`)).json();
  assert.deepEqual(restored.audiences[0].words, snapshot.audiences[0].words);
  const participant = await (await fetch(base, { headers: { Cookie: cookie } })).json();
  assert.equal(participant.remaining, 2);
  await db.query(`UPDATE questions SET status='paused' WHERE id=$1`, [q.rows[0].id]);
  assert.equal(
    (await post({ ...payload, text: 'другой ответ', idempotencyKey: randomUUID() })).status,
    409,
  );
  console.log(
    'HTTP FLOW PASS: cookie → validated POST → stored word → screen aggregate; replay, Origin, strict JSON, QR, pause and app restart persistence checked. Browser rendering is not covered.',
  );
} finally {
  try {
    if (eventId) await removeTestEvent(db, eventId);
  } finally {
    await db.end();
    await stopServer();
  }
}
