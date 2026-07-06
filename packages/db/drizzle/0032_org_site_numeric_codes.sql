-- FIX (Org/Site Maximo-parity screens): Organisation and Site now use the
-- same numeric-starting-at-10000, admin-cannot-edit code convention already
-- applied to Assets/Locations/Items/Storerooms (see 0029/0030). The
-- Organisation's "Code" field is repurposed to hold this number (heading
-- relabelled "Organisation" on the frontend); the Site's existing
-- "Site Code" (site_num) is repurposed the same way (heading "Site").
-- Also adds the extra Organization-tab fields carried over from the Maximo
-- reference screens: a second base currency, default Item Status, and
-- default Stock Category.

ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "base_currency_2" text;
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "default_item_status" text;
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "default_stock_category" text;

-- ─── Organisations (code) — renumber existing rows, per tenant ──────────────
UPDATE "organisations"
SET "code" = '_mig_' || "id"::text
WHERE NOT ("code" ~ '^[0-9]+$' AND "code"::bigint >= 10000);

WITH "ranked" AS (
  SELECT
    "id",
    (9999 + ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id"))::text AS "new_code"
  FROM "organisations"
  WHERE "code" LIKE '_mig_%'
)
UPDATE "organisations" AS "o"
SET "code" = "r"."new_code"
FROM "ranked" AS "r"
WHERE "o"."id" = "r"."id";

-- ─── Sites (site_num) — renumber existing rows, per tenant (tenant-wide
-- sequence, which stays a subset-safe superset of the existing per-org
-- uniqueness constraint) ──────────────────────────────────────────────────
UPDATE "sites"
SET "site_num" = '_mig_' || "id"::text
WHERE NOT ("site_num" ~ '^[0-9]+$' AND "site_num"::bigint >= 10000);

WITH "ranked" AS (
  SELECT
    "id",
    (9999 + ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id"))::text AS "new_num"
  FROM "sites"
  WHERE "site_num" LIKE '_mig_%'
)
UPDATE "sites" AS "s"
SET "site_num" = "r"."new_num"
FROM "ranked" AS "r"
WHERE "s"."id" = "r"."id";
