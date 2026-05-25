-- Reporting read-only role (created on first migration in app; dev helper)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eam_reporting') THEN
    CREATE ROLE eam_reporting WITH LOGIN PASSWORD 'eam_reporting' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
