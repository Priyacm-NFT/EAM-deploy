CREATE TABLE IF NOT EXISTS "notification_digest_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "trigger_id" uuid NOT NULL REFERENCES "notification_triggers"("id") ON DELETE cascade,
  "recipient_user_id" uuid REFERENCES "users"("id"),
  "recipient_email" text NOT NULL,
  "subject" text NOT NULL,
  "html" text NOT NULL,
  "entity_type" text,
  "entity_id" uuid,
  "flush_after" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "notification_digest_queue_flush_after_idx"
  ON "notification_digest_queue" ("flush_after");
