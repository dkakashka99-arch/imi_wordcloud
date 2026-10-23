CREATE TYPE "public"."question_status" AS ENUM('draft', 'open', 'paused', 'closed');--> statement-breakpoint
CREATE TABLE "audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "audiences_event_id_key_unique" UNIQUE("event_id","key"),
	CONSTRAINT "audiences_id_event_id_unique" UNIQUE("id","event_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"cookie_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_event_id_cookie_hash_unique" UNIQUE("event_id","cookie_hash"),
	CONSTRAINT "participants_id_event_id_unique" UNIQUE("id","event_id")
);
--> statement-breakpoint
CREATE TABLE "question_audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"audience_id" uuid NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	CONSTRAINT "question_audiences_question_id_audience_id_unique" UNIQUE("question_id","audience_id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "question_status" DEFAULT 'draft' NOT NULL,
	"max_answers" integer DEFAULT 3 NOT NULL,
	"max_length" integer DEFAULT 60 NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "questions_id_event_id_unique" UNIQUE("id","event_id"),
	CONSTRAINT "answer_limit" CHECK ("questions"."max_answers" between 1 and 10),
	CONSTRAINT "length_limit" CHECK ("questions"."max_length" between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "submission_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"audience_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"canonical_key" text NOT NULL,
	CONSTRAINT "submission_requests_question_id_participant_id_idempotency_key_unique" UNIQUE("question_id","participant_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"audience_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"original_text" text NOT NULL,
	"canonical_key" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_question_id_participant_id_canonical_key_unique" UNIQUE("question_id","participant_id","canonical_key"),
	CONSTRAINT "submissions_question_id_participant_id_idempotency_key_unique" UNIQUE("question_id","participant_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_audiences" ADD CONSTRAINT "question_audiences_question_id_event_id_questions_id_event_id_fk" FOREIGN KEY ("question_id","event_id") REFERENCES "public"."questions"("id","event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_audiences" ADD CONSTRAINT "question_audiences_audience_id_event_id_audiences_id_event_id_fk" FOREIGN KEY ("audience_id","event_id") REFERENCES "public"."audiences"("id","event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_requests" ADD CONSTRAINT "submission_requests_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_requests" ADD CONSTRAINT "submission_requests_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_requests" ADD CONSTRAINT "submission_requests_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_question_id_event_id_questions_id_event_id_fk" FOREIGN KEY ("question_id","event_id") REFERENCES "public"."questions"("id","event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_audience_id_event_id_audiences_id_event_id_fk" FOREIGN KEY ("audience_id","event_id") REFERENCES "public"."audiences"("id","event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_participant_id_event_id_participants_id_event_id_fk" FOREIGN KEY ("participant_id","event_id") REFERENCES "public"."participants"("id","event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_question_per_audience" ON "question_audiences" USING btree ("audience_id") WHERE "question_audiences"."active";--> statement-breakpoint
CREATE INDEX "submission_cloud_lookup" ON "submissions" USING btree ("question_id","audience_id","approved");