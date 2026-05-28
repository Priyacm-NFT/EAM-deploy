import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface ForecastItem {
  id: string; pmId: string; forecastDate: string; status: string;
  woId: string | null; pmNum: string; pmDescription: string;
  assetNum: string | null; siteName: string | null;
}

export function PMForecastPage() {
  const [items, setItems] = useState<ForecastItem[]>([]);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));

  useEffect(() => {
    const params = new URLSearchParams({ from, to });
    api<ForecastItem[]>(`/pm-forecasts?${params}`).then(setItems).catch((e) => setError(String(e)));
  }, [from, to]);

  // Group by week
  const byWeek: Record<string, ForecastItem[]> = {};
  for (const item of items) {
    const d = new Date(item.forecastDate);
    const monday = new Date(d);
    monday.setDate(d.getDate() - d.getDay() + 1);
    const key = monday.toISOString().slice(0, 10);
    if (!byWeek[key]) byWeek[key] = [];
    byWeek[key]!.push(item);
  }

  return (
    <IdentityPageLayout title="PM Forecast Calendar" backTo="/pm" backLabel="Back to PM masters">
      {error && <MessageBanner type="error" text={error} />}

      <div className="admin-section">
        <div className="flex gap-4 mb-4 items-end">
          <label className="block">
            <span className="form-label">From</span>
            <input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="form-label">To</span>
            <input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        {Object.keys(byWeek).sort().map((week) => (
          <div key={week} className="mb-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Week of {new Date(week).toLocaleDateString()}</h3>
            <div className="space-y-1">
              {byWeek[week]!.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-2 bg-white border border-slate-200 rounded text-sm">
                  <span className="text-slate-400 w-24 shrink-0">{new Date(item.forecastDate).toLocaleDateString()}</span>
                  <span className="font-mono text-xs text-blue-600 w-24 shrink-0">{item.pmNum}</span>
                  <span className="flex-1">{item.pmDescription}</span>
                  <span className="text-slate-400 text-xs">{item.assetNum ?? ''}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${item.status === 'GENERATED' ? 'bg-green-100 text-green-700' : item.status === 'SKIPPED' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <p className="text-slate-400 text-sm">No PM forecasts in this range.</p>
        )}
      </div>
    </IdentityPageLayout>
  );
}
