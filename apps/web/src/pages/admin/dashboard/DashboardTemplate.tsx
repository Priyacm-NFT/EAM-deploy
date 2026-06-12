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
  'kpi-open-wo':          'KPI: Open Work Orders',
  'kpi-open-sr':          'KPI: Open Service Requests',
  'kpi-assets':           'KPI: Total Assets',
  'kpi-pending-approval': 'KPI: Awaiting Approval',
  'shortcuts':            'Quick Action Shortcuts',
  'list-my-wo':           'My Assignments (list)',
  'list-recent-wo':       'Recent Work Orders (list)',
  'chart-wo-status':      'WO Status Chart',
  'active-users':         'Active Users',
};

const WIDGET_ICONS: Record<string, string> = {
  'kpi-open-wo':          '📊',
  'kpi-open-sr':          '📊',
  'kpi-assets':           '📊',
  'kpi-pending-approval': '📊',
  'shortcuts':            '🔗',
  'list-my-wo':           '📋',
  'list-recent-wo':       '📋',
  'chart-wo-status':      '📈',
  'active-users':         '👥',
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
    ]).then(([r, l]) => {
      setRoles(r);
      setLayouts(l);
    });
  }

  useEffect(() => { loadAll(); }, []);

  function loadRoleLayout(roleId: string) {
    setSelectedRoleId(roleId);
    if (!roleId) return;
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
    if (!window.confirm("Reset this role's default dashboard?")) return;
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
  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const visibleWidgets = widgetOrder.filter((id) => !hiddenWidgets.includes(id));

  return (
    <IdentityPageLayout
      title="Dashboard templates"
      subtitle="Set the default widget layout for each role — users can personalise their own copy"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {/* Saved role defaults table */}
      {roleLayouts.length > 0 && (
        <div className="admin-section">
          <h2 className="admin-section-title">Saved role defaults</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Visible widgets</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roleLayouts.map((l) => {
                const role = roles.find((r) => r.id === l.roleId);
                const tabs = l.layout?.tabs as Array<{ widgetOrder: string[]; hiddenWidgets?: string[] }> | undefined;
                const tab0 = tabs?.[0];
                const visible = (tab0?.widgetOrder ?? []).filter((w) => !(tab0?.hiddenWidgets ?? []).includes(w));
                return (
                  <tr key={l.id}>
                    <td className="font-medium">{role?.label ?? role?.name ?? l.roleId}</td>
                    <td className="text-sm text-slate-500">
                      {visible.map((w) => WIDGET_ICONS[w] ?? '▪').join(' ')} {visible.length} visible
                    </td>
                    <td>
                      <div className="flex gap-3">
                        <button type="button" className="btn-link text-xs" onClick={() => loadRoleLayout(l.roleId!)}>
                          Edit
                        </button>
                        <button type="button" className="btn-danger text-xs" onClick={() => resetRole(l.roleId!)}>
                          Reset
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Configure layout for a role */}
      <div className="admin-section">
        <h2 className="admin-section-title">Configure layout for a role</h2>

        <div className="mb-5">
          <label className="form-label" htmlFor="role-select">Select role</label>
          <select
            id="role-select"
            className="form-select max-w-xs"
            value={selectedRoleId}
            onChange={(e) => loadRoleLayout(e.target.value)}
          >
            <option value="">— choose a role —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.label || r.name}</option>
            ))}
          </select>
          {roles.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">No roles found. Create roles under Identity → Roles first.</p>
          )}
        </div>

        {selectedRoleId && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left: drag + toggle widgets */}
            <div>
              <p className="text-sm text-slate-500 mb-3">
                Drag to reorder. Click the eye to show/hide a widget for <strong>{selectedRole?.label ?? selectedRole?.name}</strong>.
              </p>
              <div className="space-y-2">
                {widgetOrder.map((id) => {
                  const hidden = hiddenWidgets.includes(id);
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={() => setDragging(id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(id)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-grab active:cursor-grabbing select-none transition-all ${
                        dragging === id
                          ? 'opacity-40 scale-95'
                          : hidden
                          ? 'bg-slate-50 border-slate-100 opacity-60'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-slate-300 text-sm">⠿</span>
                      <span className="text-base">{WIDGET_ICONS[id]}</span>
                      <span className={`flex-1 text-sm ${hidden ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>
                        {WIDGET_LABELS[id] ?? id}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleHidden(id)}
                        title={hidden ? 'Show widget' : 'Hide widget'}
                        className={`text-sm px-2 py-1 rounded border text-xs transition-colors ${
                          hidden
                            ? 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200'
                            : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                        }`}
                      >
                        {hidden ? 'Hidden' : 'Visible'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex gap-3 flex-wrap">
                <button type="button" className="btn-primary !w-auto px-6" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save as role default'}
                </button>
                <button
                  type="button"
                  className="btn-outline !w-auto px-4"
                  onClick={() => { setWidgetOrder([...ALL_WIDGET_IDS]); setHiddenWidgets([]); }}
                >
                  Reset to default
                </button>
              </div>
            </div>

            {/* Right: live preview */}
            <div>
              <p className="text-sm text-slate-500 mb-3">
                Preview — what <strong>{selectedRole?.label ?? selectedRole?.name}</strong> will see on login:
              </p>
              <div className="border border-slate-200 rounded-lg bg-slate-50 p-3">
                {visibleWidgets.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">All widgets hidden — users will see an empty dashboard.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {visibleWidgets.map((id) => (
                      <div
                        key={id}
                        className={`rounded-lg border bg-white p-3 text-xs font-medium text-slate-600 flex items-center gap-2 ${
                          id.startsWith('kpi') ? 'col-span-1' :
                          id === 'chart-wo-status' ? 'col-span-2' :
                          'col-span-2'
                        }`}
                      >
                        <span className="text-base">{WIDGET_ICONS[id]}</span>
                        {WIDGET_LABELS[id]}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {visibleWidgets.length} of {widgetOrder.length} widgets visible · {hiddenWidgets.length} hidden
              </p>
            </div>

          </div>
        )}
      </div>
    </IdentityPageLayout>
  );
}
