import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface RetentionCandidate {
  id: string;
  fileName: string;
  documentType: string;
  entityType: string;
  entityId: string;
  uploadedBy: string;
  uploadedAt: string;
  retentionDays: number;
  expiredAt: string;
  daysOverdue: number;
  fileSizeBytes: number;
  referenceCount: number;
  markedForDeletion: boolean;
}

interface RetentionSummary {
  totalExpired: number;
  totalMarked: number;
  storageBytesRecoverable: number;
}

interface DocumentTypeOption {
  id: string;
  name: string;
  label: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RetentionPoliciesPage() {
  const [candidates, setCandidates] = useState<RetentionCandidate[]>([]);
  const [summary, setSummary] = useState<RetentionSummary | null>(null);
  const [docTypeOptions, setDocTypeOptions] = useState<DocumentTypeOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [confirming, setConfirming] = useState(false);

  function load() {
    api<RetentionCandidate[]>('/admin/attachments/retention/candidates').then(setCandidates).catch(() => setCandidates([]));
    api<RetentionSummary>('/admin/attachments/retention/summary').then(setSummary).catch(() => setSummary(null));
    // Load all document types from API — not derived from candidates
    // This ensures dropdown is always populated even when no expired files exist
    api<DocumentTypeOption[]>('/admin/attachments/document-types').then(setDocTypeOptions).catch(() => setDocTypeOptions([]));
  }

  useEffect(() => { load(); }, []);

  const filtered = typeFilter ? candidates.filter((c) => c.documentType === typeFilter) : candidates;

  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function selectAll() {
    setSelected(new Set(filtered.map((c) => c.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function markForDeletion() {
    if (selected.size === 0) return;
    if (!window.confirm(`Mark ${selected.size} file(s) for deletion? An admin can confirm deletion in the next step.`)) return;
    setMsg('');
    setError('');
    try {
      await api('/admin/attachments/retention/mark', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selected] }),
      });
      setMsg(`${selected.size} file(s) marked for deletion.`);
      setSelected(new Set());
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mark failed');
    }
  }

  async function confirmDeletion() {
    const marked = candidates.filter((c) => c.markedForDeletion);
    if (marked.length === 0) return;
    if (!window.confirm(`Permanently delete ${marked.length} file(s) marked for deletion? This cannot be undone.`)) return;
    setConfirming(true);
    setMsg('');
    setError('');
    try {
      await api('/admin/attachments/retention/confirm-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: marked.map((c) => c.id) }),
      });
      setMsg(`${marked.length} file(s) permanently deleted.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deletion failed');
    } finally {
      setConfirming(false);
    }
  }

  async function overrideRetention(id: string) {
    const days = window.prompt('Enter new retention period in days (or 0 for indefinite):');
    if (days === null) return;
    try {
      await api(`/admin/attachments/retention/override/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ retentionDays: Number(days) || null }),
      });
      setMsg('Retention period updated.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Override failed');
    }
  }

  const markedCount = candidates.filter((c) => c.markedForDeletion).length;

  return (
    <IdentityPageLayout
      title="Retention policies"
      subtitle="Review files that have exceeded their retention period and manage two-step deletion with full audit log"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {summary && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Expired files', value: summary.totalExpired, color: 'text-orange-700 bg-orange-50 border-orange-200' },
            { label: 'Marked for deletion', value: summary.totalMarked, color: 'text-red-700 bg-red-50 border-red-200' },
            { label: 'Recoverable storage', value: formatBytes(summary.storageBytesRecoverable), color: 'text-green-700 bg-green-50 border-green-200' },
          ].map((s) => (
            <div key={s.label} className={`content-card border ${s.color} text-center`}>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-sm font-medium mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="admin-section">
        <div className="flex justify-between items-center">
          <h2 className="admin-section-title mb-0">Expired files requiring review</h2>
          <div className="flex gap-2">
            {markedCount > 0 && (
              <button type="button" className="btn-danger" disabled={confirming} onClick={confirmDeletion}>
                {confirming ? 'Deleting…' : `Confirm delete (${markedCount})`}
              </button>
            )}
            {selected.size > 0 && (
              <button type="button" className="btn-outline text-sm" onClick={markForDeletion}>
                Mark for deletion ({selected.size})
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {/* Dropdown loaded from /admin/attachments/document-types — always populated */}
          <select
            className="form-select w-56"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All document types</option>
            {docTypeOptions.map((dt) => (
              <option key={dt.id} value={dt.label || dt.name}>
                {dt.label || dt.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-link text-sm" onClick={selectAll}>Select all visible</button>
          <button type="button" className="btn-link text-sm text-slate-500" onClick={clearSelection}>Clear selection</button>
          <button type="button" className="btn-link text-sm" onClick={load}>Refresh</button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={() => selected.size === filtered.length ? clearSelection() : selectAll()}
                    className="rounded border-slate-300 text-accent"
                  />
                </th>
                <th>File</th>
                <th>Document type</th>
                <th>Entity</th>
                <th>Expired at</th>
                <th>Days overdue</th>
                <th>Size</th>
                <th>Refs</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-slate-400 py-10">
                    No files have exceeded their retention period.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} className={c.markedForDeletion ? 'bg-red-50/50' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      disabled={c.markedForDeletion}
                      className="rounded border-slate-300 text-accent"
                    />
                  </td>
                  <td>
                    <p className="font-medium text-sm text-primary">{c.fileName}</p>
                    <p className="text-xs text-slate-400">{c.uploadedBy}</p>
                  </td>
                  <td className="text-sm">{c.documentType}</td>
                  <td>
                    <span className="text-xs bg-accent/10 text-accent-dark px-1.5 py-0.5 rounded">{c.entityType}</span>
                  </td>
                  <td className="text-xs text-slate-500">{new Date(c.expiredAt).toLocaleDateString()}</td>
                  <td>
                    <span className={`text-xs font-bold ${c.daysOverdue > 30 ? 'text-red-700' : 'text-orange-600'}`}>
                      +{c.daysOverdue}d
                    </span>
                  </td>
                  <td className="text-sm">{formatBytes(c.fileSizeBytes)}</td>
                  <td className="text-sm text-center">{c.referenceCount}</td>
                  <td>
                    {c.markedForDeletion ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800">Marked</span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">Expired</span>
                    )}
                  </td>
                  <td>
                    <button type="button" className="btn-link text-xs" onClick={() => overrideRetention(c.id)}>
                      Override
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </IdentityPageLayout>
  );
}
