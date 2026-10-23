import { Pool } from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const e = await client.query(
    `INSERT INTO events(slug,title) VALUES('mir-27-oct','Встреча студентов и работодателей — 27.10.2026') ON CONFLICT(slug) DO NOTHING RETURNING id`,
  );
  if (e.rowCount) {
    for (const [key, label, title] of [
      ['student', 'Студенты', 'Что вы ожидаете от будущей работы?'],
      ['employer', 'Работодатели', 'Какие навыки и качества вы ожидаете от будущих сотрудников?'],
    ]) {
      const a = await client.query(
        'INSERT INTO audiences(event_id,key,label) VALUES($1,$2,$3) RETURNING id',
        [e.rows[0].id, key, label],
      );
      const q = await client.query(
        `INSERT INTO questions(event_id,title,status) VALUES($1,$2,'open') RETURNING id`,
        [e.rows[0].id, title],
      );
      await client.query(
        'INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',
        [e.rows[0].id, q.rows[0].id, a.rows[0].id],
      );
    }
  }
  await client.query('COMMIT');
  console.log('Seed complete; existing events left unchanged.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
