ALTER TABLE "mastery_history" ALTER COLUMN "conceptual_level" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mastery_history" ALTER COLUMN "procedural_level" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mastery_state" ALTER COLUMN "conceptual_level" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mastery_state" ALTER COLUMN "procedural_level" DROP NOT NULL;