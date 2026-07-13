CREATE TABLE IF NOT EXISTS "cross_concept_flag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"from_sub_topic_id" uuid NOT NULL,
	"note" text NOT NULL,
	"source_observation_id" uuid NOT NULL,
	"addressed_at" timestamp with time zone,
	"addressed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cross_concept_flag_source_observation_id_unique" UNIQUE("source_observation_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cross_concept_flag" ADD CONSTRAINT "cross_concept_flag_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cross_concept_flag" ADD CONSTRAINT "cross_concept_flag_student_id_app_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cross_concept_flag" ADD CONSTRAINT "cross_concept_flag_from_sub_topic_id_sub_topic_id_fk" FOREIGN KEY ("from_sub_topic_id") REFERENCES "public"."sub_topic"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cross_concept_flag" ADD CONSTRAINT "cross_concept_flag_source_observation_id_observation_id_fk" FOREIGN KEY ("source_observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cross_concept_flag" ADD CONSTRAINT "cross_concept_flag_addressed_by_app_user_id_fk" FOREIGN KEY ("addressed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
