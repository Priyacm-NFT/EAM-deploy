import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

interface DocumentType {
  id: string;
  name: string;
  label: string;
  allowedExtensions: string[];
  maxSizeBytes: number;
  virusScanEnabled: boolean;
  virusScanAction: string;
}

interface Attachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED' | 'FAILED';
  uploadedAt: string;
  versionNum: number;
  versionOf: string | null;
  description: string | null;
  tags: string[];
  documentTypeId: string;
}

interface Props {
  entityType: string;
  entityId: string;
}

const SCAN_BADGE: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  CLEAN: 'bg-green-100 text-green-700',
  INFECTED: 'bg-red-100 text-red-700',
  FAILED: 'bg-slate-100 text-slate-500',
};

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentPanel({ entityType, entityId }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('');
  const [description, setDescription] = useState('');
  const [showVersions, setShowVersions] = useState<string | null>(null);
  const [versions, setVersions] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api<Attachment[]>(`/attachments?entityType=${entityType}&entityId=${entityId}`)
      .then(setAttachments)
      .catch(() => setAttachments([]));
  };

  useEffect(() => {
    api<DocumentType[]>('/admin/attachments/document-types')
      .then((dts) => {
        setDocTypes(dts);
        if (dts.length > 0) setSelectedDocType(dts[0]!.id);
      })
      .catch(() => {});
    load();
  }, [entityType, entityId]);

  const selectedType = docTypes.find((d) => d.id === selectedDocType);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedDocType) return;
    setError('');
    setMsg('');

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (selectedType && !selectedType.allowedExtensions.map(x => x.toLowerCase()).includes(ext)) {
      setError(`Extension .${ext} is not allowed for "${selectedType.label}". Allowed: ${selectedType.allowedExtensions.join(', ')}`);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (selectedType && file.size > selectedType.maxSizeBytes) {
      setError(`File too large. Max size for "${selectedType.label}" is ${formatBytes(selectedType.maxSizeBytes)}`);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      // Step 1: Get presigned URL
      const { uploadUrl, attachmentId } = await api<{ uploadUrl: string; attachmentId: string; versionNum: number }>(
        '/attachments/presign',
        {
          method: 'POST',
          body: JSON.stringify({
            documentTypeId: selectedDocType,
            entityType,
            entityId,
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            description: description || null,
          }),
        }
      );

      // Step 2: Upload to S3/MinIO
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });

      // Step 3: Trigger scan
      await api(`/attachments/${attachmentId}/scan`, { method: 'POST', body: JSON.stringify({}) });

      setMsg(`"${file.name}" uploaded successfully. ${selectedType?.virusScanEnabled ? 'Virus scan in progress…' : 'No scan required.'}`);
      setDescription('');
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(att: Attachment) {
    try {
      const result = await api<{ downloadUrl?: string; filename: string }>(`/attachments/${att.id}/download`);
      if (result.downloadUrl) {
        const a = document.createElement('a');
        a.href = result.downloadUrl;
        a.download = att.originalFilename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      setError('Download failed — storage service (MinIO) may not be running. Start MinIO on port 9000 to enable downloads.');
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this attachment?')) return;
    try {
      await api(`/attachments/${id}`, { method: 'DELETE' });
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError('Delete failed');
    }
  }

  async function loadVersions(att: Attachment) {
    if (showVersions === att.id) { setShowVersions(null); return; }
    try {
      const versionOfId = att.versionOf ?? att.id;
      const v = await api<Attachment[]>(`/attachments/${versionOfId}/versions`);
      setVersions(v);
      setShowVersions(att.id);
    } catch {
      setError('Could not load versions');
    }
  }

  const rootAttachments = attachments.filter((a) => !a.versionOf);

  return (
    <div className="space-y-4">
      {/* Upload form */}
      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
        <h3 className="text-sm font-semibold text-primary">Upload attachment</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="form-label text-xs">Document type</label>
            <select className="form-select text-sm" value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value)}>
              {docTypes.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
            {selectedType && (
              <p className="text-xs text-slate-400 mt-0.5">
                Allowed: {selectedType.allowedExtensions.join(', ')} · Max: {formatBytes(selectedType.maxSizeBytes)}
                {selectedType.virusScanEnabled && (
                  <span className="ml-2 text-yellow-600">🛡 Virus scan on</span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className="form-label text-xs">Description (optional)</label>
            <input className="form-input text-sm" value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this file" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            className="text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-accent file:text-white hover:file:bg-orange-600 cursor-pointer"
            onChange={handleUpload}
            disabled={uploading || !selectedDocType}
            accept={selectedType ? selectedType.allowedExtensions.map(e => `.${e}`).join(',') : undefined}
          />
          {uploading && <span className="text-xs text-slate-500 animate-pulse">Uploading…</span>}
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        {msg && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{msg}</p>}
      </div>

      {/* Attachment list */}
      {rootAttachments.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">No attachments yet.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2 pr-4">File</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Size</th>
              <th className="py-2 pr-4">Scan</th>
              <th className="py-2 pr-4">Uploaded</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rootAttachments.map((att) => {
              const docType = docTypes.find((d) => d.id === att.documentTypeId);
              const canDownload = att.scanStatus === 'CLEAN' || att.scanStatus === 'PENDING';
              return (
                <Fragment key={att.id}>
                  <tr className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-slate-700 truncate max-w-[200px]">{att.originalFilename}</div>
                      {att.description && <div className="text-xs text-slate-400">{att.description}</div>}
                      {att.versionNum > 1 && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">v{att.versionNum}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-500">{docType?.label ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500">{formatBytes(att.sizeBytes)}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SCAN_BADGE[att.scanStatus] ?? 'bg-slate-100 text-slate-600'}`}>
                        {att.scanStatus === 'INFECTED' ? '🚫 Infected' :
                         att.scanStatus === 'CLEAN' ? '✓ Clean' :
                         att.scanStatus === 'PENDING' ? '⏳ Scanning' : '⚠ Failed'}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {new Date(att.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2 text-xs">
                        {canDownload && (
                          <button type="button" className="btn-link" onClick={() => handleDownload(att)}>
                            Download
                          </button>
                        )}
                        <button type="button" className="btn-link text-slate-500" onClick={() => loadVersions(att)}>
                          Versions
                        </button>
                        <button type="button" className="btn-link text-red-400" onClick={() => handleDelete(att.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {showVersions === att.id && versions.length > 0 && (
                    <tr key={`${att.id}-versions`}>
                      <td colSpan={6} className="py-2 px-4 bg-blue-50">
                        <p className="text-xs font-semibold text-blue-700 mb-2">Version history</p>
                        <div className="space-y-1">
                          {versions.map((v) => (
                            <div key={v.id} className="flex items-center gap-4 text-xs text-slate-600">
                              <span className="font-mono bg-blue-100 text-blue-700 px-1.5 rounded">v{v.versionNum}</span>
                              <span>{v.originalFilename}</span>
                              <span>{formatBytes(v.sizeBytes)}</span>
                              <span>{new Date(v.uploadedAt).toLocaleString()}</span>
                              <span className={`px-1.5 py-0.5 rounded-full ${SCAN_BADGE[v.scanStatus]}`}>{v.scanStatus}</span>
                              {v.scanStatus === 'CLEAN' && (
                                <button type="button" className="btn-link text-xs" onClick={() => handleDownload(v)}>Download</button>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
