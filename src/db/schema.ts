import { pgTable, pgEnum, uuid, text, timestamp, integer, bigint, boolean, unique, check, foreignKey } from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
export const questionStatus = pgEnum('question_status',['draft','open','paused','closed']);
export const events = pgTable('events',{
  id:uuid().defaultRandom().primaryKey(),slug:text().notNull().unique(),title:text().notNull(),
  archived:boolean().default(false).notNull(),createdAt:timestamp({withTimezone:true}).defaultNow().notNull(),
});
export const audiences = pgTable('audiences',{
  id:uuid().defaultRandom().primaryKey(),eventId:uuid().notNull().references(()=>events.id,{onDelete:'cascade'}),key:text().notNull(),label:text().notNull(),
},t=>[unique().on(t.eventId,t.key),unique().on(t.id,t.eventId)]);
export const questions = pgTable('questions',{
  id:uuid().defaultRandom().primaryKey(),eventId:uuid().notNull().references(()=>events.id,{onDelete:'cascade'}),title:text().notNull(),
  status:questionStatus().default('draft').notNull(),maxAnswers:integer().default(3).notNull(),maxLength:integer().default(60).notNull(),
  revision:bigint({mode:'number'}).default(0).notNull(),position:integer().default(0).notNull(),
},t=>[unique().on(t.id,t.eventId),check('answer_limit',sql`${t.maxAnswers} between 1 and 10`),check('length_limit',sql`${t.maxLength} between 1 and 120`)]);
export const questionAudiences = pgTable('question_audiences',{
  id:uuid().defaultRandom().primaryKey(),eventId:uuid().notNull(),questionId:uuid().notNull(),audienceId:uuid().notNull(),active:boolean().default(false).notNull(),
},t=>[unique().on(t.questionId,t.audienceId),foreignKey({columns:[t.questionId,t.eventId],foreignColumns:[questions.id,questions.eventId]}).onDelete('cascade'),foreignKey({columns:[t.audienceId,t.eventId],foreignColumns:[audiences.id,audiences.eventId]}).onDelete('cascade')]);
export const participants=pgTable('participants',{
  id:uuid().defaultRandom().primaryKey(),eventId:uuid().notNull().references(()=>events.id,{onDelete:'cascade'}),cookieHash:text().notNull(),createdAt:timestamp({withTimezone:true}).defaultNow().notNull(),
},t=>[unique().on(t.eventId,t.cookieHash),unique().on(t.id,t.eventId)]);
export const submissions=pgTable('submissions',{
  id:uuid().defaultRandom().primaryKey(),eventId:uuid().notNull(),questionId:uuid().notNull(),audienceId:uuid().notNull(),participantId:uuid().notNull(),
  originalText:text().notNull(),canonicalKey:text().notNull(),idempotencyKey:uuid().notNull(),approved:boolean().default(true).notNull(),isDemo:boolean().default(false).notNull(),createdAt:timestamp({withTimezone:true}).defaultNow().notNull(),
},t=>[unique().on(t.questionId,t.participantId,t.canonicalKey),unique().on(t.questionId,t.participantId,t.idempotencyKey),foreignKey({columns:[t.questionId,t.eventId],foreignColumns:[questions.id,questions.eventId]}).onDelete('cascade'),foreignKey({columns:[t.audienceId,t.eventId],foreignColumns:[audiences.id,audiences.eventId]}).onDelete('cascade'),foreignKey({columns:[t.participantId,t.eventId],foreignColumns:[participants.id,participants.eventId]}).onDelete('cascade')]);
