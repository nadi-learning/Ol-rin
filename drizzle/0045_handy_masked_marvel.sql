ALTER TABLE "parent_copy" DROP CONSTRAINT "parent_copy_board_id_key_unique";--> statement-breakpoint
ALTER TABLE "parent_copy" ADD COLUMN "student_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parent_copy" ADD CONSTRAINT "parent_copy_student_id_app_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "parent_copy" ADD CONSTRAINT "parent_copy_board_id_student_id_key_unique" UNIQUE NULLS NOT DISTINCT("board_id","student_id","key");