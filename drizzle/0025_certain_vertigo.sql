ALTER TABLE "ai_call_log" DROP CONSTRAINT "ai_call_log_board_id_board_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_call_log" DROP CONSTRAINT "ai_call_log_user_id_app_user_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
