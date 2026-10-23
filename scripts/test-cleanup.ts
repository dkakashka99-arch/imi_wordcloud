import type { Pool } from 'pg';
// Remove only a test-owned event, children first; never run against real events.
export async function removeTestEvent(db: Pool, id: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM submission_requests WHERE question_id IN (SELECT id FROM questions WHERE event_id=$1)',
      [id],
    );
    for (const table of [
      'submissions',
      'question_audiences',
      'participants',
      'questions',
      'audiences',
    ])
      await client.query(`DELETE FROM ${table} WHERE event_id=$1`, [id]);
    await client.query('DELETE FROM events WHERE id=$1', [id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
