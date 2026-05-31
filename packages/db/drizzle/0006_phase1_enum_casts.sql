-- 0006_phase1_enum_casts.sql
-- Converts TEXT status/priority/type/channel columns to proper enum types.
-- Must DROP DEFAULT before ALTER TYPE, then re-add the enum default after.

-- ── Create enums (idempotent) ─────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE "public"."sr_status"   AS ENUM('NEW','QUEUED','IN_PROGRESS','CLOSED','RESOLVED');      EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."sr_priority" AS ENUM('LOW','MEDIUM','HIGH','URGENT');                         EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."sr_channel"  AS ENUM('WEB','MOBILE','EMAIL','API','WALK_IN');                 EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."wo_status"   AS ENUM('WAPPR','APPR','INPRG','COMP','CLOSE','HOLD','CAN');     EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."wo_type"     AS ENUM('CM','PM','EMERGENCY','PROJECT','STANDING','INSPECTION','CALIBRATION'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."wo_priority" AS ENUM('LOW','MEDIUM','HIGH','EMERGENCY');                      EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── service_requests.status ───────────────────────────────────────────────────

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='service_requests' AND column_name='status') = 'text' THEN
    -- 1. drop the text default
    ALTER TABLE "public"."service_requests" ALTER COLUMN "status" DROP DEFAULT;
    -- 2. normalise any invalid values
    UPDATE "public"."service_requests"
      SET "status" = 'NEW'
      WHERE "status" NOT IN ('NEW','QUEUED','IN_PROGRESS','CLOSED','RESOLVED');
    -- 3. cast
    ALTER TABLE "public"."service_requests"
      ALTER COLUMN "status" TYPE "public"."sr_status"
      USING "status"::"public"."sr_status";
    -- 4. re-add enum default
    ALTER TABLE "public"."service_requests"
      ALTER COLUMN "status" SET DEFAULT 'NEW'::"public"."sr_status";
  END IF;
END $$;
--> statement-breakpoint

-- ── service_requests.priority ─────────────────────────────────────────────────

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='service_requests' AND column_name='priority') = 'text' THEN
    ALTER TABLE "public"."service_requests" ALTER COLUMN "priority" DROP DEFAULT;
    UPDATE "public"."service_requests"
      SET "priority" = 'MEDIUM'
      WHERE "priority" NOT IN ('LOW','MEDIUM','HIGH','URGENT') OR "priority" IS NULL;
    ALTER TABLE "public"."service_requests"
      ALTER COLUMN "priority" TYPE "public"."sr_priority"
      USING "priority"::"public"."sr_priority";
    ALTER TABLE "public"."service_requests"
      ALTER COLUMN "priority" SET DEFAULT 'MEDIUM'::"public"."sr_priority";
  END IF;
END $$;
--> statement-breakpoint

-- ── service_requests.channel ──────────────────────────────────────────────────

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='service_requests' AND column_name='channel') = 'text' THEN
    ALTER TABLE "public"."service_requests" ALTER COLUMN "channel" DROP DEFAULT;
    UPDATE "public"."service_requests"
      SET "channel" = 'WEB'
      WHERE "channel" NOT IN ('WEB','MOBILE','EMAIL','API','WALK_IN');
    ALTER TABLE "public"."service_requests"
      ALTER COLUMN "channel" TYPE "public"."sr_channel"
      USING "channel"::"public"."sr_channel";
    ALTER TABLE "public"."service_requests"
      ALTER COLUMN "channel" SET DEFAULT 'WEB'::"public"."sr_channel";
  END IF;
END $$;
--> statement-breakpoint

-- ── work_orders.status ────────────────────────────────────────────────────────

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='work_orders' AND column_name='status') = 'text' THEN
    ALTER TABLE "public"."work_orders" ALTER COLUMN "status" DROP DEFAULT;
    UPDATE "public"."work_orders"
      SET "status" = 'WAPPR'
      WHERE "status" NOT IN ('WAPPR','APPR','INPRG','COMP','CLOSE','HOLD','CAN');
    ALTER TABLE "public"."work_orders"
      ALTER COLUMN "status" TYPE "public"."wo_status"
      USING "status"::"public"."wo_status";
    ALTER TABLE "public"."work_orders"
      ALTER COLUMN "status" SET DEFAULT 'WAPPR'::"public"."wo_status";
  END IF;
END $$;
--> statement-breakpoint

