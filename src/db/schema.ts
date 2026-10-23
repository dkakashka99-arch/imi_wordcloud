import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  unique,
  check,
  foreignKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
export const questionStatus = pgEnum('question_status', ['draft', 'open', 'paused', 'closed']);
export const events = pgTable('events', {
  id: uuid().defaultRandom().primaryKey(),
  slug: text().notNull().unique(),
  title: text().notNull(),
  archived: boolean().default(false).notNull(),
  rehearsal: boolean().default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const audiences = pgTable(
  'audiences',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    key: text().notNull(),
    label: text().notNull(),
  },
  (t) => [unique().on(t.eventId, t.key), unique().on(t.id, t.eventId)],
);
export const questions = pgTable(
  'questions',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    status: questionStatus().default('draft').notNull(),
    maxAnswers: integer('max_answers').default(3).notNull(),
    maxLength: integer('max_length').default(60).notNull(),
    premoderation: boolean().default(false).notNull(),
    revision: bigint({ mode: 'number' }).default(0).notNull(),
    position: integer().default(0).notNull(),
  },
  (t) => [
    unique().on(t.id, t.eventId),
    check('answer_limit', sql`${t.maxAnswers} between 1 and 10`),
    check('length_limit', sql`${t.maxLength} between 1 and 120`),
  ],
);
export const questionAudiences = pgTable(
  'question_audiences',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull(),
    questionId: uuid('question_id').notNull(),
    audienceId: uuid('audience_id').notNull(),
    active: boolean().default(false).notNull(),
  },
  (t) => [
    unique().on(t.questionId, t.audienceId),
    uniqueIndex('one_active_question_per_audience')
      .on(t.audienceId)
      .where(sql`${t.active}`),
    foreignKey({
      columns: [t.questionId, t.eventId],
      foreignColumns: [questions.id, questions.eventId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.audienceId, t.eventId],
      foreignColumns: [audiences.id, audiences.eventId],
    }).onDelete('cascade'),
  ],
);
export const participants = pgTable(
  'participants',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    cookieHash: text('cookie_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.eventId, t.cookieHash), unique().on(t.id, t.eventId)],
);
export const submissions = pgTable(
  'submissions',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull(),
    questionId: uuid('question_id').notNull(),
    audienceId: uuid('audience_id').notNull(),
    participantId: uuid('participant_id').notNull(),
    originalText: text('original_text').notNull(),
    canonicalKey: text('canonical_key').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    approved: boolean().default(true).notNull(),
    isDemo: boolean('is_demo').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('submission_cloud_lookup').on(t.questionId, t.audienceId, t.approved),
    unique().on(t.questionId, t.participantId, t.canonicalKey),
    unique().on(t.questionId, t.participantId, t.idempotencyKey),
    foreignKey({
      columns: [t.questionId, t.eventId],
      foreignColumns: [questions.id, questions.eventId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.audienceId, t.eventId],
      foreignColumns: [audiences.id, audiences.eventId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.participantId, t.eventId],
      foreignColumns: [participants.id, participants.eventId],
    }).onDelete('cascade'),
  ],
);
export const submissionRequests = pgTable(
  'submission_requests',
  {
    id: uuid().defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    audienceId: uuid('audience_id')
      .notNull()
      .references(() => audiences.id, { onDelete: 'cascade' }),
    idempotencyKey: uuid('idempotency_key').notNull(),
    canonicalKey: text('canonical_key').notNull(),
  },
  (t) => [unique().on(t.questionId, t.participantId, t.idempotencyKey)],
);

export const admins = pgTable('admins', {
  id: uuid().defaultRandom().primaryKey(),
  login: text().notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  active: boolean().default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const adminSessions = pgTable(
  'admin_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('admin_session_expiry').on(t.expiresAt)],
);
export const loginLimits = pgTable('login_limits', {
  key: text().primaryKey(),
  attempts: integer().notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
});

export const wordAliases = pgTable(
  'word_aliases',
  {
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    source: text().notNull(),
    target: text().notNull(),
  },
  (t) => [unique().on(t.questionId, t.source)],
);
export const stopWords = pgTable(
  'stop_words',
  {
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    word: text().notNull(),
  },
  (t) => [unique().on(t.questionId, t.word)],
);
