CREATE TABLE IF NOT EXISTS "authoring_worker" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"sub_topic_id" uuid NOT NULL,
	"vendor" text NOT NULL,
	"ai_session_id" text,
	"session_fingerprint" text,
	"brief" text NOT NULL,
	"output" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "authoring_worker" ADD CONSTRAINT "authoring_worker_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "authoring_worker" ADD CONSTRAINT "authoring_worker_chat_id_authoring_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."authoring_chat"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "authoring_worker" ADD CONSTRAINT "authoring_worker_sub_topic_id_sub_topic_id_fk" FOREIGN KEY ("sub_topic_id") REFERENCES "public"."sub_topic"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
