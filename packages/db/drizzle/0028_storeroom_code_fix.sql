-- Fix for "duplicate key value violates unique constraint
-- storeroom_code_idx" — the live DB already had a `code` column with
-- its own unique index, but it was never declared in schema.ts, so nothing
-- controlled what went into it. The bigger problem: if that original
-- index was a plain unique index on `code` alone (not scoped per
-- tenant), two different tenants naming a storeroom the same thing would
-- collide with each other, which is almost certainly what actually
-- happened here.
--
-- This migration is defensive about not knowing the exact prior state:
-- it ensures the column exists, backfills it from storeroom_num for any
-- row where it's missing/inconsistent, drops the old index under either
-- of its two plausible names, and creates the correct tenant-scoped one.

ALTER TABLE "storerooms" ADD COLUMN IF NOT EXISTS "code" text;

-- Drop the old index BEFORE backfilling — if it was a plain unique index
-- on `code` alone (not scoped per tenant), the backfill below could hit
-- the exact same duplicate-key violation this migration is meant to fix,
-- the moment two different tenants' rows both try to backfill to the
-- same value as their own storeroom_num.
DROP INDEX IF EXISTS "storeroom_code_idx";
DROP INDEX IF EXISTS "storerooms_code_idx";

UPDATE "storerooms" SET "code" = "storeroom_num" WHERE "code" IS NULL OR "code" = '';

CREATE UNIQUE INDEX IF NOT EXISTS "storerooms_tenant_code_idx" ON "storerooms" ("tenant_id", "code");
