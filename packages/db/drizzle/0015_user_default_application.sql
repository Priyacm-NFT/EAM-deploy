-- User Default Application — default to 'Dashboard' for all users (new
-- and existing) instead of leaving the field blank. Maximo's equivalent
-- field decides which app/screen a user lands on; Dashboard is this
-- platform's landing page, so it's the sensible default rather than an
-- empty box every user has to fill in themselves.

ALTER TABLE "users"
  ALTER COLUMN "user_default_application" SET DEFAULT 'Dashboard';
--> statement-breakpoint

UPDATE "users"
  SET "user_default_application" = 'Dashboard'
  WHERE "user_default_application" IS NULL OR "user_default_application" = '';
--> statement-breakpoint

ALTER TABLE "users"
  ALTER COLUMN "user_default_application" SET NOT NULL;
