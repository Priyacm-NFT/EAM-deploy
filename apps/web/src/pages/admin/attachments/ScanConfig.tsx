import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface ScanEngineStatus {
  engine: string;
  version: string;
  definitionDate: string;
  status: 'online' | 'offline' | 'degraded';
  lastScanAt: string | null;
  totalScanned: number;
  totalDetected: number;
}

interface DocumentTypeScanPolicy {
  id: string;
  documentTypeName: string;
  virusScanEnabled: boolean;
  scanAction: 'quarantine' | 'reject' | 'alert';
}

interface ScanSettings {
  icapEnabled: boolean;
  icapHost: string;
  icapPort: number;
  icapServiceName: string;
  globalScanEnabled: boolean;
  quarantineAdminEmail: string;
}

export function ScanConfigPage() {
  const [engineStatus, setEngineStatus] = useState<ScanEngineStatus | null>(null);
  const [policies, setPolicies] = useState<DocumentTypeScanPolicy[]>([]);
  const [, setSettings] = useState<ScanSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState<ScanSettings>({
    icapEnabled: false,
    icapHost: '',
    icapPort: 1344,
    icapServiceName: 'avscan',
    globalScanEnabled: true,
    quarantineAdminEmail: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [updatingPolicy, setUpdatingPolicy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api<ScanEngineStatus>('/admin/attachments/scan-engine/status').then(setEngineStatus).catch(() => setEngineStatus(null));
    api<DocumentTypeScanPolicy[]>('/admin/attachments/scan-policies').then(setPolicies).catch(() => setPolicies([]));
    api<ScanSettings>('/admin/attachments/scan-settings').then((s) => { setSettings(s); setSettingsForm(s); }).catch(() => {});
  }

  useEffect(() => { load(); }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setError('');
    setMsg('');
    try {
      await api('/admin/attachments/scan-settings', { method: 'PUT', body: JSON.stringify(settingsForm) });
      setMsg('Scan settings saved.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingSettings(false);
    }
  }

  async function updatePolicy(policy: DocumentTypeScanPolicy, patch: Partial<Pick<DocumentTypeScanPolicy, 'virusScanEnabled' | 'scanAction'>>) {
    setUpdatingPolicy(policy.id);
    try {
      await api(`/admin/attachments/scan-policies/${policy.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setPolicies((ps) => ps.map((p) => p.id === policy.id ? { ...p, ...patch } : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setUpdatingPolicy(null);
    }
  }

  async function runTestScan() {
    setScanning(true);
    setMsg('');
    setError('');
    try {
      await api('/admin/attachments/scan-engine/test', { method: 'POST' });
      setMsg('EICAR test scan triggered. Check engine status for results.');
      setTimeout(load, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test scan failed');
    } finally {
      setScanning(false);
    }
  }

  const engineStatusColor: Record<string, string> = {
    online: 'bg-green-100 text-green-800 border-green-200',
    offline: 'bg-red-100 text-red-800 border-red-200',
    degraded: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  };

  return (
    <IdentityPageLayout
      title="Virus scan configuration"
      subtitle="Configure ClamAV or ICAP-based scanning — control which document types are scanned and what happens on detection"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {/* Engine Status Card */}
      <div className="admin-section">
        <h2 className="admin-section-title">Scan engine status</h2>
        {engineStatus ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`content-card border text-center ${engineStatusColor[engineStatus.status] ?? 'bg-slate-50 border-slate-200'}`}>
              <p className="text-lg font-bold capitalize">{engineStatus.status}</p>
              <p className="text-xs font-medium mt-0.5">{engineStatus.engine}</p>
            </div>
            <div className="content-card border border-slate-200 text-center">
              <p className="text-lg font-bold text-slate-700">{engineStatus.version}</p>
              <p className="text-xs text-slate-500 mt-0.5">Engine version</p>
            </div>
            <div className="content-card border border-slate-200 text-center">
              <p className="text-lg font-bold text-slate-700">{engineStatus.totalScanned.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-0.5">Files scanned</p>
            </div>
            <div className="content-card border border-red-200 text-center">
              <p className="text-lg font-bold text-red-700">{engineStatus.totalDetected}</p>
              <p className="text-xs text-slate-500 mt-0.5">Threats detected</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Engine status unavailable.</p>
        )}
        <div className="flex gap-3">
          <button type="button" className="btn-outline" onClick={load}>Refresh status</button>
          <button type="button" className="btn-primary !w-auto px-4" disabled={scanning} onClick={runTestScan}>
            {scanning ? 'Running EICAR test…' : 'Run EICAR test scan'}
          </button>
        </div>
        {engineStatus?.definitionDate && (
          <p className="text-xs text-slate-400">
            Virus definition date: {engineStatus.definitionDate} · Last scan: {engineStatus.lastScanAt ? new Date(engineStatus.lastScanAt).toLocaleString() : 'None'}
          </p>
        )}
      </div>

      {/* Global Settings */}
      <div className="admin-section">
        <h2 className="admin-section-title">Global scan settings</h2>
        <form onSubmit={saveSettings} className="space-y-3">
          <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settingsForm.globalScanEnabled}
              onChange={(e) => setSettingsForm({ ...settingsForm, globalScanEnabled: e.target.checked })}
              className="rounded border-slate-300 text-accent"
            />
            Enable virus scanning globally (per-document-type settings override this)
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settingsForm.icapEnabled}
              onChange={(e) => setSettingsForm({ ...settingsForm, icapEnabled: e.target.checked })}
              className="rounded border-slate-300 text-accent"
            />
            Use commercial AV via ICAP protocol (overrides ClamAV)
          </label>

          {settingsForm.icapEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-6 border-l-2 border-slate-200">
              <FormField label="ICAP host" htmlFor="icap-host">
                <input id="icap-host" className="form-input" value={settingsForm.icapHost} onChange={(e) => setSettingsForm({ ...settingsForm, icapHost: e.target.value })} placeholder="av.internal.corp" />
              </FormField>
              <FormField label="ICAP port" htmlFor="icap-port">
                <input id="icap-port" className="form-input" type="number" value={settingsForm.icapPort} onChange={(e) => setSettingsForm({ ...settingsForm, icapPort: Number(e.target.value) })} />
              </FormField>
              <FormField label="ICAP service name" htmlFor="icap-svc">
                <input id="icap-svc" className="form-input" value={settingsForm.icapServiceName} onChange={(e) => setSettingsForm({ ...settingsForm, icapServiceName: e.target.value })} />
              </FormField>
            </div>
          )}

          <FormField label="Quarantine alert email" htmlFor="quar-email" hint="Admin email notified when a file is quarantined">
            <input id="quar-email" className="form-input max-w-sm" type="email" value={settingsForm.quarantineAdminEmail} onChange={(e) => setSettingsForm({ ...settingsForm, quarantineAdminEmail: e.target.value })} placeholder="security@company.com" />
          </FormField>

          <button type="submit" className="btn-primary !w-auto px-6" disabled={savingSettings}>{savingSettings ? 'Saving…' : 'Save settings'}</button>
        </form>
      </div>

      {/* Per-document-type scan policies */}
      <div className="admin-section">
        <h2 className="admin-section-title">Per-document-type scan policies</h2>
        <p className="text-sm text-slate-600">
          Override the global setting for specific document types. Changes take effect immediately without restart.
        </p>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Document type</th>
                <th>Scan enabled</th>
                <th>Action on detection</th>
              </tr>
            </thead>
            <tbody>
              {policies.length === 0 && (
                <tr><td colSpan={3} className="text-center text-slate-400 py-8">No document types defined. Create them in the Document Types page.</td></tr>
              )}
              {policies.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-primary">{p.documentTypeName}</td>
                  <td>
                    <button
                      type="button"
                      disabled={updatingPolicy === p.id}
                      onClick={() => updatePolicy(p, { virusScanEnabled: !p.virusScanEnabled })}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer ${p.virusScanEnabled ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                    >
                      {p.virusScanEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  <td>
                    <select
                      className="form-select w-44 text-sm"
                      value={p.scanAction}
                      disabled={!p.virusScanEnabled || updatingPolicy === p.id}
                      onChange={(e) => updatePolicy(p, { scanAction: e.target.value as 'quarantine' | 'reject' | 'alert' })}
                    >
                      <option value="quarantine">Quarantine</option>
                      <option value="reject">Reject</option>
                      <option value="alert">Alert only</option>
                    </select>
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
