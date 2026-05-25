# Phase-0 Foundation Audit Report — EAM Platform

**Audit Date:** 2026-05-25
**Repo:** `/Users/muthu/nft/workspace/nft-eam`
**PRD Version:** v1.1 (Phase-0 Expanded — 8 workstreams)
**Test Coverage:** 166 defined test cases across P0-1 → P0-8 + INT
**Test Run Result:** 16/19 Turborepo tasks pass. `@eam/web` fails (broken `nanoid/non-secure` dependency — not a logic error).
**Overall Completeness: ~88%**

---

## Architecture Overview

| Layer | Technology |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Language | TypeScript throughout |
| API | Fastify with Swagger/OpenAPI |
| ORM | Drizzle ORM + PostgreSQL |
| Queues | BullMQ + Redis (ioredis) |
| Storage | MinIO (S3-compatible) |
| Real-time | Socket.IO with Redis Pub/Sub bridge |
| Frontend | React + Vite + Tailwind CSS |

---

## P0-1 — User Management & RBAC

### Status: ~87%

| Area | Status | Notes |
|---|---|---|
| Local auth (argon2id, password policy, lockout) | ✅ Done | Min length, uppercase, number, special, 5-attempt lockout |
| JWT RS256 (access 15m / refresh 7d / MFA 5m) | ✅ Done | RS256 key rotation via env vars |
| TOTP MFA (setup, QR code, verify, disable, 10 recovery codes) | ✅ Done | AES-256-GCM encrypted secret, `qrcode` for QR |
| SMS MFA (6-digit OTP via Redis TTL 300s) | ✅ Done | Routes wired; `sendSms` delegates to `lib/email.ts` — no real SMS provider (Twilio/SNS) confirmed |
| Push MFA (challengeId/poll pattern via Redis) | ✅ Done | `MFA_PUSH_AUTO_APPROVE=true` env for CI bypass; no FCM/APNs integration |
| SAML SSO (samlify, SP metadata, login redirect, callback) | ✅ Done | Requires IdP metadata in config; needs integration test with real IdP |
| OIDC SSO (openid-client, PKCE, state in Redis) | ✅ Done | Full authorization code flow with PKCE |
| LDAP/AD user sync (ldapjs, upsert users+groups) | ✅ Done | Syncs users; **group membership (`user_groups`) not populated from LDAP `member` attributes** |
| Session policy (idle timeout, absolute timeout, per-tenant) | ✅ Done | Reads `tenant.settings.sessionPolicy` via Zod schema |
| Concurrent session limiting | ✅ Done | `enforceConcurrentLimit` revokes oldest sessions beyond `maxConcurrentSessions` |
| `sessions.lastActivityAt` updated on each request | ❌ Missing | Column and `touchSession()` exist; no Fastify `preHandler` middleware calls it — idle timeout never triggers |
| `users.phone` column for SMS MFA | ❌ **CRASH BUG** | `mfa.ts` reads `user.phone` but no `phone` column in users Drizzle schema |
| Forced logout on role change | ❌ Missing | Changing a role does not revoke in-flight 15-minute access tokens |
| Field-level RBAC enforcement in API responses | ⚠️ Partial | `applyFieldRules` implemented in config-engine; callers must pass `userRoleIds` |

---

## P0-2 — Application Configuration Engine

### Status: ~83%

| Area | Status | Notes |
|---|---|---|
| All 13 field types (text, number, date, picklist, lookup, formula, attachment…) | ✅ Done | Full `fieldTypeEnum` |
| Form layouts per role with version tracking | ✅ Done | `formLayouts` + `configVersions` |
| Table views with column config, sort, filters per role | ✅ Done | `tableViews` |
| Field rules (REQUIRED/READONLY/HIDDEN/VISIBLE) with conditions | ✅ Done | `applyFieldRules` with `ruleAppliesToUser` and `conditionExpression` |
| Regex validation | ✅ Done | `validationRules.regex` |
| String length validation (minLength/maxLength) | ✅ Done | Added in update |
| Numeric and date range validation (min/max) | ✅ Done | Handles ISO date strings and numbers |
| Picklist definitions with effective dates + parent-child cascading | ✅ Done | `effectiveFrom/To`, `parentValue` |
| Schema extension (ADD_COLUMN, advisory lock, `custom__` prefix) | ✅ Done | `SchemaExtensionService` |
| Admin API: entity/field CRUD | ✅ Done | `adminRoutes` |
| Config versioning table | ✅ Schema | `configVersions` exists; no Dev→Test→Prod promotion endpoint |
| Dev→Test→Prod config promotion API | ❌ Missing | No implementation |
| WYSIWYG form builder UI | ❌ Missing | `form-layout-types.ts` is type definitions only; no React component |

