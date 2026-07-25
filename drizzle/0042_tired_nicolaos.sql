CREATE TABLE IF NOT EXISTS "parent_link_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_user_id" uuid NOT NULL,
	"entered_identifier" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_student_id" uuid,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_link_request_status_check" CHECK ("parent_link_request"."status" IN ('pending','linked','rejected'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parent_link_request" ADD CONSTRAINT "parent_link_request_parent_user_id_app_user_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parent_link_request" ADD CONSTRAINT "parent_link_request_resolved_student_id_app_user_id_fk" FOREIGN KEY ("resolved_student_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parent_link_request" ADD CONSTRAINT "parent_link_request_resolved_by_app_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
