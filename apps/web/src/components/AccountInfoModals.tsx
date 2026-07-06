import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client.js';
import { DEFAULT_SITE_CHANGE_EVENT, notifyDefaultSiteChange } from '../hooks/useActiveDefaultSite.js';

// FIX: real Maximo behaviour — clicking "Default Information" / "Personal
// Information" in the profile dropdown opens a centered popup over the
// current page (whatever page you're on), not a navigation to a separate
// route. These two modals are rendered from AuthNav (mounted once, in the
// global header) so they work from any page, not just /account.

interface DefaultInfo {
  defaultOrgId: string | null;
  defaultSiteId: string | null;
  useDefaultSiteAsFilter: boolean;
  sideNavMode: 'DISPLAY' | 'HIDE' | 'SECURITY_GROUP';
  userDefaultApplication: string | null;
  language: string | null;
  locale: string | null;
  timezone: string | null;
  calendarType: string | null;
  defaultRepairFacility: string | null;
  defaultSite: { id: string; name: string; siteNum: string } | null;
  defaultOrg: { id: string; name: string; code: string } | null;
}

// FIX: Division/Department now auto-fill from the user's existing account
// data (defaultOrgId → resolved Organisation name, and the `department`
// field already on `users`) instead of being blank inputs someone has to
// type in manually. Line 3?-6? checkboxes removed — they had no backing
// data model and no defined meaning in this platform, unlike Division/
// Department which map to real, already-stored fields.
interface PersonalInfo {
  id: string;
  phone: string | null;
  department: string | null;
  organisationName: string | null;
}

interface LookupOption {
  id: string;
  name: string;
  siteNum?: string;
  code?: string;
  orgId?: string | null;
}

// FIX: shared show/hide toggle for every password-type input across these
// modals (Password Information's 3 fields, E-Signature's 3 fields) — a
// small eye-icon button on the right edge of the input that flips the
// field between type="password" and type="text". Plain CSS/markup only,
// no new dependency.
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          className="form-input text-sm pr-9"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer"
        >
          {visible ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Shared modal shell ──────────────────────────────────────────────────
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [onClose]);

  // FIX: AuthNav (and therefore this modal, since it's rendered as a
  // sibling inside AuthNav's JSX) lives inside .app-topbar, which has
  // `backdrop-filter: blur(...)`. Per spec, backdrop-filter (like
  // transform) creates a new containing block for descendant
  // position:fixed elements — so without a portal, this overlay was
  // positioning itself relative to the topbar's box instead of the
  // viewport, which is why it rendered stuck near the top instead of
  // centered on screen. createPortal renders straight to document.body,
  // outside that containing block, fixing it properly.
  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none bg-transparent border-0 cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ── Default Information modal ───────────────────────────────────────────