-- ── work_orders.type ──────────────────────────────────────────────────────────

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='work_orders' AND column_name='type') = 'text' THEN
    ALTER TABLE "public"."work_orders" ALTER COLUMN "type" DROP DEFAULT;
    UPDATE "public"."work_orders"
      SET "type" = 'CM'
      WHERE "type" NOT IN ('CM','PM','EMERGENCY','PROJECT','STANDING','INSPECTION','CALIBRATION') OR "type" IS NULL;
    ALTER TABLE "public"."work_orders"
      ALTER COLUMN "type" TYPE "public"."wo_type"
      USING "type"::"public"."wo_type";
    ALTER TABLE "public"."work_orders"
      ALTER COLUMN "type" SET DEFAULT 'CM'::"public"."wo_type";
  END IF;
END $$;
--> statement-breakpoint

-- ── work_orders.priority ──────────────────────────────────────────────────────

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='work_orders' AND column_name='priority') = 'text' THEN
    ALTER TABLE "public"."work_orders" ALTER COLUMN "priority" DROP DEFAULT;
    UPDATE "public"."work_orders"
      SET "priority" = 'MEDIUM'
      WHERE "priority" NOT IN ('LOW','MEDIUM','HIGH','EMERGENCY') OR "priority" IS NULL;
    ALTER TABLE "public"."work_orders"
      ALTER COLUMN "priority" TYPE "public"."wo_priority"
      USING "priority"::"public"."wo_priority";
    ALTER TABLE "public"."work_orders"
      ALTER COLUMN "priority" SET DEFAULT 'MEDIUM'::"public"."wo_priority";
  END IF;
END $$;
--> statement-breakpoint

-- ── New columns: service_requests ────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE "service_requests" ADD COLUMN "long_description" text;                                          EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "service_requests" ADD COLUMN "site_id" uuid REFERENCES "public"."sites"("id");                 EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "service_requests" ADD COLUMN "org_id" uuid REFERENCES "public"."organisations"("id");          EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "service_requests" ADD COLUMN "closure_notes" text;                                             EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint

-- ── New columns: work_orders ──────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "long_description" text;                                               EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "location_id" uuid REFERENCES "public"."locations"("id");              EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "site_id" uuid REFERENCES "public"."sites"("id");                      EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "org_id" uuid REFERENCES "public"."organisations"("id");               EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "sr_id" uuid REFERENCES "public"."service_requests"("id");             EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "pm_id" uuid;                                                          EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "job_plan_id" uuid REFERENCES "public"."job_plans"("id");              EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "permit_id" uuid;                                                      EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "target_start_date" timestamp with time zone;                          EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "target_finish_date" timestamp with time zone;                         EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "actual_start_date" timestamp with time zone;                          EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "actual_finish_date" timestamp with time zone;                         EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "failure_problem_id" uuid;                                             EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "failure_cause_id" uuid;                                               EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "failure_remedy_id" uuid;                                              EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "downtime_hours" numeric(8,2);                                         EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "closure_notes" text;                                                  EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "labor_cost" numeric(10,2) DEFAULT 0;                                  EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "material_cost" numeric(10,2) DEFAULT 0;                               EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "service_cost" numeric(10,2) DEFAULT 0;                                EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "tool_cost" numeric(10,2) DEFAULT 0;                                   EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint

-- ── New columns: locations ────────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE "locations" ADD COLUMN "site_id" uuid REFERENCES "public"."sites"("id");                        EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "locations" ADD COLUMN "org_id" uuid REFERENCES "public"."organisations"("id");                 EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "locations" ADD COLUMN "gl_account" text;                                                       EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "locations" ADD COLUMN "cost_center" text;                                                      EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint

-- ── New columns: assets ───────────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE "assets" ADD COLUMN "site_id" uuid REFERENCES "public"."sites"("id");                           EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assets" ADD COLUMN "org_id" uuid REFERENCES "public"."organisations"("id");                    EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assets" ADD COLUMN "gl_account" text;                                                          EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assets" ADD COLUMN "cost_center" text;                                                         EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assets" ADD COLUMN "classification_id" uuid;                                                   EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assets" ADD COLUMN "custom_data" jsonb DEFAULT '{}';                                           EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint

-- ── Indexes ───────────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE INDEX "sr_site_idx"      ON "service_requests" USING btree ("site_id");   EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "wo_site_idx"      ON "work_orders"      USING btree ("site_id");   EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "wo_sr_idx"        ON "work_orders"      USING btree ("sr_id");     EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "wo_pm_idx"        ON "work_orders"      USING btree ("pm_id");     EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE INDEX "wo_job_plan_idx"  ON "work_orders"      USING btree ("job_plan_id"); EXCEPTION WHEN duplicate_object THEN null; END $$;
