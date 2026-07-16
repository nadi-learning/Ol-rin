CREATE TABLE IF NOT EXISTS "onboarding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"current_step" text NOT NULL,
	"grade" text,
	"school" text,
	"fav_character" text,
	"phone" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "onboarding_user_id_board_id_unique" UNIQUE("user_id","board_id"),
	CONSTRAINT "onboarding_status" CHECK ("onboarding"."status" IN ('in_progress', 'completed'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
