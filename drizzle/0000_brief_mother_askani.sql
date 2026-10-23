CREATE TYPE "public"."question_status" AS ENUM('draft', 'open', 'paused', 'closed');--> statement-breakpoint
CREATE TABLE "audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eventId" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "audiences_eventId_key_unique" UNIQUE("eventId","key"),
	CONSTRAINT "audiences_id_eventId_unique" UNIQUE("id","eventId")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eventId" uuid NOT NULL,
	"cookieHash" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_eventId_cookieHash_unique" UNIQUE("eventId","cookieHash"),
	CONSTRAINT "participants_id_eventId_unique" UNIQUE("id","eventId")
);
--> statement-breakpoint
CREATE TABLE "question_audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eventId" uuid NOT NULL,
	"questionId" uuid NOT NULL,
	"audienceId" uuid NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	CONSTRAINT "question_audiences_questionId_audienceId_unique" UNIQUE("questionId","audienceId")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eventId" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "question_status" DEFAULT 'draft' NOT NULL,
	"maxAnswers" integer DEFAULT 3 NOT NULL,
	"maxLength" integer DEFAULT 60 NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "questions_id_eventId_unique" UNIQUE("id","eventId"),
	CONSTRAINT "answer_limit" CHECK ("questions"."maxAnswers" between 1 and 10),
	CONSTRAINT "length_limit" CHECK ("questions"."maxLength" between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eventId" uuid NOT NULL,
	"questionId" uuid NOT NULL,
	"audienceId" uuid NOT NULL,
	"participantId" uuid NOT NULL,
	"originalText" text NOT NULL,
	"canonicalKey" text NOT NULL,
	"idempotencyKey" uuid NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	"isDemo" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_questionId_participantId_canonicalKey_unique" UNIQUE("questionId","participantId","canonicalKey"),
	CONSTRAINT "submissions_questionId_participantId_idempotencyKey_unique" UNIQUE("questionId","participantId","idempotencyKey")
);
--> statement-breakpoint
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_eventId_events_id_fk" FOREIGN KEY ("eventId") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_eventId_events_id_fk" FOREIGN KEY ("eventId") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_audiences" ADD CONSTRAINT "question_audiences_questionId_eventId_questions_id_eventId_fk" FOREIGN KEY ("questionId","eventId") REFERENCES "public"."questions"("id","eventId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_audiences" ADD CONSTRAINT "question_audiences_audienceId_eventId_audiences_id_eventId_fk" FOREIGN KEY ("audienceId","eventId") REFERENCES "public"."audiences"("id","eventId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_eventId_events_id_fk" FOREIGN KEY ("eventId") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_questionId_eventId_questions_id_eventId_fk" FOREIGN KEY ("questionId","eventId") REFERENCES "public"."questions"("id","eventId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_audienceId_eventId_audiences_id_eventId_fk" FOREIGN KEY ("audienceId","eventId") REFERENCES "public"."audiences"("id","eventId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_participantId_eventId_participants_id_eventId_fk" FOREIGN KEY ("participantId","eventId") REFERENCES "public"."participants"("id","eventId") ON DELETE cascade ON UPDATE no action;