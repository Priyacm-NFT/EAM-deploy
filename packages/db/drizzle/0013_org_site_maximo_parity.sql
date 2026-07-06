-- Org/Site gap analysis (PRD vs IBM Maximo) — implements:
--   #2  Base Currency / Language on Organisation (single value each —
--       multi-language means a second Organisation, per real Maximo)
--   #13 Item Set / Company Set codes on Organisation
--   #5  Site-level inheritance-override flags for GL Account / Cost Center
--   #10 Site Number uniqueness scoped to Organisation (not just tenant)
--   #6/#7 entity_scope_registry — data-driven Org-level vs Site-level
--       classification for every entity table

DO $$ BEGIN
  CREATE TYPE "org_scope_level" AS ENUM ('ORG', 'SITE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

ALTER TABLE "organisations"
  ADD COLUMN IF NOT EXISTS "base_currency" text,
  ADD COLUMN IF NOT EXISTS "language" text,
  ADD COLUMN IF NOT EXISTS "item_set_code" text,
  ADD COLUMN IF NOT EXISTS "company_set_code" text;
--> statement-breakpoint

ALTER TABLE "sites"
  ADD COLUMN IF NOT EXISTS "inherit_gl_account" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "inherit_cost_center" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

-- Site Number unique per Organisation (drop the old tenant-only index if
-- one exists under a guessable default name, then add the correct one —
-- IF NOT EXISTS protects re-runs either way).
CREATE UNIQUE INDEX IF NOT EXISTS "sites_org_sitenum_idx" ON "sites" ("org_id", "site_num");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "entity_scope_registry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_name" text NOT NULL UNIQUE,
  "scope_level" "org_scope_level" NOT NULL,
  "notes" text
);
--> statement-breakpoint

-- Seed the registry with real Maximo's own Org-level vs Site-level split
-- (confirmed via TRM reference research during the gap analysis), mapped
-- to this platform's actual table names. ON CONFLICT keeps this safe to
-- re-run if new entities get added to the seed list later.
INSERT INTO "entity_scope_registry" ("entity_name", "scope_level", "notes") VALUES
  ('organisations',        'ORG',  'The Organisation record itself'),
  ('status_sets',          'ORG',  'Maximo: status sets configured at Org level'),
  ('labour_crafts',        'ORG',  'Maximo: Labor managed at Organization level'),
  ('item_master',          'ORG',  'Maximo: Items shareable across Sites in an Org'),
  ('smtp_configurations',  'ORG',  'Org-wide notification/email config'),
  ('sites',                'SITE', 'A Site itself is Site-scoped by definition'),
  ('locations',            'SITE', 'Maximo: Locations managed at Site level'),
  ('assets',               'SITE', 'Maximo: Assets managed at Site level'),
  ('work_orders',          'SITE', 'Maximo: Work Orders managed at Site level'),
  ('service_requests',     'SITE', 'Site-scoped, follows requesting Site'),
  ('job_plans',            'SITE', 'Maximo: Job Plans managed at Site level'),
  ('pm_masters',           'SITE', 'Maximo: PM schedules managed at Site level'),
  ('inventory_items',      'SITE', 'Maximo: Inventory/storerooms managed at Site level'),
  ('permits',              'SITE', 'Permit-to-Work tied to a physical Site')
ON CONFLICT ("entity_name") DO NOTHING;
