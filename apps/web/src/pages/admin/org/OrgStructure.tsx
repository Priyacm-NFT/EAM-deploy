import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

// FIX (Maximo Organization detail page parity): real Maximo's Org record
// opens into a detail view with 3 tabs — Organization (name/code/basic
// info), Address (structured address fields), and Sites (every Site under
// this Org, managed inline). Previously this page had two flat top-level
// tabs ("Organisations" / "Sites") with Sites cross-cutting every Org at
// once and a single free-text address field — neither matches Maximo.
// This rewrite: a list view of Organisations, and clicking one opens its
// detail view with the 3 real-Maximo tabs; the Sites tab there is scoped
// to that one Org only.

interface Org {
  id: string;
  // FIX (Maximo Organization tab parity): `name` is kept only because a
  // couple of other screens still read it (e.g. the Default Organisation
  // picker) — it's silently kept in sync with `description` server-side.
  // This page's UI no longer has a Name field at all; `code` (the
  // auto-generated numeric Organisation number) is the primary identifier
  // shown everywhere instead.
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  baseCurrency: string | null;
  baseCurrency2: string | null;
  defaultItemStatus: string | null;
  defaultStockCategory: string | null;
  language: string | null;
  itemSetCode: string | null;
  companySetCode: string | null;
  glAccount: string | null;
  costCenter: string | null;
}

interface OrgAddress {
  id: string;
  orgId: string;
  addressCode: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  isActive: boolean;
}

interface Site {
  id: string;
  orgId: string | null;
  name: string;
  siteNum: string;
  description: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string | null;
  isActive: boolean;
  glAccount: string | null;
  costCenter: string | null;
  inheritGlAccount: boolean;
  inheritCostCenter: boolean;
}

// FIX (Org/Site Maximo-parity rewrite): Name and Code are no longer
// admin-entered fields. "Organisation" / "Site" is now an auto-generated
// numeric code (10000, 10001, …) allocated by the backend on create and
// never editable afterward — see nextOrgCodeForTenant / nextSiteNumForTenant
// in admin-org.ts. Description is the only free-text identifier an admin
// types now.
const EMPTY_ORG = {
  description: '',
  baseCurrency: '',
  baseCurrency2: '',
  defaultItemStatus: '',
  defaultStockCategory: '',
  isActive: true,
};
const EMPTY_ADDRESS = { addressLine1: '', addressLine2: '', city: '', stateProvince: '', postalCode: '', country: '' };
const EMPTY_SITE = {
  orgId: '', description: '', timezone: 'UTC',
  ...EMPTY_ADDRESS,
};

// FIX: Address Code field rule, per the codification note ("Alpha numeric
// - UPPER case - 30 char can be ext[end]"). Strips anything that isn't a
// letter or digit, force-uppercases, and truncates to 30 chars — applied
// live as the admin types, so what's in the box always matches what will
// be saved. (Org/Site codes themselves no longer use this — they're
// auto-generated numbers now — but Address Codes and the Default Item
// Status / Stock Category fields still follow this convention.)
function sanitizeCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 30);
}

