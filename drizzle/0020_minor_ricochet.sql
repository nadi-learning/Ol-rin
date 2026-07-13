ALTER TABLE "observation" ADD COLUMN "tutor_level" smallint;--> statement-breakpoint
ALTER TABLE "observation" ADD COLUMN "override_reason" text;--> statement-breakpoint
ALTER TABLE "observation" ADD COLUMN "overridden_by" uuid;--> statement-breakpoint
ALTER TABLE "observation" ADD COLUMN "overridden_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "observation" ADD CONSTRAINT "observation_overridden_by_app_user_id_fk" FOREIGN KEY ("overridden_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_tutor_level_range" CHECK ("observation"."tutor_level" between 1 and 5);