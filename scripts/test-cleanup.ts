import type { Pool } from 'pg';
// Remove only a test-owned event, children first; never run against real events.
export async function removeTestEvent(db: Pool, id: string, expectedSlug?: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (expectedSlug) {
      const owned = await client.query(
        'SELECT 1 FROM events WHERE id=$1 AND slug=$2 AND rehearsal FOR UPDATE',
        [id, expectedSlug],
      );
      if (owned.rowCount !== 1) throw new Error('Synthetic ownership check failed');
    }
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
