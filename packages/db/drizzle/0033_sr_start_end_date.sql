-- FIX (SR create/detail form parity): adds the requested service window
-- (Start Date / End Date) to Service Requests — shown on the create form
-- and the detail page's Overview grid.

ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "start_date" timestamp with time zone;
ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "end_date" timestamp with time zone;
