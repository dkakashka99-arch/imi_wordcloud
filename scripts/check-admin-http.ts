import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { digest } from '../src/lib/admin/auth';
import { removeTestEvent } from './test-cleanup';
export async function checkAdminHttp(origin: string) {
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const login = `http-${randomUUID()}`,
    password = randomUUID() + randomUUID();
  const ids: string[] = [];
  let adminId: string | undefined;
  try {
    // Exercise the real bootstrap script with a secret on stdin; capture output without echoing it.
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/create-admin.ts', login], {
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (x) => (output += x));
      child.stderr.on('data', (x) => (output += x));
      child.on('error', reject);
      child.on('exit', (code) => {
        if (output.includes(password)) reject(new Error('Bootstrap leaked a credential'));
        else if (code !== 0) reject(new Error('Safe administrator bootstrap failed: ' + output));
        else resolve();
      });
      child.stdin.end(password + '\n');
    });
    adminId = (await db.query('SELECT id FROM admins WHERE login=$1', [login])).rows[0].id;
    const call = (path: string, method = 'GET', body?: unknown, cookie?: string, from = origin) =>
      fetch(origin + path, {
        method,
        headers: {
          ...(method === 'GET' ? {} : { Origin: from, 'Content-Type': 'application/json' }),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    assert.equal((await call('/api/admin/events')).status, 401);
    assert.equal(
      (await call('/api/admin/events', 'POST', { title: 'No', slug: 'no' })).status,
      401,
    );
    assert.equal(
      (
        await call(
          '/api/admin/login',
          'POST',
          { login, password },
          undefined,
          'https://untrusted.example',
        )
      ).status,
      403,
    );
    assert.equal(
      (await call('/api/admin/login', 'POST', { login, password: 'wrong' })).status,
      401,
    );
    const result = await call('/api/admin/login', 'POST', { login, password });
    assert.equal(result.status, 200);
    const rawCookie = result.headers.get('set-cookie') || '';
    assert(/HttpOnly/iu.test(rawCookie));
    assert(/Secure/iu.test(rawCookie));
    assert(/SameSite=strict/iu.test(rawCookie));
    const cookie = rawCookie.split(';')[0];
    const token = cookie.split('=')[1];
    assert(!(await result.text()).includes(token));
    assert.equal(
      (await db.query('SELECT token_hash FROM admin_sessions WHERE admin_id=$1', [adminId])).rows[0]
        .token_hash,
      digest(token),
    );
    const created = await call(
      '/api/admin/events',
      'POST',
      { title: 'HTTP admin event', slug: `managed-${randomUUID()}` },
      cookie,
    );
    assert.equal(created.status, 201);
    const { id } = await created.json();
    ids.push(id);
    const event = await (await call(`/api/admin/events/${id}`, 'GET', undefined, cookie)).json();
    assert(event.audiences.length === 1);
    assert.equal(
      (
        await call(`/api/admin/events/${id}/commands`, 'POST', {
          action: 'addQuestion',
          title: 'What matters?',
          audienceIds: [event.audiences[0].id],
          maxAnswers: 3,
          maxLength: 60,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call(
          `/api/admin/events/${id}/commands`,
          'POST',
          { action: 'archive', archived: true },
          cookie,
          'https://untrusted.example',
        )
      ).status,
      403,
    );
    const qResult = await call(
      `/api/admin/events/${id}/commands`,
      'POST',
      {
        action: 'addQuestion',
        title: 'What matters?',
        audienceIds: [event.audiences[0].id],
        maxAnswers: 3,
        maxLength: 60,
      },
      cookie,
    );
    assert.equal(qResult.status, 200);
    const q = (await (await call(`/api/admin/events/${id}`, 'GET', undefined, cookie)).json())
      .questions[0];
    assert.equal(
      (
        await call(
          `/api/admin/events/${id}/commands`,
          'POST',
          { action: 'activate', questionId: q.id },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal((await call(`/api/public/events/${event.slug}/all`)).status, 200);
    const png = await call(`/api/public/events/${event.slug}/all/qr?format=png&download=1`);
    assert.equal(png.headers.get('content-type'), 'image/png');
    assert.deepEqual(
      Array.from(new Uint8Array(await png.arrayBuffer()).slice(0, 8)),
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    const page = await call(`/admin/events/${id}`, 'GET', undefined, cookie);
    assert.equal(page.status, 200);
    assert(!(await page.text()).includes('password_hash'));
    assert.equal((await call('/api/admin/logout', 'POST', {}, cookie)).status, 200);
    assert.equal((await call('/api/admin/events', 'GET', undefined, cookie)).status, 401);
    assert.equal(
      (
        await call(
          `/api/admin/events/${id}/commands`,
          'POST',
          { action: 'archive', archived: true },
          cookie,
        )
      ).status,
      401,
    );
    console.log(
      'ADMIN HTTP PASS: safe bootstrap, login, secure cookie, protected reads/writes, Origin, event/question creation, PNG QR and revoked logout session.',
    );
  } finally {
    for (const id of ids) await removeTestEvent(db, id);
    if (adminId) await db.query('DELETE FROM admins WHERE id=$1', [adminId]);
    await db.query('DELETE FROM login_limits WHERE key=$1', [`login:${digest(login)}`]);
    await db.end();
  }
}
