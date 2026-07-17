CREATE TABLE IF NOT EXISTS "horizontal_skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "horizontal_skill_chapter_id_slug_unique" UNIQUE("chapter_id","slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "horizontal_skill_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"level" smallint,
	"prose" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "horizontal_skill_state_student_id_subject_id_slug_unique" UNIQUE("student_id","subject_id","slug"),
	CONSTRAINT "horizontal_skill_state_level_range" CHECK ("horizontal_skill_state"."level" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_chapter_insight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"insight" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_chapter_insight_student_id_chapter_id_unique" UNIQUE("student_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_subject_insight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"insight" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_subject_insight_student_id_subject_id_unique" UNIQUE("student_id","subject_id")
);
--> statement-breakpoint
ALTER TABLE "cross_concept_flag" ALTER COLUMN "from_sub_topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cross_concept_flag" ALTER COLUMN "source_observation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cross_concept_flag" ADD COLUMN "origin" text DEFAULT 'stage1_cross_concept' NOT NULL;--> statement-breakpoint
ALTER TABLE "cross_concept_flag" ADD COLUMN "source_session_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "horizontal_skill" ADD CONSTRAINT "horizontal_skill_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "horizontal_skill" ADD CONSTRAINT "horizontal_skill_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "horizontal_skill" ADD CONSTRAINT "horizontal_skill_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapter"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "horizontal_skill_state" ADD CONSTRAINT "horizontal_skill_state_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "horizontal_skill_state" ADD CONSTRAINT "horizontal_skill_state_student_id_app_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "horizontal_skill_state" ADD CONSTRAINT "horizontal_skill_state_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_chapter_insight" ADD CONSTRAINT "student_chapter_insight_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_chapter_insight" ADD CONSTRAINT "student_chapter_insight_student_id_app_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_chapter_insight" ADD CONSTRAINT "student_chapter_insight_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapter"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_subject_insight" ADD CONSTRAINT "student_subject_insight_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_subject_insight" ADD CONSTRAINT "student_subject_insight_student_id_app_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_subject_insight" ADD CONSTRAINT "student_subject_insight_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "horizontal_skill_subject_idx" ON "horizontal_skill" USING btree ("subject_id","slug");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cross_concept_flag" ADD CONSTRAINT "cross_concept_flag_source_session_id_assessment_session_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."assessment_session"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cross_concept_flag_session_idx" ON "cross_concept_flag" USING btree ("source_session_id");--> statement-breakpoint
ALTER TABLE "cross_concept_flag" ADD CONSTRAINT "cross_concept_flag_origin_provenance" CHECK (("cross_concept_flag"."origin" = 'stage1_cross_concept' and "cross_concept_flag"."source_observation_id" is not null and "cross_concept_flag"."from_sub_topic_id" is not null)
       or ("cross_concept_flag"."origin" = 'stage2_synthesis' and "cross_concept_flag"."source_session_id" is not null));