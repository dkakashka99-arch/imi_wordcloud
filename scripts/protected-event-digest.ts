import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
// A consistent read-only snapshot covering content AND metadata, including queue diagnostics.
// Only the final digest is returned; rows must never be logged.
export async function protectedEventDigest(db: Pool, slug: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const hash = createHash('sha256');
    const { rows } = await client.query('SELECT id FROM events WHERE slug=$1', [slug]);
    const id = rows[0]?.id;
    for (const table of [
      'events',
      'audiences',
      'questions',
      'question_audiences',
      'participants',
      'submissions',
    ]) {
      const result = await client.query(
        `SELECT to_jsonb(t) row FROM ${table} t WHERE ${table === 'events' ? 'id' : 'event_id'}=$1 ORDER BY id`,
        [id],
      );
      hash.update(JSON.stringify([table, result.rows]));
    }
    for (const table of [
      'submission_requests',
      'word_aliases',
      'stop_words',
      'ai_jobs',
      'semantic_queue',
      'semantic_history',
      'answer_analysis',
    ]) {
      const result = await client.query(
        `SELECT to_jsonb(t) row FROM ${table} t WHERE question_id IN (SELECT id FROM questions WHERE event_id=$1) ORDER BY to_jsonb(t)::text`,
        [id],
      );
      hash.update(JSON.stringify([table, result.rows]));
    }
    await client.query('COMMIT');
    return hash.digest('hex');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
