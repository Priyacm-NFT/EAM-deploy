# Phase 0 Test Tracker

Maps to [EAM_Phase0_Test_Plan.xlsx](./EAM_Phase0_Test_Plan.xlsx) — 166 tests.

| Workstream | Count | Automation |
|------------|-------|------------|
| P0-1 | 26 | `packages/auth/**/*.test.ts`, API integration |
| P0-2 | 19 | `packages/config-engine/**/*.test.ts` |
| P0-3 | 18 | `packages/workflow-engine/**/*.test.ts` |
| P0-4 | 13 | `packages/integration-framework/**/*.test.ts` |
| P0-5 | 13 | `packages/attachment-service/**/*.test.ts` |
| P0-6 | 14 | `packages/reporting-engine/**/*.test.ts` |
| P0-7 | 14 | Playwright (chat/dashboard) |
| P0-8 | 16 | `packages/notification-service/**/*.test.ts` |
| INT | 33 | `apps/web/e2e/`, `load-tests/`, security checks |

Run all unit tests: `pnpm test`
