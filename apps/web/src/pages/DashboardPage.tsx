import { useEffect, useState } from 'react';
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

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="content-card max-w-5xl mx-auto">
        <h1 className="page-title !text-primary">Dashboard</h1>
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content-card max-w-5xl mx-auto">
        <h1 className="page-title !text-primary">Dashboard</h1>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const kpis = data?.widgets.filter((w) => w.type === 'kpi') ?? [];
  const lists = data?.widgets.filter((w) => w.type === 'list') ?? [];

  return (
    <div className="content-card max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold text-primary mb-4">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kpis.map((w) =>
          w.type === 'kpi' ? (
            <div
              key={w.id}
              className="rounded-lg border border-accent/20 bg-gradient-to-br from-white to-orange-50/40 p-4"
              data-testid={`widget-${w.id}`}
            >
              <p className="text-sm text-slate-500">{w.title}</p>
              <p className="text-3xl font-bold text-primary">{w.value}</p>
            </div>
          ) : null,
        )}
      </div>
      {lists.map((w) =>
        w.type === 'list' ? (
          <div key={w.id} className="mt-6 rounded-lg border border-slate-200 bg-white p-4" data-testid={`widget-${w.id}`}>
            <p className="text-sm font-medium text-primary mb-2">{w.title}</p>
            {w.rows.length === 0 ? (
              <p className="text-sm text-slate-500">No records</p>
            ) : (
              <ul className="divide-y text-sm">
                {w.rows.map((row) => (
                  <li key={row.id} className="py-2 flex justify-between gap-2">
                    <span>{row.label}</span>
                    <span className="text-slate-500">{row.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null,
      )}
    </div>
  );
}
