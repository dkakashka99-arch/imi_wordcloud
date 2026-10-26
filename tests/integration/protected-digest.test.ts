import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { database } from '../../src/db/client';
import { protectedEventDigest } from '../../scripts/protected-event-digest';
import { removeTestEvent } from '../../scripts/test-cleanup';
const slug = `digest-test-${randomUUID()}`;
let event: string;
let question: string;
beforeAll(async () => {
  const db = database();
  event = (
    await db.query(
      "INSERT INTO events(slug,title,rehearsal) VALUES($1,'Synthetic digest',true) RETURNING id",
      [slug],
    )
  ).rows[0].id;
  question = (
    await db.query("INSERT INTO questions(event_id,title) VALUES($1,'Synthetic') RETURNING id", [
      event,
    ])
  ).rows[0].id;
  await db.query(
    "INSERT INTO semantic_queue(question_id,source,status,error) VALUES($1,'synthetic','review','protected_event')",
    [question],
  );
});
afterAll(async () => {
  if (event) await removeTestEvent(database(), event, slug);
  await database().end();
});
it('detects queue error_detail and moderation metadata changes without modifying data', async () => {
  const db = database();
  const before = await protectedEventDigest(db, slug);
  expect(await protectedEventDigest(db, slug)).toBe(before);
  await db.query("UPDATE semantic_queue SET error_detail='synthetic-change' WHERE question_id=$1", [
    question,
  ]);
  const queueChanged = await protectedEventDigest(db, slug);
  expect(queueChanged).not.toBe(before);
  await db.query('UPDATE questions SET premoderation=true WHERE id=$1', [question]);
  expect(await protectedEventDigest(db, slug)).not.toBe(queueChanged);
});
it('refuses cleanup if the caller has the wrong ownership slug', async () => {
  await expect(removeTestEvent(database(), event, 'wrong-slug')).rejects.toThrow(
    'Synthetic ownership check failed',
  );
  expect((await database().query('SELECT id FROM events WHERE id=$1', [event])).rowCount).toBe(1);
});