function formatAddress(o: { addressLine1: string | null; city: string | null; stateProvince: string | null; postalCode: string | null; country: string | null }): string {
  const parts = [o.addressLine1, o.city, o.stateProvince, o.postalCode, o.country].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

// FIX (Maximo Organization tab parity): Base Currency 1 / 2 are Maximo
// lookups against a fixed currency table (Administration > Currency Codes),
// not free text — this is that lookup list, ISO 4217 codes with their
// common names, sorted alphabetically by code so it's scannable in a long
// dropdown the same way Maximo's lookup dialog is.
const CURRENCIES: { code: string; name: string }[] = [
  { code: 'AED', name: 'UAE Dirham' }, { code: 'AFN', name: 'Afghan Afghani' },
  { code: 'ALL', name: 'Albanian Lek' }, { code: 'AMD', name: 'Armenian Dram' },
  { code: 'ANG', name: 'Netherlands Antillean Guilder' }, { code: 'AOA', name: 'Angolan Kwanza' },
  { code: 'ARS', name: 'Argentine Peso' }, { code: 'AUD', name: 'Australian Dollar' },
  { code: 'AWG', name: 'Aruban Florin' }, { code: 'AZN', name: 'Azerbaijani Manat' },
  { code: 'BAM', name: 'Bosnia-Herzegovina Convertible Mark' }, { code: 'BBD', name: 'Barbadian Dollar' },
  { code: 'BDT', name: 'Bangladeshi Taka' }, { code: 'BGN', name: 'Bulgarian Lev' },
  { code: 'BHD', name: 'Bahraini Dinar' }, { code: 'BIF', name: 'Burundian Franc' },
  { code: 'BMD', name: 'Bermudan Dollar' }, { code: 'BND', name: 'Brunei Dollar' },
  { code: 'BOB', name: 'Bolivian Boliviano' }, { code: 'BRL', name: 'Brazilian Real' },
  { code: 'BSD', name: 'Bahamian Dollar' }, { code: 'BTN', name: 'Bhutanese Ngultrum' },
  { code: 'BWP', name: 'Botswanan Pula' }, { code: 'BYN', name: 'Belarusian Ruble' },
  { code: 'BZD', name: 'Belize Dollar' }, { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'CDF', name: 'Congolese Franc' }, { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CLP', name: 'Chilean Peso' }, { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'COP', name: 'Colombian Peso' }, { code: 'CRC', name: 'Costa Rican Colon' },
  { code: 'CUP', name: 'Cuban Peso' }, { code: 'CVE', name: 'Cape Verdean Escudo' },
  { code: 'CZK', name: 'Czech Koruna' }, { code: 'DJF', name: 'Djiboutian Franc' },
  { code: 'DKK', name: 'Danish Krone' }, { code: 'DOP', name: 'Dominican Peso' },
  { code: 'DZD', name: 'Algerian Dinar' }, { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'ERN', name: 'Eritrean Nakfa' }, { code: 'ETB', name: 'Ethiopian Birr' },
  { code: 'EUR', name: 'Euro' }, { code: 'FJD', name: 'Fijian Dollar' },
  { code: 'GBP', name: 'British Pound Sterling' }, { code: 'GEL', name: 'Georgian Lari' },
  { code: 'GHS', name: 'Ghanaian Cedi' }, { code: 'GMD', name: 'Gambian Dalasi' },
  { code: 'GNF', name: 'Guinean Franc' }, { code: 'GTQ', name: 'Guatemalan Quetzal' },
  { code: 'GYD', name: 'Guyanaese Dollar' }, { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'HNL', name: 'Honduran Lempira' }, { code: 'HRK', name: 'Croatian Kuna' },
  { code: 'HTG', name: 'Haitian Gourde' }, { code: 'HUF', name: 'Hungarian Forint' },
  { code: 'IDR', name: 'Indonesian Rupiah' }, { code: 'ILS', name: 'Israeli New Shekel' },
  { code: 'INR', name: 'Indian Rupee' }, { code: 'IQD', name: 'Iraqi Dinar' },
  { code: 'IRR', name: 'Iranian Rial' }, { code: 'ISK', name: 'Icelandic Krona' },
  { code: 'JMD', name: 'Jamaican Dollar' }, { code: 'JOD', name: 'Jordanian Dinar' },
  { code: 'JPY', name: 'Japanese Yen' }, { code: 'KES', name: 'Kenyan Shilling' },
  { code: 'KGS', name: 'Kyrgystani Som' }, { code: 'KHR', name: 'Cambodian Riel' },
  { code: 'KMF', name: 'Comorian Franc' }, { code: 'KRW', name: 'South Korean Won' },
  { code: 'KWD', name: 'Kuwaiti Dinar' }, { code: 'KYD', name: 'Cayman Islands Dollar' },
  { code: 'KZT', name: 'Kazakhstani Tenge' }, { code: 'LAK', name: 'Laotian Kip' },
  { code: 'LBP', name: 'Lebanese Pound' }, { code: 'LKR', name: 'Sri Lankan Rupee' },
  { code: 'LRD', name: 'Liberian Dollar' }, { code: 'LSL', name: 'Lesotho Loti' },
  { code: 'LYD', name: 'Libyan Dinar' }, { code: 'MAD', name: 'Moroccan Dirham' },
  { code: 'MDL', name: 'Moldovan Leu' }, { code: 'MGA', name: 'Malagasy Ariary' },
  { code: 'MKD', name: 'Macedonian Denar' }, { code: 'MMK', name: 'Myanma Kyat' },
  { code: 'MNT', name: 'Mongolian Tugrik' }, { code: 'MOP', name: 'Macanese Pataca' },
  { code: 'MRU', name: 'Mauritanian Ouguiya' }, { code: 'MUR', name: 'Mauritian Rupee' },
  { code: 'MVR', name: 'Maldivian Rufiyaa' }, { code: 'MWK', name: 'Malawian Kwacha' },
  { code: 'MXN', name: 'Mexican Peso' }, { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'MZN', name: 'Mozambican Metical' }, { code: 'NAD', name: 'Namibian Dollar' },
  { code: 'NGN', name: 'Nigerian Naira' }, { code: 'NIO', name: 'Nicaraguan Cordoba' },
  { code: 'NOK', name: 'Norwegian Krone' }, { code: 'NPR', name: 'Nepalese Rupee' },
  { code: 'NZD', name: 'New Zealand Dollar' }, { code: 'OMR', name: 'Omani Rial' },
  { code: 'PAB', name: 'Panamanian Balboa' }, { code: 'PEN', name: 'Peruvian Sol' },
  { code: 'PGK', name: 'Papua New Guinean Kina' }, { code: 'PHP', name: 'Philippine Peso' },
  { code: 'PKR', name: 'Pakistani Rupee' }, { code: 'PLN', name: 'Polish Zloty' },
  { code: 'PYG', name: 'Paraguayan Guarani' }, { code: 'QAR', name: 'Qatari Rial' },
  { code: 'RON', name: 'Romanian Leu' }, { code: 'RSD', name: 'Serbian Dinar' },
  { code: 'RUB', name: 'Russian Ruble' }, { code: 'RWF', name: 'Rwandan Franc' },
  { code: 'SAR', name: 'Saudi Riyal' }, { code: 'SBD', name: 'Solomon Islands Dollar' },
  { code: 'SCR', name: 'Seychellois Rupee' }, { code: 'SDG', name: 'Sudanese Pound' },
  { code: 'SEK', name: 'Swedish Krona' }, { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'SLE', name: 'Sierra Leonean Leone' }, { code: 'SOS', name: 'Somali Shilling' },
  { code: 'SRD', name: 'Surinamese Dollar' }, { code: 'SSP', name: 'South Sudanese Pound' },
  { code: 'SYP', name: 'Syrian Pound' }, { code: 'SZL', name: 'Swazi Lilangeni' },
  { code: 'THB', name: 'Thai Baht' }, { code: 'TJS', name: 'Tajikistani Somoni' },
  { code: 'TMT', name: 'Turkmenistani Manat' }, { code: 'TND', name: 'Tunisian Dinar' },
  { code: 'TOP', name: "Tongan Pa'anga" }, { code: 'TRY', name: 'Turkish Lira' },
  { code: 'TTD', name: 'Trinidad & Tobago Dollar' }, { code: 'TWD', name: 'New Taiwan Dollar' },
  { code: 'TZS', name: 'Tanzanian Shilling' }, { code: 'UAH', name: 'Ukrainian Hryvnia' },
  { code: 'UGX', name: 'Ugandan Shilling' }, { code: 'USD', name: 'US Dollar' },
  { code: 'UYU', name: 'Uruguayan Peso' }, { code: 'UZS', name: 'Uzbekistani Som' },
  { code: 'VES', name: 'Venezuelan Bolivar' }, { code: 'VND', name: 'Vietnamese Dong' },
  { code: 'VUV', name: 'Vanuatu Vatu' }, { code: 'WST', name: 'Samoan Tala' },
  { code: 'XAF', name: 'Central African CFA Franc' }, { code: 'XCD', name: 'East Caribbean Dollar' },
  { code: 'XOF', name: 'West African CFA Franc' }, { code: 'XPF', name: 'CFP Franc' },
  { code: 'YER', name: 'Yemeni Rial' }, { code: 'ZAR', name: 'South African Rand' },
  { code: 'ZMW', name: 'Zambian Kwacha' }, { code: 'ZWL', name: 'Zimbabwean Dollar' },
];

function CurrencySelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <select id={id} className="form-input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Select —</option>
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
      ))}
    </select>
  );
}

