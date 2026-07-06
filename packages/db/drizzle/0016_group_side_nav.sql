-- Real Maximo's Security Groups "Display Side Navigation Menu?" checkbox.
-- Defaults to true so existing groups behave exactly as before this
-- feature existed (sidebar visible) — nothing changes for current users
-- until an admin deliberately turns a group's sidebar off.

ALTER TABLE "groups"
  ADD COLUMN IF NOT EXISTS "display_side_nav" boolean NOT NULL DEFAULT true;
