-- P1-2 gap: "category.routing_role drives the P0-3 workflow assignment
-- for triage." service_requests.category was always free text with no
-- table behind it, so there was nowhere to configure a routing role,
-- default priority, or SLA hours per category.

CREATE TABLE IF NOT EXISTS "sr_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "parent_id" uuid,
  "default_priority" text DEFAULT 'MEDIUM',
  "sla_hours" integer,
  "routing_role" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sr_categories_tenant_idx" ON "sr_categories" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "sr_categories_tenant_name_idx" ON "sr_categories" ("tenant_id", "name");

ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "routed_role" text;

-- A handful of sensible starter categories per tenant, so category
-- routing has something to demonstrate/use immediately rather than every
-- tenant starting from an empty list.
INSERT INTO "sr_categories" ("tenant_id", "name", "default_priority", "sla_hours", "routing_role")
SELECT t.id, v.name, v.default_priority, v.sla_hours, v.routing_role
FROM "tenants" t
CROSS JOIN (VALUES
  ('Electrical', 'HIGH', 8, 'electrician'),
  ('Plumbing', 'MEDIUM', 24, 'plumber'),
  ('HVAC', 'MEDIUM', 24, 'hvac_technician'),
  ('IT / Network', 'HIGH', 8, 'it_support'),
  ('General Maintenance', 'LOW', 72, 'maintenance_technician'),
  ('Safety Concern', 'URGENT', 4, 'safety_officer')
) AS v(name, default_priority, sla_hours, routing_role)
ON CONFLICT ("tenant_id", "name") DO NOTHING;
