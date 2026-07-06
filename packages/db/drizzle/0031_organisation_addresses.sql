-- Maximo-parity "Addresses" tab: an Organisation can have multiple
-- addresses, each identified by its own Address Code, instead of the
-- single address baked into the organisations row. See the comment above
-- organisationAddresses in packages/db/src/schema/entities.ts.

CREATE TABLE IF NOT EXISTS "organisation_addresses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "org_id" uuid NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "address_code" text NOT NULL,
  "address_line1" text,
  "address_line2" text,
  "city" text,
  "state_province" text,
  "postal_code" text,
  "country" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "org_addresses_org_idx" ON "organisation_addresses" ("org_id");
CREATE UNIQUE INDEX IF NOT EXISTS "org_addresses_org_code_idx" ON "organisation_addresses" ("org_id", "address_code");