---

## P0-3 — SQL-Conditioned Workflow Engine

### Status: ~95%

| Area | Status | Notes |
|---|---|---|
| START / END / DECISION / TASK / APPROVAL nodes | ✅ Done | Full implementation in `engine.ts` |
| Expression-conditioned decisions (expr-eval) | ✅ Done | Safer than raw SQL; functionally equivalent |
| NOTIFICATION node (EventBus emit, history logging) | ✅ Done | Configurable `eventType`, `distributionRules`, `subject`, `body` in node config |
| INTEGRATION node (adapter delegation via registry) | ✅ Done | `executeWorkflowIntegration` resolves connection from DB or inline config |
| Dynamic assignment: ROLE, STATIC_USER, GROUP, SUPERVISOR | ✅ Done | GROUP resolves by groupId or groupName within tenant |
| Time-based escalation (BullMQ delayed jobs from `dueAt`) | ✅ Done | Worker schedules delay job; `processTaskEscalation` sets ESCALATED status, emits `WF_TASK_ESCALATED` |
| In-flight version pinning | ✅ Done | `advanceTask` re-fetches definition using instance's stored `workflowDefId`; `pickWorkflowDefinition` picks highest semver |
| Workflow history ledger | ✅ Done | All node transitions logged to `workflow_history` |
| Process versioning schema | ✅ Done | `version` field with semantic version comparison |

**No significant functional gaps.** Drag-and-drop canvas UI is out of scope for Phase-0 backend work.

---

## P0-4 — Multi-Protocol Integration Framework

### Status: ~90%

| Area | Status | Notes |
|---|---|---|
| REST adapter (exponential backoff, retry) | ✅ Done | `rest.ts` |
| Webhook outbound (HMAC-SHA256, 3-attempt retry) | ✅ Done | `webhook.ts` |
| SOAP adapter (envelope template, fast-xml-parser response) | ✅ Done | SOAPAction header, configurable timeout |
| Kafka adapter (kafkajs, producer.send, admin topic verify) | ✅ Done | Dry-run support |
| RabbitMQ adapter (amqplib) | ✅ Done | |
| SFTP adapter (ssh2-sftp-client, inbound+outbound, privateKey) | ✅ Done | Inbound get / outbound put via tmpdir staging |
| JDBC/PostgreSQL adapter (pg) | ✅ Done | PostgreSQL-only (not Oracle/MySQL JDBC) |
| ERP connectors (SAP, Oracle EBS, MS Dynamics, Workday) | ✅ Done | Config builders delegating to REST/SOAP adapters |
| Integration job scheduler (cron-parser, `processDueIntegrationJobs`) | ✅ Done | 1-minute BullMQ repeat job polls `nextRunAt ≤ now` |
| Event-triggered jobs (`onAny` EventBus) | ✅ Done | `integration-jobs.ts` fires matching `triggerEvent` jobs on any system event |
| Bulk export (CSV/JSON/XLSX via ExcelJS) | ✅ Done | `fetchExportRows` + `formatBulkExport` |
| OpenAPI/Swagger route annotations | ⚠️ Partial | Report routes annotated; admin/integration routes missing full schemas |
| JDBC generic (Oracle, MySQL) | ❌ N/A | Current `JdbcAdapter` uses `pg` — PostgreSQL only |

---

## P0-5 — Attachment Management

### Status: ~88%

