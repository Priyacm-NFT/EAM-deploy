# EAM Platform (Phase 0)

Enterprise Asset Management monorepo — pnpm workspaces + Turborepo.

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker (for local services)

## Quick start

```bash
# Install dependencies
pnpm install

# Start infrastructure (Postgres, Redis, MinIO, ClamAV, Mailhog)
docker compose -f docker/docker-compose.dev.yml up -d

# Copy environment template
cp .env.example .env

# Build all packages
pnpm build

# Run database migrations (requires Postgres)
pnpm db:migrate

# Start apps (separate terminals)
pnpm --filter @eam/api dev
pnpm --filter @eam/worker dev
pnpm --filter @eam/web dev
```

- API: http://localhost:3000 — health at `/health`, docs at `/docs`
- Web: http://localhost:5173
- Mailhog: http://localhost:8025

## Monorepo layout

```
apps/api          Fastify REST API + Socket.IO
apps/web          React + Vite frontend
apps/worker       BullMQ background workers
packages/db       Drizzle ORM schema + migrations
packages/auth     Authentication & RBAC
packages/config-engine
packages/workflow-engine
packages/integration-framework
packages/attachment-service
packages/reporting-engine
packages/notification-service
packages/shared   Shared types & utilities
packages/ui       Component library
docker/           docker-compose.dev.yml
load-tests/       k6 baseline (INT-P-*)
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages (Turborepo) |
| `pnpm dev` | Run all dev servers in parallel |
| `pnpm lint` | ESLint across workspace |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | Vitest unit tests |
| `pnpm db:migrate` | Apply Drizzle migrations |

## Phase 0 workstreams

1. **P0-1** Identity — `@eam/auth`, `/auth/*`, admin identity UI
2. **P0-2** Config engine — metadata fields, validation, dynamic UI
3. **P0-3** Workflow — BPMN-lite engine + designer stubs
4. **P0-4** Integrations — REST/webhook adapters
5. **P0-5** Attachments — presigned MinIO upload + virus scan
6. **P0-6** Reporting — safe query builder
7. **P0-7** Dashboard + chat — widgets + Socket.IO
8. **P0-8** Notifications — templates, triggers, email worker

Test plan: [docs/phase0-test-tracker.md](docs/phase0-test-tracker.md) (166 cases).

## CI

GitHub Actions runs lint, typecheck, and test on every PR. Manual workflow dispatch runs k6 load tests.
