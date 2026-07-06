-- PRD 9.2 gap — Service Request "Waiting on Requester" status with SLA
-- clock pause. Adds the new enum value and the two tracking columns
-- needed to pause/resume the SLA due date correctly.
--
-- FIX #1: this originally assumed the "sr_status" enum type already
-- existed (it's supposed to have been created back in migration 0006 /
-- 0009) and just tried to ALTER TYPE ... ADD VALUE on it. On at least
-- one environment that type wasn't present at all when this ran.
--
-- FIX #2: on investigation (via the guard added in FIX #1), it turned
-- out service_requests.status is actually a plain "text" column on that
-- DB, not the "sr_status" enum declared in schema.ts — 0006/0009 never
-- actually converted it (likely a `db:push` run at some point that
-- didn't carry the conversion through). A text column already accepts
-- any string value with zero risk, so rather than force a live
-- text→enum cast here (a bigger, separate piece of schema-drift cleanup,
-- and one that would fail outright if any existing row's value doesn't
-- match an enum label), this now branches at runtime: the ALTER TYPE ADD
-- VALUE only runs if the column turns out to actually be enum-typed;
-- plain-text columns are left alone entirely and just proceed straight
-- to adding the new SLA-pause tracking columns, which is all this
-- migration actually needs to accomplish either way.
--
-- (ALTER TYPE ... ADD VALUE can't be written directly inside a
-- PL/pgSQL block — Postgres rejects that at parse time regardless of
-- transaction settings — so it's invoked here via EXECUTE, the standard
-- documented workaround for making it conditional.)

DO $$ BEGIN
  CREATE TYPE "public"."sr_status" AS ENUM (
    'NEW', 'QUEUED', 'IN_PROGRESS', 'CLOSED', 'RESOLVED', 'CONVERTED', 'CANCELLED', 'WAITING_ON_REQUESTER'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$
DECLARE actual_type text;
BEGIN
  SELECT udt_name INTO actual_type
  FROM information_schema.columns
  WHERE table_name = 'service_requests' AND column_name = 'status';

  IF actual_type = 'sr_status' THEN
    EXECUTE 'ALTER TYPE public.sr_status ADD VALUE IF NOT EXISTS ''WAITING_ON_REQUESTER''';
  ELSE
    RAISE NOTICE
      'service_requests.status is "%", not sr_status — skipping ALTER TYPE ADD VALUE; a % column already accepts the new status string with no migration needed. (Separate cleanup: schema.ts declares this column as the sr_status enum, but the live column is %. Worth reconciling later — see packages/db/src/schema/entities.ts srStatusEnum — but out of scope for this migration.)',
      actual_type, actual_type, actual_type;
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "service_requests"
  ADD COLUMN IF NOT EXISTS "sla_paused_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "sla_paused_total_ms" numeric(20, 0) NOT NULL DEFAULT 0;
 