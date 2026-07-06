-- Fixes "Set or Modify E-Signature Key" modal returning a raw 404 "Not
-- Found" — GET/PUT /account/esignature now exist in account.ts, and need
-- these two columns to store the (hashed) key and when it was last set.
 
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "esignature_hash" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "esignature_set_at" timestamp with time zone;
 