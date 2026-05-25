# @eam/notification-service

Event-driven notification framework for Phase 0 (P0-8):

- **Trigger evaluation** — reads `notification_triggers`, applies entity/condition filters
- **Template rendering** — Handlebars merge fields from event context
- **Recipient resolution** — role, group, field, static user/email distribution rules
- **EventBus bridge** — Redis pub/sub so API/workflow emits reach the worker dispatcher
- **Digest scheduling** — queues batched emails; worker cron flushes due digests
- **Rate limiting** — overflow routes to digest instead of individual emails
