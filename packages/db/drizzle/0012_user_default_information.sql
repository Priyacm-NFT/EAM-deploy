-- P0/P1: User "Default Information" profile screen (Maximo parity)
-- Self-service fields a logged-in user sets for themselves: Default Insert
-- Site/Org, display-filter behaviour, side nav mode, self-service storeroom,
-- default application, language/locale/timezone.

DO $$ BEGIN
  CREATE TYPE "side_nav_mode" AS ENUM ('DISPLAY', 'HIDE', 'SECURITY_GROUP');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "default_org_id" uuid,
  ADD COLUMN IF NOT EXISTS "default_site_id" uuid,
  ADD COLUMN IF NOT EXISTS "use_default_site_as_filter" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "side_nav_mode" "side_nav_mode" NOT NULL DEFAULT 'SECURITY_GROUP',
  ADD COLUMN IF NOT EXISTS "storeroom_site_id" uuid,
  ADD COLUMN IF NOT EXISTS "default_storeroom" text,
  ADD COLUMN IF NOT EXISTS "user_default_application" text,
  ADD COLUMN IF NOT EXISTS "language" text,
  ADD COLUMN IF NOT EXISTS "locale" text,
  ADD COLUMN IF NOT EXISTS "timezone" text,
  ADD COLUMN IF NOT EXISTS "calendar_type" text,
  ADD COLUMN IF NOT EXISTS "default_repair_facility" text,
  ADD COLUMN IF NOT EXISTS "division" text,
  ADD COLUMN IF NOT EXISTS "line3" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "line4" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "line5" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "line6" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- No FK constraint on default_org_id/default_site_id/storeroom_site_id by
-- design (avoids a circular schema-file dependency — see identity.ts
-- comment). Referential integrity enforced in the API route instead.
-- Index the two lookups that matter for read performance.
CREATE INDEX IF NOT EXISTS "users_default_site_idx" ON "users" ("default_site_id");
CREATE INDEX IF NOT EXISTS "users_default_org_idx" ON "users" ("default_org_id");
