-- Sheet row 2 — Position field on Asset (copied from location on
-- install, retained on uninstall). Adds the same `position` column to
-- both Locations and Assets so an asset installed into a slot can carry
-- that slot's identity, and keeps it even after being moved out to a
-- storeroom (see assets.ts /assets/:id/move route for the copy/retain
-- logic — this migration only adds the columns).

ALTER TABLE "locations"
  ADD COLUMN IF NOT EXISTS "position" text;
--> statement-breakpoint

ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "position" text;
