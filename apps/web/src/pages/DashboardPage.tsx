import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

// ─── Widget types ──────────────────────────────────────────────────────────────
type KpiWidget        = { id: string; type: 'kpi';          title: string; value: number; trend?: number; link?: string };
type ListWidget       = { id: string; type: 'list';         title: string; rows: { id: string; label: string; status: string; link?: string }[] };
type ChartWidget      = { id: string; type: 'chart';        title: string; data: { label: string; value: number }[]; chartType?: 'bar' | 'line' };
type AnnWidget        = { id: string; type: 'announcement'; title: string; body: string; severity?: 'info' | 'warning' | 'alert' };
type ShortcutWidget   = { id: string; type: 'shortcut';     title: string; shortcuts: { label: string; href: string; icon?: string }[] };
type ActiveUsersWidget= { id: string; type: 'active_users'; title: string; users: { userId: string; displayName: string; status: string }[] };

type DashboardWidget = KpiWidget | ListWidget | ChartWidget | AnnWidget | ShortcutWidget | ActiveUsersWidget;
type DashTab = { id: string; name: string; widgetOrder: string[]; hiddenWidgets?: string[] };
type WidgetConfig = { title?: string; refreshMs?: number; rowLimit?: number };

type DashboardResponse = { widgets: DashboardWidget[]; tenantId: string };
type LayoutResponse    = { layout: Record<string, unknown>; source: string };

// ─── Status badge ──────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  WAPPR: 'bg-slate-100 text-slate-600',  APPR:   'bg-blue-100 text-blue-700',
  INPRG: 'bg-yellow-100 text-yellow-800', COMP:  'bg-green-100 text-green-700',
  CLOSE: 'bg-gray-100 text-gray-500',    HOLD:   'bg-orange-100 text-orange-700',
  URGENT:'bg-red-100 text-red-700',       HIGH:  'bg-orange-100 text-orange-700',
  MEDIUM:'bg-yellow-100 text-yellow-700', LOW:   'bg-slate-100 text-slate-500',
  ONLINE:'bg-green-100 text-green-700',   AWAY:  'bg-amber-100 text-amber-700',
  DND:   'bg-red-100 text-red-600',       OFFLINE:'bg-slate-100 text-slate-400',
};
function StatusBadge({ status }: { status: string }) {
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-500'}`}>{status}</span>;
}

