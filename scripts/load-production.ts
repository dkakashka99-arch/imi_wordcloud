import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
// Explicit opt-in, dedicated CI/rehearsal DB only. No real event is reused.
if (process.env.LOAD_TEST_ALLOWED !== 'true') throw new Error('Dedicated test DB opt-in required');
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const base = process.env.LOAD_TEST_ORIGIN || 'http://app:3000';
const slug = 'infra-load-test';
try {
  if (process.env.VERIFY_ONLY === 'true') {
    const result = await db.query(
      'SELECT count(*)::int n FROM submissions s JOIN events e ON e.id=s.event_id WHERE e.slug=$1',
      [slug],
    );
    assert.equal(result.rows[0].n, 300);
    assert.equal((await fetch(`${base}/api/ready`)).status, 200);
    console.log('PASS: 300 answers survive app/database restart');
  } else {
    assert.equal(
      (await db.query('SELECT count(*)::int n FROM events')).rows[0].n,
      0,
      'Requires empty test database',
    );
    const e = await db.query(
      'INSERT INTO events(slug,title,rehearsal) VALUES($1,$2,true) RETURNING id',
      [slug, 'Isolated infrastructure load test'],
    );
    const a = await db.query(
      "INSERT INTO audiences(event_id,key,label) VALUES($1,'student','Test') RETURNING id",
      [e.rows[0].id],
    );
    const q = await db.query(
      "INSERT INTO questions(event_id,title,status) VALUES($1,'Test','open') RETURNING id",
      [e.rows[0].id],
    );
    await db.query(
      'INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',
      [e.rows[0].id, q.rows[0].id, a.rows[0].id],
    );
    for (let i = 0; i < 10; i++)
      await db.query(
        `INSERT INTO answer_analysis(question_id,source,title,semantic_revision,verdict,canonical,family) VALUES($1,$2,'Test',0,'allow',$2,'навыки')`,
        [q.rows[0].id, `навык ${i}`],
      );
    const start = Date.now();
    const latencies: number[] = [];
    const results = await Promise.all(
      Array.from({ length: 300 }, async (_, i) => {
        const t = Date.now();
        const cookie = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
        const response = await fetch(`${base}/api/public/events/${slug}/student/submissions`, {
          method: 'POST',
          headers: {
            Origin: process.env.APP_ORIGIN!,
            'Content-Type': 'application/json',
            Cookie: `mir_participant=${cookie}`,
          },
          body: JSON.stringify({
            questionId: q.rows[0].id,
            text: `навык ${i % 10}`,
            idempotencyKey: randomUUID(),
          }),
          signal: AbortSignal.timeout(60000),
        });
        latencies.push(Date.now() - t);
        return response.status;
      }),
    );
    assert.deepEqual([...new Set(results)], [200]);
    const count = await db.query('SELECT count(*)::int n FROM submissions WHERE event_id=$1', [
      e.rows[0].id,
    ]);
    assert.equal(count.rows[0].n, 300);
    const cloud = await fetch(`${base}/api/public/events/${slug}/screen`);
    assert.equal(cloud.status, 200);
    const state = await cloud.json();
    assert.equal(
      state.audiences[0].words.reduce((n: number, w: { count: number }) => n + w.count, 0),
      300,
    );
    latencies.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        participants: 300,
        success: 300,
        totalMs: Date.now() - start,
        p95Ms: latencies[284],
        maxMs: latencies[299],
        cloudAnswers: 300,
      }),
    );
  }
} finally {
  await db.end();
}
