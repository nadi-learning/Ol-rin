CREATE TABLE IF NOT EXISTS "chapter_budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"budget" integer NOT NULL,
	"sub_topic_count" integer,
	"note" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_budget_chapter_id_unique" UNIQUE("chapter_id"),
	CONSTRAINT "chapter_budget_non_negative" CHECK ("chapter_budget"."budget" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chapter_budget" ADD CONSTRAINT "chapter_budget_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chapter_budget" ADD CONSTRAINT "chapter_budget_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapter"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chapter_budget" ADD CONSTRAINT "chapter_budget_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
