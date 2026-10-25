import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { cases } from './check-semantic-live';
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
    await db.query('UPDATE question_audiences SET active=(question_id=$2) WHERE event_id=$1', [
      event,
      fixture.q,
    ]);
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
  assert.equal(await protectedState(), before, 'Protected real event data changed');
  const queue = (
    await db.query(
      'SELECT status,error,error_detail,count(*)::int n,max(attempts) max_attempts FROM semantic_queue GROUP BY 1,2,3',
    )
  ).rows;
  console.log(
    JSON.stringify({
      event: 'production_semantic_complete',
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
  await db.query('UPDATE question_audiences SET active=(question_id=$2) WHERE event_id=$1', [
    event,
    safari.q,
  ]);
  await db.query("UPDATE questions SET status='paused' WHERE event_id=$1", [event]);
} finally {
  await db.end();
}
