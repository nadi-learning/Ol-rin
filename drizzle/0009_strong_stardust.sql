ALTER TABLE "authoring_chat" ADD COLUMN "chapter_id" uuid;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "image" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "authoring_chat" ADD CONSTRAINT "authoring_chat_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapter"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
