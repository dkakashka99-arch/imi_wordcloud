CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"admin_id" uuid,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"revision" bigint NOT NULL,
	"review_revision" bigint NOT NULL,
	"cache_key" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"result" jsonb,
	"decisions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"usage" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ai_job_status" CHECK ("ai_jobs"."status" in ('running','completed','failed','discarded')),
	CONSTRAINT "ai_job_kind" CHECK ("ai_jobs"."kind" in ('aliases','moderation','summary'))
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "ai_summary" jsonb;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "ai_summary_revision" bigint;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_job_cache" ON "ai_jobs" USING btree ("question_id","cache_key");--> statement-breakpoint
CREATE INDEX "ai_job_history" ON "ai_jobs" USING btree ("question_id","created_at");