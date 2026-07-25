ALTER TABLE "cross_concept_flag" ADD COLUMN "plan" text;--> statement-breakpoint
ALTER TABLE "cross_concept_flag" ADD COLUMN "plan_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cross_concept_flag" ADD COLUMN "plan_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cross_concept_flag" ADD CONSTRAINT "cross_concept_flag_plan_by_app_user_id_fk" FOREIGN KEY ("plan_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
