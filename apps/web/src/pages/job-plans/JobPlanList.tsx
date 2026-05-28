import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface JP { id: string; jpNum: string; description: string; estimatedDurationHours: string | null; updatedAt: string }

export function JobPlanListPage() {
  const [jps, setJps] = useState<JP[]>([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api<JP[]>('/job-plans').then(setJps).catch((e) => setError(String(e)));
  }, []);

  return (
    <IdentityPageLayout title="Job Plans" subtitle="Standardised task sequences, labour, and materials">
      {error && <MessageBanner type="error" text={error} />}
      <div className="admin-section">
        <div className="flex justify-end mb-4">
          <button type="button" className="btn-primary !w-auto px-4" onClick={() => navigate('/job-plans/new')}>+ New job plan</button>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4">JP #</th>
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4">Est. hours</th>
              <th className="py-2 pr-4">Updated</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {jps.length === 0 ? (
              <tr><td colSpan={5} className="py-6 text-center text-slate-400">No job plans.</td></tr>
            ) : (
              jps.map((jp) => (
                <tr key={jp.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pr-4 font-mono text-xs"><Link to={`/job-plans/${jp.id}`} className="text-blue-600">{jp.jpNum}</Link></td>
                  <td className="py-2 pr-4">{jp.description}</td>
                  <td className="py-2 pr-4 text-slate-500">{jp.estimatedDurationHours ?? '—'}</td>
                  <td className="py-2 pr-4 text-slate-400">{new Date(jp.updatedAt).toLocaleDateString()}</td>
                  <td className="py-2"><Link to={`/job-plans/${jp.id}`} className="btn-link text-xs">View</Link></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </IdentityPageLayout>
  );
}
