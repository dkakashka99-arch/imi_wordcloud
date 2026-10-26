import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { database } from '../src/db/client';
import { cases } from './check-semantic-live';
import { AiError } from '../src/lib/ai/client';
import { semanticTick } from '../src/lib/semantic/worker';
import { removeTestEvent } from './test-cleanup';
import { analyzeAnswer } from '../src/lib/semantic/admission';
import { protectedEventDigest } from './protected-event-digest';
if (process.env.PRODUCTION_ACCEPTANCE !== 'true')
  throw new Error('Synthetic acceptance opt-in required');
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const origin = process.env.APP_ORIGIN!;
const slug = `semantic-acceptance-${randomUUID()}`;
const protectedState = () => protectedEventDigest(db, 'mir-27-oct');
let eventId: string | undefined;
const before = await protectedState();
try {
  const event = (
    await db.query(
      "INSERT INTO events(slug,title,rehearsal,public_audience_key) VALUES($1,'GigaChat synthetic acceptance',true,'student') RETURNING id",
      [slug],
    )
  ).rows[0].id;
  eventId = event;
  const audience = (
    await db.query(
      "INSERT INTO audiences(event_id,key,label) VALUES($1,'student','Synthetic test') RETURNING id",
      [event],
    )
  ).rows[0].id;
  const fixtures = [];
  for (const fixture of cases) {
    const q = (
      await db.query(
        "INSERT INTO questions(event_id,title,status) VALUES($1,$2,'open') RETURNING id",
        [event, fixture.question],
      )
    ).rows[0].id;
    await db.query('UPDATE question_audiences SET active=false WHERE event_id=$1', [event]);
    await db.query(
      'INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',
      [event, q, audience],
    );
    // The repeated correct spelling makes canonical preference measurable in the real worker.
    const words = [fixture.words[0], ...fixture.words];
    for (const text of words) {
      if (fixture.name === 'word-form' || fixture.name === 'translation') {
        const candidates = (
          await db.query(
            "SELECT canonical,family FROM answer_analysis WHERE question_id=$1 AND verdict='allow' ORDER BY canonical",
            [q],
          )
        ).rows;
        for (let repeat = 0; repeat < 2; repeat++) {
          const started = Date.now();
          const direct = await analyzeAnswer(fixture.question, text, candidates);
          assert.equal(direct.verdict, 'allow', `Direct ${fixture.name}`);
          console.log(
            JSON.stringify({
              event: 'production_admission_direct',
              case: fixture.name,
              candidateCount: candidates.length,
              elapsedMs: Date.now() - started,
              verdict: direct.verdict,
              repeat,
            }),
          );
        }
      }
      const started = Date.now();
      const response = await fetch(`${origin}/api/public/events/${slug}/student/submissions`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: `mir_participant=${randomBytes(32).toString('hex')}`,
        },
        body: JSON.stringify({ questionId: q, text, idempotencyKey: randomUUID() }),
        signal: AbortSignal.timeout(70000),
      });
      console.log(
        JSON.stringify({
          event: 'production_admission_post',
          case: fixture.name,
          status: response.status,
          traceId: response.headers.get('x-request-id'),
          elapsedMs: Date.now() - started,
        }),
      );
      assert.equal(
        response.status,
        200,
        `POST ${fixture.name}; trace=${response.headers.get('x-request-id')}`,
      );
    }
    fixtures.push({ ...fixture, q, words });
  }
  let pending = 0;
  for (let attempt = 0; attempt < 120; attempt++) {
    pending = (
      await db.query(
        "SELECT count(*)::int n FROM semantic_queue WHERE question_id=ANY($1::uuid[]) AND status='pending'",
        [fixtures.map((f) => f.q)],
      )
    ).rows[0].n;
    if (!pending) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  let failures = 0;
  for (const fixture of fixtures) {
    await db.query('UPDATE question_audiences SET active=false WHERE event_id=$1', [event]);
    await db.query(
      'UPDATE question_audiences SET active=true WHERE event_id=$1 AND question_id=$2',
      [event, fixture.q],
    );
    const response = await fetch(`${origin}/api/public/events/${slug}/screen`, {
      signal: AbortSignal.timeout(70000),
    });
    assert.equal(response.status, 200);
    const screen = await response.json();
    const state = screen.audiences[0];
    const originals = (
      await db.query(
        'SELECT original_text FROM submissions WHERE question_id=$1 ORDER BY created_at',
        [fixture.q],
      )
    ).rows.map((r) => r.original_text);
    assert.deepEqual(originals, fixture.words);
    assert.equal(state.answerCount, fixture.words.length);
    assert.equal(
      state.words.reduce((n: number, w: { count: number }) => n + w.count, 0),
      fixture.words.length,
    );
    const pass = fixture.same
      ? state.words.length === 1
      : state.words.length === fixture.words.length - 1;
    if (!pass) failures++;
    console.log(
      JSON.stringify({
        event: 'production_semantic_case',
        case: fixture.name,
        pass,
        words: state.words,
        votes: state.answerCount,
      }),
    );
  }
  const outageQ = (
    await db.query(
      "INSERT INTO questions(event_id,title,status) VALUES($1,'Проверка при недоступности модели','open') RETURNING id",
      [event],
    )
  ).rows[0].id;
  await db.query('UPDATE question_audiences SET active=false WHERE event_id=$1', [event]);
  await db.query(
    'INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',
    [event, outageQ, audience],
  );
  const outagePost = async (text: string) =>
    fetch(`${origin}/api/public/events/${slug}/student/submissions`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Cookie: `mir_participant=${randomBytes(32).toString('hex')}`,
      },
      body: JSON.stringify({ questionId: outageQ, text, idempotencyKey: randomUUID() }),
      signal: AbortSignal.timeout(70000),
    });
  assert.equal((await outagePost('тест недоступности')).status, 200);
  // Exercise only the background worker outage, independently of successful admission.
  await db.query('DELETE FROM semantic_queue WHERE question_id=$1', [outageQ]);
  await db.query(
    "INSERT INTO semantic_queue(question_id,source) VALUES($1,'проверка сбоя фонового сервиса')",
    [outageQ],
  );
  for (let attempt = 0; attempt < 20; attempt++) {
    await db.query(
      "UPDATE semantic_queue SET status='pending',available_at=now() WHERE question_id=$1",
      [outageQ],
    );
    await semanticTick(
      {
        model: async () => {
          throw new AiError('unavailable');
        },
        generate: async () => {
          throw new Error('Must not generate');
        },
      },
      outageQ,
    );
    if (
      (
        await db.query(
          "SELECT 1 FROM semantic_queue WHERE question_id=$1 AND error='unavailable'",
          [outageQ],
        )
      ).rowCount
    )
      break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM semantic_queue WHERE question_id=$1 AND error='unavailable'",
        [outageQ],
      )
    ).rows[0].n,
    1,
  );
  assert.equal((await outagePost('приём продолжается')).status, 200);
  assert.equal(
    (await db.query('SELECT count(*)::int n FROM submissions WHERE question_id=$1', [outageQ]))
      .rows[0].n,
    2,
  );
  console.log(
    JSON.stringify({
      event: 'production_outage_acceptance',
      injection: 'scoped worker API-unavailable failure',
      accepted: 2,
      pass: true,
    }),
  );
  // Finish the isolated outage queue with an explicit test status; never touch other queues.
  await db.query(
    "UPDATE semantic_queue SET status='review',error='synthetic_outage_verified' WHERE question_id=$1",
    [outageQ],
  );
  // Real-event diagnostics are strictly read-only digests; no provider calls on live answers.
  assert.equal(await protectedState(), before, 'Protected real event data changed');
  console.log(
    JSON.stringify({
      event: 'production_semantic_complete',
      cases: cases.length,
      slug,
      pending,
      failures,
      protectedEventUnchanged: true,
    }),
  );
  assert.equal(pending, 0);
  assert.equal(failures, 0);
} finally {
  try {
    if (eventId) await removeTestEvent(db, eventId, slug);
    assert.equal(await protectedState(), before, 'Protected real event data changed');
  } finally {
    await db.end();
    await database().end();
  }
}
