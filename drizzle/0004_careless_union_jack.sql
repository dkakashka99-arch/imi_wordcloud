CREATE TABLE "semantic_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"source" text NOT NULL,
	"target" text NOT NULL,
	"method" text NOT NULL,
	"version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "semantic_queue" (
	"question_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	CONSTRAINT "semantic_queue_question_id_source_unique" UNIQUE("question_id","source"),
	CONSTRAINT "semantic_queue_status" CHECK ("semantic_queue"."status" in ('pending','review','completed'))
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "public_audience_key" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "semantic_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "semantic_history" ADD CONSTRAINT "semantic_history_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semantic_queue" ADD CONSTRAINT "semantic_queue_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "semantic_queue_pending" ON "semantic_queue" USING btree ("available_at") WHERE "semantic_queue"."status"='pending';--> statement-breakpoint
UPDATE events SET public_audience_key='student' WHERE slug='mir-27-oct' AND EXISTS(SELECT 1 FROM audiences a WHERE a.event_id=events.id AND a.key='student');

--> statement-breakpoint
INSERT INTO semantic_queue(question_id,source)
SELECT DISTINCT s.question_id,s.canonical_key FROM submissions s JOIN questions q ON q.id=s.question_id JOIN events e ON e.id=s.event_id
WHERE s.approved AND NOT e.archived AND s.original_text !~ '^[А-ЯЁ][а-яё]+[[:space:]]+[А-ЯЁ][а-яё]+'
AND s.canonical_key !~ '[<>@]' AND NOT EXISTS(SELECT 1 FROM word_aliases wa WHERE wa.question_id=s.question_id AND wa.source=s.canonical_key)
ON CONFLICT DO NOTHING;
