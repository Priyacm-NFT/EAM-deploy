-- P1-1 gap analysis — two PRD items that were never implemented:
--
-- 1) locations.path (materialized path). The tree was previously being
--    rebuilt in application code on every GET /locations call instead of
--    being stored, so "Moving a location subtree recomputes materialized
--    path for all descendants within one transaction" (AC-P1-1.2) had no
--    column to write to. Backfilled here for all existing rows via a
--    recursive CTE; kept in sync going forward by the API's move logic.
--
-- 2) asset_spares (BOM / spare-parts list per asset), called out
--    explicitly in the PRD data model as its own table, separate from
--    item_assembly_structure (which relates two Items to each other for
--    kitting, not an Asset to its recommended spare Items).

-- ── 1) locations.path ────────────────────────────────────────────────────

ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "path" text;

-- Backfill: root-first, dot-separated chain of ancestor ids ending in the
-- row's own id, e.g. "<rootId>.<parentId>.<selfId>". Recursive CTE walks
-- from every root location (parent_id IS NULL) down through children.
WITH RECURSIVE location_paths AS (
  SELECT id, id::text AS path
  FROM "locations"
  WHERE "parent_id" IS NULL
  UNION ALL
  SELECT l.id, lp.path || '.' || l.id::text
  FROM "locations" l
  JOIN location_paths lp ON l."parent_id" = lp.id
)
UPDATE "locations" l
SET "path" = lp.path
FROM location_paths lp
WHERE l.id = lp.id;

-- Any row whose ancestor chain couldn't be resolved (e.g. a dangling
-- parent_id pointing at a row that no longer exists) falls back to just
-- its own id so path is never left NULL.
UPDATE "locations" SET "path" = id::text WHERE "path" IS NULL;

ALTER TABLE "locations" ALTER COLUMN "path" SET NOT NULL;

-- text_pattern_ops so `path LIKE '<prefix>%'` subtree lookups can use the
-- index regardless of the database's collation/locale settings.
CREATE INDEX IF NOT EXISTS "locations_path_idx" ON "locations" USING btree ("path" text_pattern_ops);

-- ── 2) asset_spares (BOM) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "asset_spares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
  "quantity" integer NOT NULL DEFAULT 1,
  "notes" text,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "asset_spares_asset_idx" ON "asset_spares" ("asset_id");
CREATE INDEX IF NOT EXISTS "asset_spares_tenant_idx" ON "asset_spares" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "asset_spares_asset_item_idx" ON "asset_spares" ("asset_id", "item_id");
