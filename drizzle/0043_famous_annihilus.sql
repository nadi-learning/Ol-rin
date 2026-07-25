CREATE TABLE IF NOT EXISTS "referral" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"code_used" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_referred_user_id_unique" UNIQUE("referred_user_id"),
	CONSTRAINT "referral_status_check" CHECK ("referral"."status" IN ('pending','qualified','void')),
	CONSTRAINT "referral_no_self_check" CHECK ("referral"."referrer_user_id" <> "referral"."referred_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral_reward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"beneficiary_user_id" uuid NOT NULL,
	"side" text NOT NULL,
	"percent_off" smallint NOT NULL,
	"months" smallint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"redeemed_by" uuid,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_reward_referral_side_uq" UNIQUE("referral_id","side"),
	CONSTRAINT "referral_reward_side_check" CHECK ("referral_reward"."side" IN ('referrer','referred')),
	CONSTRAINT "referral_reward_status_check" CHECK ("referral_reward"."status" IN ('pending','redeemed','void'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referral" ADD CONSTRAINT "referral_referrer_user_id_app_user_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referral" ADD CONSTRAINT "referral_referred_user_id_app_user_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referral" ADD CONSTRAINT "referral_resolved_by_app_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referral_reward" ADD CONSTRAINT "referral_reward_referral_id_referral_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referral"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referral_reward" ADD CONSTRAINT "referral_reward_beneficiary_user_id_app_user_id_fk" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referral_reward" ADD CONSTRAINT "referral_reward_redeemed_by_app_user_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_referrer_idx" ON "referral" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_reward_beneficiary_idx" ON "referral_reward" USING btree ("beneficiary_user_id");