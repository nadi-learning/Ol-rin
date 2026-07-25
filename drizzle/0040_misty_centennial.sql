CREATE TABLE IF NOT EXISTS "mastery_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"period" date NOT NULL,
	"covered_count" integer NOT NULL,
	"solid_count" integer NOT NULL,
	"metrics" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mastery_snapshot_student_id_period_unique" UNIQUE("student_id","period")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mastery_snapshot" ADD CONSTRAINT "mastery_snapshot_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mastery_snapshot" ADD CONSTRAINT "mastery_snapshot_student_id_app_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
