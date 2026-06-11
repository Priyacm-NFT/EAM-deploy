-- Bounce tracking columns on delivery log + bounce suppression list

ALTER TABLE "notification_delivery_log"
  ADD COLUMN IF NOT EXISTS "bounce_type" text,
  ADD COLUMN IF NOT EXISTS "bounce_code" text,
  ADD COLUMN IF NOT EXISTS "bounce_message" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_bounce_list" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "email" text NOT NULL,
  "bounce_type" text NOT NULL,
  "bounce_code" text,
  "bounce_message" text,
  "suppress_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_bounce_list_tenant_email_idx"
  ON "email_bounce_list" ("tenant_id", "email");
--> statement-breakpoint
-- Fix accidental leading/trailing whitespace in SMTP hostnames
UPDATE "smtp_configurations" SET "host" = TRIM("host") WHERE "host" <> TRIM("host");
