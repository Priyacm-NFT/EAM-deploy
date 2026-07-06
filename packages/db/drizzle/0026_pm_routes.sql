-- P1-5 gap — AC-P1-5.7: "Route PM generates a single WO covering all
-- route assets." Named explicitly in the PRD (pm_routes / pm_route_assets,
-- POST /pm-routes) but never built — only single-asset/location time and
-- meter triggers existed.

CREATE TABLE IF NOT EXISTS "pm_routes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "site_id" uuid REFERENCES "sites"("id"),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pm_routes_tenant_idx" ON "pm_routes" ("tenant_id");

CREATE TABLE IF NOT EXISTS "pm_route_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "route_id" uuid NOT NULL REFERENCES "pm_routes"("id") ON DELETE CASCADE,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE,
  "seq" integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "pm_route_assets_route_idx" ON "pm_route_assets" ("route_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pm_route_assets_route_asset_idx" ON "pm_route_assets" ("route_id", "asset_id");

ALTER TABLE "pm_masters" ADD COLUMN IF NOT EXISTS "route_id" uuid REFERENCES "pm_routes"("id");

ALTER TABLE "wo_tasks" ADD COLUMN IF NOT EXISTS "asset_id" uuid REFERENCES "assets"("id");
