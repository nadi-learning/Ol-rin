CREATE TABLE IF NOT EXISTS "assessment_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"assignment_id" uuid,
	"sub_topic_ids" uuid[] NOT NULL,
	"drafts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_session" ADD CONSTRAINT "assessment_session_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_session" ADD CONSTRAINT "assessment_session_student_id_app_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_session" ADD CONSTRAINT "assessment_session_tutor_id_app_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_session" ADD CONSTRAINT "assessment_session_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_session_open_assignment_idx" ON "assessment_session" USING btree ("assignment_id") WHERE "assessment_session"."status" = 'open' and "assessment_session"."assignment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_session_open_catchall_idx" ON "assessment_session" USING btree ("student_id") WHERE "assessment_session"."status" = 'open' and "assessment_session"."assignment_id" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_session_student_idx" ON "assessment_session" USING btree ("student_id","status");