import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../../components/identity/IdentityLayout.js';

interface Role { id: string; name: string; label: string }
interface LayoutRow { id: string; roleId: string | null; userId: string | null; isDefault: boolean; layout: Record<string, unknown> }

const ALL_WIDGET_IDS = [
  'kpi-open-wo', 'kpi-open-sr', 'kpi-assets', 'kpi-pending-approval',
  'shortcuts', 'list-my-wo', 'list-recent-wo', 'chart-wo-status', 'active-users',
];

const WIDGET_LABELS: Record<string, string> = {
  'kpi-open-wo':          '📊 KPI: Open Work Orders',
  'kpi-open-sr':          '📊 KPI: Open Service Requests',
  'kpi-assets':           '📊 KPI: Total Assets',
  'kpi-pending-approval': '📊 KPI: Awaiting Approval',
  'shortcuts':            '🔗 Quick Action Shortcuts',
  'list-my-wo':           '📋 My Assignments',
  'list-recent-wo':       '📋 Recent Work Orders',
  'chart-wo-status':      '📈 WO Status Chart',
  'active-users':         '👥 Active Users',
};

export function DashboardTemplatePage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [layouts, setLayouts] = useState<LayoutRow[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [widgetOrder, setWidgetOrder] = useState<string[]>([...ALL_WIDGET_IDS]);
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);

  function loadAll() {
    Promise.all([
      api<Role[]>('/admin/roles').catch(() => [] as Role[]),
      api<LayoutRow[]>('/dashboard/layouts/all').catch(() => [] as LayoutRow[]),
    ]).then(([r, l]) => { setRoles(r); setLayouts(l); });
  }

  useEffect(() => { loadAll(); }, []);

  function loadRoleLayout(roleId: string) {
    setSelectedRoleId(roleId);
    const existing = layouts.find((l) => l.roleId === roleId && l.isDefault);
    if (existing) {
      const tabs = existing.layout?.tabs as Array<{ widgetOrder: string[]; hiddenWidgets?: string[] }> | undefined;
      const first = tabs?.[0];
      setWidgetOrder(first?.widgetOrder ?? [...ALL_WIDGET_IDS]);
      setHiddenWidgets(first?.hiddenWidgets ?? []);
    } else {
      setWidgetOrder([...ALL_WIDGET_IDS]);
      setHiddenWidgets([]);
    }
  }

  async function save() {
    if (!selectedRoleId) { setError('Select a role first.'); return; }
    setSaving(true); setError(''); setMsg('');
    try {
      await api(`/dashboard/layout/role/${selectedRoleId}`, {
        method: 'PUT',
        body: JSON.stringify({ layout: { tabs: [{ id: 'default', name: 'Overview', widgetOrder, hiddenWidgets }] } }),
      });
      const roleName = roles.find((r) => r.id === selectedRoleId)?.label ?? selectedRoleId;
      setMsg(`Default layout saved for role "${roleName}". Users in this role will see it on next login.`);
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function resetRole(roleId: string) {
    if (!window.confirm('Reset this role\'s default dashboard?')) return;
    await api(`/dashboard/layout/role/${roleId}`, { method: 'DELETE' }).catch(() => {});
    setMsg('Reset to system default.');
    loadAll();
    if (selectedRoleId === roleId) { setWidgetOrder([...ALL_WIDGET_IDS]); setHiddenWidgets([]); }
  }

  function handleDrop(targetId: string) {
    if (!dragging || dragging === targetId) { setDragging(null); return; }
    const order = [...widgetOrder];
    const fi = order.indexOf(dragging); const ti = order.indexOf(targetId);
    if (fi === -1 || ti === -1) { setDragging(null); return; }
    order.splice(fi, 1); order.splice(ti, 0, dragging);
    setWidgetOrder(order); setDragging(null);
  }

  function toggleHidden(id: string) {
    setHiddenWidgets((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  const roleLayouts = layouts.filter((l) => l.roleId && l.isDefault);

  return (
    <IdentityPageLayout
      title="Dashboard Templates"
      subtitle="Set the default widget layout for each role — users can personalise their own copy"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {roleLayouts.length > 0 && (
        <div className="admin-section">
          <h2 className="admin-section-title">Saved role defaults</h2>
          <table className="admin-table">
            <thead><tr><th>Role</th><th>Widgets</th><th>Actions</th></tr></thead>
            <tbody>
              {roleLayouts.map((l) => {
                const role = roles.find((r) => r.id === l.roleId);
                const tabs = l.layout?.tabs as Array<{ widgetOrder: string[] }> | undefined;
                const count = tabs?.[0]?.widgetOrder?.length ?? 0;
                return (
                  <tr key={l.id}>
                    <td className="font-medium">{role?.label ?? role?.name ?? l.roleId}</td>
                    <td className="text-sm text-slate-500">{count} widgets</td>
                    <td>
                      <div className="flex gap-2">
                        <button type="button" className="btn-link text-xs" onClick={() => loadRoleLayout(l.roleId!)}>Edit</button>
                        <button type="button" className="btn-danger text-xs" onClick={() => resetRole(l.roleId!)}>Reset</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-section">
        <h2 className="admin-section-title">Configure layout for a role</h2>
        <div className="mb-5">
          <label className="form-label">Role</label>
          <select className="form-select max-w-xs" value={selectedRoleId}
            onChange={(e) => loadRoleLayout(e.target.value)}>
            <option value="">— choose a role —</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.label || r.name}</option>)}
          </select>
        </div>

        {selectedRoleId && (
          <>
            <p className="text-sm text-slate-500 mb-4">
              Drag to reorder. Click the eye to show/hide a widget for this role.
            </p>
            <div className="space-y-2">
              {widgetOrder.map((id) => {
                const hidden = hiddenWidgets.includes(id);
                return (
                  <div key={id} draggable
                    onDragStart={() => setDragging(id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-grab active:cursor-grabbing transition-all ${
                      dragging === id ? 'opacity-40 scale-95' :
                      hidden ? 'bg-slate-50 border-slate-100 opacity-60' :
                      'bg-white border-slate-200 hover:border-accent/30 hover:shadow-sm'
                    }`}>
                    <span className="text-slate-300 text-sm select-none">⠿</span>
                    <span className={`flex-1 text-sm font-medium ${hidden ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {WIDGET_LABELS[id] ?? id}
                    </span>
                    <button type="button" onClick={() => toggleHidden(id)}
                      title={hidden ? 'Show' : 'Hide'}
                      className={`text-base transition-colors ${hidden ? 'opacity-30 hover:opacity-60' : 'hover:text-accent'}`}>
                      {hidden ? '🙈' : '👁'}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex gap-3 flex-wrap">
              <button type="button" className="btn-primary !w-auto px-6" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save as role default'}
              </button>
              <button type="button" className="btn-outline"
                onClick={() => { setWidgetOrder([...ALL_WIDGET_IDS]); setHiddenWidgets([]); }}>
                Reset order
              </button>
            </div>
          </>
        )}
      </div>
    </IdentityPageLayout>
  );
}