export function OrgStructurePage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // List-view "new organisation" form state
  const [showOrgForm, setShowOrgForm] = useState(false);
  const [orgForm, setOrgForm] = useState(EMPTY_ORG);

  // Detail-view state — which Org is open, and which of its 3 tabs
  const [openOrgId, setOpenOrgId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'organization' | 'addresses' | 'sites'>('organization');

  // Detail-view edit buffer for the Organization tab
  const [orgEditForm, setOrgEditForm] = useState(EMPTY_ORG);

  // FIX (multi-address support): an Org can have multiple addresses, each
  // with its own Address Code — a list, not one set of fields. Loaded
  // fresh whenever an Org's Addresses tab is opened (loadAddresses below).
  const [orgAddresses, setOrgAddresses] = useState<OrgAddress[]>([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressForm, setAddressForm] = useState({ addressCode: '', ...EMPTY_ADDRESS });
  const [editAddressId, setEditAddressId] = useState<string | null>(null);

  // Site form, used inside the Sites tab of an open Org's detail view
  const [showSiteForm, setShowSiteForm] = useState(false);
  const [siteForm, setSiteForm] = useState(EMPTY_SITE);
  const [editSiteId, setEditSiteId] = useState<string | null>(null);

  function load() {
    api<Org[]>('/admin/org/organisations').then(setOrgs).catch(() => setOrgs([]));
    api<Site[]>('/admin/org/sites').then(setSites).catch(() => setSites([]));
  }

  function loadAddresses(orgId: string) {
    api<OrgAddress[]>(`/admin/org/organisations/${orgId}/addresses`).then(setOrgAddresses).catch(() => setOrgAddresses([]));
  }

  useEffect(() => { load(); }, []);

  const openOrg = orgs.find((o) => o.id === openOrgId) ?? null;
  const sitesForOpenOrg = sites.filter((s) => s.orgId === openOrgId);

  // ── Organisation list-view create ───────────────────────────────────────
  async function saveNewOrg(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMsg('');
    try {
      await api('/admin/org/organisations', { method: 'POST', body: JSON.stringify(orgForm) });
      setMsg('Organisation created.');
      setShowOrgForm(false);
      setOrgForm(EMPTY_ORG);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deactivateOrg(o: Org) {
    // FIX (Org/Site gap #12): soft-delete on the backend — wording
    // reflects that, not a promise of permanent removal.
    if (!window.confirm(`Deactivate organisation "${o.code}"? It will be hidden but its historical data is preserved.`)) return;
    try {
      await api(`/admin/org/organisations/${o.id}`, { method: 'DELETE' });
      setMsg(`Organisation "${o.code}" deactivated.`);
      if (openOrgId === o.id) setOpenOrgId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deactivate failed');
    }
  }

  // ── Detail-view: open an Org, populate both tab-scoped edit buffers ───
  function openOrgDetail(o: Org) {
    setOrgEditForm({
      description: o.description ?? '',
      baseCurrency: o.baseCurrency ?? '',
      baseCurrency2: o.baseCurrency2 ?? '',
      defaultItemStatus: o.defaultItemStatus ?? '',
      defaultStockCategory: o.defaultStockCategory ?? '',
      isActive: o.isActive,
    });
    setOpenOrgId(o.id);
    setDetailTab('organization');
    setShowSiteForm(false);
    setEditSiteId(null);
    setShowAddressForm(false);
    setEditAddressId(null);
    loadAddresses(o.id);
  }

  // ── Detail-view: "Organization" tab save ───────────────────────────────
  async function saveOrgTab(e: React.FormEvent) {
    e.preventDefault();
    if (!openOrgId) return;
    setSaving(true); setError(''); setMsg('');
    try {
      await api(`/admin/org/organisations/${openOrgId}`, { method: 'PUT', body: JSON.stringify(orgEditForm) });
      setMsg('Organisation details saved.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Detail-view: "Addresses" tab — add/edit/delete a Site's-worth-alike
  // list of addresses under this Org ───────────────────────────────────────
  async function saveAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!openOrgId) return;
    setSaving(true); setError(''); setMsg('');
    try {
      if (editAddressId) {
        await api(`/admin/org/organisations/${openOrgId}/addresses/${editAddressId}`, { method: 'PUT', body: JSON.stringify(addressForm) });
        setMsg('Address updated.');
      } else {
        await api(`/admin/org/organisations/${openOrgId}/addresses`, { method: 'POST', body: JSON.stringify(addressForm) });
        setMsg('Address added.');
      }
      setShowAddressForm(false);
      setEditAddressId(null);
      setAddressForm({ addressCode: '', ...EMPTY_ADDRESS });
      loadAddresses(openOrgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAddress(a: OrgAddress) {
    if (!openOrgId) return;
    if (!window.confirm(`Delete address "${a.addressCode}"?`)) return;
    try {
      await api(`/admin/org/organisations/${openOrgId}/addresses/${a.id}`, { method: 'DELETE' });
      setMsg(`Address "${a.addressCode}" deleted.`);
      loadAddresses(openOrgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  function startEditAddress(a: OrgAddress) {
    setAddressForm({
      addressCode: a.addressCode,
      addressLine1: a.addressLine1 ?? '',
      addressLine2: a.addressLine2 ?? '',
      city: a.city ?? '',
      stateProvince: a.stateProvince ?? '',
      postalCode: a.postalCode ?? '',
      country: a.country ?? '',
    });
    setEditAddressId(a.id);
    setShowAddressForm(true);
  }

  // ── Detail-view: "Sites" tab — create/edit a Site scoped to this Org ──
  async function saveSite(e: React.FormEvent) {
    e.preventDefault();
    if (!openOrgId) return;
    setSaving(true); setError(''); setMsg('');
    try {
      const payload = { ...siteForm, orgId: openOrgId };
      if (editSiteId) {
        await api(`/admin/org/sites/${editSiteId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMsg('Site updated.');
      } else {
        await api('/admin/org/sites', { method: 'POST', body: JSON.stringify(payload) });
        setMsg('Site created.');
      }
      setShowSiteForm(false);
      setEditSiteId(null);
      setSiteForm(EMPTY_SITE);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deactivateSite(s: Site) {
    if (!window.confirm(`Deactivate site "${s.siteNum}"? It will be hidden but its historical data is preserved.`)) return;
    try {
      await api(`/admin/org/sites/${s.id}`, { method: 'DELETE' });
      setMsg(`Site "${s.siteNum}" deactivated.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deactivate failed');
    }
  }

  function startEditSite(s: Site) {
    setSiteForm({
      orgId: s.orgId ?? '',
      description: s.description ?? '',
      addressLine1: s.addressLine1 ?? '',
      addressLine2: s.addressLine2 ?? '',
      city: s.city ?? '',
      stateProvince: s.stateProvince ?? '',
      postalCode: s.postalCode ?? '',
      country: s.country ?? '',
      timezone: s.timezone ?? 'UTC',
    });
    setEditSiteId(s.id);
    setShowSiteForm(true);
  }

  // ── Detail view ──────────────────────────────────────────────────────────
  if (openOrg) {
    return (
      <IdentityPageLayout
        title={`Organisation ${openOrg.code}`}
        subtitle={openOrg.description || undefined}
      >
        <button type="button" className="btn-link text-sm mb-2" onClick={() => setOpenOrgId(null)}>
          ← Back to Organisations
        </button>

        {error && <MessageBanner type="error" text={error} />}
        {msg && <MessageBanner type="success" text={msg} />}

        {/* FIX (Maximo parity): the 3 real tabs on an Org detail page */}
        <div className="flex gap-0 border-b border-slate-200">
          {([
            ['organization', 'Organization'],
            ['addresses', `Addresses (${orgAddresses.length})`],
            ['sites', `Sites (${sitesForOpenOrg.length})`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDetailTab(key)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                detailTab === key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Organization tab ──────────────────────────────────────────── */}
        {detailTab === 'organization' && (
          <form onSubmit={saveOrgTab} className="admin-section space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField label="Organisation" htmlFor="org-code" hint="Auto-generated, sequential — cannot be changed">
                <input id="org-code" className="form-input bg-slate-100 cursor-not-allowed" readOnly disabled value={openOrg.code} />
              </FormField>
              <FormField label="Description" htmlFor="org-desc">
                <input id="org-desc" className="form-input" value={orgEditForm.description} onChange={(e) => setOrgEditForm({ ...orgEditForm, description: e.target.value })} />
              </FormField>
              <FormField label="Base Currency 1" htmlFor="org-currency1">
                <CurrencySelect id="org-currency1" value={orgEditForm.baseCurrency} onChange={(v) => setOrgEditForm({ ...orgEditForm, baseCurrency: v })} />
              </FormField>
              <FormField label="Base Currency 2" htmlFor="org-currency2">
                <CurrencySelect id="org-currency2" value={orgEditForm.baseCurrency2} onChange={(v) => setOrgEditForm({ ...orgEditForm, baseCurrency2: v })} />
              </FormField>
              <FormField label="Default Item Status" htmlFor="org-item-status">
                <input id="org-item-status" className="form-input" maxLength={30} value={orgEditForm.defaultItemStatus} onChange={(e) => setOrgEditForm({ ...orgEditForm, defaultItemStatus: sanitizeCode(e.target.value) })} placeholder="PENDING" />
              </FormField>
              <FormField label="Default Stock Category" htmlFor="org-stock-category">
                <input id="org-stock-category" className="form-input" maxLength={30} value={orgEditForm.defaultStockCategory} onChange={(e) => setOrgEditForm({ ...orgEditForm, defaultStockCategory: sanitizeCode(e.target.value) })} placeholder="STK" />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={orgEditForm.isActive} onChange={(e) => setOrgEditForm({ ...orgEditForm, isActive: e.target.checked })} />
              Active
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}

        {/* ── Addresses tab: an Org can have multiple addresses, each with
             its own Address Code. "+ New address" opens a form above the
             list; saved addresses appear as rows below it, same pattern as
             the Sites tab. ─────────────────────────────────────────────── */}
        {detailTab === 'addresses' && (
          <div className="admin-section">
            <div className="flex justify-between items-center">
              <h2 className="admin-section-title">Addresses</h2>
              <button
                type="button"
                className="btn-primary !w-auto px-4"
                onClick={() => {
                  setShowAddressForm((v) => !v);
                  setEditAddressId(null);
                  setAddressForm({ addressCode: '', ...EMPTY_ADDRESS });
                }}
              >
                {showAddressForm && !editAddressId ? 'Cancel' : '+ New address'}
              </button>
            </div>

            {showAddressForm && (
              <form onSubmit={saveAddress} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
                <h3 className="font-semibold text-primary text-sm">{editAddressId ? 'Edit address' : 'New address'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <FormField label="Address Code" htmlFor="addr-code" hint="Alphanumeric, uppercase, up to 30 characters">
                    <input id="addr-code" className="form-input" required maxLength={30} value={addressForm.addressCode} onChange={(e) => setAddressForm({ ...addressForm, addressCode: sanitizeCode(e.target.value) })} placeholder="ALSTOMB004" />
                  </FormField>
                  <FormField label="Address Line 1" htmlFor="addr-line1">
                    <input id="addr-line1" className="form-input" value={addressForm.addressLine1} onChange={(e) => setAddressForm({ ...addressForm, addressLine1: e.target.value })} />
                  </FormField>
                  <FormField label="Address Line 2" htmlFor="addr-line2">
                    <input id="addr-line2" className="form-input" value={addressForm.addressLine2} onChange={(e) => setAddressForm({ ...addressForm, addressLine2: e.target.value })} />
                  </FormField>
                  <FormField label="City" htmlFor="addr-city">
                    <input id="addr-city" className="form-input" value={addressForm.city} onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })} />
                  </FormField>
                  <FormField label="State / Province" htmlFor="addr-state">
                    <input id="addr-state" className="form-input" value={addressForm.stateProvince} onChange={(e) => setAddressForm({ ...addressForm, stateProvince: e.target.value })} />
                  </FormField>
                  <FormField label="Postal Code" htmlFor="addr-postal">
                    <input id="addr-postal" className="form-input" value={addressForm.postalCode} onChange={(e) => setAddressForm({ ...addressForm, postalCode: e.target.value })} />
                  </FormField>
                  <FormField label="Country" htmlFor="addr-country">
                    <input id="addr-country" className="form-input" value={addressForm.country} onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })} />
                  </FormField>
                </div>
                <div className="flex gap-3">
                  <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>{saving ? 'Saving…' : editAddressId ? 'Update' : 'Save'}</button>
                  <button type="button" className="btn-outline text-slate-500" onClick={() => { setShowAddressForm(false); setEditAddressId(null); }}>Cancel</button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Address Code</th>
                    <th>Address</th>
                    <th>City</th>
                    <th>State/Province</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orgAddresses.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-slate-400 py-10">No addresses yet.</td></tr>
                  )}
                  {orgAddresses.map((a) => (
                    <tr key={a.id}>
                      <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{a.addressCode}</code></td>
                      <td className="text-sm text-slate-700">{a.addressLine1 || '—'}</td>
                      <td className="text-sm text-slate-500">{a.city || '—'}</td>
                      <td className="text-sm text-slate-500">{a.stateProvince || '—'}</td>
                      <td>
                        <div className="flex gap-3">
                          <button type="button" className="btn-link text-xs" onClick={() => startEditAddress(a)}>Edit</button>
                          <button type="button" className="btn-danger text-xs" onClick={() => deleteAddress(a)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Sites tab (Maximo parity: nested inside the Org, not a
             separate top-level list) ───────────────────────────────────── */}
        {detailTab === 'sites' && (
          <div className="admin-section">
            <div className="flex justify-between items-center">
              <h2 className="admin-section-title">Sites under Organisation {openOrg.code}</h2>
              <button
                type="button"
                className="btn-primary !w-auto px-4"
                onClick={() => { setShowSiteForm((v) => !v); setEditSiteId(null); setSiteForm(EMPTY_SITE); }}
              >
                {showSiteForm && !editSiteId ? 'Cancel' : '+ New site'}
              </button>
            </div>

            {/* FIX: this is the master Site list an admin manages — each
                Site has its own unique, auto-generated Site code (siteNum).
                A regular (non-admin) user never browses this list directly;
                they instead pick from sites they're permitted to see, once,
                in their own Default Information popup (profile menu →
                Default Information → Default Insert Site). That selection
                is a personal pointer into this same master list, filtered
                to only the Sites their Security Group authorizes — see
                /account/lookups/sites in account.ts and the
                DefaultInformationModal in AccountInfoModals.tsx. */}
            <p className="text-xs text-slate-400 -mt-1">
              Each Site has a unique, auto-generated Site code. Non-admin users don't manage this list — they pick their own
              Default Site (from Sites their Security Group permits) in the profile menu's Default Information screen.
            </p>

            {showSiteForm && (
              <form onSubmit={saveSite} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
                <h3 className="font-semibold text-primary text-sm">{editSiteId ? 'Edit site' : 'New site'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormField label="Site" htmlFor="site-num" hint="Auto-generated, sequential — cannot be changed">
                    {editSiteId ? (
                      <input id="site-num" className="form-input bg-slate-100 cursor-not-allowed" readOnly disabled value={sites.find((s) => s.id === editSiteId)?.siteNum ?? ''} />
                    ) : (
                      <input id="site-num" className="form-input bg-slate-100 cursor-not-allowed" readOnly disabled placeholder="Auto-generated on save" value="" />
                    )}
                  </FormField>
                  <FormField label="Description" htmlFor="site-desc">
                    <input id="site-desc" className="form-input" value={siteForm.description} onChange={(e) => setSiteForm({ ...siteForm, description: e.target.value })} />
                  </FormField>
                  <FormField label="Timezone" htmlFor="site-tz">
                    <input id="site-tz" className="form-input" value={siteForm.timezone} onChange={(e) => setSiteForm({ ...siteForm, timezone: e.target.value })} placeholder="UTC" />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <FormField label="Address Line 1" htmlFor="site-addr1">
                    <input id="site-addr1" className="form-input" value={siteForm.addressLine1} onChange={(e) => setSiteForm({ ...siteForm, addressLine1: e.target.value })} />
                  </FormField>
                  <FormField label="Address Line 2" htmlFor="site-addr2">
                    <input id="site-addr2" className="form-input" value={siteForm.addressLine2} onChange={(e) => setSiteForm({ ...siteForm, addressLine2: e.target.value })} />
                  </FormField>
                  <FormField label="City" htmlFor="site-city">
                    <input id="site-city" className="form-input" value={siteForm.city} onChange={(e) => setSiteForm({ ...siteForm, city: e.target.value })} />
                  </FormField>
                  <FormField label="State / Province" htmlFor="site-state">
                    <input id="site-state" className="form-input" value={siteForm.stateProvince} onChange={(e) => setSiteForm({ ...siteForm, stateProvince: e.target.value })} />
                  </FormField>
                  <FormField label="Postal Code" htmlFor="site-postal">
                    <input id="site-postal" className="form-input" value={siteForm.postalCode} onChange={(e) => setSiteForm({ ...siteForm, postalCode: e.target.value })} />
                  </FormField>
                  <FormField label="Country" htmlFor="site-country">
                    <input id="site-country" className="form-input" value={siteForm.country} onChange={(e) => setSiteForm({ ...siteForm, country: e.target.value })} />
                  </FormField>
                </div>

                <div className="flex gap-3">
                  <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>{saving ? 'Saving…' : editSiteId ? 'Update' : 'Create'}</button>
                  <button type="button" className="btn-outline text-slate-500" onClick={() => { setShowSiteForm(false); setEditSiteId(null); }}>Cancel</button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Description</th>
                    <th>Address</th>
                    <th>Timezone</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sitesForOpenOrg.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-slate-400 py-10">No sites under this organisation yet.</td></tr>
                  )}
                  {sitesForOpenOrg.map((s) => (
                    <tr key={s.id}>
                      <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{s.siteNum}</code></td>
                      <td className="text-sm text-slate-500">{s.description || '—'}</td>
                      <td className="text-xs text-slate-500 max-w-[160px] truncate">{formatAddress(s)}</td>
                      <td className="text-xs text-slate-500">{s.timezone || 'UTC'}</td>
                      <td>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {s.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-3">
                          <button type="button" className="btn-link text-xs" onClick={() => startEditSite(s)}>Edit</button>
                          <button type="button" className="btn-danger text-xs" onClick={() => deactivateSite(s)}>Deactivate</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </IdentityPageLayout>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <IdentityPageLayout
      title="Organisations & Sites"
      subtitle="Manage organisations — click one to view its Organization, Address, and Sites tabs"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <div className="flex justify-between items-center">
          <h2 className="admin-section-title">Organisations</h2>
          <button
            type="button"
            className="btn-primary !w-auto px-4"
            onClick={() => { setShowOrgForm((v) => !v); setOrgForm(EMPTY_ORG); }}
          >
            {showOrgForm ? 'Cancel' : '+ New organisation'}
          </button>
        </div>

        {showOrgForm && (
          <form onSubmit={saveNewOrg} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
            <h3 className="font-semibold text-primary text-sm">New organisation</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField label="Organisation" htmlFor="new-org-code" hint="Auto-generated on save, sequential — cannot be changed">
                <input id="new-org-code" className="form-input bg-slate-100 cursor-not-allowed" readOnly disabled placeholder="Auto-generated on save" value="" />
              </FormField>
              <FormField label="Description" htmlFor="new-org-desc">
                <input id="new-org-desc" className="form-input" value={orgForm.description} onChange={(e) => setOrgForm({ ...orgForm, description: e.target.value })} placeholder="Acme Corporation" />
              </FormField>
              <FormField label="Base Currency 1" htmlFor="new-org-currency1">
                <CurrencySelect id="new-org-currency1" value={orgForm.baseCurrency} onChange={(v) => setOrgForm({ ...orgForm, baseCurrency: v })} />
              </FormField>
              <FormField label="Base Currency 2" htmlFor="new-org-currency2">
                <CurrencySelect id="new-org-currency2" value={orgForm.baseCurrency2} onChange={(v) => setOrgForm({ ...orgForm, baseCurrency2: v })} />
              </FormField>
              <FormField label="Default Item Status" htmlFor="new-org-item-status">
                <input id="new-org-item-status" className="form-input" maxLength={30} value={orgForm.defaultItemStatus} onChange={(e) => setOrgForm({ ...orgForm, defaultItemStatus: sanitizeCode(e.target.value) })} placeholder="PENDING" />
              </FormField>
              <FormField label="Default Stock Category" htmlFor="new-org-stock-category">
                <input id="new-org-stock-category" className="form-input" maxLength={30} value={orgForm.defaultStockCategory} onChange={(e) => setOrgForm({ ...orgForm, defaultStockCategory: sanitizeCode(e.target.value) })} placeholder="STK" />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={orgForm.isActive} onChange={(e) => setOrgForm({ ...orgForm, isActive: e.target.checked })} />
              Active
            </label>
            <p className="text-xs text-slate-400">Address and Sites are added after creation, from the Organisation's own detail page.</p>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
              <button type="button" className="btn-outline text-slate-500" onClick={() => { setShowOrgForm(false); setOrgForm(EMPTY_ORG); }}>Cancel</button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Description</th>
                <th>Sites</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-400 py-10">No organisations yet.</td></tr>
              )}
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td>
                    <button type="button" className="font-medium text-accent hover:underline bg-transparent border-0 cursor-pointer text-left" onClick={() => openOrgDetail(o)}>
                      <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{o.code}</code>
                    </button>
                  </td>
                  <td className="text-sm text-slate-500">{o.description || '—'}</td>
                  <td className="text-sm">{sites.filter((s) => s.orgId === o.id).length}</td>
                  <td>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${o.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {o.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-3">
                      <button type="button" className="btn-link text-xs" onClick={() => openOrgDetail(o)}>Open</button>
                      <button type="button" className="btn-danger text-xs" onClick={() => deactivateOrg(o)}>Deactivate</button>
                    </div>
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
