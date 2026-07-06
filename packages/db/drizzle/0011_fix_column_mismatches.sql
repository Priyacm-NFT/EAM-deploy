-- 0006_fix_column_mismatches.sql
-- Fixes column name mismatches between the Drizzle schema (code) and
-- what was physically created in the DB by migrations 0004 & 0005.
-- All statements are fully idempotent.

-- ─── asset_move_history ───────────────────────────────────────────────────────
-- Code uses: movedByUserId, tenantId, fromLocationId, toLocationId, movedAt
-- DB has:    moved_by,  (no tenant_id), from_location_id, to_location_id, moved_at

-- Add tenant_id (code inserts it)
ALTER TABLE "asset_move_history" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
DO $$ BEGIN
  ALTER TABLE "asset_move_history"
    ADD CONSTRAINT "asset_move_history_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Rename moved_by → moved_by_user_id (code uses movedByUserId which maps to moved_by_user_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='asset_move_history' AND column_name='moved_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='asset_move_history' AND column_name='moved_by_user_id'
  ) THEN
    ALTER TABLE "asset_move_history" RENAME COLUMN "moved_by" TO "moved_by_user_id";
  END IF;
END $$;

-- ─── asset_meters ─────────────────────────────────────────────────────────────
-- Code uses: rolloverValue → rollover_value
-- DB has:    rollover_val
-- Code also uses: lastReading, lastReadingDate (these need to be added)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='asset_meters' AND column_name='rollover_val'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='asset_meters' AND column_name='rollover_value'
  ) THEN
    ALTER TABLE "asset_meters" RENAME COLUMN "rollover_val" TO "rollover_value";
  END IF;
END $$;

-- Add lastReading / lastReadingDate columns used by the meter reading logic
ALTER TABLE "asset_meters" ADD COLUMN IF NOT EXISTS "last_reading" numeric(14,2);
ALTER TABLE "asset_meters" ADD COLUMN IF NOT EXISTS "last_reading_date" timestamp with time zone;

-- ─── asset_meter_readings ─────────────────────────────────────────────────────
-- Code uses: value, delta, loggedByUserId, readingDate, tenantId
-- DB has:    reading (not value), entered_by (not logged_by_user_id), no delta, no tenant_id

DO $$
BEGIN
  -- reading → value
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='asset_meter_readings' AND column_name='reading'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='asset_meter_readings' AND column_name='value'
  ) THEN
    ALTER TABLE "asset_meter_readings" RENAME COLUMN "reading" TO "value";
  END IF;
END $$;

DO $$
BEGIN
  -- entered_by → logged_by_user_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='asset_meter_readings' AND column_name='entered_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='asset_meter_readings' AND column_name='logged_by_user_id'
  ) THEN
    ALTER TABLE "asset_meter_readings" RENAME COLUMN "entered_by" TO "logged_by_user_id";
  END IF;
END $$;

-- Add delta and tenant_id
ALTER TABLE "asset_meter_readings" ADD COLUMN IF NOT EXISTS "delta" numeric(14,2);
ALTER TABLE "asset_meter_readings" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
DO $$ BEGIN
  ALTER TABLE "asset_meter_readings"
    ADD CONSTRAINT "asset_meter_readings_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── asset_meter_readings: reading_date already exists, code uses same name ───
-- (no change needed for reading_date)

-- ─── wo_labour ────────────────────────────────────────────────────────────────
-- Code uses: regularHrs, overtimeHrs → regular_hrs, overtime_hrs already correct
-- Code uses: workDate → work_date already correct
-- No changes needed

-- ─── pm_masters ───────────────────────────────────────────────────────────────
-- Code may use: assignedToUserId, assignedToGroupId
-- DB has: assigned_to_user_id, assigned_to_group_id — already correct camelCase maps fine

-- ─── storerooms ───────────────────────────────────────────────────────────────
-- Code uses: siteId → site_id already correct
-- No changes needed

-- ─── inventory_transactions ───────────────────────────────────────────────────
-- Code uses: transactedBy, transactedAt → transacted_by, transacted_at already correct
-- No changes needed

-- ─── Verify summary (run in pgAdmin to confirm) ───────────────────────────────
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'asset_move_history' ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'asset_meters' ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'asset_meter_readings' ORDER BY ordinal_position;
