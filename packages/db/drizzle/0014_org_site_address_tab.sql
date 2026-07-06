-- Maximo "Address" tab parity — replace the single free-text `address`
-- column on organisations/sites with structured fields (Address Line 1/2,
-- City, State/Province, Postal Code, Country), matching real Maximo's
-- Organization/Site detail page Address tab.

ALTER TABLE "organisations"
  ADD COLUMN IF NOT EXISTS "address_line1" text,
  ADD COLUMN IF NOT EXISTS "address_line2" text,
  ADD COLUMN IF NOT EXISTS "city" text,
  ADD COLUMN IF NOT EXISTS "state_province" text,
  ADD COLUMN IF NOT EXISTS "postal_code" text,
  ADD COLUMN IF NOT EXISTS "country" text;
--> statement-breakpoint

-- Best-effort carry-over: dump whatever was in the old single `address`
-- field into Address Line 1 so existing data isn't silently lost, then
-- drop the old column. Safe to run even if `address` doesn't exist
-- anymore (re-run safety).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'address'
  ) THEN
    UPDATE "organisations" SET "address_line1" = "address" WHERE "address" IS NOT NULL AND "address_line1" IS NULL;
    ALTER TABLE "organisations" DROP COLUMN "address";
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "sites"
  ADD COLUMN IF NOT EXISTS "address_line1" text,
  ADD COLUMN IF NOT EXISTS "address_line2" text,
  ADD COLUMN IF NOT EXISTS "city" text,
  ADD COLUMN IF NOT EXISTS "state_province" text,
  ADD COLUMN IF NOT EXISTS "postal_code" text,
  ADD COLUMN IF NOT EXISTS "country" text;
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name = 'address'
  ) THEN
    UPDATE "sites" SET "address_line1" = "address" WHERE "address" IS NOT NULL AND "address_line1" IS NULL;
    ALTER TABLE "sites" DROP COLUMN "address";
  END IF;
END $$;
