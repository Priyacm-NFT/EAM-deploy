import { db, audit } from '@eam/db';
import { revokeAllSessions } from '@eam/auth';
 
const INTERVAL_MS = 60 * 60 * 1000;
 
export function startDeactivationScheduler(): void {
  console.info('[scheduler] Deactivation scheduler started');
  runCheck();
  setInterval(runCheck, INTERVAL_MS);
}
 
async function runCheck(): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
 
    const due = await (db as any).$client<{ id: string; email: string; tenant_id: string }[]>`
      SELECT id, email, tenant_id
      FROM users
      WHERE is_active = true
        AND deactivate_at IS NOT NULL
        AND deactivate_at <= ${nowIso}::timestamptz
        AND deleted_at IS NULL
    `;
 
    if (!due || due.length === 0) return;
    console.info(`[scheduler] Deactivating ${due.length} user(s)`);
 
    for (const u of due) {
      try {
        await (db as any).$client`UPDATE users SET is_active = false, deactivate_at = NULL WHERE id = ${u.id}`;
        const revoked = await revokeAllSessions(db, u.id);
        await audit(db, {
          tenantId: u.tenant_id,
          userId: null,
          action: 'USER_AUTO_DEACTIVATED',
          resource: 'users',
          resourceId: u.id,
          metadata: { executedAt: nowIso, sessionsRevoked: revoked },
        });
        console.info(`[scheduler] Deactivated ${u.email}`);
      } catch (err) {
        console.error(`[scheduler] Failed for ${u.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[scheduler] Check failed:', err);
  }
}