export function DefaultInformationModal({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<DefaultInfo | null>(null);
  const [sitesOpts, setSitesOpts] = useState<LookupOption[]>([]);
  // FIX (Maximo behaviour — "if I click any site, the org should
  // auto-allocate to match, not stay stuck on whatever org loaded first"):
  // need every Site's owning orgId (already on sitesOpts) *and* the
  // Organisation names/codes to label it with, so picking a new Site can
  // resolve+show its Organisation immediately, client-side, without a
  // round trip.
  const [orgsOpts, setOrgsOpts] = useState<LookupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError('');
      try {
        const [data, sites, orgs] = await Promise.all([
          api<DefaultInfo>('/account/default-info'),
          api<LookupOption[]>('/account/lookups/sites'),
          api<LookupOption[]>('/account/lookups/organisations'),
        ]);
        if (cancelled) return;
        const siteResolved = (!data.defaultSiteId && sites.length === 1)
          ? { ...data, defaultSiteId: sites[0].id, defaultOrg: data.defaultOrg ?? null }
          : data;

        const resolvedData = {
          ...siteResolved,
          userDefaultApplication: siteResolved.userDefaultApplication || 'Dashboard',
          language: siteResolved.language || 'English',
          calendarType: siteResolved.calendarType || 'mm/dd/yyyy',
          locale: siteResolved.locale || 'en-IN',
          timezone: siteResolved.timezone || 'Asia/Kolkata (IST)',
        };
        setInfo(resolvedData);
        setSitesOpts(sites);
        setOrgsOpts(orgs);

        if (!data.defaultSiteId && sites.length === 1) {
          api('/account/default-info', {
            method: 'PUT',
            body: JSON.stringify({ defaultSiteId: sites[0].id, defaultOrgId: sites[0].orgId }),
          }).catch(() => {});
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load Default Information');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // FIX: this is the actual fix for the "org doesn't auto-allocate with
  // site" bug. Picking a Site in the dropdown used to only ever update
  // defaultSiteId — defaultOrgId (and the "Default Organisation: ..." hint
  // below it) kept whatever value loaded on open, so Save kept sending the
  // *original* org no matter which Site got picked, and Personal
  // Information's Organisation field never changed either. This looks up
  // the newly-picked Site's owning orgId (already present on sitesOpts)
  // and the matching Organisation's name/code (from orgsOpts), and updates
  // both defaultOrgId and the display object together, in the same click —
  // real Maximo re-derives Organisation the instant a different Site is
  // selected, it doesn't wait for a save+reload round trip.
  function handleSiteChange(siteId: string | null) {
    if (!info) return;
    const selectedSite = sitesOpts.find((s) => s.id === siteId);
    const matchedOrg = selectedSite?.orgId
      ? orgsOpts.find((o) => o.id === selectedSite.orgId) ?? null
      : null;
    setInfo({
      ...info,
      defaultSiteId: siteId,
      defaultOrgId: selectedSite?.orgId ?? null,
      defaultOrg: matchedOrg ? { id: matchedOrg.id, name: matchedOrg.name, code: matchedOrg.code ?? '' } : null,
    });
  }

  async function handleSave() {
    if (!info) return;
    setSaving(true); setMsg(''); setError('');
    try {
      const updated = await api<DefaultInfo>('/account/default-info', {
        method: 'PUT',
        body: JSON.stringify({
          defaultSiteId: info.defaultSiteId,
          defaultOrgId: info.defaultOrgId,
          useDefaultSiteAsFilter: info.useDefaultSiteAsFilter,
          sideNavMode: info.sideNavMode,
          userDefaultApplication: info.userDefaultApplication,
          language: info.language,
          locale: info.locale,
          timezone: info.timezone,
          calendarType: info.calendarType,
          defaultRepairFacility: info.defaultRepairFacility,
        }),
      });
      setInfo((prev) => (prev ? { ...prev, ...updated } : prev));
      const selectedSite = sitesOpts.find((s) => s.id === info.defaultSiteId);
      notifyDefaultSiteChange({
        defaultSiteId: info.defaultSiteId,
        defaultOrgId: info.defaultOrgId,
        defaultSite: selectedSite
          ? { id: selectedSite.id, name: selectedSite.name, siteNum: selectedSite.siteNum ?? '' }
          : null,
        defaultOrg: info.defaultOrg,
      });
      setMsg('Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Default Information" onClose={onClose}>
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{error}</p>}
      {msg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">{msg}</p>}

      {info && (
        <div className="space-y-4">
          <div>
            <label htmlFor="m-di-site" className="text-xs font-medium text-gray-600 block mb-1">Default Insert Site</label>
            {sitesOpts.length === 1 ? (
              <p className="text-sm text-gray-800 bg-gray-100 border border-gray-200 rounded px-3 py-2">
                {sitesOpts[0].siteNum} — {sitesOpts[0].name}
              </p>
            ) : (
              <select
                id="m-di-site"
                className="form-input text-sm"
                value={info.defaultSiteId ?? ''}
                onChange={(e) => handleSiteChange(e.target.value || null)}
              >
                <option value="">— None —</option>
                {sitesOpts.map((s) => (
                  <option key={s.id} value={s.id}>{s.siteNum} — {s.name}</option>
                ))}
              </select>
            )}
            {info.defaultOrg && (
              <p className="text-xs text-gray-400 mt-1">
                Default Organisation: {info.defaultOrg.code} — {info.defaultOrg.name}
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={info.useDefaultSiteAsFilter}
              onChange={(e) => setInfo({ ...info, useDefaultSiteAsFilter: e.target.checked })}
            />
            Use Default Insert Site as a Display Filter?
          </label>

          <div>
            <span className="text-xs font-medium text-gray-600 block mb-1">Side navigation menu</span>
            <div className="space-y-1">
              {([
                ['DISPLAY', 'Display'],
                ['HIDE', 'Hide'],
                ['SECURITY_GROUP', 'Use setting from security group'],
              ] as const).map(([val, label]) => (
                <label key={val} className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="radio"
                    name="m-sideNavMode"
                    checked={info.sideNavMode === val}
                    onChange={() => setInfo({ ...info, sideNavMode: val })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="m-di-default-app" className="text-xs font-medium text-gray-600 block mb-1">User Default Application</label>
            <input id="m-di-default-app" type="text" className="form-input text-sm"
              value={info.userDefaultApplication ?? ''}
              onChange={(e) => setInfo({ ...info, userDefaultApplication: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="m-di-language" className="text-xs font-medium text-gray-600 block mb-1">Language</label>
              <input id="m-di-language" type="text" className="form-input text-sm"
                value={info.language ?? ''} onChange={(e) => setInfo({ ...info, language: e.target.value })} />
            </div>
            <div>
              <label htmlFor="m-di-locale" className="text-xs font-medium text-gray-600 block mb-1">Locale</label>
              <input id="m-di-locale" type="text" className="form-input text-sm"
                value={info.locale ?? ''} onChange={(e) => setInfo({ ...info, locale: e.target.value })} />
            </div>
            <div>
              <label htmlFor="m-di-calendar" className="text-xs font-medium text-gray-600 block mb-1">Calendar Type</label>
              <input id="m-di-calendar" type="text" className="form-input text-sm"
                value={info.calendarType ?? ''} onChange={(e) => setInfo({ ...info, calendarType: e.target.value })} />
            </div>
            <div>
              <label htmlFor="m-di-timezone" className="text-xs font-medium text-gray-600 block mb-1">Time Zone</label>
              <input id="m-di-timezone" type="text" className="form-input text-sm"
                value={info.timezone ?? ''} onChange={(e) => setInfo({ ...info, timezone: e.target.value })} />
            </div>
          </div>

          <div>
            <label htmlFor="m-di-repair-facility" className="text-xs font-medium text-gray-600 block mb-1">Default Repair Facility</label>
            <input id="m-di-repair-facility" type="text" className="form-input text-sm"
              value={info.defaultRepairFacility ?? ''}
              onChange={(e) => setInfo({ ...info, defaultRepairFacility: e.target.value })} />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" disabled={saving} onClick={handleSave} className="btn-primary !w-auto px-4 text-sm">
              {saving ? 'Saving…' : 'OK'}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── Personal Information modal ──────────────────────────────────────────
export function PersonalInformationModal({ onClose, email }: { onClose: () => void; email: string }) {
  const [info, setInfo] = useState<PersonalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError('');
      try {
        const data = await api<PersonalInfo>('/account/personal-info');
        if (!cancelled) setInfo(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load Personal Information');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function refreshPersonalInfo() {
      api<PersonalInfo>('/account/personal-info')
        .then((data) => setInfo(data))
        .catch(() => {});
    }
    window.addEventListener(DEFAULT_SITE_CHANGE_EVENT, refreshPersonalInfo);
    return () => window.removeEventListener(DEFAULT_SITE_CHANGE_EVENT, refreshPersonalInfo);
  }, []);

  async function handleSave() {
    if (!info) return;
    setSaving(true); setMsg(''); setError('');
    try {
      const updated = await api<PersonalInfo>('/account/personal-info', {
        method: 'PUT',
        body: JSON.stringify({
          phone: info.phone,
          department: info.department,
        }),
      });
      setInfo((prev) => (prev ? { ...prev, ...updated } : prev));
      setMsg('Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Personal Information" onClose={onClose}>
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{error}</p>}
      {msg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">{msg}</p>}

      {info && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Press the lookup icon to view or modify phone numbers or e-mail addresses if there are more than one.
          </p>

          <div>
            <label htmlFor="m-pi-phone" className="text-xs font-medium text-gray-600 block mb-1">Primary Phone</label>
            <input id="m-pi-phone" type="text" className="form-input text-sm"
              value={info.phone ?? ''} onChange={(e) => setInfo({ ...info, phone: e.target.value })} />
          </div>

          <div>
            <span className="text-xs font-medium text-gray-600 block mb-1">Primary E-mail</span>
            <p className="text-sm text-gray-700">{email}</p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded px-3 py-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Organization</p>

            <div>
              <span className="text-xs font-medium text-gray-600 block mb-1">Organisation</span>
              <p className="text-sm text-gray-700 bg-gray-100 border border-gray-200 rounded px-3 py-2">
                {info.organisationName || 'Not yet assigned — set a Default Site in Default Information'}
              </p>
            </div>

            <div className="mt-2">
              <label htmlFor="m-pi-department" className="text-xs font-medium text-gray-600 block mb-1">Department</label>
              <input id="m-pi-department" type="text" className="form-input text-sm"
                value={info.department ?? ''} onChange={(e) => setInfo({ ...info, department: e.target.value })} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" disabled={saving} onClick={handleSave} className="btn-primary !w-auto px-4 text-sm">
              {saving ? 'Saving…' : 'OK'}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── Password Information modal ──────────────────────────────────────────
// FIX (Gap analysis — was a placeholder: "In-page password change isn't
// built yet"). Real self-service password change against
// PUT /account/password, gated by re-entering the current password.
export function PasswordInformationModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  async function handleSave() {
    setErrors([]); setMsg('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrors(['Current password, new password, and confirmation are all required.']);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrors(['New password and confirmation do not match.']);
      return;
    }

    setSaving(true);
    try {
      await api('/account/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMsg('Password changed. You have been signed out of any other active sessions.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Failed to change password']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Password Information" onClose={onClose}>
      {errors.length > 0 && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
          {errors.length === 1 ? errors[0] : (
            <ul className="list-disc pl-4 space-y-0.5">
              {errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          )}
        </div>
      )}
      {msg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">{msg}</p>}

      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          To change your password, enter your current password followed by the new password.
          If your account is managed by an external identity provider (AD/LDAP/SSO), change it
          there instead — this form will tell you if that's the case.
        </p>

        {/* FIX: replaced plain <input type="password"> with the shared
            PasswordField component — adds a show/hide eye-icon toggle to
            every credential field in this modal, matching the common
            pattern most sites already use, so a user can verify what
            they typed before submitting. */}
        <PasswordField
          id="m-pw-current"
          label="Current Password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        <PasswordField
          id="m-pw-new"
          label="New Password"
          autoComplete="new-password"
          value={newPassword}
          onChange={setNewPassword}
        />
        <PasswordField
          id="m-pw-confirm"
          label="Confirm New Password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
        />

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button type="button" disabled={saving} onClick={handleSave} className="btn-primary !w-auto px-4 text-sm">
            {saving ? 'Saving…' : 'OK'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Set or Modify E-Signature Key modal ─────────────────────────────────
// FIX (Gap analysis — was a placeholder: "e-signature key storage doesn't
// exist in the platform yet", and the GET on load 404'd with a raw "Not
// Found" since the backend route never existed at all — see
// GET/PUT /account/esignature, newly added in account.ts). Real
// set/modify flow. The key is a separate secret from the login password
// (used to sign/approve records), so changing it still requires
// re-entering the login password as proof of identity.
export function ESignatureModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [isSet, setIsSet] = useState(false);
  const [setAt, setSetAt] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newKey, setNewKey] = useState('');
  const [confirmKey, setConfirmKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await api<{ isSet: boolean; setAt: string | null }>('/account/esignature');
        if (!cancelled) { setIsSet(data.isSet); setSetAt(data.setAt); }
      } catch (e) {
        if (!cancelled) setErrors([e instanceof Error ? e.message : 'Failed to load E-Signature status']);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleSave() {
    setErrors([]); setMsg('');

    if (!currentPassword || !newKey || !confirmKey) {
      setErrors(['Your login password, the new key, and its confirmation are all required.']);
      return;
    }
    if (newKey !== confirmKey) {
      setErrors(['E-Signature keys do not match.']);
      return;
    }

    setSaving(true);
    try {
      const result = await api<{ ok: boolean; setAt: string }>('/account/esignature', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newKey, confirmKey }),
      });
      setIsSet(true);
      setSetAt(result.setAt);
      setMsg(isSet ? 'E-Signature key updated.' : 'E-Signature key set.');
      setCurrentPassword(''); setNewKey(''); setConfirmKey('');
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Failed to set E-Signature key']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Set or Modify E-Signature Key" onClose={onClose}>
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {errors.length > 0 && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
          {errors.length === 1 ? errors[0] : (
            <ul className="list-disc pl-4 space-y-0.5">
              {errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          )}
        </div>
      )}
      {msg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">{msg}</p>}

      {!loading && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Your E-Signature key is a separate credential from your login password, used to
            electronically sign or approve records (e.g. work order sign-off) without re-entering
            your login password each time.
          </p>

          <p className="text-sm text-gray-700">
            Status:{' '}
            {isSet ? (
              <span className="text-green-700 font-medium">
                Set{setAt ? ` (last updated ${new Date(setAt).toLocaleDateString()})` : ''}
              </span>
            ) : (
              <span className="text-gray-500 font-medium">Not set</span>
            )}
          </p>

          <PasswordField
            id="m-es-current-pw"
            label="Your Login Password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <PasswordField
            id="m-es-new"
            label={isSet ? 'New E-Signature Key' : 'E-Signature Key'}
            autoComplete="new-password"
            value={newKey}
            onChange={setNewKey}
          />
          <PasswordField
            id="m-es-confirm"
            label="Confirm E-Signature Key"
            autoComplete="new-password"
            value={confirmKey}
            onChange={setConfirmKey}
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" disabled={saving} onClick={handleSave} className="btn-primary !w-auto px-4 text-sm">
              {saving ? 'Saving…' : 'OK'}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
