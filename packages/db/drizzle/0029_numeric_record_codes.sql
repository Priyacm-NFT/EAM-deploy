-- One-time data migration: convert legacy prefixed auto-generated record codes
-- (WO-000001, JP-00001, ITM-00001, etc.) to numeric IDs starting at 10000.
-- Rows already using numeric auto-gen (>= 10000) are renumbered into the same
-- per-tenant sequence. Manually entered codes (e.g. WO-TEST-001) are untouched.
-- Two-phase updates avoid unique-index collisions during the transition.

-- ─── Work Orders (wo_num) ────────────────────────────────────────────────────
UPDATE "work_orders"
SET "wo_num" = '_mig_' || "id"::text
WHERE "wo_num" ~ '^WO-\d{6}$'
   OR ("wo_num" ~ '^\d+$' AND "wo_num"::bigint >= 10000);

WITH "ranked" AS (
  SELECT
    "id",
    (9999 + ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id"))::text AS "new_num"
  FROM "work_orders"
  WHERE "wo_num" LIKE '_mig_%'
)
UPDATE "work_orders" AS "w"
SET "wo_num" = "r"."new_num"
FROM "ranked" AS "r"
WHERE "w"."id" = "r"."id";

-- ─── Job Plans (jp_num) ──────────────────────────────────────────────────────
UPDATE "job_plans"
SET "jp_num" = '_mig_' || "id"::text
WHERE "jp_num" ~ '^JP-\d{5}$'
   OR ("jp_num" ~ '^\d+$' AND "jp_num"::bigint >= 10000);

WITH "ranked" AS (
  SELECT
    "id",
    (9999 + ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id"))::text AS "new_num"
  FROM "job_plans"
  WHERE "jp_num" LIKE '_mig_%'
)
UPDATE "job_plans" AS "j"
SET "jp_num" = "r"."new_num"
FROM "ranked" AS "r"
WHERE "j"."id" = "r"."id";

-- ─── PM Masters (pm_num) ─────────────────────────────────────────────────────
UPDATE "pm_masters"
SET "pm_num" = '_mig_' || "id"::text
WHERE "pm_num" ~ '^PM-\d{5}$'
   OR ("pm_num" ~ '^\d+$' AND "pm_num"::bigint >= 10000);

WITH "ranked" AS (
  SELECT
    "id",
    (9999 + ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id"))::text AS "new_num"
  FROM "pm_masters"
  WHERE "pm_num" LIKE '_mig_%'
)
UPDATE "pm_masters" AS "p"
SET "pm_num" = "r"."new_num"
FROM "ranked" AS "r"
WHERE "p"."id" = "r"."id";

-- ─── Permits to Work (permit_num) ─────────────────────────────────────────────
UPDATE "permits"
SET "permit_num" = '_mig_' || "id"::text
WHERE "permit_num" ~ '^PTW-\d{5}$'
   OR ("permit_num" ~ '^\d+$' AND "permit_num"::bigint >= 10000);

WITH "ranked" AS (
  SELECT
    "id",
    (9999 + ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id"))::text AS "new_num"
  FROM "permits"
  WHERE "permit_num" LIKE '_mig_%'
)
UPDATE "permits" AS "p"
SET "permit_num" = "r"."new_num"
FROM "ranked" AS "r"
WHERE "p"."id" = "r"."id";

-- ─── Service Requests (sr_num) ───────────────────────────────────────────────
UPDATE "service_requests"
SET "sr_num" = '_mig_' || "id"::text
WHERE "sr_num" ~ '^SR-\d{6}$'
   OR ("sr_num" ~ '^\d+$' AND "sr_num"::bigint >= 10000);

WITH "ranked" AS (
  SELECT
    "id",
    (9999 + ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id"))::text AS "new_num"
  FROM "service_requests"
  WHERE "sr_num" LIKE '_mig_%'
)
UPDATE "service_requests" AS "s"
SET "sr_num" = "r"."new_num"
FROM "ranked" AS "r"
WHERE "s"."id" = "r"."id";

-- ─── Item Master (item_num) + denormalized references ────────────────────────
CREATE TEMP TABLE "_item_num_map" ON COMMIT DROP AS
SELECT
  "i"."id",
  "i"."tenant_id",
  "i"."item_num" AS "old_num",
  (9999 + ROW_NUMBER() OVER (PARTITION BY "i"."tenant_id" ORDER BY "i"."created_at", "i"."id"))::text AS "new_num"
FROM "items" AS "i"
WHERE "i"."item_num" ~ '^(ITM|ITEM)-\d{5,6}$'
   OR ("i"."item_num" ~ '^\d+$' AND "i"."item_num"::bigint >= 10000);

UPDATE "items" AS "i"
SET "item_num" = '_mig_' || "i"."id"::text
FROM "_item_num_map" AS "m"
WHERE "i"."id" = "m"."id";

UPDATE "wo_materials" AS "wm"
SET "item_num" = "m"."new_num"
FROM "_item_num_map" AS "m"
WHERE "wm"."tenant_id" = "m"."tenant_id"
  AND "wm"."item_num" = "m"."old_num";

UPDATE "job_plan_materials"
SET "item_num" = "m"."new_num"
FROM "_item_num_map" AS "m"
INNER JOIN "job_plans" AS "jp" ON "jp"."tenant_id" = "m"."tenant_id"
WHERE "job_plan_materials"."jp_id" = "jp"."id"
  AND "job_plan_materials"."item_num" = "m"."old_num";

UPDATE "items" AS "i"
SET "item_num" = "m"."new_num"
FROM "_item_num_map" AS "m"
WHERE "i"."id" = "m"."id";

-- ─── Storerooms (storeroom_num + code kept in sync) ──────────────────────────
CREATE TEMP TABLE "_storeroom_map" ON COMMIT DROP AS
SELECT
  "s"."id",
  "s"."tenant_id",
  (9999 + ROW_NUMBER() OVER (PARTITION BY "s"."tenant_id" ORDER BY "s"."created_at", "s"."id"))::text AS "new_num"
FROM "storerooms" AS "s"
WHERE "s"."storeroom_num" ~ '^STR-\d{5}$'
   OR ("s"."storeroom_num" ~ '^\d+$' AND "s"."storeroom_num"::bigint >= 10000);

UPDATE "storerooms" AS "s"
SET
  "storeroom_num" = '_mig_' || "s"."id"::text,
  "code" = '_mig_' || "s"."id"::text
FROM "_storeroom_map" AS "m"
WHERE "s"."id" = "m"."id";

UPDATE "storerooms" AS "s"
SET
  "storeroom_num" = "m"."new_num",
  "code" = "m"."new_num"
FROM "_storeroom_map" AS "m"
WHERE "s"."id" = "m"."id";

-- ─── Assets (asset_num) ──────────────────────────────────────────────────────
UPDATE "assets"
SET "asset_num" = '_mig_' || "id"::text
WHERE "asset_num" ~ '^AST-\d{5}$'
   OR ("asset_num" ~ '^\d+$' AND "asset_num"::bigint >= 10000);

WITH "ranked" AS (
  SELECT
    "id",
    (9999 + ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id"))::text AS "new_num"
  FROM "assets"
  WHERE "asset_num" LIKE '_mig_%'
)
UPDATE "assets" AS "a"
SET "asset_num" = "r"."new_num"
FROM "ranked" AS "r"
WHERE "a"."id" = "r"."id";

-- ─── Locations (code) ────────────────────────────────────────────────────────
UPDATE "locations"
SET "code" = '_mig_' || "id"::text
WHERE "code" ~ '^LOC-\d{5}$'
   OR ("code" ~ '^\d+$' AND "code"::bigint >= 10000);

WITH "ranked" AS (
  SELECT
    "id",
    (9999 + ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id"))::text AS "new_num"
  FROM "locations"
  WHERE "code" LIKE '_mig_%'
)
UPDATE "locations" AS "l"
SET "code" = "r"."new_num"
FROM "ranked" AS "r"
WHERE "l"."id" = "r"."id";

-- ─── Crews (crew_num) ────────────────────────────────────────────────────────
UPDATE "crews"
SET "crew_num" = '_mig_' || "id"::text
WHERE "crew_num" ~ '^CREW-\d{4}$'
   OR ("crew_num" ~ '^\d+$' AND "crew_num"::bigint >= 10000);

WITH "ranked" AS (
  SELECT
    "id",
    (9999 + ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id"))::text AS "new_num"
  FROM "crews"
  WHERE "crew_num" LIKE '_mig_%'
)
UPDATE "crews" AS "c"
SET "crew_num" = "r"."new_num"
FROM "ranked" AS "r"
WHERE "c"."id" = "r"."id";
