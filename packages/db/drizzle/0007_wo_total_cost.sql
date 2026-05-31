-- 0007_wo_total_cost.sql
-- Adds columns that exist in the Drizzle schema but were missed in earlier migrations.

DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "total_cost"  numeric(14,2) DEFAULT 0; EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_orders" ADD COLUMN "custom_data" jsonb DEFAULT '{}';      EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "service_requests" ADD COLUMN "custom_data" jsonb DEFAULT '{}'; EXCEPTION WHEN duplicate_column THEN null; END $$;
