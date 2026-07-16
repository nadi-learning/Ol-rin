CREATE TABLE IF NOT EXISTS "ai_call_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid,
	"user_id" uuid,
	"endpoint" text NOT NULL,
	"model" text NOT NULL,
	"vendor_id" text,
	"slot_id" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"thinking_tokens" integer,
	"latency_ms" integer,
	"timeout_ms" integer,
	"ok" boolean DEFAULT true NOT NULL,
	"finish_reason" text,
	"error_cause" text,
	"error_message" text,
	"prompt_in" text,
	"prompt_out" text,
	"ai_session_id" text,
	"session_fingerprint" text,
	"attempt" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_call_log_endpoint_ts" ON "ai_call_log" USING btree ("endpoint","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_call_log_ok_ts" ON "ai_call_log" USING btree ("ok","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_call_log_board_ts" ON "ai_call_log" USING btree ("board_id","created_at");