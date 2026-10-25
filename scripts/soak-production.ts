import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { removeTestEvent } from './test-cleanup';
if (process.env.PRODUCTION_ACCEPTANCE !== 'true')
  throw new Error('Explicit synthetic acceptance opt-in required');
const origin = process.env.APP_ORIGIN!;
assert.equal(new URL(origin).origin, origin);
const duration = Number(process.env.ACCEPTANCE_DURATION_SECONDS || 3600);
assert(Number.isInteger(duration) && duration >= 3600 && duration <= 7200);
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const slug = `acceptance-${randomUUID()}`;
const participants = Array.from({ length: 250 }, () => randomBytes(32).toString('hex'));
const errors: { phase: string; code: string }[] = [];
let eventId: string | undefined;
const started = Date.now();
async function get(path: string, cookie?: string) {
  const response = await fetch(origin + path, {
    headers: cookie ? { Cookie: `mir_participant=${cookie}` } : {},
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200);
  return response;
}
try {
  eventId = (
    await db.query(
      'INSERT INTO events(slug,title,rehearsal,public_audience_key) VALUES($1,$2,true,$3) RETURNING id',
      [slug, 'Isolated release acceptance', 'student'],
    )
  ).rows[0].id;
  const a = (
    await db.query(
      "INSERT INTO audiences(event_id,key,label) VALUES($1,'student','Synthetic participants') RETURNING id",
      [eventId],
    )
  ).rows[0].id;
  const q = (
    await db.query(
      "INSERT INTO questions(event_id,title,status) VALUES($1,'Что вы ожидаете от будущей работы?','open') RETURNING id",
      [eventId],
    )
  ).rows[0].id;
  await db.query(
    'INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',
    [eventId, q, a],
  );
  const base = `/api/public/events/${slug}/student`;
  const latencies: number[] = [];
  const initial = await Promise.all(
    participants.map(async (cookie, i) => {
      const t = Date.now();
      const text = i === 0 ? 'работа на дому' : ['ЗП', 'удалёнка', 'хорошая команда'][i % 3];
      const response = await fetch(origin + base + '/submissions', {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: `mir_participant=${cookie}`,
        },
        body: JSON.stringify({ questionId: q, text, idempotencyKey: randomUUID() }),
        signal: AbortSignal.timeout(60000),
      });
      latencies.push(Date.now() - t);
      return response.status;
    }),
  );
  assert.deepEqual([...new Set(initial)], [200]);
  assert.equal(
    (await db.query('SELECT count(*)::int n FROM submissions WHERE event_id=$1', [eventId])).rows[0]
      .n,
    250,
  );
  latencies.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      event: 'initial_burst',
      participants: 250,
      accepted: 250,
      p95Ms: latencies[237],
      maxMs: latencies[249],
    }),
  );
  // This unknown variant is deliberately absent from the deterministic dictionary.
  let classificationMs: number | undefined;
  for (let i = 0; i < 90; i++) {
    const history = await db.query(
      "SELECT target,method FROM semantic_history WHERE question_id=$1 AND source=$2 AND method='gigachat-double-validation'",
      [q, 'работа на дому'],
    );
    if (history.rows.some((r) => r.target === 'удаленная работа')) {
      classificationMs = Date.now() - started;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!classificationMs) errors.push({ phase: 'live_ai', code: 'unverified_after_180s' });
  console.log(
    JSON.stringify({
      event: 'live_classification',
      verified: !!classificationMs,
      classificationMs,
    }),
  );
  const until = Date.now() + duration * 1000;
  let rounds = 0,
    requests = 0;
  while (Date.now() < until) {
    const round = Date.now();
    await Promise.all(
      participants.map(async (cookie) => {
        try {
          const data = await (await get(base, cookie)).json();
          assert.equal(data.question.id, q);
          requests++;
        } catch (e) {
          errors.push({ phase: 'participant_poll', code: e instanceof Error ? e.name : 'error' });
        }
      }),
    );
    try {
      await get('/api/ready');
      await get(`/e/${slug}/student`);
      await get(`/e/${slug}/screen`);
      await get(base + '/qr');
      const screen = await (await get(`/api/public/events/${slug}/screen`)).json();
      assert.equal(screen.audiences[0].answerCount, 250);
    } catch (e) {
      errors.push({ phase: 'public_chain', code: e instanceof Error ? e.name : 'error' });
    }
    rounds++;
    if (rounds % 6 === 0)
      console.log(
        JSON.stringify({
          event: 'soak_progress',
          elapsedSeconds: Math.round((Date.now() - started) / 1000),
          rounds,
          requests,
          failures: errors.length,
          roundMs: Date.now() - round,
        }),
      );
    await new Promise((r) => setTimeout(r, Math.max(0, 8000 - (Date.now() - round))));
  }
  assert.equal(
    (await db.query('SELECT count(*)::int n FROM submissions WHERE event_id=$1', [eventId])).rows[0]
      .n,
    250,
  );
  console.log(
    JSON.stringify({
      event: 'soak_complete',
      durationSeconds: duration,
      participants: 250,
      requests,
      failures: errors.length,
      classificationMs,
      errors: errors.slice(0, 20),
    }),
  );
  assert.equal(errors.length, 0, 'Acceptance evidence contains failures');
} finally {
  if (eventId) await removeTestEvent(db, eventId);
  await db.end();
}
