-- 0008_phase1_schema_alignment.sql
-- Aligns Phase 1 tables/columns with the Drizzle schema and API code.
-- Idempotent — safe to re-run.

-- ─── pm_frequency_type enum (DB uses CALENDAR; code previously used TIME) ─────

DO $$ BEGIN
  ALTER TYPE "public"."pm_frequency_type" ADD VALUE IF NOT EXISTS 'CALENDAR';
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."pm_frequency_type" ADD VALUE IF NOT EXISTS 'CALENDAR_AND_METER';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── permit_approvals ─────────────────────────────────────────────────────────
-- Migration 0005: approver_id NOT NULL, actioned_at
-- Code: step, role NOT NULL, assigned_user_id nullable, decided_at, created_at

ALTER TABLE "permit_approvals" ADD COLUMN IF NOT EXISTS "step" integer;
ALTER TABLE "permit_approvals" ADD COLUMN IF NOT EXISTS "assigned_user_id" uuid;
ALTER TABLE "permit_approvals" ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;
ALTER TABLE "permit_approvals" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permit_approvals' AND column_name = 'approver_id'
  ) THEN
    UPDATE "permit_approvals"
      SET "assigned_user_id" = "approver_id"
      WHERE "assigned_user_id" IS NULL AND "approver_id" IS NOT NULL;
    ALTER TABLE "permit_approvals" DROP COLUMN "approver_id";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permit_approvals' AND column_name = 'actioned_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permit_approvals' AND column_name = 'decided_at'
  ) THEN
    ALTER TABLE "permit_approvals" RENAME COLUMN "actioned_at" TO "decided_at";
  END IF;
END $$;

UPDATE "permit_approvals" SET "step" = 1 WHERE "step" IS NULL;
UPDATE "permit_approvals" SET "role" = 'supervisor' WHERE "role" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permit_approvals' AND column_name = 'step'
  ) THEN
    ALTER TABLE "permit_approvals" ALTER COLUMN "step" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permit_approvals' AND column_name = 'role'
  ) THEN
    ALTER TABLE "permit_approvals" ALTER COLUMN "role" SET NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE "permit_approvals"
    ADD CONSTRAINT "permit_approvals_assigned_user_id_users_id_fk"
    FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── permit_checklist_items ───────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permit_checklist_items' AND column_name = 'is_checked'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permit_checklist_items' AND column_name = 'checked'
  ) THEN
    ALTER TABLE "permit_checklist_items" RENAME COLUMN "is_checked" TO "checked";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permit_checklist_items' AND column_name = 'checked_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permit_checklist_items' AND column_name = 'checked_by_user_id'
  ) THEN
    ALTER TABLE "permit_checklist_items" RENAME COLUMN "checked_by" TO "checked_by_user_id";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permit_checklist_items' AND column_name = 'seq'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permit_checklist_items' AND column_name = 'sequence'
  ) THEN
    ALTER TABLE "permit_checklist_items" RENAME COLUMN "seq" TO "sequence";
  END IF;
END $$;

ALTER TABLE "permit_checklist_items" ADD COLUMN IF NOT EXISTS "is_required" boolean DEFAULT true NOT NULL;
ALTER TABLE "permit_checklist_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

-- ─── storerooms ───────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'storerooms' AND column_name = 'code'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'storerooms' AND column_name = 'storeroom_num'
  ) THEN
    ALTER TABLE "storerooms" RENAME COLUMN "code" TO "storeroom_num";
  END IF;
END $$;

ALTER TABLE "storerooms" ADD COLUMN IF NOT EXISTS "storeroom_num" text;
ALTER TABLE "storerooms" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "storerooms" ADD COLUMN IF NOT EXISTS "custodian_user_id" uuid;
ALTER TABLE "storerooms" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

UPDATE "storerooms" SET "storeroom_num" = 'STR-' || LEFT("id"::text, 8) WHERE "storeroom_num" IS NULL;

-- ─── items ────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'items' AND column_name = 'unit'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'items' AND column_name = 'unit_of_issue'
  ) THEN
    ALTER TABLE "items" RENAME COLUMN "unit" TO "unit_of_issue";
  END IF;
END $$;

ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "long_description" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "commodity_code" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "manufacturer" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "part_num" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "gl_account" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "is_hazardous" boolean DEFAULT false NOT NULL;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;

-- ─── inventory_balances ───────────────────────────────────────────────────────

ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "qty_on_order" numeric(14,4) DEFAULT 0 NOT NULL;
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "min_qty" numeric(14,4) DEFAULT 0;
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "max_qty" numeric(14,4);
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "safety_stock" numeric(14,4) DEFAULT 0;
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "bin_location" text;
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "avg_cost" numeric(10,4) DEFAULT 0;
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "cost_method" "cost_method" DEFAULT 'AVERAGE';
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "last_count_date" timestamp with time zone;
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_balances' AND column_name = 'last_counted_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_balances' AND column_name = 'last_count_date'
  ) THEN
    ALTER TABLE "inventory_balances" RENAME COLUMN "last_counted_at" TO "last_count_date";
  END IF;
END $$;

-- ─── inventory_transactions ───────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_transactions' AND column_name = 'transacted_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_transactions' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE "inventory_transactions" RENAME COLUMN "transacted_by" TO "user_id";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_transactions' AND column_name = 'transacted_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_transactions' AND column_name = 'tx_date'
  ) THEN
    ALTER TABLE "inventory_transactions" RENAME COLUMN "transacted_at" TO "tx_date";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_transactions' AND column_name = 'reference'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_transactions' AND column_name = 'reference_num'
  ) THEN
    ALTER TABLE "inventory_transactions" RENAME COLUMN "reference" TO "reference_num";
  END IF;
END $$;

ALTER TABLE "inventory_transactions" ADD COLUMN IF NOT EXISTS "to_storeroom_id" uuid;
ALTER TABLE "inventory_transactions" ADD COLUMN IF NOT EXISTS "total_cost" numeric(14,2);
ALTER TABLE "inventory_transactions" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "inventory_transactions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

DO $$ BEGIN
  ALTER TABLE "inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_to_storeroom_id_storerooms_id_fk"
    FOREIGN KEY ("to_storeroom_id") REFERENCES "public"."storerooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
