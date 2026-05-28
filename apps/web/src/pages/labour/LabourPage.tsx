import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface LabourRecord {
  id: string; userId: string; craftCode: string | null; craftDescription: string | null;
  regularRate: string | null; isActive: boolean; userName: string | null; userEmail: string | null;
}
interface Crew { id: string; crewNum: string; name: string; isActive: boolean; members?: Array<{ userName: string | null; role: string }> }

type View = 'records' | 'crews';

export function LabourPage() {
  const [view, setView] = useState<View>('records');
  const [records, setRecords] = useState<LabourRecord[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<LabourRecord[]>('/labour-records').then(setRecords).catch((e) => setError(String(e)));
    api<Crew[]>('/crews').then(setCrews).catch((e) => setError(String(e)));
  }, []);

  return (
    <IdentityPageLayout title="Labour & Crews" subtitle="Technicians, crafts, and crew management">
      {error && <MessageBanner type="error" text={error} />}

      <div className="flex gap-4 mb-4">
        <button type="button" className={`px-4 py-2 text-sm rounded ${view === 'records' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`} onClick={() => setView('records')}>
          Labour records ({records.length})
        </button>
        <button type="button" className={`px-4 py-2 text-sm rounded ${view === 'crews' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`} onClick={() => setView('crews')}>
          Crews ({crews.length})
        </button>
      </div>

      {view === 'records' && (
        <div className="admin-section">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Craft</th>
                <th className="py-2 pr-4">Rate / hr</th>
                <th className="py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">No labour records.</td></tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{r.userName ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{r.userEmail ?? '—'}</td>
                    <td className="py-2 pr-4">{r.craftDescription ?? r.craftCode ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{r.regularRate ? `$${parseFloat(r.regularRate).toFixed(2)}` : '—'}</td>
                    <td className="py-2">{r.isActive ? '✓' : '✗'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === 'crews' && (
        <div className="admin-section">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Crew #</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {crews.length === 0 ? (
                <tr><td colSpan={3} className="py-6 text-center text-slate-400">No crews.</td></tr>
              ) : (
                crews.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs text-blue-600">{c.crewNum}</td>
                    <td className="py-2 pr-4">{c.name}</td>
                    <td className="py-2">{c.isActive ? '✓' : '✗'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </IdentityPageLayout>
  );
}
