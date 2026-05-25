import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import type { BiConnectionRow } from './report-types.js';

const ADAPTERS = ['POWERBI', 'QLIK', 'TABLEAU', 'COGNOS', 'BIRT'] as const;

export function BIConnectionsPage() {
  const [connections, setConnections] = useState<BiConnectionRow[]>([]);
  const [biInfo, setBiInfo] = useState<Record<string, unknown> | null>(null);
  const [adapterType, setAdapterType] = useState<string>('POWERBI');
  const [name, setName] = useState('');
  const [configJson, setConfigJson] = useState('{}');
  const [testing, setTesting] = useState<string | null>(null);

  const load = async () => {
    const [c, info] = await Promise.all([
      api<BiConnectionRow[]>('/admin/reporting/bi-connections'),
      api<Record<string, unknown>>('/admin/reporting/bi-connection-info'),
    ]);
    setConnections(c);
    setBiInfo(info);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const config = JSON.parse(configJson) as Record<string, unknown>;
    await api('/admin/reporting/bi-connections', {
      method: 'POST',
      body: JSON.stringify({ adapterType, name: name || adapterType, config }),
    });
    setName('');
    await load();
  };

  const test = async (id: string) => {
    setTesting(id);
    try {
      await api(`/admin/reporting/bi-connections/${id}/test`, { method: 'POST' });
      await load();
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">BI connections</h1>
      {biInfo && (
        <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded overflow-auto max-h-40">
          {JSON.stringify(biInfo, null, 2)}
        </pre>
      )}
      <section className="border rounded-lg bg-white p-4 max-w-lg space-y-3">
        <h2 className="font-medium text-sm">Add adapter</h2>
        <select
          className="w-full border rounded px-2 py-1"
          value={adapterType}
          onChange={(e) => setAdapterType(e.target.value)}
        >
          {ADAPTERS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          className="w-full border rounded px-2 py-1"
          placeholder="Connection name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="w-full border rounded px-2 py-1 font-mono text-xs h-24"
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
        />
        <button
          type="button"
          className="rounded bg-slate-900 text-white px-4 py-2 text-sm"
          onClick={save}
        >
          Save connection
        </button>
      </section>
      <table className="w-full text-sm border bg-white rounded-lg">
        <thead className="bg-slate-100 text-left">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Adapter</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {connections.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="px-3 py-2">{c.name}</td>
              <td className="px-3 py-2">{c.adapterType}</td>
              <td className="px-3 py-2">
                <span
                  className={
                    c.lastTestStatus === 'OK'
                      ? 'text-green-700'
                      : c.lastTestStatus === 'FAILED'
                        ? 'text-red-700'
                        : 'text-slate-500'
                  }
                >
                  {c.lastTestStatus ?? 'Not tested'}
                </span>
              </td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="text-blue-600 text-sm disabled:opacity-50"
                  disabled={testing === c.id}
                  onClick={() => test(c.id)}
                >
                  Test
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
