CREATE TABLE IF NOT EXISTS "question_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text DEFAULT 'image/png' NOT NULL,
	"spec" jsonb NOT NULL,
	"py_script" text,
	"verifier_label" text,
	"verifier_reason" text,
	"verifier_model" text,
	"verified_at" timestamp with time zone,
	"spec_hash" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_image_question_id_version_unique" UNIQUE("question_id","version")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_image" ADD CONSTRAINT "question_image_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_image" ADD CONSTRAINT "question_image_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
