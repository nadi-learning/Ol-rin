ALTER TABLE "authoring_worker" ADD COLUMN "messages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "authoring_worker" ADD COLUMN "status" text DEFAULT 'drafted' NOT NULL;