CREATE TABLE "stop_words" (
	"question_id" uuid NOT NULL,
	"word" text NOT NULL,
	CONSTRAINT "stop_words_question_id_word_unique" UNIQUE("question_id","word")
);
--> statement-breakpoint
CREATE TABLE "word_aliases" (
	"question_id" uuid NOT NULL,
	"source" text NOT NULL,
	"target" text NOT NULL,
	CONSTRAINT "word_aliases_question_id_source_unique" UNIQUE("question_id","source")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "rehearsal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "premoderation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stop_words" ADD CONSTRAINT "stop_words_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_aliases" ADD CONSTRAINT "word_aliases_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;