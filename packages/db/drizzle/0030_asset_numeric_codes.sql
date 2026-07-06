-- Asset module only: assign every asset a sequential numeric code per tenant
-- (10000, 10001, 10002, …) ordered by creation date. Idempotent when assets
-- already use the correct numeric sequence.

UPDATE "assets" AS "a"
SET "asset_num" = "r"."new_num"
FROM (
  SELECT
    "id",
    (9999 + ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id"))::text AS "new_num"
  FROM "assets"
) AS "r"
WHERE "a"."id" = "r"."id"
  AND "a"."asset_num" IS DISTINCT FROM "r"."new_num";
