import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { removeTestEvent } from './test-cleanup';
import { protectedEventDigest } from './protected-event-digest';
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
const protectedBefore = await protectedEventDigest(db, 'mir-27-oct');
const getLatencies: number[] = [];
const httpStatuses: Record<string, number> = {};
const recordStatus = (status: number) => {
  httpStatuses[status] = (httpStatuses[status] || 0) + 1;
};
function latencySummary(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))] ?? 0;
  return {
    samples: sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: sorted.at(-1) || 0,
  };
}
async function get(path: string, cookie?: string) {
  const t = Date.now();
  const response = await fetch(origin + path, {
    headers: cookie ? { Cookie: `mir_participant=${cookie}` } : {},
    signal: AbortSignal.timeout(15000),
  });
  recordStatus(response.status);
  await response.clone().arrayBuffer();
  getLatencies.push(Date.now() - t);
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
  const payloads = participants.map((_, i) => ({
    questionId: q,
    text: i === 0 ? 'работа на дому' : ['ЗП', 'удалёнка', 'хорошая команда'][i % 3],
    idempotencyKey: randomUUID(),
  }));
  const initial = await Promise.all(
    participants.map(async (cookie, i) => {
      const t = Date.now();
      const response = await fetch(origin + base + '/submissions', {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: `mir_participant=${cookie}`,
        },
        body: JSON.stringify(payloads[i]),
        signal: AbortSignal.timeout(60000),
      });
      await response.arrayBuffer();
      recordStatus(response.status);
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
      latency: latencySummary(latencies),
      inputProfile:
        '250 concurrent participants, repeated variants plus one unfamiliar phrase; mixed cold/shared-inflight/cache',
    }),
  );
  const replayLatencies: number[] = [];
  await Promise.all(
    participants.map(async (cookie, i) => {
      const t = Date.now();
      const response = await fetch(origin + base + '/submissions', {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: `mir_participant=${cookie}`,
        },
        body: JSON.stringify(payloads[i]),
        signal: AbortSignal.timeout(70000),
      });
      recordStatus(response.status);
      assert.equal(response.status, 200, 'Idempotent replay');
      assert.equal((await response.json()).duplicate, true, 'Replay must not add votes');
      replayLatencies.push(Date.now() - t);
    }),
  );
  assert.equal(
    (await db.query('SELECT count(*)::int n FROM submissions WHERE event_id=$1', [eventId])).rows[0]
      .n,
    250,
  );
  console.log(
    JSON.stringify({
      event: 'idempotent_replay',
      participants: 250,
      replayed: 250,
      submissions: 250,
      latency: latencySummary(replayLatencies),
      inputProfile: 'warm idempotency; not fresh cold generation',
    }),
  );
  // This unknown variant is deliberately absent from the deterministic dictionary.
  let classificationMs: number | undefined;
  for (let i = 0; i < 90; i++) {
    const history = await db.query(
      "SELECT target,method FROM semantic_history WHERE question_id=$1 AND source=$2 AND method IN ('gigachat-double-validation','gigachat-admission')",
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
      elapsedSeconds: Math.round((Date.now() - started) / 1000),
      durationSeconds: duration,
      participants: 250,
      requests,
      failures: errors.length,
      classificationMs,
      errors: errors.slice(0, 20),
      getLatency: latencySummary(getLatencies),
      initialMixedPostLatency: latencySummary(latencies),
      warmReplayLatency: latencySummary(replayLatencies),
      httpStatusCounts: httpStatuses,
      storedSubmissions: (
        await db.query('SELECT count(*)::int n FROM submissions WHERE event_id=$1', [eventId])
      ).rows[0].n,
      storedRequests: (
        await db.query('SELECT count(*)::int n FROM submission_requests WHERE question_id=$1', [q])
      ).rows[0].n,
    }),
  );
  assert.equal(errors.length, 0, 'Acceptance evidence contains failures');
} finally {
  try {
    if (eventId) await removeTestEvent(db, eventId, slug);
    assert.equal(
      await protectedEventDigest(db, 'mir-27-oct'),
      protectedBefore,
      'Protected real event data changed during soak',
    );
  } finally {
    await db.end();
  }
}
