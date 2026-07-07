CREATE TABLE IF NOT EXISTS "attempt_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"ordinal" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_image_attempt_id_ordinal_unique" UNIQUE("attempt_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"board_id" uuid NOT NULL,
	"app_user_id" uuid NOT NULL,
	"practice_session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"upload_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attempt_image" ADD CONSTRAINT "attempt_image_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attempt_image" ADD CONSTRAINT "attempt_image_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_token" ADD CONSTRAINT "upload_token_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_token" ADD CONSTRAINT "upload_token_app_user_id_app_user_id_fk" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_token" ADD CONSTRAINT "upload_token_practice_session_id_practice_session_id_fk" FOREIGN KEY ("practice_session_id") REFERENCES "public"."practice_session"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_token" ADD CONSTRAINT "upload_token_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
