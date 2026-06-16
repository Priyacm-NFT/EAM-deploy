import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface FailureCode {
  id: string;
  type: 'PROBLEM' | 'CAUSE' | 'REMEDY';
  code: string;
  description: string;
  parentId: string | null;
  isActive: boolean;
}

const TYPES: FailureCode['type'][] = ['PROBLEM', 'CAUSE', 'REMEDY'];

const TYPE_LABELS: Record<FailureCode['type'], string> = {
  PROBLEM: 'Problem codes',
  CAUSE: 'Cause codes',
  REMEDY: 'Remedy codes',
};

const EMPTY_FORM = { type: 'PROBLEM' as FailureCode['type'], code: '', description: '' };

export function FailureCodesPage() {
  const [codes, setCodes] = useState<FailureCode[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function load() {
    api<FailureCode[]>('/failure-codes').then(setCodes).catch((e) => setError(String(e)));
  }

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api('/failure-codes', { method: 'POST', body: JSON.stringify(form) });
      setSuccess('Failure code created.');
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <IdentityPageLayout title="Failure Codes" subtitle="Problem / Cause / Remedy taxonomy used when logging work against assets">
      {error && <MessageBanner type="error" text={error} />}
      {success && <MessageBanner type="success" text={success} />}

      <div className="admin-section">
        <div className="flex justify-between items-center mb-3">
          <h2 className="admin-section-title">Failure code library</h2>
          <button type="button" className="btn-primary !w-auto px-4" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : '+ Add failure code'}
          </button>
        </div>

        {showForm && (
          <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="form-label">Type</span>
              <select className="form-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FailureCode['type'] })}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="form-label">Code</span>
              <input className="form-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="P01" />
            </label>
            <div className="col-span-2">
              <label className="block">
                <span className="form-label">Description</span>
                <input className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Pump leak" />
              </label>
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="button" className="btn-primary !w-auto px-4" onClick={save} disabled={saving || !form.code || !form.description}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn-link" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>Cancel</button>
            </div>
          </div>
        )}

        {TYPES.map((type) => {
          const items = codes.filter((c) => c.type === type);
          return (
            <div key={type} className="mb-4">
              <h3 className="text-sm font-semibold text-slate-600 mb-2">{TYPE_LABELS[type]} ({items.length})</h3>
              <div className="border border-slate-200 rounded bg-white">
                {items.length === 0 ? (
                  <p className="text-slate-400 text-sm p-3">No {TYPE_LABELS[type].toLowerCase()} yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {items.map((c) => (
                        <tr key={c.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 px-3 font-mono text-xs text-slate-500 w-24">{c.code}</td>
                          <td className="py-2 px-3 text-slate-700">{c.description}</td>
                          <td className="py-2 px-3 w-20">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${c.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                              {c.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </IdentityPageLayout>
  );
}