// ─── Mini bar chart ────────────────────────────────────────────────────────────
function MiniBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-20 mt-3">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="w-full bg-accent/70 rounded-t transition-all hover:bg-accent"
            style={{ height: `${Math.round((d.value / max) * 64)}px`, minHeight: 2 }}
            title={`${d.label}: ${d.value}`} />
          <span className="text-[9px] text-slate-400 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function TrendArrow({ trend }: { trend?: number }) {
  if (trend == null) return null;
  return <span className={`text-xs font-medium ml-1 ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>{trend >= 0 ? '↑' : '↓'}{Math.abs(trend)}%</span>;
}

// ─── Per-widget config modal ───────────────────────────────────────────────────
function WidgetConfigModal({
  widget, config, onSave, onClose,
}: {
  widget: DashboardWidget;
  config: WidgetConfig;
  onSave: (c: WidgetConfig) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<WidgetConfig>({ ...config });
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Configure widget</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="form-label text-xs">Widget title</label>
            <input className="form-input text-sm" value={form.title ?? widget.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          {(widget.type === 'list') && (
            <div>
              <label className="form-label text-xs">Max rows to show</label>
              <input className="form-input text-sm" type="number" min={1} max={20}
                value={form.rowLimit ?? 8}
                onChange={(e) => setForm({ ...form, rowLimit: Number(e.target.value) })} />
            </div>
          )}
          <div>
            <label className="form-label text-xs">Auto-refresh interval (seconds, 0 = off)</label>
            <input className="form-input text-sm" type="number" min={0} max={3600}
              value={form.refreshMs ? form.refreshMs / 1000 : 0}
              onChange={(e) => setForm({ ...form, refreshMs: Number(e.target.value) * 1000 })} />
          </div>
        </div>
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" className="btn-outline px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary !w-auto px-5 text-sm" onClick={() => { onSave(form); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Single widget card with drag handles ─────────────────────────────────────
function WidgetCard({
  widget, config, isDragging, onDragStart, onDragOver, onDrop, onMoveUp, onMoveDown, canUp, canDown,
  onConfigure, onHide,
}: {
  widget: DashboardWidget; config: WidgetConfig;
  isDragging: boolean;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void;
  onMoveUp: () => void; onMoveDown: () => void; canUp: boolean; canDown: boolean;
  onConfigure: () => void; onHide: () => void;
}) {
  const title = config.title ?? widget.title;
  const rowLimit = config.rowLimit ?? 8;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className={`admin-section relative group cursor-grab active:cursor-grabbing transition-all ${isDragging ? 'opacity-40 scale-95' : ''}`}
    >
      {/* Widget toolbar — appears on hover */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button type="button" title="Configure" onClick={onConfigure}
          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xs">⚙</button>
        <button type="button" title="Move up" onClick={onMoveUp} disabled={!canUp}
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-20 text-xs">↑</button>
        <button type="button" title="Move down" onClick={onMoveDown} disabled={!canDown}
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-20 text-xs">↓</button>
        <button type="button" title="Hide widget" onClick={onHide}
          className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 text-xs">✕</button>
      </div>

      {widget.type === 'kpi' && (
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{title}</p>
          <div className="flex items-baseline gap-1">
            <p className="text-4xl font-bold text-slate-800">{widget.value.toLocaleString()}</p>
            <TrendArrow trend={widget.trend} />
          </div>
          {widget.link && <Link to={widget.link} className="text-xs text-accent hover:underline mt-2 inline-block">View all →</Link>}
        </div>
      )}

      {widget.type === 'list' && (
        <div>
          <p className="admin-section-title">{title}</p>
          {widget.rows.length === 0
            ? <p className="text-sm text-slate-400">No records</p>
            : <ul className="divide-y divide-slate-50">
                {widget.rows.slice(0, rowLimit).map((row) => (
                  <li key={row.id} className="flex items-center justify-between py-2">
                    {row.link
                      ? <Link to={row.link} className="text-sm text-accent hover:underline truncate mr-2">{row.label}</Link>
                      : <span className="text-sm text-slate-700 truncate mr-2">{row.label}</span>}
                    <StatusBadge status={row.status} />
                  </li>
                ))}
                {widget.rows.length > rowLimit && (
                  <li className="py-1 text-xs text-slate-400">+{widget.rows.length - rowLimit} more</li>
                )}
              </ul>}
        </div>
      )}

      {widget.type === 'chart' && (
        <div>
          <p className="admin-section-title">{title}</p>
          <MiniBarChart data={widget.data} />
        </div>
      )}

      {widget.type === 'announcement' && (
        <div className={`rounded-xl px-4 py-3 ${
          widget.severity === 'alert'   ? 'bg-red-50 border border-red-200' :
          widget.severity === 'warning' ? 'bg-amber-50 border border-amber-200' :
                                          'bg-blue-50 border border-blue-200'}`}>
          <p className={`font-semibold text-sm mb-1 ${
            widget.severity === 'alert' ? 'text-red-700' :
            widget.severity === 'warning' ? 'text-amber-700' : 'text-blue-700'}`}>{title}</p>
          <p className="text-sm text-slate-600">{widget.body}</p>
        </div>
      )}

      {widget.type === 'shortcut' && (
        <div>
          <p className="admin-section-title">{title}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {widget.shortcuts.map((s) => (
              <Link key={s.href} to={s.href}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-medium text-slate-700 hover:bg-accent/5 hover:border-accent/30 hover:text-accent transition-colors">
                {s.icon && <span>{s.icon}</span>}{s.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {widget.type === 'active_users' && (
        <div>
          <p className="admin-section-title">{title}</p>
          <ul className="space-y-2">
            {widget.users.length === 0
              ? <li className="text-sm text-slate-400">No users online</li>
              : widget.users.slice(0, rowLimit).map((u) => (
                <li key={u.userId} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    u.status === 'ONLINE' ? 'bg-green-500' :
                    u.status === 'AWAY'   ? 'bg-amber-400' :
                    u.status === 'DND'    ? 'bg-red-400' : 'bg-slate-300'}`} />
                  <span className="text-sm text-slate-700 truncate">{u.displayName ?? u.userId}</span>
                  <StatusBadge status={u.status} />
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── KPI strip (horizontal row) ───────────────────────────────────────────────
function KpiStrip({ widgets, onMoveUp, onMoveDown, allCount }: {
  widgets: KpiWidget[];
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  allCount: number;
}) {
  return (
    <div className="admin-section !p-0 overflow-hidden">
      <div className="grid divide-x divide-slate-100" style={{ gridTemplateColumns: `repeat(${widgets.length}, 1fr)` }}>
        {widgets.map((w, i) => (
          <div key={w.id} className="p-5 relative group">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{w.title}</p>
            <div className="flex items-baseline gap-1">
              <p className="text-3xl font-bold text-slate-800">{w.value.toLocaleString()}</p>
              <TrendArrow trend={w.trend} />
            </div>
            {w.link && <Link to={w.link} className="text-xs text-accent hover:underline mt-1 inline-block">View →</Link>}
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button type="button" disabled={i === 0} onClick={() => onMoveUp(w.id)}
                className="p-0.5 text-[10px] text-slate-400 hover:text-slate-600 disabled:opacity-20">↑</button>
              <button type="button" disabled={i === allCount - 1} onClick={() => onMoveDown(w.id)}
                className="p-0.5 text-[10px] text-slate-400 hover:text-slate-600 disabled:opacity-20">↓</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard Page ───────────────────────────────────────────────────────
export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabs, setTabs] = useState<DashTab[]>([{ id: 'default', name: 'Overview', widgetOrder: [] }]);
  const [newTabPromptOpen, setNewTabPromptOpen] = useState(false);
  const [newTabName, setNewTabName] = useState('');
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('default');
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [editingTabName, setEditingTabName] = useState<string | null>(null);
  const [widgetConfigs, setWidgetConfigs] = useState<Record<string, WidgetConfig>>({});
  const [configuringWidget, setConfiguringWidget] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const tabInputRef = useRef<HTMLInputElement>(null);

  // ── Load widget data ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    api<DashboardResponse>('/dashboard')
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Load layout ───────────────────────────────────────────────────────────
  useEffect(() => {
    api<LayoutResponse>('/dashboard/layout')
      .then((res) => {
        const savedTabs = res.layout?.tabs as DashTab[] | undefined;
        const savedConfigs = res.layout?.widgetConfigs as Record<string, WidgetConfig> | undefined;
        if (savedTabs?.length) {
          setTabs(savedTabs); setActiveTab(savedTabs[0]!.id);
        }
        if (savedConfigs) setWidgetConfigs(savedConfigs);
      })
      .catch(() => {})
      .finally(() => setLayoutLoaded(true));
  }, []);

  const saveLayout = useCallback((updatedTabs: DashTab[], configs?: Record<string, WidgetConfig>) => {
    api('/dashboard/layout', {
      method: 'PUT',
      body: JSON.stringify({ layout: { tabs: updatedTabs, widgetConfigs: configs ?? widgetConfigs } }),
    }).catch(console.error);
  }, [widgetConfigs]);

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0]!;

  // Initialise widgetOrder from API on first load
  useEffect(() => {
    if (!layoutLoaded || !data || currentTab.widgetOrder.length > 0) return;
    const allIds = data.widgets.map((w) => w.id);
    const updated = tabs.map((t) => t.id === currentTab.id ? { ...t, widgetOrder: allIds } : t);
    setTabs(updated);
  }, [layoutLoaded, data]);

  const allWidgets = data?.widgets ?? [];
  const hidden = currentTab.hiddenWidgets ?? [];
  // Only use fallback for the default/first tab on first load — new user tabs start empty
  const isDefaultTab = currentTab.id === 'default' || currentTab.id === tabs[0]?.id;
  const widgetOrder = (currentTab.widgetOrder.length > 0
    ? currentTab.widgetOrder
    : isDefaultTab ? allWidgets.map((w) => w.id) : []
  ).filter((id) => !hidden.includes(id));
  const orderedWidgets = widgetOrder.map((id) => allWidgets.find((w) => w.id === id)).filter(Boolean) as DashboardWidget[];

  // ── Move widget ───────────────────────────────────────────────────────────
  function move(index: number, dir: -1 | 1) {
    const allOrder = currentTab.widgetOrder.length > 0 ? [...currentTab.widgetOrder] : allWidgets.map((w) => w.id);
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= allOrder.length) return;
    [allOrder[index], allOrder[swapIdx]] = [allOrder[swapIdx]!, allOrder[index]!];
    const updated = tabs.map((t) => t.id === activeTab ? { ...t, widgetOrder: allOrder } : t);
    setTabs(updated); saveLayout(updated);
  }

  function moveById(id: string, dir: -1 | 1) {
    const idx = widgetOrder.indexOf(id);
    if (idx === -1) return;
    move(idx, dir);
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────
  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDragOverId(null); return; }
    const order = [...widgetOrder];
    const fromIdx = order.indexOf(draggingId);
    const toIdx = order.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, draggingId);
    const updated = tabs.map((t) => t.id === activeTab ? { ...t, widgetOrder: order } : t);
    setTabs(updated); saveLayout(updated);
    setDraggingId(null); setDragOverId(null);
  }

  // ── Hide / restore widgets ────────────────────────────────────────────────
  function hideWidget(id: string) {
    const updated = tabs.map((t) => t.id === activeTab
      ? { ...t, hiddenWidgets: [...(t.hiddenWidgets ?? []), id] }
      : t);
    setTabs(updated); saveLayout(updated);
  }

  function restoreAllWidgets() {
    const updated = tabs.map((t) => t.id === activeTab ? { ...t, hiddenWidgets: [] } : t);
    setTabs(updated); saveLayout(updated);
  }

  // ── Per-widget config ─────────────────────────────────────────────────────
  function saveWidgetConfig(id: string, config: WidgetConfig) {
    const newConfigs = { ...widgetConfigs, [id]: config };
    setWidgetConfigs(newConfigs);
    saveLayout(tabs, newConfigs);
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  function addTab() {
    setNewTabName('');
    setNewTabPromptOpen(true);
  }

  function confirmAddTab() {
    const name = newTabName.trim() || 'New tab';
    const id = `tab_${Date.now()}`;
    const updated = [...tabs, { id, name, widgetOrder: [], hiddenWidgets: [] }];
    setTabs(updated);
    setActiveTab(id);
    saveLayout(updated);
    setNewTabPromptOpen(false);
    setNewTabName('');
  }

  function addWidgetToTab(widgetId: string) {
    if (currentTab.widgetOrder.includes(widgetId)) return;
    const updated = tabs.map((t) =>
      t.id === activeTab
        ? { ...t, widgetOrder: [...t.widgetOrder, widgetId], hiddenWidgets: (t.hiddenWidgets ?? []).filter((h) => h !== widgetId) }
        : t
    );
    setTabs(updated);
    saveLayout(updated);
  }

  function renameTab(tabId: string, name: string) {
    const updated = tabs.map((t) => t.id === tabId ? { ...t, name } : t);
    setTabs(updated); setEditingTabName(null); saveLayout(updated);
  }

  function removeTab(tabId: string) {
    if (tabs.length === 1) return;
    const updated = tabs.filter((t) => t.id !== tabId);
    setTabs(updated);
    if (activeTab === tabId) setActiveTab(updated[0]!.id);
    saveLayout(updated);
  }

  // ── Auto-refresh per widget ───────────────────────────────────────────────
  useEffect(() => {
    const timers: ReturnType<typeof setInterval>[] = [];
    for (const [, cfg] of Object.entries(widgetConfigs)) {
      if (cfg.refreshMs && cfg.refreshMs > 0) {
        const t = setInterval(() => {
          api<DashboardResponse>('/dashboard').then(setData).catch(() => {});
        }, cfg.refreshMs);
        timers.push(t);
      }
    }
    return () => timers.forEach(clearInterval);
  }, [widgetConfigs]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => <div key={i} className="admin-section animate-pulse h-24 bg-white/50" />)}
    </div>
  );

  if (error) return <div className="admin-section"><p className="text-red-600 text-sm">{error}</p></div>;

  const kpis  = orderedWidgets.filter((w) => w.type === 'kpi') as KpiWidget[];
  const rest  = orderedWidgets.filter((w) => w.type !== 'kpi');
  const configuringW = configuringWidget ? allWidgets.find((w) => w.id === configuringWidget) : null;

  return (
    <div className="space-y-5">
      {/* ── Config modal ── */}
      {configuringW && (
        <WidgetConfigModal
          widget={configuringW}
          config={widgetConfigs[configuringW.id] ?? {}}
          onSave={(c) => saveWidgetConfig(configuringW.id, c)}
          onClose={() => setConfiguringWidget(null)}
        />
      )}

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 flex-wrap">
        {tabs.map((tab) => (
          <div key={tab.id} className="relative group/tab">
            {editingTabName === tab.id ? (
              <input ref={tabInputRef} defaultValue={tab.name} autoFocus
                className="px-3 py-1.5 text-sm border border-accent rounded-lg outline-none bg-white"
                onBlur={(e) => renameTab(tab.id, e.target.value || tab.name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameTab(tab.id, (e.target as HTMLInputElement).value || tab.name);
                  if (e.key === 'Escape') setEditingTabName(null);
                }} />
            ) : (
              <button type="button"
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id ? 'bg-white text-accent border border-accent shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
                onClick={() => setActiveTab(tab.id)}
                onDoubleClick={() => setEditingTabName(tab.id)}>
                {tab.name}
              </button>
            )}
            {tabs.length > 1 && (
              <button type="button"
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-300 text-slate-600 text-[9px] flex items-center justify-center opacity-0 group-hover/tab:opacity-100 hover:bg-red-400 hover:text-white transition-all"
                onClick={() => removeTab(tab.id)}>✕</button>
            )}
          </div>
        ))}
        <button type="button" onClick={addTab}
          className="px-3 py-1.5 text-sm text-white/50 hover:text-white/80 rounded-lg hover:bg-white/10 transition-colors">
          + Tab
        </button>

      {/* ── New tab name prompt modal ── */}
      {newTabPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-800">New dashboard tab</h2>
            <div>
              <label className="form-label text-xs">Tab name</label>
              <input
                className="form-input"
                autoFocus
                placeholder="e.g. Safety, Procurement, My Team"
                value={newTabName}
                onChange={(e) => setNewTabName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmAddTab(); if (e.key === 'Escape') setNewTabPromptOpen(false); }}
              />
            </div>
            <div className="flex gap-3">
              <button type="button" className="btn-primary !w-auto px-5" onClick={confirmAddTab}>Create tab</button>
              <button type="button" className="btn-outline text-slate-500" onClick={() => setNewTabPromptOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
        {hidden.length > 0 && (
          <button type="button" onClick={restoreAllWidgets}
            className="px-3 py-1.5 text-xs text-white/40 hover:text-white/70 rounded-lg hover:bg-white/10 transition-colors ml-auto">
            Restore {hidden.length} hidden
          </button>
        )}
        {orderedWidgets.length > 0 && (
          <button type="button" onClick={() => setAddWidgetOpen(true)}
            className="px-3 py-1.5 text-xs text-white/40 hover:text-white/80 rounded-lg hover:bg-white/10 transition-colors ml-auto">
            + Add widget
          </button>
        )}
      </div>

      {/* ── Empty tab state ── */}
      {orderedWidgets.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/20 py-16 space-y-4">
          <p className="text-white/50 text-sm">This tab has no widgets yet.</p>
          <button
            type="button"
            className="btn-primary !w-auto px-6"
            onClick={() => setAddWidgetOpen(true)}
          >
            + Add widget
          </button>
        </div>
      )}

      {/* ── Add widget picker modal ── */}
      {addWidgetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">Add widget to "{currentTab.name}"</h2>
              <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setAddWidgetOpen(false)}>✕</button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {allWidgets.map((w) => {
                const alreadyAdded = currentTab.widgetOrder.includes(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => { addWidgetToTab(w.id); setAddWidgetOpen(false); }}
                    className={`w-full text-left flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                      alreadyAdded
                        ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                        : 'border-slate-200 hover:border-accent hover:bg-accent/5 text-slate-700'
                    }`}
                  >
                    <span className="text-sm font-medium">{w.title}</span>
                    <span className="text-xs text-slate-400">{alreadyAdded ? 'Already added' : 'Add →'}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="btn-outline w-full text-slate-500" onClick={() => setAddWidgetOpen(false)}>Done</button>
          </div>
        </div>
      )}

      {/* ── KPI strip ── */}
      {kpis.length > 0 && (
        <KpiStrip widgets={kpis}
          onMoveUp={(id) => moveById(id, -1)}
          onMoveDown={(id) => moveById(id, 1)}
          allCount={orderedWidgets.length} />
      )}

      {/* ── Widget grid with drag-drop ── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
        onDragOver={(e) => e.preventDefault()}
      >
        {rest.map((w) => {
          const globalIdx = orderedWidgets.findIndex((x) => x.id === w.id);
          return (
            <div key={w.id}
              className={`transition-all ${dragOverId === w.id && draggingId !== w.id ? 'ring-2 ring-accent/40 rounded-2xl' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverId(w.id); }}
              onDrop={(e) => { e.preventDefault(); handleDrop(w.id); }}>
              <WidgetCard
                widget={w}
                config={widgetConfigs[w.id] ?? {}}
                isDragging={draggingId === w.id}
                onDragStart={() => setDraggingId(w.id)}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(w.id); }}
                onDrop={() => handleDrop(w.id)}
                onMoveUp={() => move(globalIdx, -1)}
                onMoveDown={() => move(globalIdx, 1)}
                canUp={globalIdx > 0}
                canDown={globalIdx < orderedWidgets.length - 1}
                onConfigure={() => setConfiguringWidget(w.id)}
                onHide={() => hideWidget(w.id)}
              />
            </div>
          );
        })}
      </div>

      {orderedWidgets.length === 0 && !loading && (
        <div className="admin-section text-center py-16">
          <p className="text-slate-400 text-sm mb-3">No widgets on this tab.</p>
          {hidden.length > 0 && (
            <button type="button" onClick={restoreAllWidgets} className="btn-outline text-sm">
              Restore hidden widgets
            </button>
          )}
        </div>
      )}
    </div>
  );
}
