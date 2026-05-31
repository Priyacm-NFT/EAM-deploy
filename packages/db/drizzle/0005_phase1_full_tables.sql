-- 0005_phase1_full_tables.sql
-- Creates every Phase 1 table missing from earlier migrations.
-- All statements are fully idempotent (IF NOT EXISTS / DO $$ EXCEPTION).

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE "public"."meter_type" AS ENUM('GAUGE','CONTINUOUS','CHARACTERISTIC'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."pm_frequency_type" AS ENUM('CALENDAR','METER','CALENDAR_AND_METER','SEASONAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."pm_interval_unit" AS ENUM('DAY','WEEK','MONTH','YEAR','HOUR','MILE','KILOMETRE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."pm_status" AS ENUM('ACTIVE','INACTIVE','DRAFT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."pm_forecast_status" AS ENUM('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED','SKIPPED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."permit_type" AS ENUM('HOT_WORK','CONFINED_SPACE','ELECTRICAL','HEIGHT','EXCAVATION','GENERAL','LOTO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."permit_status" AS ENUM('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','SUSPENDED','CLOSED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."permit_checklist_category" AS ENUM('PRE_WORK','DURING_WORK','POST_WORK'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."permit_approval_status" AS ENUM('PENDING','APPROVED','REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."item_type" AS ENUM('STOCKED','NON_STOCKED','SPECIAL_ORDER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."cost_method" AS ENUM('AVERAGE','FIFO','STANDARD'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."inventory_tx_type" AS ENUM('RECEIPT','ISSUE','TRANSFER','ADJUST','RETURN','SCRAP'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."wo_task_status" AS ENUM('PENDING','IN_PROGRESS','COMPLETED','SKIPPED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."job_plan_status" AS ENUM('DRAFT','ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── organisations (may already exist — add missing columns + index safely) ────

CREATE TABLE IF NOT EXISTS "organisations" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid NOT NULL,
  "name"        text NOT NULL,
  "code"        text NOT NULL,
  "description" text,
  "is_active"   boolean DEFAULT true NOT NULL,
  "gl_account"  text,
  "cost_center" text,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"  timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Ensure all columns exist when table was created by an earlier migration
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "code"        text;
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "is_active"   boolean DEFAULT true NOT NULL;
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "gl_account"  text;
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "cost_center" text;
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "updated_at"  timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organisations" ADD CONSTRAINT "organisations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE UNIQUE INDEX "org_code_idx" ON "organisations" USING btree ("tenant_id","code"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "org_tenant_idx" ON "organisations" USING btree ("tenant_id"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── sites ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sites" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid NOT NULL,
  "org_id"      uuid,
  "name"        text NOT NULL,
  "code"        text NOT NULL,
  "description" text,
  "address"     text,
  "is_active"   boolean DEFAULT true NOT NULL,
  "gl_account"  text,
  "cost_center" text,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"  timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Ensure all columns exist when table was created by an earlier migration
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "org_id"      uuid;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "code"        text;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "address"     text;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "is_active"   boolean DEFAULT true NOT NULL;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "gl_account"  text;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "cost_center" text;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "updated_at"  timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "sites" ADD CONSTRAINT "sites_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE UNIQUE INDEX "site_code_idx" ON "sites" USING btree ("tenant_id","code"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "site_tenant_idx" ON "sites" USING btree ("tenant_id"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── status_sets & status_transitions ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "status_sets" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid NOT NULL,
  "entity_type" text NOT NULL,
  "name"        text NOT NULL,
  "status_code" text NOT NULL,
  "label"       text NOT NULL,
  "colour"      text DEFAULT '#64748b' NOT NULL,
  "is_closed"   boolean DEFAULT false NOT NULL,
  "sort_order"  integer DEFAULT 0 NOT NULL,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "status_sets" ADD CONSTRAINT "status_sets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "status_sets_tenant_entity_idx" ON "status_sets" USING btree ("tenant_id","entity_type"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "status_transitions" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status_set_id"  uuid NOT NULL,
  "from_status"    text NOT NULL,
  "to_status"      text NOT NULL,
  "label"          text,
  "requires_role"  text
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "status_transitions" ADD CONSTRAINT "status_transitions_status_set_id_status_sets_id_fk" FOREIGN KEY ("status_set_id") REFERENCES "public"."status_sets"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── asset_meters ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "asset_meters" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"    uuid NOT NULL,
  "asset_id"     uuid NOT NULL,
  "name"         text NOT NULL,
  "unit"         text NOT NULL,
  "meter_type"   "meter_type" DEFAULT 'CONTINUOUS' NOT NULL,
  "rollover_val" numeric(14,2),
  "is_active"    boolean DEFAULT true NOT NULL,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "asset_meters" ADD CONSTRAINT "asset_meters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "asset_meters" ADD CONSTRAINT "asset_meters_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "asset_meter_readings" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "meter_id"     uuid NOT NULL,
  "reading"      numeric(14,2) NOT NULL,
  "reading_date" timestamp with time zone DEFAULT now() NOT NULL,
  "entered_by"   uuid,
  "notes"        text
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "asset_meter_readings" ADD CONSTRAINT "asset_meter_readings_meter_id_asset_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."asset_meters"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "asset_move_history" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id"         uuid NOT NULL,
  "from_location_id" uuid,
  "to_location_id"   uuid,
  "moved_by"         uuid,
  "moved_at"         timestamp with time zone DEFAULT now() NOT NULL,
  "reason"           text
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "asset_move_history" ADD CONSTRAINT "asset_move_history_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── job_plans & sub-tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "job_plans" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"           uuid NOT NULL,
  "jp_num"              text NOT NULL,
  "description"         text NOT NULL,
  "status"              "job_plan_status" DEFAULT 'DRAFT' NOT NULL,
  "estimated_duration"  numeric(8,2),
  "created_by"          uuid,
  "created_at"          timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"          timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_plans" ADD CONSTRAINT "job_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE UNIQUE INDEX "jp_num_idx" ON "job_plans" USING btree ("tenant_id","jp_num"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "jp_tenant_idx" ON "job_plans" USING btree ("tenant_id"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "job_plan_tasks" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_plan_id"  uuid NOT NULL,
  "seq"          integer NOT NULL,
  "description"  text NOT NULL,
  "duration_hrs" numeric(8,2),
  "craft_id"     uuid
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_plan_tasks" ADD CONSTRAINT "job_plan_tasks_job_plan_id_job_plans_id_fk" FOREIGN KEY ("job_plan_id") REFERENCES "public"."job_plans"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "job_plan_labour" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_plan_id"  uuid NOT NULL,
  "craft_id"     uuid,
  "craft_code"   text NOT NULL,
  "qty_hrs"      numeric(8,2) NOT NULL,
  "rate"         numeric(10,2)
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_plan_labour" ADD CONSTRAINT "job_plan_labour_job_plan_id_job_plans_id_fk" FOREIGN KEY ("job_plan_id") REFERENCES "public"."job_plans"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "job_plan_materials" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_plan_id"  uuid NOT NULL,
  "item_id"      uuid,
  "item_num"     text NOT NULL,
  "description"  text NOT NULL,
  "qty"          numeric(12,4) NOT NULL,
  "unit"         text DEFAULT 'EA' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_plan_materials" ADD CONSTRAINT "job_plan_materials_job_plan_id_job_plans_id_fk" FOREIGN KEY ("job_plan_id") REFERENCES "public"."job_plans"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "job_plan_tools" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_plan_id"  uuid NOT NULL,
  "description"  text NOT NULL,
  "qty"          integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_plan_tools" ADD CONSTRAINT "job_plan_tools_job_plan_id_job_plans_id_fk" FOREIGN KEY ("job_plan_id") REFERENCES "public"."job_plans"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "job_plan_safety" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_plan_id"  uuid NOT NULL,
  "hazard"       text NOT NULL,
  "precaution"   text NOT NULL,
  "seq"          integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_plan_safety" ADD CONSTRAINT "job_plan_safety_job_plan_id_job_plans_id_fk" FOREIGN KEY ("job_plan_id") REFERENCES "public"."job_plans"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── wo_tasks, wo_labour, wo_materials, wo_tools, wo_services, wo_safety ───────

CREATE TABLE IF NOT EXISTS "wo_tasks" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wo_id"        uuid NOT NULL,
  "seq"          integer NOT NULL,
  "description"  text NOT NULL,
  "status"       "wo_task_status" DEFAULT 'PENDING' NOT NULL,
  "completed_by" uuid,
  "completed_at" timestamp with time zone,
  "duration_hrs" numeric(8,2)
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "wo_tasks" ADD CONSTRAINT "wo_tasks_wo_id_work_orders_id_fk" FOREIGN KEY ("wo_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "wo_labour" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wo_id"         uuid NOT NULL,
  "user_id"       uuid,
  "craft_id"      uuid,
  "craft_code"    text NOT NULL,
  "regular_hrs"   numeric(8,2) DEFAULT 0 NOT NULL,
  "overtime_hrs"  numeric(8,2) DEFAULT 0 NOT NULL,
  "rate"          numeric(10,2),
  "work_date"     timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "wo_labour" ADD CONSTRAINT "wo_labour_wo_id_work_orders_id_fk" FOREIGN KEY ("wo_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "wo_materials" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wo_id"         uuid NOT NULL,
  "item_id"       uuid,
  "item_num"      text NOT NULL,
  "description"   text NOT NULL,
  "qty_required"  numeric(12,4) NOT NULL,
  "qty_used"      numeric(12,4) DEFAULT 0 NOT NULL,
  "unit"          text DEFAULT 'EA' NOT NULL,
  "unit_cost"     numeric(10,2)
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "wo_materials" ADD CONSTRAINT "wo_materials_wo_id_work_orders_id_fk" FOREIGN KEY ("wo_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "wo_tools" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wo_id"       uuid NOT NULL,
  "description" text NOT NULL,
  "qty"         integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "wo_tools" ADD CONSTRAINT "wo_tools_wo_id_work_orders_id_fk" FOREIGN KEY ("wo_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "wo_services" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wo_id"       uuid NOT NULL,
  "description" text NOT NULL,
  "vendor"      text,
  "cost"        numeric(10,2),
  "po_num"      text
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "wo_services" ADD CONSTRAINT "wo_services_wo_id_work_orders_id_fk" FOREIGN KEY ("wo_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "wo_safety" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wo_id"       uuid NOT NULL,
  "hazard"      text NOT NULL,
  "precaution"  text NOT NULL,
  "seq"         integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "wo_safety" ADD CONSTRAINT "wo_safety_wo_id_work_orders_id_fk" FOREIGN KEY ("wo_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── pm_masters, pm_meter_triggers, pm_forecasts ───────────────────────────────

CREATE TABLE IF NOT EXISTS "pm_masters" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"            uuid NOT NULL,
  "pm_num"               text NOT NULL,
  "description"          text NOT NULL,
  "asset_id"             uuid,
  "location_id"          uuid,
  "job_plan_id"          uuid,
  "status"               "pm_status" DEFAULT 'DRAFT' NOT NULL,
  "frequency_type"       "pm_frequency_type" DEFAULT 'CALENDAR' NOT NULL,
  "interval_value"       integer DEFAULT 1 NOT NULL,
  "interval_unit"        "pm_interval_unit" DEFAULT 'MONTH' NOT NULL,
  "last_run_date"        timestamp with time zone,
  "next_run_date"        timestamp with time zone,
  "lead_time_days"       integer DEFAULT 0 NOT NULL,
  "assigned_to_user_id"  uuid,
  "assigned_to_group_id" uuid,
  "priority"             text DEFAULT 'MEDIUM' NOT NULL,
  "estimated_duration"   numeric(8,2),
  "created_by"           uuid,
  "created_at"           timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"           timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pm_masters" ADD CONSTRAINT "pm_masters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE UNIQUE INDEX "pm_num_idx" ON "pm_masters" USING btree ("tenant_id","pm_num"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "pm_tenant_idx" ON "pm_masters" USING btree ("tenant_id"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "pm_next_run_idx" ON "pm_masters" USING btree ("next_run_date"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "pm_meter_triggers" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pm_id"          uuid NOT NULL,
  "meter_id"       uuid NOT NULL,
  "interval_value" numeric(14,2) NOT NULL,
  "last_reading"   numeric(14,2)
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pm_meter_triggers" ADD CONSTRAINT "pm_meter_triggers_pm_id_pm_masters_id_fk" FOREIGN KEY ("pm_id") REFERENCES "public"."pm_masters"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "pm_forecasts" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pm_id"          uuid NOT NULL,
  "tenant_id"      uuid NOT NULL,
  "scheduled_date" timestamp with time zone NOT NULL,
  "status"         "pm_forecast_status" DEFAULT 'SCHEDULED' NOT NULL,
  "wo_id"          uuid,
  "generated_at"   timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pm_forecasts" ADD CONSTRAINT "pm_forecasts_pm_id_pm_masters_id_fk" FOREIGN KEY ("pm_id") REFERENCES "public"."pm_masters"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "pm_forecast_date_idx" ON "pm_forecasts" USING btree ("pm_id","scheduled_date"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── permits ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "permits" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"    uuid NOT NULL,
  "permit_num"   text NOT NULL,
  "type"         "permit_type" NOT NULL,
  "status"       "permit_status" DEFAULT 'DRAFT' NOT NULL,
  "wo_id"        uuid,
  "asset_id"     uuid,
  "location_id"  uuid,
  "description"  text NOT NULL,
  "valid_from"   timestamp with time zone,
  "valid_to"     timestamp with time zone,
  "requested_by" uuid,
  "approved_by"  uuid,
  "issued_at"    timestamp with time zone,
  "closed_at"    timestamp with time zone,
  "notes"        text,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"   timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "permits" ADD CONSTRAINT "permits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE UNIQUE INDEX "permit_num_idx" ON "permits" USING btree ("tenant_id","permit_num"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "permit_tenant_idx" ON "permits" USING btree ("tenant_id"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "permit_checklist_items" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "permit_id"   uuid NOT NULL,
  "category"    "permit_checklist_category" NOT NULL,
  "description" text NOT NULL,
  "is_checked"  boolean DEFAULT false NOT NULL,
  "checked_by"  uuid,
  "checked_at"  timestamp with time zone,
  "seq"         integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "permit_checklist_items" ADD CONSTRAINT "permit_checklist_items_permit_id_permits_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."permits"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "permit_approvals" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "permit_id"   uuid NOT NULL,
  "approver_id" uuid NOT NULL,
  "role"        text,
  "status"      "permit_approval_status" DEFAULT 'PENDING' NOT NULL,
  "comments"    text,
  "actioned_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "permit_approvals" ADD CONSTRAINT "permit_approvals_permit_id_permits_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."permits"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── items, storerooms, inventory ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "items" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"     uuid NOT NULL,
  "item_num"      text NOT NULL,
  "description"   text NOT NULL,
  "item_type"     "item_type" DEFAULT 'STOCKED' NOT NULL,
  "unit"          text DEFAULT 'EA' NOT NULL,
  "cost_method"   "cost_method" DEFAULT 'AVERAGE' NOT NULL,
  "unit_cost"     numeric(10,2) DEFAULT 0 NOT NULL,
  "reorder_point" numeric(12,4) DEFAULT 0 NOT NULL,
  "reorder_qty"   numeric(12,4) DEFAULT 0 NOT NULL,
  "is_active"     boolean DEFAULT true NOT NULL,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"    timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "items" ADD CONSTRAINT "items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE UNIQUE INDEX "item_num_idx" ON "items" USING btree ("tenant_id","item_num"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "item_tenant_idx" ON "items" USING btree ("tenant_id"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "storerooms" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"  uuid NOT NULL,
  "name"       text NOT NULL,
  "code"       text NOT NULL,
  "site_id"    uuid,
  "is_active"  boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "storerooms" ADD CONSTRAINT "storerooms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE UNIQUE INDEX "storeroom_code_idx" ON "storerooms" USING btree ("tenant_id","code"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "inventory_balances" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"       uuid NOT NULL,
  "item_id"         uuid NOT NULL,
  "storeroom_id"    uuid NOT NULL,
  "qty_on_hand"     numeric(12,4) DEFAULT 0 NOT NULL,
  "qty_reserved"    numeric(12,4) DEFAULT 0 NOT NULL,
  "last_counted_at" timestamp with time zone,
  "updated_at"      timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_storeroom_id_storerooms_id_fk" FOREIGN KEY ("storeroom_id") REFERENCES "public"."storerooms"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE UNIQUE INDEX "inv_bal_item_store_idx" ON "inventory_balances" USING btree ("item_id","storeroom_id"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "inventory_transactions" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"     uuid NOT NULL,
  "item_id"       uuid NOT NULL,
  "storeroom_id"  uuid NOT NULL,
  "tx_type"       "inventory_tx_type" NOT NULL,
  "qty"           numeric(12,4) NOT NULL,
  "unit_cost"     numeric(10,2),
  "wo_id"         uuid,
  "reference"     text,
  "transacted_by" uuid,
  "transacted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "inv_tx_item_idx" ON "inventory_transactions" USING btree ("item_id"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "inv_tx_wo_idx" ON "inventory_transactions" USING btree ("wo_id"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "material_reservations" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wo_id"        uuid NOT NULL,
  "item_id"      uuid NOT NULL,
  "storeroom_id" uuid NOT NULL,
  "qty_reserved" numeric(12,4) NOT NULL,
  "qty_issued"   numeric(12,4) DEFAULT 0 NOT NULL,
  "reserved_at"  timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "material_reservations" ADD CONSTRAINT "material_reservations_wo_id_work_orders_id_fk" FOREIGN KEY ("wo_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── labour_records, crews, crew_members ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS "labour_records" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"    uuid NOT NULL,
  "user_id"      uuid,
  "craft_id"     uuid,
  "wo_id"        uuid,
  "work_date"    timestamp with time zone DEFAULT now() NOT NULL,
  "regular_hrs"  numeric(8,2) DEFAULT 0 NOT NULL,
  "overtime_hrs" numeric(8,2) DEFAULT 0 NOT NULL,
  "rate"         numeric(10,2),
  "notes"        text,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "labour_records" ADD CONSTRAINT "labour_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "labour_records_tenant_idx" ON "labour_records" USING btree ("tenant_id"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "labour_records_wo_idx" ON "labour_records" USING btree ("wo_id"); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "crews" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"     uuid NOT NULL,
  "name"          text NOT NULL,
  "description"   text,
  "supervisor_id" uuid,
  "is_active"     boolean DEFAULT true NOT NULL,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crews" ADD CONSTRAINT "crews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "crew_members" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "crew_id"   uuid NOT NULL,
  "user_id"   uuid NOT NULL,
  "craft_id"  uuid,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE UNIQUE INDEX "crew_member_unique_idx" ON "crew_members" USING btree ("crew_id","user_id"); EXCEPTION WHEN duplicate_object THEN null; END $$;
