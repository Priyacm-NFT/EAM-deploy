import React, { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface Attachment {
  id: string;
  fileName: string;
  documentType: string;
  entityType: string;
  entityId: string;
  fileSizeBytes: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
  scanStatus: 'clean' | 'infected' | 'pending' | 'skipped';
  versionCount: number;
  referenceCount: number;
  tags: string[];
  downloadUrl: string | null;
}

const SCAN_STYLE: Record<string, string> = {
  clean: 'bg-green-100 text-green-800',
  infected: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
  skipped: 'bg-slate-100 text-slate-600',
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentLibraryPage() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [scanFilter, setScanFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [quarantining, setQuarantining] = useState<string | null>(null);
  const [versionsAttId, setVersionsAttId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Array<{
    id: string; versionNum: number; filename: string;
    sizeBytes: number; uploadedBy: string; uploadedAt: string;
    scanStatus: string; mimeType: string;
  }>>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  function load() {
    api<{ data: Attachment[]; total: number }>('/admin/attachments/library')
      .then((res) => setAttachments(res.data ?? []))
      .catch(() => setAttachments([]));
  }

  useEffect(() => { load(); }, []);

  const entityTypes = [...new Set(attachments.map((a) => a.entityType))].sort();
  const docTypes = [...new Set(attachments.map((a) => a.documentType))].sort();

  const filtered = attachments.filter((a) => {
    const matchSearch = !search || a.fileName.toLowerCase().includes(search.toLowerCase()) || a.uploadedBy.toLowerCase().includes(search.toLowerCase()) || a.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchEntity = !entityFilter || a.entityType === entityFilter;
    const matchScan = !scanFilter || a.scanStatus === scanFilter;
    const matchType = !typeFilter || a.documentType === typeFilter;
    return matchSearch && matchEntity && matchScan && matchType;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  async function quarantine(a: Attachment) {
    if (!window.confirm(`Quarantine "${a.fileName}"? It will be hidden from all records.`)) return;
    setQuarantining(a.id);
    try {
      await api(`/admin/attachments/${a.id}/quarantine`, { method: 'POST' });
      setMsg(`"${a.fileName}" quarantined.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quarantine failed');
    } finally {
      setQuarantining(null);
    }
  }

  async function openVersions(a: Attachment) {
    if (versionsAttId === a.id) { setVersionsAttId(null); return; }
    setVersionsAttId(a.id); setLoadingVersions(true);
    try {
      const rows = await api<typeof versions>(`/admin/attachments/${a.id}/versions`);
      setVersions(rows);
    } catch { setVersions([]); } finally { setLoadingVersions(false); }
  }

  async function deleteAttachment(a: Attachment) {
    if (!window.confirm(`Permanently delete "${a.fileName}"?\n\nThis file is referenced by ${a.referenceCount} record(s). Deletion requires all references to be removed first.`)) return;
    try {
      await api(`/admin/attachments/${a.id}`, { method: 'DELETE' });
      setMsg(`"${a.fileName}" deleted.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  const totalSize = attachments.reduce((sum, a) => sum + a.fileSizeBytes, 0);
  const infectedCount = attachments.filter((a) => a.scanStatus === 'infected').length;

  return (
    <IdentityPageLayout
      title="Attachment library"
      subtitle="Central library of all files across the tenant — search, quarantine, and manage retention from one place"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {infectedCount > 0 && (
        <div className="content-card border border-red-200 bg-red-50 text-red-800 text-sm flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-semibold">{infectedCount} infected file{infectedCount !== 1 ? 's' : ''} detected</p>
            <p className="text-xs">Filter by scan status "infected" to review and quarantine.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total files', value: attachments.length.toLocaleString(), color: 'text-slate-700 bg-white border-slate-200' },
          { label: 'Total storage', value: formatBytes(totalSize), color: 'text-accent-dark bg-accent/10 border-accent/20' },
          { label: 'Infected / flagged', value: infectedCount, color: infectedCount > 0 ? 'text-red-700 bg-red-50 border-red-200' : 'text-slate-600 bg-slate-50 border-slate-200' },
        ].map((s) => (
          <div key={s.label} className={`content-card border ${s.color} text-center`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm font-medium mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="admin-section">
        <h2 className="admin-section-title">Files</h2>

        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            placeholder="Search by filename, uploader, or tag…"
            className="form-input flex-1 min-w-[200px]"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
          <select className="form-select w-44" value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setPage(0); }}>
            <option value="">All entity types</option>
            {entityTypes.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
          <select className="form-select w-44" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}>
            <option value="">All doc types</option>
            {docTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="form-select w-40" value={scanFilter} onChange={(e) => { setScanFilter(e.target.value); setPage(0); }}>
            <option value="">All scan statuses</option>
            <option value="clean">Clean</option>
            <option value="infected">Infected</option>
            <option value="pending">Pending</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Entity</th>
                <th>Size</th>
                <th>Scan</th>
                <th>Refs</th>
                <th>Versions</th>
                <th>Uploaded by</th>
                <th>Uploaded at</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr><td colSpan={10} className="text-center text-slate-400 py-10">No attachments found.</td></tr>
              )}
              {paginated.map((a) => (
                <React.Fragment key={a.id}>
                <tr>
                  <td>
                    <p className="font-medium text-primary text-sm">{a.fileName}</p>
                    {a.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {a.tags.slice(0, 3).map((t) => <span key={t} className="text-xs bg-slate-100 text-slate-500 px-1 rounded">{t}</span>)}
                      </div>
                    )}
                  </td>
                  <td className="text-xs text-slate-500">{a.documentType}</td>
                  <td>
                    <span className="text-xs bg-accent/10 text-accent-dark px-1.5 py-0.5 rounded">{a.entityType}</span>
                    <span className="block text-xs text-slate-400 font-mono">{a.entityId.slice(0, 8)}…</span>
                  </td>
                  <td className="text-sm">{formatBytes(a.fileSizeBytes)}</td>
                  <td>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SCAN_STYLE[a.scanStatus]}`}>
                      {a.scanStatus}
                    </span>
                  </td>
                  <td className="text-sm text-center">{a.referenceCount}</td>
                  <td className="text-sm text-center">{a.versionCount}</td>
                  <td className="text-xs text-slate-500">{a.uploadedBy}</td>
                  <td className="text-xs text-slate-500">{new Date(a.uploadedAt).toLocaleDateString()}</td>
                  <td>
                    <div className="flex flex-col gap-1">
                      {a.downloadUrl && (
                        <a href={a.downloadUrl} className="btn-link text-xs" target="_blank" rel="noreferrer">Download</a>
                      )}
                      <button type="button" className="btn-link text-xs" onClick={() => openVersions(a)}>
                        {versionsAttId === a.id ? 'Hide versions' : 'Versions'}
                      </button>
                      <button type="button" className="btn-link text-xs text-yellow-700" disabled={quarantining === a.id} onClick={() => quarantine(a)}>
                        {quarantining === a.id ? '…' : 'Quarantine'}
                      </button>
                      <button type="button" className="btn-danger text-xs" onClick={() => deleteAttachment(a)}>Delete</button>
                    </div>
                  </td>
                </tr>
                {versionsAttId === a.id && (
                  <tr key={`${a.id}-versions`}>
                    <td colSpan={10} className="bg-slate-50 p-0">
                      <div className="p-4">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                          Version history — {a.fileName}
                        </p>
                        {loadingVersions
                          ? <p className="text-xs text-slate-400">Loading…</p>
                          : versions.length === 0
                            ? <p className="text-xs text-slate-400 italic">Only one version exists.</p>
                            : (
                              <table className="admin-table text-xs">
                                <thead>
                                  <tr>
                                    <th>Version</th><th>Filename</th><th>Size</th>
                                    <th>Scan</th><th>Uploaded by</th><th>Uploaded at</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {versions.map((v) => (
                                    <tr key={v.id}>
                                      <td><span className="font-mono bg-accent/10 text-accent-dark px-1.5 py-0.5 rounded text-[10px]">v{v.versionNum}</span></td>
                                      <td className="font-medium text-slate-700">{v.filename}</td>
                                      <td>{formatBytes(v.sizeBytes)}</td>
                                      <td><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${SCAN_STYLE[v.scanStatus] ?? ''}`}>{v.scanStatus}</span></td>
                                      <td className="text-slate-500">{v.uploadedBy}</td>
                                      <td className="text-slate-500">{new Date(v.uploadedAt).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-3 justify-end text-sm">
            <button type="button" className="btn-outline py-1 px-3 text-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <span className="text-slate-600">Page {page + 1} of {totalPages} ({filtered.length} files)</span>
            <button type="button" className="btn-outline py-1 px-3 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </IdentityPageLayout>
  );
}

