-- Real bug found during Meter Rolldown (Sheet row 8) testing — a
-- double-submitted "Save" on the meter creation form created two
-- identically-named meters on the same asset, which broke the rolldown
-- cascade ambiguously (the lookup matches by name, and two same-named
-- parent meters make it unclear which one's rolldown flag actually
-- governs). This constraint makes that state impossible going forward.
--
-- NOTE: if any existing asset already has duplicate meter names, this
-- migration will fail with a unique-violation. Run the cleanup query
-- below first if needed:
--
--   DELETE FROM asset_meters a USING asset_meters b
--   WHERE a.id > b.id AND a.asset_id = b.asset_id AND a.name = b.name;

CREATE UNIQUE INDEX IF NOT EXISTS "asset_meters_asset_name_idx" ON "asset_meters" ("asset_id", "name");
