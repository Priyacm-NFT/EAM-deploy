-- FIX (Maximo meter rolldown parity): real Maximo puts the rolldown
-- control on the *receiving* meter ("Accept Rolldown From": NONE /
-- PARENT_ASSET / LOCATION), not on the source meter. This migration:
--   1. Adds the accept_rolldown_from enum + column to asset_meters.
--   2. Migrates existing data: any asset meter previously flagged
--      rolldown = true had its reading cascaded to same-named meters on
--      its direct child assets — this sets those children's new
--      accept_rolldown_from to 'PARENT_ASSET' so the same effective
--      behaviour continues under the new (correct) direction.
--   3. Drops the old rolldown column.
--   4. Creates location_meters / location_meter_readings — Maximo
--      attaches meters to Locations too, but (per Maximo) a Location
--      meter can never itself accept a rolldown, so it has no
--      accept_rolldown_from column at all — it can only ever be a
--      rolldown *source* for an asset meter set to 'LOCATION'.

DO $$ BEGIN
  CREATE TYPE "public"."accept_rolldown_from" AS ENUM('NONE', 'PARENT_ASSET', 'LOCATION');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "asset_meters" ADD COLUMN IF NOT EXISTS "accept_rolldown_from" "accept_rolldown_from" DEFAULT 'NONE' NOT NULL;
--> statement-breakpoint

-- Preserve existing rolldown behaviour under the new direction: a child
-- asset's meter of the same name as a rolldown-flagged parent meter now
-- carries the flag itself.
UPDATE "asset_meters" AS "child_meter"
SET "accept_rolldown_from" = 'PARENT_ASSET'
FROM "asset_meters" AS "parent_meter"
INNER JOIN "assets" AS "child_asset" ON "child_asset"."parent_asset_id" = "parent_meter"."asset_id"
WHERE "parent_meter"."rolldown" = true
  AND "child_meter"."asset_id" = "child_asset"."id"
  AND "child_meter"."name" = "parent_meter"."name";
--> statement-breakpoint

ALTER TABLE "asset_meters" DROP COLUMN IF EXISTS "rolldown";
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "location_meters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "location_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "unit" text NOT NULL,
  "meter_type" "meter_type" DEFAULT 'CONTINUOUS' NOT NULL,
  "last_reading" numeric(18, 4),
  "last_reading_date" timestamp with time zone,
  "rollover_value" numeric(18, 4),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "location_meters" ADD CONSTRAINT "location_meters_location_id_locations_id_fk"
    FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "location_meters" ADD CONSTRAINT "location_meters_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "location_meters_location_idx" ON "location_meters" USING btree ("location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "location_meters_location_name_idx" ON "location_meters" USING btree ("location_id","name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "location_meter_readings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "meter_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "value" numeric(18, 4) NOT NULL,
  "delta" numeric(18, 4),
  "reading_date" timestamp with time zone DEFAULT now() NOT NULL,
  "source" text DEFAULT 'MANUAL',
  "logged_by_user_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "location_meter_readings" ADD CONSTRAINT "location_meter_readings_meter_id_location_meters_id_fk"
    FOREIGN KEY ("meter_id") REFERENCES "public"."location_meters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "location_meter_readings" ADD CONSTRAINT "location_meter_readings_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "location_meter_readings" ADD CONSTRAINT "location_meter_readings_logged_by_user_id_users_id_fk"
    FOREIGN KEY ("logged_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "location_meter_readings_meter_idx" ON "location_meter_readings" USING btree ("meter_id");
