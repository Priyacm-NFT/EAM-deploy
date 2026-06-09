import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';
import type { ReportDefinitionRow, ReportSubject } from './report-types.js';

interface Permission {
  id: string;
  userId: string | null;
  roleId: string | null;
  canView: boolean;
  canRun: boolean;
  canEdit: boolean;
  canSchedule: boolean;
  canShare: boolean;
  grantedAt: string;
}

interface Role { id: string; name: string; label: string }
interface UserRow { id: string; displayName: string; email: string }

type RunFormat = 'PDF' | 'XLSX' | 'CSV';

const FORMAT_LABELS: Record<RunFormat, string> = { PDF: '📄 PDF', XLSX: '📊 Excel', CSV: '📋 CSV' };

export function ReportLibraryPage() {
  const [reports, setReports] = useState<ReportDefinitionRow[]>([]);
  const [subjects, setSubjects] = useState<ReportSubject[]>([]);
  const [filter, setFilter] = useState('');
  const [running, setRunning] = useState<{ id: string; format: RunFormat } | null>(null);
  const [lastDownload, setLastDownload] = useState<{ name: string; url: string } | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Permissions panel state
  const [permReportId, setPermReportId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [permForm, setPermForm] = useState({
    userId: '', roleId: '',
    canView: true, canRun: true, canEdit: false, canSchedule: false, canShare: false,
  });
  const [savingPerm, setSavingPerm] = useState(false);

  function load() {
    Promise.all([
      api<ReportDefinitionRow[]>('/reports/definitions'),
      api<ReportSubject[]>('/reports/subjects'),
    ]).then(([r, s]) => { setReports(r); setSubjects(s); }).catch((e) => setError(String(e)));
  }

  useEffect(() => { load(); }, []);

  const subjectLabel = (id: string) => subjects.find((s) => s.id === id)?.label ?? id;
  const filtered = reports.filter((r) =>
    !filter ||
    r.name.toLowerCase().includes(filter.toLowerCase()) ||
    subjectLabel(r.subjectId).toLowerCase().includes(filter.toLowerCase()),
  );

  async function runReport(id: string, format: RunFormat) {
    setRunning({ id, format }); setError(''); setMsg('');
    try {
      const result = await api<{ downloadUrl?: string; status?: string }>(`/reports/definitions/${id}/run`, {
        method: 'POST',
        body: JSON.stringify({ format }),
      });
      if (result.status === 'SKIPPED') {
        setMsg('Report skipped — no rows returned (skip if empty is enabled).');
      } else if (result.downloadUrl) {
        const name = reports.find((r) => r.id === id)?.name ?? 'report';
        setLastDownload({ name, url: result.downloadUrl });
        setMsg(`"${name}" ready. Click the download link below.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setRunning(null);
    }
  }

  async function deleteReport(id: string, name: string) {
    if (!window.confirm(`Delete report "${name}"? This also deletes all schedules.`)) return;
    try {
      await api(`/reports/definitions/${id}`, { method: 'DELETE' });
      setMsg(`"${name}" deleted.`);
      load();
      if (permReportId === id) setPermReportId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function openPermissions(id: string) {
    if (permReportId === id) { setPermReportId(null); return; }
    setPermReportId(id);
    const [perms, roleList, userList] = await Promise.all([
      api<Permission[]>(`/reports/definitions/${id}/permissions`),
      api<Role[]>('/admin/roles').catch(() => [] as Role[]),
      api<UserRow[]>('/admin/users').catch(() => [] as UserRow[]),
    ]);
    setPermissions(perms);
    setRoles(roleList);
    setUsers(userList);
  }

  async function grantPermission(reportId: string) {
    if (!permForm.userId && !permForm.roleId) {
      setError('Select a user or role to grant access to.'); return;
    }
    setSavingPerm(true); setError('');
    try {
      const body = {
        ...(permForm.userId ? { userId: permForm.userId } : {}),
        ...(permForm.roleId ? { roleId: permForm.roleId } : {}),
        canView: permForm.canView, canRun: permForm.canRun,
        canEdit: permForm.canEdit, canSchedule: permForm.canSchedule, canShare: permForm.canShare,
      };
      const row = await api<Permission>(`/reports/definitions/${reportId}/permissions`, {
        method: 'POST', body: JSON.stringify(body),
      });
      setPermissions((p) => [...p, row]);
      setPermForm({ userId: '', roleId: '', canView: true, canRun: true, canEdit: false, canSchedule: false, canShare: false });
      setMsg('Permission granted.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Grant failed');
    } finally {
      setSavingPerm(false);
    }
  }

  async function revokePermission(reportId: string, permId: string) {
    await api(`/reports/definitions/${reportId}/permissions/${permId}`, { method: 'DELETE' });
    setPermissions((p) => p.filter((x) => x.id !== permId));
    setMsg('Permission revoked.');
  }

  return (
    <IdentityPageLayout
      title="Reports"
      subtitle="Build, schedule, and run reports"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {lastDownload && (
        <div className="admin-section border border-green-200 bg-green-50">
          <p className="text-sm text-green-800">
            <strong>{lastDownload.name}</strong> is ready —{' '}
            <a href={lastDownload.url} className="underline font-medium" target="_blank" rel="noreferrer">
              Download
            </a>
            <button type="button" className="ml-4 text-green-600 hover:text-green-800 text-xs"
              onClick={() => setLastDownload(null)}>✕ Dismiss</button>
          </p>
        </div>
      )}

      {/* Tools */}
      <div className="admin-section">
        <div className="flex flex-wrap gap-3 items-center">
          <Link to="/admin/reporting/designer" className="btn-primary !w-auto px-4">+ New report</Link>
          <Link to="/admin/reporting/schedules" className="btn-outline !w-auto px-4">Scheduled reports</Link>
          <Link to="/admin/reporting/bi" className="btn-outline !w-auto px-4">BI connections</Link>
          <Link to="/admin/reporting/bi-rls" className="btn-outline !w-auto px-4">BI RLS views</Link>
        </div>
      </div>

      {/* Report list */}
      <div className="admin-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="admin-section-title !border-0 !pb-0 !mb-0">Saved reports ({filtered.length})</h2>
          <input type="search" className="form-input w-64 text-sm" placeholder="Filter reports…"
            value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Report name</th>
                <th>Subject</th>
                <th>Mode</th>
                <th>Run</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-400 py-10">
                  No reports yet. <Link to="/admin/reporting/designer" className="text-accent hover:underline">Create one →</Link>
                </td></tr>
              )}
              {filtered.map((r) => {
                const isSqlMode = (r.definition as Record<string, unknown>)?.sqlMode === true;
                return (
                  <>
                    <tr key={r.id}>
                      <td className="font-medium text-slate-800">{r.name}</td>
                      <td className="text-sm text-slate-500">{subjectLabel(r.subjectId)}</td>
                      <td>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${isSqlMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {isSqlMode ? 'SQL' : 'Builder'}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1 flex-wrap">
                          {(['PDF', 'XLSX', 'CSV'] as RunFormat[]).map((fmt) => (
                            <button key={fmt} type="button"
                              className="text-xs px-2 py-1 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 transition-colors"
                              disabled={running?.id === r.id}
                              onClick={() => runReport(r.id, fmt)}>
                              {running?.id === r.id && running.format === fmt ? '…' : FORMAT_LABELS[fmt]}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <Link to={`/admin/reporting/designer?id=${r.id}`} className="btn-link text-xs">Edit</Link>
                          <button type="button" className="btn-link text-xs"
                            onClick={() => openPermissions(r.id)}>
                            {permReportId === r.id ? 'Hide perms' : 'Permissions'}
                          </button>
                          <button type="button" className="btn-danger text-xs"
                            onClick={() => deleteReport(r.id, r.name)}>Delete</button>
                        </div>
                      </td>
                    </tr>

                    {/* Permissions panel */}
                    {permReportId === r.id && (
                      <tr key={`${r.id}-perms`}>
                        <td colSpan={5} className="bg-slate-50 p-0">
                          <div className="p-5 space-y-4">
                            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                              Permissions — {r.name}
                            </p>

                            {/* Grant form */}
                            <div className="flex flex-wrap gap-3 items-end bg-white rounded-lg border border-slate-200 p-4">
                              <div>
                                <label className="form-label text-xs">Grant to User</label>
                                <select className="form-select text-sm w-48" value={permForm.userId}
                                  onChange={(e) => setPermForm({ ...permForm, userId: e.target.value, roleId: '' })}>
                                  <option value="">— select user —</option>
                                  {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="form-label text-xs">or Role</label>
                                <select className="form-select text-sm w-48" value={permForm.roleId}
                                  onChange={(e) => setPermForm({ ...permForm, roleId: e.target.value, userId: '' })}>
                                  <option value="">— select role —</option>
                                  {roles.map((ro) => <option key={ro.id} value={ro.id}>{ro.label || ro.name}</option>)}
                                </select>
                              </div>
                              {(['canView', 'canRun', 'canEdit', 'canSchedule', 'canShare'] as const).map((perm) => (
                                <label key={perm} className="inline-flex items-center gap-1 text-xs cursor-pointer">
                                  <input type="checkbox" checked={permForm[perm]}
                                    onChange={(e) => setPermForm({ ...permForm, [perm]: e.target.checked })}
                                    className="rounded border-slate-300 text-accent" />
                                  {perm.replace('can', '')}
                                </label>
                              ))}
                              <button type="button" className="btn-primary !w-auto px-4 text-xs" disabled={savingPerm}
                                onClick={() => grantPermission(r.id)}>
                                {savingPerm ? '…' : 'Grant'}
                              </button>
                            </div>

                            {/* Existing permissions */}
                            {permissions.length === 0
                              ? <p className="text-xs text-slate-400 italic">No explicit permissions — report uses isPublic setting.</p>
                              : (
                                <table className="admin-table text-xs">
                                  <thead>
                                    <tr>
                                      <th>Grantee</th>
                                      <th>View</th><th>Run</th><th>Edit</th><th>Schedule</th><th>Share</th>
                                      <th>Granted</th><th>Revoke</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {permissions.map((p) => (
                                      <tr key={p.id}>
                                        <td>
                                          {p.userId
                                            ? <span>{users.find((u) => u.id === p.userId)?.displayName ?? p.userId.slice(0, 8)}</span>
                                            : <span className="font-mono bg-accent/10 text-accent-dark px-1.5 py-0.5 rounded text-[10px]">
                                                role:{roles.find((ro) => ro.id === p.roleId)?.name ?? p.roleId?.slice(0, 8)}
                                              </span>}
                                        </td>
                                        {(['canView', 'canRun', 'canEdit', 'canSchedule', 'canShare'] as const).map((perm) => (
                                          <td key={perm} className="text-center">
                                            {p[perm]
                                              ? <span className="text-green-600 font-bold">✓</span>
                                              : <span className="text-slate-300">—</span>}
                                          </td>
                                        ))}
                                        <td className="text-slate-500">{new Date(p.grantedAt).toLocaleDateString()}</td>
                                        <td>
                                          <button type="button" className="btn-danger text-[10px]"
                                            onClick={() => revokePermission(r.id, p.id)}>Revoke</button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </IdentityPageLayout>
  );
}
