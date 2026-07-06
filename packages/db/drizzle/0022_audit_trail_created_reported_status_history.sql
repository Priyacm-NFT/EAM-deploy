-- Audit trail additions: master-data "created by", transactional
-- "reported by"/"report date", and a universal status_history log.
--
-- Master data (Organisations, Sites, Locations, Assets, Items) already
-- had created_at (when) but never created_by_user_id (who) — this adds
-- the missing "who" half, matching the created_by_user_id column already
-- used on job_plans.
--
-- Work Orders and Service Requests get explicit reported_by_user_id /
-- reported_date columns — real Maximo's distinct "who originally
-- reported this and when", separate from created_at/created_by (someone
-- else often logs the record after the fact) and, for Service Requests,
-- separate from the existing requester_id (a helpdesk agent can report
-- an issue on a requester's behalf).
--
-- status_history is a new, always-on log table: every actual status
-- change on any status-bearing entity gets one row here, entityType-
-- tagged (same pattern as audit_logs) rather than needing a Workflow to
-- be configured first (unlike the existing workflow_history table, which
-- only fires when a Workflow is attached to that specific transition).

ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid REFERENCES "users"("id");
--> statement-breakpoint

ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid REFERENCES "users"("id");
--> statement-breakpoint

ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid REFERENCES "users"("id");
--> statement-breakpoint

ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid REFERENCES "users"("id");
--> statement-breakpoint

ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid REFERENCES "users"("id");
--> statement-breakpoint

ALTER TABLE "work_orders"
  ADD COLUMN IF NOT EXISTS "reported_by_user_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "reported_date" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "service_requests"
  ADD COLUMN IF NOT EXISTS "reported_by_user_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "reported_date" timestamp with time zone;
--> statement-breakpoint

-- Backfill: for existing rows, the best available answer for "who
-- reported it / when" is whoever created the record and when — not
-- perfect history, but strictly better than leaving it null for every
-- pre-existing Work Order/SR.
UPDATE "work_orders" SET "reported_date" = "created_at" WHERE "reported_date" IS NULL;
--> statement-breakpoint

UPDATE "service_requests" SET "reported_by_user_id" = "requester_id" WHERE "reported_by_user_id" IS NULL;
--> statement-breakpoint

UPDATE "service_requests" SET "reported_date" = "created_at" WHERE "reported_date" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "status_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "from_status" text,
  "to_status" text NOT NULL,
  "changed_by_user_id" uuid REFERENCES "users"("id"),
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "notes" text
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "status_history_entity_idx" ON "status_history" ("entity_type", "entity_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "status_history_tenant_idx" ON "status_history" ("tenant_id");