| Area | Status | Notes |
|---|---|---|
| S3/MinIO presigned upload + download | ✅ Done | `presignUpload`, `presignDownload` |
| Document type enforcement (extensions, size, retention, visibility) | ✅ Done | Validated in presign route |
| Real ClamAV TCP INSTREAM socket | ✅ Done | `clamav.ts`: chunked 64 KB blocks with 4-byte BE length prefix; `CLAMAV_DISABLED=true` fallback |
| GPS/timestamp/device auto-tagging | ✅ Done | `buildAutoTags` in `tags.ts`; integrated in presign route |
| Presigned download route (`/attachments/:id/download`) | ✅ Done | Blocks download if `scanStatus !== CLEAN` |
| Document versioning schema (`versionOf`, `versionNum`) | ✅ Schema | Fields stored; version creation not automated in API |
| Attachment library multi-entity linking | ✅ Done | `attachmentLinks` table |
| Configurable virus action (QUARANTINE/REJECT/ALERT) | ⚠️ Partial | Enum stored; worker always sets `INFECTED` without branching on action — no S3 delete (REJECT) or alert-only path |
| SHA-256 checksum storage | ❌ Missing | `checksumSha256` column exists; never computed or stored in presign route |

---

## P0-6 — Pluggable Reporting Engine

### Status: ~78%

| Area | Status | Notes |
|---|---|---|
| PDF report generation (pdfkit, paginated, page numbers) | ✅ Done | Landscape A4, bold header row, column layout, page footer |
| XLSX report (ExcelJS, bold headers, auto-filter) | ✅ Done | Sheet named after report, auto-filter on all columns |
| CSV report | ✅ Done | Proper RFC 4180 escaping |
| Full `runReport` pipeline (query→format→S3→presign URL) | ✅ Done | Uses `READ_REPLICA_DATABASE_URL` if set |
| Report CRUD API (list, create, update, delete, preview, run) | ✅ Done | Full REST with permission guards |
| Report schedule API + BullMQ runner (15-min tick) | ✅ Done | Creates cron schedule, enqueues run, distributes via email |
| Power BI adapter (push dataset + direct query connection string) | ✅ Done | `powerbi.ts` |
| Tableau WDC (schema + data endpoints + connector HTML) | ✅ Done | `tableau.ts` with paginated data endpoint |
| BIRT, Cognos, Qlik adapters | ✅ Done | Implemented in `bi-adapters/` |
| Report run log (audit) | ✅ Done | `reportRunLog` with status/rowCount/outputKey |
| Query builder field allowlist | ⚠️ **Blocking** | Only 6 fields allowed (`wo_num`, `status`, `sr_num`, `asset_num`, `site_num`, `tenant_id`); real reports need dozens |
| Query builder operators | ⚠️ **Blocking** | `BETWEEN`, `IN`, `IS_NULL`, `NOT_EQUALS`, `STARTS_WITH` defined in type but **not implemented** in switch statement — fall through silently |
| Drag-and-drop report builder UI | ❌ Missing | `report-types.ts` is type definitions only |

---

## P0-7 — Dashboard & Live Collaboration

### Status: ~90%

| Area | Status | Notes |
|---|---|---|
| Live dashboard KPI data (SR count, WO count) | ✅ Done | `getDashboardWidgets` queries DB by userId/tenantId |
| Recent work orders list (5 most recent open) | ✅ Done | Ordered by `updatedAt` desc |
| Chat persistence (DB insert on send) | ✅ Done | `persistChatMessage` called in socket handler |
| Chat history retrieval (`chat:history` with ack callback) | ✅ Done | Last 100 bidirectional messages |
| Chat read receipts (`chat:read`) | ✅ Done | Updates `readAt` in chatMessages |
| User presence on connect/disconnect (upsert pattern) | ✅ Done | `setUserPresence` with ONLINE/OFFLINE transitions broadcast to tenant room |
| Presence status change (`presence:status` event) | ✅ Done | Updates DB and broadcasts `user:presence` to tenant |
| Redis Pub/Sub → Socket.IO notification push | ✅ Done | `wireNotificationSocketPush` in `notification-bridge.ts` |
| EventBus → Redis publisher bridge | ✅ Done | `wireApiNotificationBridge` |
| Per-user/per-role dashboard layout schema | ✅ Schema | `dashboardLayouts` table; no save/load API endpoint |
| Dashboard layout save/load API | ❌ Missing | `GET /dashboard` returns live widgets; no `PUT /dashboard/layout` |
| `@eam/web` test suite | ❌ **Broken** | `Cannot find module 'nanoid/non-secure'` — run `pnpm install` or pin `nanoid` to v3.x |

