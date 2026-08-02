ALTER TABLE "student_authoring_preference" ADD COLUMN "chapter_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_authoring_preference" ADD CONSTRAINT "student_authoring_preference_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapter"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "student_authoring_preference" ADD CONSTRAINT "student_authoring_preference_student_id_chapter_id_unique" UNIQUE("student_id","chapter_id");