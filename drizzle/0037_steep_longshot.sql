CREATE TABLE IF NOT EXISTS "hero" (
	"hero_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hero_level" integer DEFAULT 0 NOT NULL,
	"hero_name" text,
	"hero_type" text,
	"hero_ref" text,
	"status" text DEFAULT 'active' NOT NULL,
	"persona_id" text,
	"default_voice_model" text,
	"default_chat_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_flow_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"state" text NOT NULL,
	"status" text NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"relation" text DEFAULT 'guardian' NOT NULL,
	"plan_tier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_status_check" CHECK ("parent"."status" IN ('active','inactive'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pet" (
	"pet_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_level" integer DEFAULT 0 NOT NULL,
	"pet_name" text,
	"pet_type" text,
	"pet_ref" text,
	"status" text DEFAULT 'active' NOT NULL,
	"persona_id" text,
	"default_voice_model" text,
	"default_chat_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"age" integer,
	"class" text NOT NULL,
	"tutor_id" uuid,
	"parent_id" uuid,
	"school" text,
	"pronoun" text,
	"hero_id" uuid,
	"pet_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"onboarding_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_status_check" CHECK ("student"."status" IN ('active','inactive'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tutor" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"boards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"qualifications" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_status_check" CHECK ("tutor"."status" IN ('active','inactive'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tutor_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"progress_snapshot" jsonb,
	"ended_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_assignment_status_check" CHECK ("tutor_assignment"."status" IN ('active','ended'))
);
--> statement-breakpoint
ALTER TABLE "membership" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "parent_child" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tutor_student" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "membership" CASCADE;--> statement-breakpoint
DROP TABLE "parent_child" CASCADE;--> statement-breakpoint
DROP TABLE "tutor_student" CASCADE;--> statement-breakpoint
ALTER TABLE "app_user" DROP CONSTRAINT "app_user_email_unique";--> statement-breakpoint
ALTER TABLE "onboarding" DROP CONSTRAINT "onboarding_user_id_board_id_unique";--> statement-breakpoint
ALTER TABLE "onboarding" DROP CONSTRAINT "onboarding_board_id_board_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding" DROP CONSTRAINT "onboarding_user_id_app_user_id_fk";
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "phone" text;--> statement-breakpoint
-- HAND-EDIT (ID-0): user_type is NOT NULL with no default, so add it nullable,
-- backfill existing rows to 'student' (the transitional value; the cutover fixes
-- the founder to 'admin'), then enforce NOT NULL. Adding NOT NULL directly would
-- fail on any pre-existing app_user row.
ALTER TABLE "app_user" ADD COLUMN "user_type" text;--> statement-breakpoint
UPDATE "app_user" SET "user_type" = 'student' WHERE "user_type" IS NULL;--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "user_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- HAND-EDIT (ID-0): same NOT-NULL-on-existing-rows fix. Backfill `state` from
-- the old `current_step` (the resume point) before that column is dropped below.
ALTER TABLE "onboarding" ADD COLUMN "state" text;--> statement-breakpoint
UPDATE "onboarding" SET "state" = COALESCE("current_step", 'welcome') WHERE "state" IS NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ALTER COLUMN "state" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_flow_log" ADD CONSTRAINT "onboarding_flow_log_onboarding_id_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboarding"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parent" ADD CONSTRAINT "parent_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student" ADD CONSTRAINT "student_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student" ADD CONSTRAINT "student_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student" ADD CONSTRAINT "student_tutor_id_app_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student" ADD CONSTRAINT "student_parent_id_app_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student" ADD CONSTRAINT "student_hero_id_hero_hero_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."hero"("hero_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student" ADD CONSTRAINT "student_pet_id_pet_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("pet_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tutor" ADD CONSTRAINT "tutor_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tutor_assignment" ADD CONSTRAINT "tutor_assignment_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tutor_assignment" ADD CONSTRAINT "tutor_assignment_student_id_app_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tutor_assignment" ADD CONSTRAINT "tutor_assignment_tutor_id_app_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tutor_assignment_student" ON "tutor_assignment" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tutor_assignment_tutor" ON "tutor_assignment" USING btree ("tutor_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- HAND-EDIT (ID-0): onboarding leaves RLS and becomes GLOBAL. Drop the
-- board-claim policy + FORCE/ENABLE before removing the board_id column the
-- policy keys on — otherwise DROP COLUMN errors on the dependent policy.
-- migrate.ts no longer re-applies a policy (onboarding is out of TENANT_SCOPED).
DROP POLICY IF EXISTS "board_isolation" ON "onboarding";--> statement-breakpoint
ALTER TABLE "onboarding" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "onboarding" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "onboarding" DROP COLUMN IF EXISTS "board_id";--> statement-breakpoint
ALTER TABLE "onboarding" DROP COLUMN IF EXISTS "current_step";--> statement-breakpoint
ALTER TABLE "onboarding" DROP COLUMN IF EXISTS "grade";--> statement-breakpoint
ALTER TABLE "onboarding" DROP COLUMN IF EXISTS "pronoun";--> statement-breakpoint
ALTER TABLE "onboarding" DROP COLUMN IF EXISTS "school";--> statement-breakpoint
ALTER TABLE "onboarding" DROP COLUMN IF EXISTS "fav_character";--> statement-breakpoint
ALTER TABLE "onboarding" DROP COLUMN IF EXISTS "fun_fact_about";--> statement-breakpoint
ALTER TABLE "onboarding" DROP COLUMN IF EXISTS "fun_fact";--> statement-breakpoint
ALTER TABLE "onboarding" DROP COLUMN IF EXISTS "pet";--> statement-breakpoint
ALTER TABLE "onboarding" DROP COLUMN IF EXISTS "phone";--> statement-breakpoint
ALTER TABLE "onboarding" DROP COLUMN IF EXISTS "completed_at";--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_referral_code_unique" UNIQUE("referral_code");--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_email_phone_type_uq" UNIQUE NULLS NOT DISTINCT("email","phone","user_type");--> statement-breakpoint
-- HAND-EDIT (ID-0): the old unique was (user_id, board_id); the new one is
-- (user_id). Collapse any pre-existing multi-board onboarding rows to one per
-- user (keep the newest) so the unique can land. Post-ID-0 there is one
-- onboarding per profile (keyed on user_id = app_user.id).
DELETE FROM "onboarding" a USING "onboarding" b
  WHERE a.user_id = b.user_id
    AND (a.started_at < b.started_at OR (a.started_at = b.started_at AND a.ctid < b.ctid));--> statement-breakpoint
ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_user_type_check" CHECK ("app_user"."user_type" IN ('student','tutor','parent','admin'));--> statement-breakpoint
ALTER TABLE "board" ADD CONSTRAINT "board_status_check" CHECK ("board"."status" IN ('active','inactive'));