---

## P0-8 — Email Notification Framework

### Status: ~90%

| Area | Status | Notes |
|---|---|---|
| Handlebars templates (subject + HTML + plain-text, merge fields) | ✅ Done | `formatDate` helper registered |
| `NotificationDispatcher` (event→trigger→template→recipients) | ✅ Done | Full dispatch pipeline |
| EventBus → Redis Pub/Sub → Worker dispatch pipeline | ✅ Done | `wireEventBusPublisher` + `subscribeSystemEvents` |
| In-app notifications (store + Socket.IO push via Redis) | ✅ Done | Pushes via `eam:notification-push` Pub/Sub channel |
| Rate limiting (in-memory + Redis sliding window, overflow as digest or drop) | ✅ Done | Both modes implemented |
| Digest queue (DB-backed `notificationDigestQueue`, 1-min flush) | ✅ Done | Grouped by trigger+recipient, batched email |
| Distribution: ROLE, GROUP, FIELD, STATIC_EMAIL, STATIC_USER | ✅ Done | `resolveDistributionRecipients` |
| Delivery log (written on QUEUED and DIGEST_QUEUED) | ✅ Done | `notificationDeliveryLog` |
| Per-user notification preferences (email/in-app/digest) | ✅ Done | Consulted in dispatcher for each recipient |
| System event registry (8 event types) | ✅ Done | `WO_ASSIGNED`, `WO_STATUS_CHANGED`, `SR_CREATED`, `SR_STATUS_CHANGED`, `WF_TASK_ASSIGNED`, `WF_TASK_APPROVED`, `ATTACHMENT_VIRUS_FOUND`, `REPORT_READY` |
| Per-tenant SMTP config from DB | ⚠️ Partial | `smtpConfigurations` table fully designed; email worker uses `SMTP_HOST` env vars — **ignores DB config** |
| In-app delivery logging | ⚠️ Partial | `notificationDeliveryLog` only written for EMAIL channel; in-app insert not logged |

---

## Overall Summary

| Workstream | Completeness | Primary Remaining Gap |
|---|---|---|
| P0-1 Auth & RBAC | **~87%** | `users.phone` missing (crash bug); idle timeout middleware absent; forced logout on role change |
| P0-2 Config Engine | **~83%** | Config promotion API; WYSIWYG form builder UI |
| P0-3 Workflow Engine | **~95%** | No significant backend gaps |
| P0-4 Integration | **~90%** | OpenAPI annotations incomplete; JDBC PostgreSQL-only |
| P0-5 Attachments | **~88%** | SHA-256 checksum not computed; virus action branching incomplete |
| P0-6 Reporting | **~78%** | Query builder field allowlist (6 fields) and missing operators (BETWEEN/IN/IS_NULL) are blocking |
| P0-7 Dashboard | **~90%** | `nanoid` broken web dep; layout save/load API |
| P0-8 Notifications | **~90%** | Per-tenant SMTP from DB not used; in-app delivery not logged |
| **Overall** | **~88%** | |

---

## Action Items

### 🔴 Immediate (Runtime Bugs)

**1. Add `users.phone` column**
- **File:** `packages/db/src/schema/identity.ts`
- **Fix:** Add `phone: text('phone')` to the `users` table and generate a migration.
- **Impact:** Any SMS MFA call currently crashes at runtime — `mfa.ts` reads `user.phone` which does not exist in the Drizzle schema.

**2. Fix `nanoid/non-secure` missing dependency**
- **Fix:** Run `pnpm install` from workspace root, or add `"nanoid": "3.x"` to the root `package.json` overrides.
- **Impact:** Breaks all `@eam/web` unit tests, blocking CI for the frontend package.

---

### 🟠 High Priority (Functional Gaps)

