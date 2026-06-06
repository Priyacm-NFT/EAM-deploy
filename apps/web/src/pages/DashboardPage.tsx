import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';

type DashboardWidget =
  | { id: string; type: 'kpi'; title: string; value: number }
  | {
      id: string;
      type: 'list';
      title: string;
      rows: { id: string; label: string; status: string }[];
    };

type DashboardResponse = {
  widgets: DashboardWidget[];
  tenantId: string;
};

type LayoutResponse = {
  layout: Record<string, unknown>;
  source: 'user' | 'role_default' | 'empty';
};

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [widgetOrder, setWidgetOrder] = useState<string[]>([]);
  const [layoutLoaded, setLayoutLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<DashboardResponse>('/dashboard');
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<LayoutResponse>('/dashboard/layout');
        if (!cancelled) {
          const savedOrder = res.layout?.widgetOrder as string[] | undefined;
          if (savedOrder && savedOrder.length > 0) setWidgetOrder(savedOrder);
          setLayoutLoaded(true);
        }
      } catch {
        if (!cancelled) setLayoutLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveLayout = useCallback((order: string[]) => {
    if (order.length === 0) return;
    api('/dashboard/layout', {
      method: 'PUT',
      body: JSON.stringify({ layout: { widgetOrder: order } }),
    }).catch(console.error);
  }, []);

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...widgetOrder];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setWidgetOrder(next); saveLayout(next);
  }

  function moveDown(index: number) {
    if (index === widgetOrder.length - 1) return;
    const next = [...widgetOrder];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setWidgetOrder(next); saveLayout(next);
  }

  if (loading) return (
    <div className="content-card max-w-5xl mx-auto">
      <h1 className="page-title !text-primary">Dashboard</h1>
      <p className="text-slate-500">Loading…</p>
    </div>
  );

  if (error) return (
    <div className="content-card max-w-5xl mx-auto">
      <h1 className="page-title !text-primary">Dashboard</h1>
      <p className="text-red-600">{error}</p>
    </div>
  );

  const allWidgets = data?.widgets ?? [];
  const orderedWidgets =
    widgetOrder.length > 0 && layoutLoaded
      ? widgetOrder.map((id) => allWidgets.find((w) => w.id === id)).filter(Boolean) as DashboardWidget[]
      : allWidgets;

  if (layoutLoaded && widgetOrder.length === 0 && allWidgets.length > 0) {
    setWidgetOrder(allWidgets.map((w) => w.id));
  }

  const kpis = orderedWidgets.filter((w) => w.type === 'kpi') as Extract<DashboardWidget, { type: 'kpi' }>[];
  const lists = orderedWidgets.filter((w) => w.type === 'list') as Extract<DashboardWidget, { type: 'list' }>[];

  return (
    <div className="content-card max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold text-primary mb-6">Dashboard</h1>

      {/* KPI row — all side by side with dividers */}
      {kpis.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid #e2e8f0',
          marginBottom: '24px',
          paddingBottom: '20px',
        }}>
          {kpis.map((w, i) => (
            <div key={w.id} style={{
              flex: 1,
              padding: '0 24px',
              borderLeft: i > 0 ? '1px solid #e2e8f0' : 'none',
            }}>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>{w.title}</p>
              <p style={{ fontSize: '36px', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>{w.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* List widgets — no cards, just clean sections */}
      {lists.map((w, index) => {
        const globalIndex = orderedWidgets.findIndex((x) => x.id === w.id);
        return (
          <div key={w.id} style={{ marginBottom: '24px' }} className="relative group" data-testid={`widget-${w.id}`}>
            {/* Move buttons */}
            <div className="absolute top-0 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <button onClick={() => moveUp(globalIndex)} disabled={globalIndex === 0}
                className="px-2 py-0.5 text-xs bg-white border border-slate-200 rounded shadow-sm disabled:opacity-30 hover:bg-slate-50" title="Move up">↑</button>
              <button onClick={() => moveDown(globalIndex)} disabled={globalIndex === orderedWidgets.length - 1}
                className="px-2 py-0.5 text-xs bg-white border border-slate-200 rounded shadow-sm disabled:opacity-30 hover:bg-slate-50" title="Move down">↓</button>
            </div>

            <p style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '10px',
              paddingBottom: '8px',
              borderBottom: '1px solid #f1f5f9',
            }}>{w.title}</p>

            {w.rows.length === 0 ? (
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>No records</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {w.rows.map((row, i) => (
                  <li key={row.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: i < w.rows.length - 1 ? '1px solid #f8fafc' : 'none',
                    fontSize: '14px',
                  }}>
                    <span style={{ color: '#1e293b' }}>{row.label}</span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      background: '#f1f5f9',
                      color: '#64748b',
                    }}>{row.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
