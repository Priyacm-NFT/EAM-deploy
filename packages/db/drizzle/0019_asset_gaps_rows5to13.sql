-- Sheet rows 5-13 — Asset/Location gap analysis, remaining schema
-- additions. Row 5 (parent-reset on non-CM move) and Row 6 (cross-Org
-- block) need no new columns — pure logic in assets.ts. Rows 14-16
-- (CM Location flag/item/asset-required) were already added in
-- migration 0017.

DO $$ BEGIN
  CREATE TYPE "asset_type" AS ENUM ('NORMAL', 'STRUCTURAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Row 7 — Structural vs Normal (PBS) asset type field
ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "asset_type" "asset_type" NOT NULL DEFAULT 'NORMAL';
--> statement-breakpoint

-- Row 8 — Meter Rolldown
ALTER TABLE "asset_meters"
  ADD COLUMN IF NOT EXISTS "rolldown" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- Row 11 — Downtime tracking directly on Asset record
CREATE TABLE IF NOT EXISTS "asset_downtime_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "start_time" timestamp with time zone NOT NULL,
  "end_time" timestamp with time zone,
  "reason_code" text,
  "notes" text,
  "work_order_id" uuid REFERENCES "work_orders"("id") ON DELETE SET NULL,
  "logged_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_downtime_asset_idx" ON "asset_downtime_logs" ("asset_id");
CREATE INDEX IF NOT EXISTS "asset_downtime_tenant_idx" ON "asset_downtime_logs" ("tenant_id");
--> statement-breakpoint

-- Row 12 — Classification attribute inheritance with per-attribute lock
ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "class_attribute_overrides" jsonb DEFAULT '{}';
--> statement-breakpoint

-- Row 13 — Linear Assets
ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "is_linear" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "length_unit" text,
  ADD COLUMN IF NOT EXISTS "total_length" numeric(14, 3);
--> statement-breakpoint

-- Row 10 — Item Assembly Structure (IAS)
CREATE TABLE IF NOT EXISTS "item_assembly_structure" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "parent_item_id" uuid NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
  "child_item_id" uuid NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
  "position" text NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ias_parent_item_idx" ON "item_assembly_structure" ("parent_item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ias_parent_position_idx" ON "item_assembly_structure" ("parent_item_id", "position");
