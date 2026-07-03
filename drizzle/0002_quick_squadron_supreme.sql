ALTER TABLE "content_unit" ADD COLUMN "chapter_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_unit" ADD CONSTRAINT "content_unit_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapter"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
