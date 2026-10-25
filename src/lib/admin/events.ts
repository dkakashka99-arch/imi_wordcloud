import type { PoolClient } from 'pg';
import { database } from '@/db/client';
import { HttpError } from '@/lib/http';
import type { AdminCommand, AdminEvent, EventListItem } from './contracts';

export async function listEvents(): Promise<EventListItem[]> {
  const r = await database()
    .query(`SELECT e.id,e.slug,e.title,e.archived,e.rehearsal,e.created_at "createdAt",
 (SELECT count(*)::int FROM questions q WHERE q.event_id=e.id) "questionCount",
 (SELECT count(*)::int FROM submissions s WHERE s.event_id=e.id) "answerCount" FROM events e ORDER BY e.archived,e.created_at DESC,e.id`);
  return r.rows;
}
export async function getEvent(id: string): Promise<AdminEvent> {
  const client = await database().connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const event = await client.query(
      'SELECT id,slug,title,archived,rehearsal,created_at "createdAt" FROM events WHERE id=$1',
      [id],
    );
    if (!event.rows[0]) throw new HttpError(404, 'Мероприятие не найдено.');
    const audiences = await client.query(
      'SELECT id,key,label FROM audiences WHERE event_id=$1 ORDER BY key',
      [id],
    );
    const questions = await client.query(
      `SELECT q.id,q.title,q.status,q.max_answers "maxAnswers",q.max_length "maxLength",q.position,
    COALESCE(array_agg(qa.audience_id::text) FILTER(WHERE qa.audience_id IS NOT NULL),ARRAY[]::text[]) "audienceIds",
    COALESCE(bool_or(qa.active),false) active,(SELECT count(*)::int FROM submissions s WHERE s.question_id=q.id) "answerCount"
    FROM questions q LEFT JOIN question_audiences qa ON qa.question_id=q.id WHERE q.event_id=$1 GROUP BY q.id ORDER BY q.position,q.id`,
      [id],
    );
    await client.query('COMMIT');
    return { ...event.rows[0], audiences: audiences.rows, questions: questions.rows };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
function conflict(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
    throw new HttpError(409, 'Такой адрес или код группы уже существует. Выберите другой.');
  throw error;
}
async function insertEvent(client: PoolClient, title: string, slug: string) {
  const r = await client.query('INSERT INTO events(title,slug) VALUES($1,$2) RETURNING id', [
    title,
    slug,
  ]);
  return r.rows[0].id as string;
}
export async function createEvent(title: string, slug: string) {
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    const id = await insertEvent(client, title, slug);
    await client.query(`INSERT INTO audiences(event_id,key,label) VALUES($1,'all','Участники')`, [
      id,
    ]);
    await client.query('COMMIT');
    return { id };
  } catch (error) {
    await client.query('ROLLBACK');
    conflict(error);
  } finally {
    client.release();
  }
}
export async function eventCommand(eventId: string, cmd: AdminCommand): Promise<{ id: string }> {
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    const e = await client.query('SELECT id,archived FROM events WHERE id=$1 FOR UPDATE', [
      eventId,
    ]);
    if (!e.rows[0]) throw new HttpError(404, 'Мероприятие не найдено.');
    // All admin writes use event → ordered questions, shared with the participant lock order.
    const qs = await client.query(
      'SELECT id,title,status,max_answers,max_length,position FROM questions WHERE event_id=$1 ORDER BY id FOR UPDATE',
      [eventId],
    );
    if (e.rows[0].archived && !['archive', 'duplicate', 'editEvent'].includes(cmd.action))
      throw new HttpError(409, 'Сначала восстановите мероприятие из архива.');
    if (cmd.action === 'editEvent')
      await client.query('UPDATE events SET title=$2 WHERE id=$1', [eventId, cmd.title]);
    else if (cmd.action === 'archive') {
      await client.query('UPDATE events SET archived=$2 WHERE id=$1', [eventId, cmd.archived]);
      if (cmd.archived)
        await client.query(
          `UPDATE questions SET status='closed',revision=revision+1 WHERE event_id=$1`,
          [eventId],
        );
    } else if (cmd.action === 'duplicate') {
      const id = await insertEvent(client, cmd.title, cmd.slug);
      await client.query('UPDATE events SET rehearsal=$2 WHERE id=$1', [
        id,
        cmd.rehearsal ?? false,
      ]);
      const mapping = new Map<string, string>();
      const audiences = await client.query('SELECT id,key,label FROM audiences WHERE event_id=$1', [
        eventId,
      ]);
      for (const a of audiences.rows) {
        const r = await client.query(
          'INSERT INTO audiences(event_id,key,label) VALUES($1,$2,$3) RETURNING id',
          [id, a.key, a.label],
        );
        mapping.set(a.id, r.rows[0].id);
      }
      for (const q of qs.rows) {
        const r = await client.query(
          'INSERT INTO questions(event_id,title,max_answers,max_length,position) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [id, q.title, q.max_answers, q.max_length, q.position],
        );
        await client.query(
          'INSERT INTO word_aliases(question_id,source,target) SELECT $2,source,target FROM word_aliases WHERE question_id=$1',
          [q.id, r.rows[0].id],
        );
        await client.query(
          'INSERT INTO stop_words(question_id,word) SELECT $2,word FROM stop_words WHERE question_id=$1',
          [q.id, r.rows[0].id],
        );
        await client.query(
          'UPDATE questions SET premoderation=(SELECT premoderation FROM questions WHERE id=$1) WHERE id=$2',
          [q.id, r.rows[0].id],
        );
        const links = await client.query(
          'SELECT audience_id FROM question_audiences WHERE question_id=$1',
          [q.id],
        );
        for (const link of links.rows)
          await client.query(
            'INSERT INTO question_audiences(event_id,question_id,audience_id) VALUES($1,$2,$3)',
            [id, r.rows[0].id, mapping.get(link.audience_id)],
          );
      }
      await client.query('COMMIT');
      return { id };
    } else if (cmd.action === 'addAudience')
      await client.query('INSERT INTO audiences(event_id,key,label) VALUES($1,$2,$3)', [
        eventId,
        cmd.key,
        cmd.label,
      ]);
    else if (cmd.action === 'editAudience' || cmd.action === 'deleteAudience') {
      const a = await client.query('SELECT id FROM audiences WHERE event_id=$1 AND id=$2', [
        eventId,
        cmd.audienceId,
      ]);
      if (!a.rowCount) throw new HttpError(404, 'Группа не найдена.');
      if (cmd.action === 'editAudience')
        await client.query('UPDATE audiences SET label=$2 WHERE id=$1', [
          cmd.audienceId,
          cmd.label,
        ]);
      else {
        const links = await client.query(
          'SELECT id FROM question_audiences WHERE audience_id=$1 LIMIT 1',
          [cmd.audienceId],
        );
        if (links.rowCount)
          throw new HttpError(409, 'Сначала переназначьте или удалите вопросы этой группы.');
        const count = await client.query(
          'SELECT count(*)::int n FROM audiences WHERE event_id=$1',
          [eventId],
        );
        if (count.rows[0].n <= 1) throw new HttpError(409, 'Нужна хотя бы одна группа участников.');
        await client.query('DELETE FROM audiences WHERE id=$1', [cmd.audienceId]);
      }
    } else {
      if (cmd.action === 'addQuestion' || cmd.action === 'editQuestion') {
        const ids = [...new Set(cmd.audienceIds)];
        const valid = await client.query(
          'SELECT id FROM audiences WHERE event_id=$1 AND id=ANY($2::uuid[])',
          [eventId, ids],
        );
        if (valid.rowCount !== ids.length)
          throw new HttpError(400, 'Выберите группы этого мероприятия.');
        if (cmd.action === 'addQuestion') {
          const r = await client.query(
            'INSERT INTO questions(event_id,title,max_answers,max_length,position) VALUES($1,$2,$3,$4,$5) RETURNING id',
            [
              eventId,
              cmd.title,
              cmd.maxAnswers,
              cmd.maxLength,
              Math.max(-1, ...qs.rows.map((q) => q.position)) + 1,
            ],
          );
          for (const audience of ids)
            await client.query(
              'INSERT INTO question_audiences(event_id,question_id,audience_id) VALUES($1,$2,$3)',
              [eventId, r.rows[0].id, audience],
            );
        } else {
          if (!qs.rows.some((q) => q.id === cmd.questionId))
            throw new HttpError(404, 'Вопрос не найден.');
          const counts = await client.query(
            'SELECT count(*)::int n FROM submissions WHERE question_id=$1 GROUP BY participant_id ORDER BY n DESC LIMIT 1',
            [cmd.questionId],
          );
          if ((counts.rows[0]?.n || 0) > cmd.maxAnswers)
            throw new HttpError(409, 'Лимит меньше числа уже принятых ответов участника.');
          const removed = await client.query(
            'SELECT id FROM submissions WHERE question_id=$1 AND NOT (audience_id=ANY($2::uuid[])) LIMIT 1',
            [cmd.questionId, ids],
          );
          if (removed.rowCount)
            throw new HttpError(409, 'Нельзя убрать группу с уже принятыми ответами.');
          await client.query(
            'UPDATE questions SET title=$2,max_answers=$3,max_length=$4,revision=revision+1 WHERE id=$1',
            [cmd.questionId, cmd.title, cmd.maxAnswers, cmd.maxLength],
          );
          await client.query(
            'DELETE FROM question_audiences WHERE question_id=$1 AND NOT (audience_id=ANY($2::uuid[]))',
            [cmd.questionId, ids],
          );
          for (const audience of ids)
            await client.query(
              'INSERT INTO question_audiences(event_id,question_id,audience_id) VALUES($1,$2,$3) ON CONFLICT(question_id,audience_id) DO NOTHING',
              [eventId, cmd.questionId, audience],
            );
        }
      } else {
        const q = qs.rows.find((q) => q.id === cmd.questionId);
        if (!q) throw new HttpError(404, 'Вопрос не найден.');
        if (cmd.action === 'deleteQuestion') {
          const count = await client.query(
            'SELECT id FROM submissions WHERE question_id=$1 LIMIT 1',
            [q.id],
          );
          if (count.rowCount)
            throw new HttpError(
              409,
              'Вопрос с ответами сохраняется в истории. Завершите его вместо удаления.',
            );
          await client.query('DELETE FROM questions WHERE id=$1', [q.id]);
        } else if (cmd.action === 'activate') {
          const groups = await client.query(
            'SELECT audience_id FROM question_audiences WHERE question_id=$1',
            [q.id],
          );
          if (!groups.rowCount) throw new HttpError(409, 'У вопроса нет группы участников.');
          await client.query(
            'UPDATE question_audiences SET active=false WHERE audience_id=ANY($1::uuid[])',
            [groups.rows.map((a) => a.audience_id)],
          );
          await client.query('UPDATE question_audiences SET active=true WHERE question_id=$1', [
            q.id,
          ]);
          await client.query(
            `UPDATE questions SET status='paused',revision=revision+1 WHERE event_id=$1 AND status='open' AND id<>$2 AND NOT EXISTS(SELECT 1 FROM question_audiences qa WHERE qa.question_id=questions.id AND qa.active)`,
            [eventId, q.id],
          );
          await client.query(`UPDATE questions SET status='open',revision=revision+1 WHERE id=$1`, [
            q.id,
          ]);
        } else if (cmd.action === 'status') {
          if (cmd.status === 'open') {
            const active = await client.query(
              'SELECT id FROM question_audiences WHERE question_id=$1 AND active LIMIT 1',
              [q.id],
            );
            if (!active.rowCount)
              throw new HttpError(409, 'Сначала выберите этот вопрос для группы.');
          }
          if (cmd.status === 'draft') {
            const count = await client.query(
              'SELECT id FROM submissions WHERE question_id=$1 LIMIT 1',
              [q.id],
            );
            if (count.rowCount)
              throw new HttpError(409, 'Вопрос с ответами нельзя вернуть в черновик.');
          }
          await client.query('UPDATE questions SET status=$2,revision=revision+1 WHERE id=$1', [
            q.id,
            cmd.status,
          ]);
        } else if (cmd.action === 'move') {
          const sorted = [...qs.rows].sort(
            (a, b) => a.position - b.position || a.id.localeCompare(b.id),
          );
          const index = sorted.findIndex((x) => x.id === q.id),
            next = index + (cmd.direction === 'up' ? -1 : 1);
          if (next >= 0 && next < sorted.length)
            [sorted[index], sorted[next]] = [sorted[next], sorted[index]];
          for (const [position, question] of sorted.entries())
            await client.query('UPDATE questions SET position=$2 WHERE id=$1', [
              question.id,
              position,
            ]);
        }
      }
    }
    await client.query('COMMIT');
    return { id: eventId };
  } catch (error) {
    await client.query('ROLLBACK');
    conflict(error);
  } finally {
    client.release();
  }
}