**3. Wire `touchSession` on authenticated requests**
- **File:** `apps/api/src/plugins/auth.ts` (or equivalent Fastify auth plugin)
- **Fix:** Add a Fastify `onRequest` hook after JWT verification that calls `touchSession(db, payload.sid)`. The `sid` claim is already embedded in the access token.
- **Impact:** Without this, `sessions.lastActivityAt` is never updated after login. The `isIdleExpired` check in `isSessionValid` always sees the original login timestamp, so idle timeout never fires despite the full infrastructure being in place.

**4. Expand query builder field allowlist and implement missing operators**
- **File:** `packages/reporting-engine/src/query-builder.ts`
- **Fix (fields):** Expand `ALLOWED_FIELDS` beyond the current 6 (`wo_num`, `status`, `sr_num`, `asset_num`, `site_num`, `tenant_id`) to cover all commonly reported columns across assets, work orders, and service requests using table-qualified names.
- **Fix (operators):** Implement `BETWEEN`, `IN`, `IS_NULL`, `NOT_EQUALS`, and `STARTS_WITH` cases in the filter switch statement — they are defined in the TypeScript type but currently fall through with no SQL output.
- **Impact:** Reports using any field other than those 6, or any filter operator other than `EQUALS`/`CONTAINS`, silently return wrong or empty results.

**5. Per-tenant SMTP from DB**
- **File:** `apps/worker/src/index.ts` (send-email BullMQ worker)
- **Fix:** In the worker handler, receive `tenantId` as part of the job data. Query `smtpConfigurations` for the active row matching that `tenantId` and create the Nodemailer transport from those credentials instead of `process.env.SMTP_*`.
- **Impact:** All tenants share a single SMTP server, breaking the per-tenant email branding and deliverability isolation the PRD requires.

**6. LDAP group membership sync**
- **File:** `packages/auth/src/ldap-sync.ts` → `syncProvider`
- **Fix:** After upserting users, query LDAP group entries for `member` (or `memberOf`) attributes. For each group member, insert the corresponding row into the `user_groups` join table using `onConflictDoNothing`.
- **Impact:** Users authenticated via LDAP/AD do not inherit group roles after sync. Permission checks via `getEffectivePermissions` will miss group-granted permissions entirely.

---

### 🟡 Medium Priority (Completeness)

**7. Virus scan action branching**
- **File:** `apps/worker/src/index.ts` (virus-scan BullMQ worker)
- **Fix:** After `scanBuffer` returns `INFECTED`, load the attachment's linked `documentType.virusScanAction` and branch:
  - `QUARANTINE` — mark `scanStatus = INFECTED`, keep file in S3 (current behaviour)
  - `REJECT` — mark `scanStatus = INFECTED` **and** delete the object from S3
  - `ALERT` — mark `scanStatus = INFECTED`, emit `ATTACHMENT_VIRUS_FOUND` notification event without hard-blocking download
- **Impact:** The `virusScanAction` enum and schema are fully in place; branching logic is the only missing piece.

**8. Compute and store SHA-256 checksum**
- **File:** `apps/api/src/routes/attachments.ts` (presign route)
- **Fix:** After the upload confirmation step, compute `createHash('sha256').update(buffer).digest('hex')` and store it in the `checksumSha256` column of the `attachments` row. Alternatively, accept a client-supplied checksum and verify it server-side.
- **Impact:** The column is unused despite being designed for integrity verification and deduplication.

**9. Dashboard layout save/load API**
- **File:** `apps/api/src/routes/dashboard.ts`
- **Fix:** Add `GET /dashboard/layout` (load user's `dashboardLayouts` row) and `PUT /dashboard/layout` (upsert layout config for userId+tenantId). The `dashboardLayouts` table and schema are already in place.
- **Impact:** Custom widget arrangements are lost on page refresh.

**10. Config promotion API**
- **File:** `apps/api/src/routes/admin.ts` (or a new `config-versions.ts` route)
- **Fix:** Add `POST /admin/config/versions/:id/promote` that copies a `configVersions` snapshot to a target environment slug (e.g. `test`, `prod`) and optionally runs the corresponding `schemaMigrations`.
- **Impact:** The Dev→Test→Prod configuration lifecycle defined in the PRD has no API surface — operators cannot promote config changes between environments.

---

*Report generated from full static analysis of the nft-eam monorepo source. All file paths are relative to the repo root unless noted as absolute.*
