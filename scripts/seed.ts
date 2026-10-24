import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { z } from 'zod';
// Trusted CLI import. Questions are data, never application source constants.
const path = process.argv[2];
if (!path) throw new Error('Usage: npm run db:seed -- event.json');
const input = z
  .object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u),
    title: z.string().min(1).max(240),
    polls: z
      .array(
        z
          .object({
            key: z
              .string()
              .regex(/^[a-z0-9][a-z0-9-]{0,63}$/u)
              .refine((s) => s !== 'screen'),
            label: z.string().min(1).max(240),
            question: z.string().min(1).max(240),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .parse(JSON.parse(await readFile(path, 'utf8')));
if (new Set(input.polls.map((p) => p.key)).size !== input.polls.length)
  throw new Error('Duplicate audience keys');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const e = await client.query(
    'INSERT INTO events(slug,title) VALUES($1,$2) ON CONFLICT(slug) DO NOTHING RETURNING id',
    [input.slug, input.title],
  );
  if (e.rowCount) {
    for (const poll of input.polls) {
      const a = await client.query(
        'INSERT INTO audiences(event_id,key,label) VALUES($1,$2,$3) RETURNING id',
        [e.rows[0].id, poll.key, poll.label],
      );
      const q = await client.query(
        "INSERT INTO questions(event_id,title,status) VALUES($1,$2,'paused') RETURNING id",
        [e.rows[0].id, poll.question],
      );
      await client.query(
        'INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',
        [e.rows[0].id, q.rows[0].id, a.rows[0].id],
      );
    }
  }
  await client.query('COMMIT');
  console.log(
    e.rowCount
      ? 'Event imported, collection paused; review in organizer panel.'
      : 'Existing event left unchanged. Review its questions in the organizer panel.',
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
