-- Phase 1 entity schema alignment (org/site/location/assets + reference data)

DO $$ BEGIN
  CREATE TYPE "public"."location_type" AS ENUM('FUNCTIONAL', 'OPERATING', 'REPAIR', 'SALVAGE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."failure_code_type" AS ENUM('PROBLEM', 'CAUSE', 'REMEDY');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."asset_status" AS ENUM('ACTIVE', 'INACTIVE', 'DECOMMISSIONED', 'DISPOSED', 'IN_REPAIR', 'STANDBY');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."criticality" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "gl_account" text;
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "cost_center" text;

ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "gl_account" text;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "cost_center" text;

ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "site_id" uuid;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "org_id" uuid;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "code" text;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "type" "location_type" DEFAULT 'FUNCTIONAL';
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "gl_account" text;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "cost_center" text;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "effective_from" timestamp with time zone;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "effective_to" timestamp with time zone;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

DO $$ BEGIN
  ALTER TABLE "locations" ADD CONSTRAINT "locations_site_id_sites_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "locations" ADD CONSTRAINT "locations_org_id_organisations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_locations_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "site_id" uuid;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "org_id" uuid;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "parent_asset_id" uuid;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "class_id" uuid;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "criticality" "criticality" DEFAULT 'MEDIUM';
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "manufacturer" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "model" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "serial_num" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "install_date" timestamp with time zone;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "warranty_expiry" timestamp with time zone;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "gl_account" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "cost_center" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "purchase_cost" numeric(14, 2);
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "replacement_cost" numeric(14, 2);
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "class_attributes" jsonb DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "failure_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "type" "failure_code_type" NOT NULL,
  "code" text NOT NULL,
  "description" text NOT NULL,
  "parent_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "failure_codes" ADD CONSTRAINT "failure_codes_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "failure_codes_tenant_type_idx" ON "failure_codes" USING btree ("tenant_id", "type");

CREATE TABLE IF NOT EXISTS "labour_crafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "craft_code" text NOT NULL,
  "description" text NOT NULL,
  "default_rate" numeric(10, 2),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "labour_crafts" ADD CONSTRAINT "labour_crafts_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "labour_crafts_code_idx" ON "labour_crafts" USING btree ("tenant_id", "craft_code");
CREATE INDEX IF NOT EXISTS "labour_crafts_tenant_idx" ON "labour_crafts" USING btree ("tenant_id");

CREATE TABLE IF NOT EXISTS "asset_classifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "parent_id" uuid,
  "class_code" text NOT NULL,
  "description" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "asset_classifications" ADD CONSTRAINT "asset_classifications_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_class_tenant_idx" ON "asset_classifications" USING btree ("tenant_id");

CREATE TABLE IF NOT EXISTS "asset_class_attributes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_id" uuid NOT NULL,
  "attr_name" text NOT NULL,
  "attr_type" text DEFAULT 'text' NOT NULL,
  "is_required" boolean DEFAULT false NOT NULL,
  "default_value" text
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "asset_class_attributes" ADD CONSTRAINT "asset_class_attributes_class_id_asset_classifications_id_fk"
    FOREIGN KEY ("class_id") REFERENCES "public"."asset_classifications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

