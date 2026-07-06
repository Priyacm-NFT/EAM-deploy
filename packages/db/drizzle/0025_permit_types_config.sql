-- P1-6 gap — AC-P1-6.6: "Admin can configure a new permit type with
-- custom checklist and approver roles."
--
-- Two changes:
-- 1) permits.type: was a fixed Postgres enum (permit_type), which meant
--    the set of permit types was baked in at migration time. Converted
--    to plain text — safe because every existing value is already a
--    valid string, this is a widen-only change (enum -> text never loses
--    data, unlike the reverse).
-- 2) permit_types_config: new table holding each type's checklist
--    template and required approver roles, seeded with the same 6 types
--    (+ checklist items + approver roles) that used to be hardcoded in
--    apps/api/src/routes/permits.ts's getDefaultChecklistItems() /
--    getApprovalSteps() functions, so existing behavior is unchanged by
--    default — it's just admin-editable now instead of code-only.

ALTER TABLE "permits" ALTER COLUMN "type" TYPE text;

CREATE TABLE IF NOT EXISTS "permit_types_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "label" text NOT NULL,
  "checklist_template" jsonb NOT NULL DEFAULT '[]',
  "required_approver_roles" jsonb NOT NULL DEFAULT '[]',
  "max_validity_hours" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "permit_types_config_tenant_idx" ON "permit_types_config" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "permit_types_config_tenant_type_idx" ON "permit_types_config" ("tenant_id", "type");

-- Seed the 6 built-in types (+ GENERAL) for every existing tenant, using
-- the exact checklist/approver data that used to be hardcoded, so no
-- tenant's permit behavior changes just from running this migration.
INSERT INTO "permit_types_config" ("tenant_id", "type", "label", "checklist_template", "required_approver_roles", "is_active")
SELECT t.id, v.type, v.label, v.checklist_template::jsonb, v.required_approver_roles::jsonb, true
FROM "tenants" t
CROSS JOIN (VALUES
  ('HOT_WORK', 'Hot Work',
   '[{"category":"PPE","description":"Appropriate PPE identified and worn","isRequired":true},{"category":"GENERAL","description":"Area inspected and safe to proceed","isRequired":true},{"category":"GENERAL","description":"Emergency contacts available","isRequired":true},{"category":"GENERAL","description":"Combustible materials cleared from 10m radius","isRequired":true},{"category":"GAS_TEST","description":"Flammable gas test performed (< 10% LEL)","isRequired":true},{"category":"JSA","description":"Fire extinguisher positioned at work site","isRequired":true},{"category":"GENERAL","description":"Fire watch assigned","isRequired":true}]',
   '["supervisor","safety_officer"]'),
  ('CONFINED_SPACE', 'Confined Space',
   '[{"category":"PPE","description":"Appropriate PPE identified and worn","isRequired":true},{"category":"GENERAL","description":"Area inspected and safe to proceed","isRequired":true},{"category":"GENERAL","description":"Emergency contacts available","isRequired":true},{"category":"GAS_TEST","description":"Oxygen level tested (19.5-23.5%)","isRequired":true},{"category":"GAS_TEST","description":"Toxic gas levels tested","isRequired":true},{"category":"ISOLATION","description":"All energy sources isolated (LOTO)","isRequired":true},{"category":"LOTO","description":"Rescue plan and rescue team in place","isRequired":true},{"category":"JSA","description":"Continuous atmospheric monitoring in place","isRequired":true}]',
   '["supervisor","safety_officer"]'),
  ('ELECTRICAL', 'Electrical',
   '[{"category":"PPE","description":"Appropriate PPE identified and worn","isRequired":true},{"category":"GENERAL","description":"Area inspected and safe to proceed","isRequired":true},{"category":"GENERAL","description":"Emergency contacts available","isRequired":true},{"category":"ISOLATION","description":"Circuit de-energised and LOTO applied","isRequired":true},{"category":"ISOLATION","description":"Voltage verified with approved tester","isRequired":true},{"category":"LOTO","description":"All isolation points locked and tagged","isRequired":true}]',
   '["supervisor","safety_officer"]'),
  ('HEIGHT', 'Working at Height',
   '[{"category":"PPE","description":"Appropriate PPE identified and worn","isRequired":true},{"category":"GENERAL","description":"Area inspected and safe to proceed","isRequired":true},{"category":"GENERAL","description":"Emergency contacts available","isRequired":true},{"category":"PPE","description":"Fall arrest harness inspected and worn","isRequired":true},{"category":"GENERAL","description":"Scaffold / platform inspected and tagged","isRequired":true},{"category":"GENERAL","description":"Exclusion zone established below work area","isRequired":true}]',
   '["supervisor"]'),
  ('EXCAVATION', 'Excavation',
   '[{"category":"PPE","description":"Appropriate PPE identified and worn","isRequired":true},{"category":"GENERAL","description":"Area inspected and safe to proceed","isRequired":true},{"category":"GENERAL","description":"Emergency contacts available","isRequired":true},{"category":"GENERAL","description":"Underground services located and marked","isRequired":true},{"category":"GENERAL","description":"Shoring / sloping plan in place","isRequired":true},{"category":"GAS_TEST","description":"Gas detection active during excavation","isRequired":false}]',
   '["supervisor"]'),
  ('CHEMICAL', 'Chemical Handling',
   '[{"category":"PPE","description":"Appropriate PPE identified and worn","isRequired":true},{"category":"GENERAL","description":"Area inspected and safe to proceed","isRequired":true},{"category":"GENERAL","description":"Emergency contacts available","isRequired":true},{"category":"PPE","description":"Chemical-resistant PPE worn","isRequired":true},{"category":"GENERAL","description":"SDS reviewed and available on site","isRequired":true},{"category":"GENERAL","description":"Spill kit positioned at work site","isRequired":true},{"category":"GENERAL","description":"Eyewash station available","isRequired":true}]',
   '["supervisor"]'),
  ('GENERAL', 'General',
   '[{"category":"PPE","description":"Appropriate PPE identified and worn","isRequired":true},{"category":"GENERAL","description":"Area inspected and safe to proceed","isRequired":true},{"category":"GENERAL","description":"Emergency contacts available","isRequired":true}]',
   '["supervisor"]')
) AS v(type, label, checklist_template, required_approver_roles)
ON CONFLICT ("tenant_id", "type") DO NOTHING;
