import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../../components/identity/IdentityLayout.js';

interface Trigger {
  id: string;
  eventType: string;
  entityType: string | null;
  isMandatory: boolean;
  isActive: boolean;
}

interface Pref {
  triggerId: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  digestEnabled: boolean;
}

export function UserNotificationPrefsPage() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [prefs, setPrefs] = useState<Record<string, Pref>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api<Trigger[]>('/admin/notifications/triggers'),
      api<Pref[]>('/users/me/notification-prefs'),
    ]).then(([triggers, prefList]) => {
      setTriggers(triggers.filter((t) => t.isActive));
      const map: Record<string, Pref> = {};
      for (const p of prefList) map[p.triggerId] = p;
      setPrefs(map);
    }).catch((e) => setError(String(e)));
  }, []);

  async function updatePref(triggerId: string, field: keyof Omit<Pref, 'triggerId'>, value: boolean) {
    const current = prefs[triggerId] ?? { triggerId, emailEnabled: true, inAppEnabled: true, digestEnabled: false };
    const updated = { ...current, [field]: value };
    setPrefs((prev) => ({ ...prev, [triggerId]: updated }));
    setSaving(triggerId);
    try {
      await api(`/users/me/notification-prefs/${triggerId}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: value }),
      });
      setMsg('Preference saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      // Revert on error
      setPrefs((prev) => ({ ...prev, [triggerId]: current }));
    } finally {
      setSaving(null);
    }
  }

  const getPref = (triggerId: string): Pref =>
    prefs[triggerId] ?? { triggerId, emailEnabled: true, inAppEnabled: true, digestEnabled: false };

  return (
    <IdentityPageLayout
      title="My Notification Preferences"
      subtitle="Choose how you receive notifications for each event type"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <p className="text-sm text-slate-600 mb-4">
          Mandatory notifications cannot be disabled. Changes take effect immediately.
        </p>

        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Entity</th>
                <th className="text-center">📧 Email</th>
                <th className="text-center">🔔 In-app</th>
                <th className="text-center">📦 Digest</th>
                <th className="text-center">Mandatory</th>
              </tr>
            </thead>
            <tbody>
              {triggers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-400 py-8">
                    No notification triggers configured yet.
                  </td>
                </tr>
              )}
              {triggers.map((t) => {
                const p = getPref(t.id);
                const busy = saving === t.id;
                return (
                  <tr key={t.id}>
                    <td className="font-medium text-slate-800">{t.eventType.replace(/_/g, ' ')}</td>
                    <td className="text-sm text-slate-500">{t.entityType ?? '—'}</td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={p.emailEnabled}
                        disabled={t.isMandatory || busy}
                        title={t.isMandatory ? 'Mandatory — cannot be disabled' : 'Toggle email notifications'}
                        onChange={(e) => updatePref(t.id, 'emailEnabled', e.target.checked)}
                        className="rounded border-slate-300 text-accent disabled:opacity-40"
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={p.inAppEnabled}
                        disabled={busy}
                        title="Toggle in-app notifications"
                        onChange={(e) => updatePref(t.id, 'inAppEnabled', e.target.checked)}
                        className="rounded border-slate-300 text-accent disabled:opacity-40"
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={p.digestEnabled}
                        disabled={busy}
                        title="Receive as digest instead of individual emails"
                        onChange={(e) => updatePref(t.id, 'digestEnabled', e.target.checked)}
                        className="rounded border-slate-300 text-accent disabled:opacity-40"
                      />
                    </td>
                    <td className="text-center">
                      {t.isMandatory
                        ? <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Yes</span>
                        : <span className="text-xs text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-section text-sm text-slate-500 space-y-1">
        <p><strong>📧 Email</strong> — receive an email for each event</p>
        <p><strong>🔔 In-app</strong> — show in the notification bell (top right)</p>
        <p><strong>📦 Digest</strong> — batch events and receive one summary email</p>
      </div>
    </IdentityPageLayout>
  );
}
