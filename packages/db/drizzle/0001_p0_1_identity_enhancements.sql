DO $$ BEGIN
  CREATE TYPE "public"."mfa_method" AS ENUM('TOTP', 'SMS', 'PUSH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "push_device_id" text;

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "password_reset_user_idx" ON "password_reset_tokens" ("user_id");

CREATE TABLE IF NOT EXISTS "mfa_methods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "method" "mfa_method" NOT NULL,
  "secret_or_target" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "enabled_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "mfa_methods_user_method_idx" ON "mfa_methods" ("user_id", "method");
