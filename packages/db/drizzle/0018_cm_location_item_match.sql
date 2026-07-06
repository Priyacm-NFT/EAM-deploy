-- Sheet row 3 — Item-match validation on Move (asset item vs target
-- location's CM item). Adds real Maximo's "CM Location" concept:
--   locations.is_cm_location  — marks a location as holding one specific Item
--   locations.cm_item_id      — which Item is required there
--   locations.asset_required  — flags whether a missing asset there is a
--                               configuration gap (used later for the
--                               Configuration Consistency Report)
--   assets.item_id            — which Item/part an asset represents
--                               (Maximo's "Rotating Item" link), compared
--                               against cm_item_id on Move.

ALTER TABLE "locations"
  ADD COLUMN IF NOT EXISTS "is_cm_location" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cm_item_id" uuid REFERENCES "items"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "asset_required" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "item_id" uuid REFERENCES "items"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "locations_cm_item_idx" ON "locations" ("cm_item_id");
CREATE INDEX IF NOT EXISTS "assets_item_idx" ON "assets" ("item_id");
