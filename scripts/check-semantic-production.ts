import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { database } from '../src/db/client';
import { cases } from './check-semantic-live';
import { classify } from '../src/lib/semantic/classifier';
import { AiError, gigaClient, semanticModelPreference } from '../src/lib/ai/client';
import { semanticTick } from '../src/lib/semantic/worker';
import { sensitive } from '../src/lib/ai/validation';
if (process.env.PRODUCTION_ACCEPTANCE !== 'true')
  throw new Error('Synthetic acceptance opt-in required');
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const origin = process.env.APP_ORIGIN!;
const slug = `semantic-acceptance-${randomUUID()}`;
const protectedState = async () =>
  JSON.stringify(
    (
      await db.query(
        "SELECT (SELECT md5(coalesce(string_agg(s.id::text||s.original_text||s.canonical_key,'|' ORDER BY s.id),'')) FROM submissions s JOIN events e ON e.id=s.event_id WHERE e.slug='mir-27-oct') originals,(SELECT md5(coalesce(string_agg(wa.source||wa.target,'|' ORDER BY wa.question_id,wa.source),'')) FROM word_aliases wa JOIN questions q ON q.id=wa.question_id JOIN events e ON e.id=q.event_id WHERE e.slug='mir-27-oct') aliases",
      )
    ).rows,
  );
const before = await protectedState();
try {
  const event = (
    await db.query(
      "INSERT INTO events(slug,title,rehearsal,public_audience_key) VALUES($1,'GigaChat synthetic acceptance',true,'student') RETURNING id",
      [slug],
    )
  ).rows[0].id;
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
      const response = await fetch(`${origin}/api/public/events/${slug}/student/submissions`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: `mir_participant=${randomBytes(32).toString('hex')}`,
        },
        body: JSON.stringify({ questionId: q, text, idempotencyKey: randomUUID() }),
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 200, `POST ${fixture.name}`);
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
      signal: AbortSignal.timeout(15000),
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
      signal: AbortSignal.timeout(15000),
    });
  assert.equal((await outagePost('тест недоступности')).status, 200);
  for (let attempt = 0; attempt < 4; attempt++) {
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
  // Diagnose the protected historic queue without changing real-event aliases/votes.
  const protectedQuestions = (
    await db.query(
      "SELECT DISTINCT q.id,q.title FROM semantic_queue sq JOIN questions q ON q.id=sq.question_id JOIN events e ON e.id=q.event_id WHERE e.slug='mir-27-oct' AND sq.error='protected_event'",
    )
  ).rows;
  const ai = gigaClient(),
    model = await ai.model(semanticModelPreference());
  for (const q of protectedQuestions) {
    const sources = (
      await db.query(
        "SELECT source FROM semantic_queue WHERE question_id=$1 AND error='protected_event'",
        [q.id],
      )
    ).rows
      .map((r) => r.source)
      .filter((s) => !sensitive(s));
    const candidates = (
      await db.query(
        "SELECT COALESCE(wa.target,s.canonical_key) text,count(*) n FROM submissions s LEFT JOIN word_aliases wa ON wa.question_id=s.question_id AND wa.source=s.canonical_key WHERE s.question_id=$1 AND s.approved AND s.original_text !~ '^[А-ЯЁ][а-яё]+[[:space:]]+[А-ЯЁ][а-яё]+' GROUP BY 1 ORDER BY n DESC,text LIMIT 150",
        [q.id],
      )
    ).rows
      .map((r) => r.text)
      .filter((s) => !sensitive(s));
    const result = await classify(ai, model, q.title, sources, candidates);
    console.log(
      JSON.stringify({
        event: 'protected_recovery_dry_run',
        count: sources.length,
        proposed: result.matches.length,
        unmatched: sources.length - result.matches.length,
        applied: 0,
        model,
      }),
    );
    await db.query(
      "UPDATE semantic_queue SET error_detail='DRY_RUN_CLASSIFIED_NO_APPLICATION' WHERE question_id=$1 AND error='protected_event'",
      [q.id],
    );
  }
  assert.equal(await protectedState(), before, 'Protected real event data changed');
  const queue = (
    await db.query(
      'SELECT status,error,error_detail,count(*)::int n,max(attempts) max_attempts FROM semantic_queue GROUP BY 1,2,3',
    )
  ).rows;
  console.log(
    JSON.stringify({
      event: 'production_semantic_complete',
      cases: cases.length,
      slug,
      pending,
      failures,
      protectedEventUnchanged: true,
      queue,
    }),
  );
  assert.equal(pending, 0);
  assert.equal(failures, 0);
  // Keep the Safari question selected for a human/browser visual check.
  const safari = fixtures.find((f) => f.name === 'safari')!;
  await db.query('UPDATE question_audiences SET active=false WHERE event_id=$1', [event]);
  await db.query('UPDATE question_audiences SET active=true WHERE event_id=$1 AND question_id=$2', [
    event,
    safari.q,
  ]);
  await db.query("UPDATE questions SET status='paused' WHERE event_id=$1", [event]);
} finally {
  await db.end();
  await database().end();
}
