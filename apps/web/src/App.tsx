import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { isLoggedIn } from './api/client.js';
import { HomePage } from './pages/HomePage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { AccountPage } from './pages/AccountPage.js';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.js';
import { ResetPasswordPage } from './pages/ResetPasswordPage.js';
import { MfaChallengePage } from './pages/MfaChallengePage.js';
import { MfaSetupPage } from './pages/MfaSetupPage.js';
import { AuthNav } from './components/AuthNav.js';
import { useCurrentUser, hasPermission } from './hooks/useCurrentUser.js';
import { AdminIdentityPage } from './pages/admin/identity/UserList.js';
import { UserFormPage } from './pages/admin/identity/UserForm.js';
import { GroupListPage } from './pages/admin/identity/GroupList.js';
import { GroupFormPage } from './pages/admin/identity/GroupForm.js';
import { RoleListPage } from './pages/admin/identity/RoleList.js';
import { RoleFormPage } from './pages/admin/identity/RoleForm.js';
import { SsoConfigPage } from './pages/admin/identity/SsoConfig.js';
import { ConfigEntityListPage } from './pages/admin/config/EntityList.js';
import { ConfigFieldListPage } from './pages/admin/config/FieldList.js';
import { FormDesignerPage } from './pages/admin/config/FormDesigner.js';
import { ReportDesignerPage } from './pages/admin/reporting/ReportDesigner.js';
import { ReportLibraryPage } from './pages/admin/reporting/ReportLibrary.js';
import { ScheduledReportsPage } from './pages/admin/reporting/ScheduledReports.js';
import { BIConnectionsPage } from './pages/admin/reporting/BIConnections.js';
import { BIRlsViewsPage } from './pages/admin/reporting/BIRlsViews.js';
import { DashboardTemplatePage } from './pages/admin/dashboard/DashboardTemplate.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { ChatPage } from './pages/ChatPage.js';
import { SchemaMigrationLogPage } from './pages/admin/schema/SchemaMigrationLog.js';
import { WorkflowListPage } from './pages/admin/workflows/WorkflowList.js';
import { WorkflowDesignerPage } from './pages/admin/workflows/WorkflowDesigner.js';
import { ConnectionListPage } from './pages/admin/integrations/ConnectionList.js';
import { IntegrationJobsPage } from './pages/admin/integrations/IntegrationJobs.js';
import { WebhookConfigPage } from './pages/admin/integrations/WebhookConfig.js';
import { IntegrationHistoryPage } from './pages/admin/integrations/IntegrationHistory.js';
import { ApiKeyManagerPage } from './pages/admin/integrations/ApiKeyManager.js';
import { DocumentTypesPage } from './pages/admin/attachments/DocumentTypes.js';
import { AttachmentLibraryPage } from './pages/admin/attachments/AttachmentLibrary.js';
import { RetentionPoliciesPage } from './pages/admin/attachments/RetentionPolicies.js';
import { ScanConfigPage } from './pages/admin/attachments/ScanConfig.js';
import { NotificationTemplatesPage } from './pages/admin/notifications/NotificationTemplates.js';
import { NotificationBell } from './components/NotificationBell.js';
import { NotificationTriggersPage } from './pages/admin/notifications/NotificationTriggers.js';
import { SmtpConfigPage } from './pages/admin/notifications/SmtpConfig.js';
import { SmsConfigPage } from './pages/admin/notifications/SmsConfig.js';
import { DeliveryLogPage } from './pages/admin/notifications/DeliveryLog.js';
import { BounceListPage } from './pages/admin/notifications/BounceList.js';
import { UserNotificationPrefsPage } from './pages/admin/notifications/UserNotificationPrefs.js';
import { LocationTreePage } from './pages/assets/LocationTree.js';
import { LocationDetailPage } from './pages/assets/LocationDetail.js';
import { FailureCodesPage } from './pages/assets/FailureCodes.js';
import { SRCategoriesPage } from './pages/service-requests/SRCategories.js';
import { PMRouteListPage } from './pages/pm/PMRouteList.js';
import { PMRouteDetailPage } from './pages/pm/PMRouteDetail.js';
import { PermitTypesPage } from './pages/permits/PermitTypes.js';
import { AssetListPage } from './pages/assets/AssetList.js';
import { AssetFormPage } from './pages/assets/AssetForm.js';
import { AssetImportPage } from './pages/assets/AssetImport.js';
import { AssetDetailPage } from './pages/assets/AssetDetail.js';
import { SRListPage } from './pages/service-requests/SRList.js';
import { SRFormPage } from './pages/service-requests/SRForm.js';
import { SRDetailPage } from './pages/service-requests/SRDetail.js';
import { WOListPage } from './pages/work-orders/WOList.js';
import { WOFormPage } from './pages/work-orders/WOForm.js';
import { WODetailPage } from './pages/work-orders/WODetail.js';
import { JobPlanListPage } from './pages/job-plans/JobPlanList.js';
import { JobPlanDetailPage } from './pages/job-plans/JobPlanDetail.js';
import { JobPlanFormPage } from './pages/job-plans/JobPlanForm.js';
import { PMMasterListPage } from './pages/pm/PMMasterList.js';
import { PMFormPage } from './pages/pm/PMForm.js';
import { PMDetailPage } from './pages/pm/PMDetail.js';
import { PMForecastPage } from './pages/pm/PMForecast.js';
import { PermitListPage } from './pages/permits/PermitList.js';
import { PermitDetailPage } from './pages/permits/PermitDetail.js';
import { PermitFormPage } from './pages/permits/PermitForm.js';
import { ItemMasterListPage } from './pages/inventory/ItemMasterList.js';
import { ItemDetailPage } from './pages/inventory/ItemDetail.js';
import { StoreroomListPage } from './pages/inventory/StoreroomList.js';
import { StoreroomDetailPage } from './pages/inventory/StoreroomDetail.js';
import { TransactionLogPage } from './pages/inventory/TransactionLog.js';
import { LabourPage } from './pages/labour/LabourPage.js';
import { StandardReportsPage } from './pages/StandardReports.js';
import { OrgStructurePage } from './pages/admin/org/OrgStructure.js';
import { PicklistManagerPage } from './pages/admin/config/PicklistManager.js';
import { StatusModelPage } from './pages/admin/config/StatusModel.js';
import { ConfigVersionsPage } from './pages/admin/config/ConfigVersions.js';
import { TableDesignerPage } from './pages/admin/config/TableDesigner.js';

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ── Modern sidebar nav link ──────────────────────────────────────────────────
function SidebarLink({ to, label, icon }: { to: string; label: string; icon?: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = pathname === to || pathname.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      className={`app-sidebar-link${active ? ' app-sidebar-link-active' : ''}`}
    >
      {icon && <span style={{ opacity: active ? 1 : 0.6, display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {label}
    </Link>
  );
}

// ── SVG icon helpers ─────────────────────────────────────────────────────────
const ChevronDown = ({ open }: { open: boolean }) => (
  <svg
    width="12" height="12" viewBox="0 0 12 12" fill="none"
    stroke="currentColor" strokeWidth="1.8"
    style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', marginLeft: 'auto', flexShrink: 0 }}
  >
    <path d="M2 4l4 4 4-4" />
  </svg>
);

// ── Collapsible sidebar section ──────────────────────────────────────────────
// FIX: this is now a true accordion. Open/closed state for every section
// lives in ONE place — the parent <App> component's `openSection` state —
// instead of each section owning its own independent `useState`. With
// independent state, clicking one section never affected the others, so
// multiple sections could stay expanded at once, and a section that was
// open from a previous page never auto-collapsed when you navigated
// somewhere else. Now: clicking a section's header sets it as the single
// "open" id; clicking it again closes it; clicking a different section's
// header switches to that one and implicitly closes the previous one —
// exactly one section open at a time.
function CollapsibleSection({
  id,
  label,
  children,
  paths = [],
  icon,
  isOpen,
  onToggle,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  paths?: string[];
  icon?: React.ReactNode;
  isOpen: boolean;
  onToggle: (id: string) => void;
}) {
  const { pathname } = useLocation();
  const isChildActive = paths.some((p) => pathname === p || pathname.startsWith(p + '/'));

  return (
    <div style={{ marginBottom: '1px' }}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={`app-sidebar-group-btn${isChildActive ? ' app-sidebar-group-btn-active' : ''}`}
      >
        {icon && <span style={{ display: 'flex', alignItems: 'center', opacity: 0.6 }}>{icon}</span>}
        <span>{label}</span>
        <ChevronDown open={isOpen} />
      </button>
      {isOpen && (
        <nav className="app-sidebar-sub-nav">
          {children}
        </nav>
      )}
    </div>
  );
}

// ── Logo mark SVG ────────────────────────────────────────────────────────────
function LogoMark() {
  return (
    <span className="app-logo-mark">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="5" height="5" rx="1" fill="rgba(255,255,255,0.9)" />
        <rect x="9" y="2" width="5" height="5" rx="1" fill="rgba(255,255,255,0.6)" />
        <rect x="2" y="9" width="5" height="5" rx="1" fill="rgba(255,255,255,0.6)" />
        <rect x="9" y="9" width="5" height="5" rx="1" fill="rgba(255,255,255,0.9)" />
      </svg>
    </span>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { user, authenticated } = useCurrentUser();

  const canReadAssets          = hasPermission(user, 'assets:read');
  const canReadWO              = hasPermission(user, 'work_orders:read');
  const canReadSR              = hasPermission(user, 'service_requests:read');
  const canReadInventory       = hasPermission(user, 'inventory:read');
  const canReadPermits         = hasPermission(user, 'permits:read');
  const canReadPM              = hasPermission(user, 'pm:read');
  // FIX: People (Labour & Crews) and Reports sidebar sections were both
  // gated by canReadWO (work_orders:read) — a copy-paste leftover, not
  // their own labour:read/reports:read permissions. Any user with WO
  // access saw both sections regardless of whether their Security
  // Group's Permissions list actually granted labour:read or
  // reports:read, matching the same gap just fixed on the backend
  // (labour.ts's guards, and reports.ts's new reportsReadGuard).
  const canReadLabour          = hasPermission(user, 'labour:read');
  const canReadReports         = hasPermission(user, 'reports:read');
  const canManageIdentity      = hasPermission(user, 'admin:users:manage');
  const canManageConfig        = hasPermission(user, 'admin:config:manage');
  const canManageReporting     = hasPermission(user, 'admin:reporting:manage');
  const canManageWorkflows     = hasPermission(user, 'admin:workflows:manage');
  const canManageIntegrations  = hasPermission(user, 'admin:integrations:manage');
  const canManageAttachments   = hasPermission(user, 'admin:attachments:manage');
  const canManageNotifications = hasPermission(user, 'admin:notifications:manage');

  const { pathname } = useLocation();

  // ── Single source of truth for "which sidebar section is open" ───────────
  // FIX: one piece of state for the whole sidebar, not one per section.
  const SECTION_PATHS: Record<string, string[]> = {
    assets: ['/assets', '/locations', '/failure-codes'],
    service: ['/service-requests', '/sr-categories'],
    maintenance: ['/work-orders', '/job-plans', '/pm', '/pm-routes'],
    safety: ['/permits', '/admin/permit-types'],
    inventory: ['/inventory'],
    people: ['/labour'],
    reports: ['/reports'],
    identity: ['/admin/identity'],
    configuration: ['/admin/config'],
    schemaWorkflows: ['/admin/schema', '/admin/workflows'],
    integrations: ['/admin/integrations'],
    attachments: ['/admin/attachments'],
    reporting: ['/admin/reporting'],
    orgManagement: ['/admin/org'],
    notifications: ['/admin/notifications'],
  };

  function sectionForPath(path: string): string | null {
    for (const [id, paths] of Object.entries(SECTION_PATHS)) {
      if (paths.some((p) => path === p || path.startsWith(p + '/'))) return id;
    }
    return null;
  }

  const [openSection, setOpenSection] = useState<string | null>(() => sectionForPath(pathname));

  // ── Sidebar visibility toggle (hamburger icon in topbar) ──────────────────
  // FIX: real Maximo's resolved Display/Hide/Use-setting-from-security-
  // group choice (see auth.ts effectiveSideNav) decides the *starting*
  // state here — defaults to true (visible) until /auth/me resolves,
  // matching groups' own "off is something an admin chooses" default so
  // the sidebar doesn't flash hidden during the brief loading window.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarUserToggled, setSidebarUserToggled] = useState(false);

  // Apply the resolved server value once it loads — but only if the user
  // hasn't already manually clicked the hamburger toggle this session;
  // a manual click should win for the rest of the session even if the
  // user object re-fetches in the background.
  useEffect(() => {
    if (!sidebarUserToggled && user?.effectiveSideNav !== undefined) {
      setSidebarOpen(user.effectiveSideNav);
    }
  }, [user?.effectiveSideNav, sidebarUserToggled]);

  // FIX: when navigating to a page that belongs to a different section,
  // automatically open that section. Since openSection only ever holds
  // one id, this implicitly closes whichever section was open before.
  useEffect(() => {
    const matchedSection = sectionForPath(pathname);
    if (matchedSection) setOpenSection(matchedSection);
  }, [pathname]);

  function toggleSection(id: string) {
    setOpenSection((current) => (current === id ? null : id));
  }

  const PAGE_TITLES: [string, string, string?][] = [
    ['/assets', 'Assets', 'Equipment, machinery and infrastructure register'],
    ['/locations', 'Locations'],
    ['/failure-codes', 'Failure Codes'],
    ['/service-requests', 'Service Requests', 'Customer and internal service tickets'],
    ['/sr-categories', 'Service Request Categories'],
    ['/work-orders', 'Work Orders', 'Maintenance and corrective work'],
    ['/job-plans', 'Job Plans', 'Reusable task and resource templates'],
    ['/pm', 'Preventive Maintenance', 'Scheduled maintenance programs'],
    ['/pm-routes', 'PM Routes', 'Route-based PM — many assets, one visit'],
    ['/permits', 'Permits to Work', 'Safety authorisation for hazardous work'],
    ['/admin/permit-types', 'Permit Types', 'Configure checklist templates and approver roles per permit type'],
    ['/inventory', 'Inventory', 'Stock, items and storerooms'],
    ['/people', 'People', 'Crew, contractors and contacts'],
    ['/reports', 'Reports'],
    ['/admin/dashboard-templates', 'Dashboard Templates', 'Set default layouts per role'],
    ['/dashboard', 'Dashboard'],
    ['/admin/identity', 'Identity & Access'],
    ['/admin/config', 'Configuration'],
    ['/admin/notifications', 'Notifications'],
    ['/admin/identity/sms-config', 'SMS OTP Configuration', 'Configure SMS provider for MFA one-time passwords'],
    ['/admin/integrations/api-keys', 'API Keys', 'Manage per-consumer API tokens'],
    ['/admin/integrations', 'Integrations'],
    ['/admin/reporting', 'Reporting'],
    ['/admin/schema', 'Schema & Workflows'],
    ['/admin/attachments', 'Attachments'],
    ['/admin/org', 'Org & Sites'],
    ['/account', 'My Account'],
    ['/chat', 'Chat'],
  ];

  const matched = PAGE_TITLES.find(([path]) => pathname === path || pathname.startsWith(path + '/'));
  const topbarTitle = matched?.[1] ?? 'EAM Platform';
  const topbarSub   = matched?.[2];

  const showEamNav =
    authenticated &&
    (canReadAssets || canReadWO || canReadSR || canReadInventory || canReadPermits || canReadPM);

  const showAdminNav =
    authenticated &&
    (canManageIdentity || canManageConfig || canManageReporting ||
     canManageWorkflows || canManageIntegrations || canManageAttachments || canManageNotifications);

  const publicPaths = ['/', '/login', '/login/mfa', '/register', '/forgot-password', '/reset-password'];
  const isPublicPage = publicPaths.some((p) => pathname === p);

  // User initials for avatar
  const userInitials = user
    ? (user.displayName
        ? user.displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
        : user.email[0]?.toUpperCase())
    : '';

  return (
    <div className={isPublicPage ? '' : 'app-shell'}>
      {!isPublicPage && sidebarOpen && (
        <aside className="app-sidebar">
          {/* ── Logo ── */}
          <Link to="/" className="app-sidebar-logo">
            <LogoMark />
            <div>
              <div className="app-sidebar-logo-text">EAM Platform</div>
              
            </div>
          </Link>

          {/* ── Primary nav ── */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '12px' }}>
            {authenticated && (
              <nav className="app-sidebar-nav" aria-label="Main" style={{ paddingTop: '10px' }}>
                <SidebarLink to="/dashboard" label="Dashboard" />
                <SidebarLink to="/chat" label="Chat" />
                <SidebarLink to="/account" label="Account" />
              </nav>
            )}

            {showEamNav && (
              <>
                <div className="app-sidebar-divider" />
                <div className="app-sidebar-section-label">Operations</div>

                {canReadAssets && (
                  <CollapsibleSection id="assets" label="Assets" paths={SECTION_PATHS.assets}
                    isOpen={openSection === 'assets'} onToggle={toggleSection}>
                    <SidebarLink to="/assets" label="Asset Register" />
                    <SidebarLink to="/locations" label="Locations" />
                    <SidebarLink to="/failure-codes" label="Failure Codes" />
                  </CollapsibleSection>
                )}

                {canReadSR && (
                  <CollapsibleSection id="service" label="Service" paths={SECTION_PATHS.service}
                    isOpen={openSection === 'service'} onToggle={toggleSection}>
                    <SidebarLink to="/service-requests" label="Service Requests" />
                    <SidebarLink to="/sr-categories" label="Categories" />
                  </CollapsibleSection>
                )}

                {canReadWO && (
                  <CollapsibleSection id="maintenance" label="Maintenance" paths={SECTION_PATHS.maintenance}
                    isOpen={openSection === 'maintenance'} onToggle={toggleSection}>
                    <SidebarLink to="/work-orders" label="Work Orders" />
                    <SidebarLink to="/job-plans" label="Job Plans" />
                    <SidebarLink to="/pm" label="PM Masters" />
                    <SidebarLink to="/pm-routes" label="PM Routes" />
                    <SidebarLink to="/pm/forecast" label="PM Forecast" />
                  </CollapsibleSection>
                )}

                {canReadPermits && (
                  <CollapsibleSection id="safety" label="Safety" paths={SECTION_PATHS.safety}
                    isOpen={openSection === 'safety'} onToggle={toggleSection}>
                    <SidebarLink to="/permits" label="Permits to Work" />
                    <SidebarLink to="/admin/permit-types" label="Permit Types" />
                  </CollapsibleSection>
                )}

                {canReadInventory && (
                  <CollapsibleSection id="inventory" label="Inventory" paths={SECTION_PATHS.inventory}
                    isOpen={openSection === 'inventory'} onToggle={toggleSection}>
                    <SidebarLink to="/inventory" label="Item Master" />
                    <SidebarLink to="/inventory/transactions" label="Transactions" />
                  </CollapsibleSection>
                )}

                {canReadLabour && (
                  <CollapsibleSection id="people" label="People" paths={SECTION_PATHS.people}
                    isOpen={openSection === 'people'} onToggle={toggleSection}>
                    <SidebarLink to="/labour" label="Labour & Crews" />
                  </CollapsibleSection>
                )}

                {canReadReports && (
                  <CollapsibleSection id="reports" label="Reports" paths={SECTION_PATHS.reports}
                    isOpen={openSection === 'reports'} onToggle={toggleSection}>
                    <SidebarLink to="/reports/standard" label="Standard Reports" />
                  </CollapsibleSection>
                )}
              </>
            )}

            {showAdminNav && (
              <>
                <div className="app-sidebar-divider" />
                <div className="app-sidebar-section-label">Administration</div>

                {canManageIdentity && (
                  <CollapsibleSection id="identity" label="Identity" paths={SECTION_PATHS.identity}
                    isOpen={openSection === 'identity'} onToggle={toggleSection}>
                    <SidebarLink to="/admin/identity/users" label="Users" />
                    <SidebarLink to="/admin/identity/groups" label="Groups" />
                    <SidebarLink to="/admin/identity/roles" label="Roles" />
                    <SidebarLink to="/admin/identity/providers" label="SSO" />
                    <SidebarLink to="/admin/identity/sms-config" label="SMS OTP" />
                  </CollapsibleSection>
                )}

                {canManageConfig && (
                  <CollapsibleSection id="configuration" label="Configuration" paths={SECTION_PATHS.configuration}
                    isOpen={openSection === 'configuration'} onToggle={toggleSection}>
                    <SidebarLink to="/admin/config" label="Entities & Fields" />
                    <SidebarLink to="/admin/config/picklists" label="Picklists" />
                    <SidebarLink to="/admin/config/status-model" label="Status Model" />
                    <SidebarLink to="/admin/dashboard-templates" label="Dashboard Templates" />
                    <SidebarLink to="/admin/config/versions" label="Config Versions" />
                  </CollapsibleSection>
                )}

                {canManageWorkflows && (
                  <CollapsibleSection id="schemaWorkflows" label="Schema & Workflows" paths={SECTION_PATHS.schemaWorkflows}
                    isOpen={openSection === 'schemaWorkflows'} onToggle={toggleSection}>
                    <SidebarLink to="/admin/schema/migrations" label="Schema Migrations" />
                    <SidebarLink to="/admin/workflows" label="Workflows" />
                  </CollapsibleSection>
                )}

                {canManageIntegrations && (
                  <CollapsibleSection id="integrations" label="Integrations" paths={SECTION_PATHS.integrations}
                    isOpen={openSection === 'integrations'} onToggle={toggleSection}>
                    <SidebarLink to="/admin/integrations/connections" label="Connections" />
                    <SidebarLink to="/admin/integrations/jobs" label="Scheduled Jobs" />
                    <SidebarLink to="/admin/integrations/webhooks" label="Webhooks" />
                    <SidebarLink to="/admin/integrations/api-keys" label="API Keys" />
                    <SidebarLink to="/admin/integrations/history" label="Run History" />
                  </CollapsibleSection>
                )}

                {canManageAttachments && (
                  <CollapsibleSection id="attachments" label="Attachments" paths={SECTION_PATHS.attachments}
                    isOpen={openSection === 'attachments'} onToggle={toggleSection}>
                    <SidebarLink to="/admin/attachments/document-types" label="Document Types" />
                    <SidebarLink to="/admin/attachments/library" label="File Library" />
                    <SidebarLink to="/admin/attachments/scan-config" label="Scan Config" />
                    <SidebarLink to="/admin/attachments/retention" label="Retention" />
                  </CollapsibleSection>
                )}

                {canManageReporting && (
                  <CollapsibleSection id="reporting" label="Reporting" paths={SECTION_PATHS.reporting}
                    isOpen={openSection === 'reporting'} onToggle={toggleSection}>
                    <SidebarLink to="/admin/reporting/library" label="Reports" />
                    <SidebarLink to="/admin/reporting/designer" label="Report Designer" />
                    <SidebarLink to="/admin/reporting/schedules" label="Schedules" />
                    <SidebarLink to="/admin/reporting/bi" label="BI Connections" />
                    <SidebarLink to="/admin/reporting/bi-rls" label="BI RLS Views" />
                  </CollapsibleSection>
                )}

                {canManageConfig && (
                  <CollapsibleSection id="orgManagement" label="Org Management" paths={SECTION_PATHS.orgManagement}
                    isOpen={openSection === 'orgManagement'} onToggle={toggleSection}>
                    <SidebarLink to="/admin/org" label="Organisations & Sites" />
                    <SidebarLink to="/admin/config/status-model" label="Status Model" />
                  </CollapsibleSection>
                )}

                {canManageNotifications && (
                  <CollapsibleSection id="notifications" label="Notifications" paths={SECTION_PATHS.notifications}
                    isOpen={openSection === 'notifications'} onToggle={toggleSection}>
                    <SidebarLink to="/admin/notifications/templates" label="Templates" />
                    <SidebarLink to="/admin/notifications/triggers" label="Triggers" />
                    <SidebarLink to="/admin/notifications/smtp" label="SMTP Config" />
                    <SidebarLink to="/admin/notifications/delivery-log" label="Delivery Log" />
                    <SidebarLink to="/admin/notifications/bounce-list" label="Bounce List" />
                    <SidebarLink to="/admin/notifications/my-prefs" label="My Preferences" />
                  </CollapsibleSection>
                )}
              </>
            )}
          </div>

          {/* ── User footer ── */}
          {user && (
            <div style={{
              padding: '10px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <Link
                to="/account"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              >
                <span style={{
                  width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                  background: 'linear-gradient(135deg, #c45608, #E8650A)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700, color: '#fff',
                }}>
                  {userInitials}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.88)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.displayName || user.email}
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>View profile</div>
                </div>
              </Link>
            </div>
          )}
        </aside>
      )}

      <div className={isPublicPage ? 'w-full' : 'app-main'}>
        {!isPublicPage && (
          <header className="app-topbar">
            {/* Left: sidebar toggle + brand name + page title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {/* FIX: replaced the plain 3-line hamburger with a
                  collapse/expand-style icon — 3 horizontal lines plus a
                  chevron that flips direction with sidebarOpen (points
                  right when collapsed, i.e. "expand me"; points left when
                  open, i.e. "collapse me"), matching the reference icon. */}
              {/* FIX: removed the boxed look (background/border/rounded
                  corners) — just the bare icon now, hover feedback via
                  opacity instead of a visible button shape. */}
              <button
                type="button"
                onClick={() => { setSidebarOpen((v) => !v); setSidebarUserToggled(true); }}
                title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                style={{
                  width: '34px', height: '34px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer', color: 'rgba(255,255,255,0.85)',
                  opacity: 0.85,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.85')}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  {/* 3 horizontal bars, shortest at top (matches reference) */}
                  <path d="M2 5h7" />
                  <path d="M2 9h14" />
                  <path d="M2 13h14" />
                  {/* Chevron — right-pointing when collapsed (click to expand),
                      left-pointing when open (click to collapse) */}
                  {sidebarOpen ? (
                    <path d="M13.5 5.5l-3 3.5 3 3.5" />
                  ) : (
                    <path d="M11.5 5.5l3 3.5-3 3.5" />
                  )}
                </svg>
              </button>
              {/* FIX: removed the "EAM Platform" link here — it duplicated
                  the brand name already shown in the sidebar logo, and
                  the topbar should show only the current page's title. */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', marginLeft: '6px' }}>
                <span style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 600, fontSize: '14px', lineHeight: 1.2 }}>
                  {topbarTitle}
                </span>
                {topbarSub && (
                  <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: '11px', marginTop: '1px' }}>
                    {topbarSub}
                  </span>
                )}
              </div>
            </div>

            {/* Right: actions */}
            <div className="app-topbar-actions">
              {user && <NotificationBell />}
              <AuthNav />
            </div>
          </header>
        )}

        <div className="app-content">
          <Routes>
            {/* ── Public pages ── */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/login/mfa" element={<MfaChallengePage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* ── Authenticated routes ── */}
            <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
            <Route path="/account/mfa/setup" element={<RequireAuth><MfaSetupPage /></RequireAuth>} />
            <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
            <Route path="/admin/dashboard-templates" element={<RequireAuth><DashboardTemplatePage /></RequireAuth>} />
            <Route path="/chat" element={<RequireAuth><ChatPage /></RequireAuth>} />

            {/* Identity */}
            <Route path="/admin/identity/users" element={<RequireAuth><AdminIdentityPage /></RequireAuth>} />
            <Route path="/admin/identity/users/:id" element={<RequireAuth><UserFormPage /></RequireAuth>} />
            <Route path="/admin/identity/groups" element={<RequireAuth><GroupListPage /></RequireAuth>} />
            <Route path="/admin/identity/groups/:id" element={<RequireAuth><GroupFormPage /></RequireAuth>} />
            <Route path="/admin/identity/roles" element={<RequireAuth><RoleListPage /></RequireAuth>} />
            <Route path="/admin/identity/roles/:id" element={<RequireAuth><RoleFormPage /></RequireAuth>} />
            <Route path="/admin/identity/providers" element={<RequireAuth><SsoConfigPage /></RequireAuth>} />

            {/* Configuration */}
            <Route path="/admin/config" element={<RequireAuth><ConfigEntityListPage /></RequireAuth>} />
            <Route path="/admin/config/entities/:entityId/fields" element={<RequireAuth><ConfigFieldListPage /></RequireAuth>} />
            <Route path="/admin/config/entities/:entityId/forms" element={<RequireAuth><FormDesignerPage /></RequireAuth>} />
            <Route path="/admin/config/entities/:entityId/table" element={<RequireAuth><TableDesignerPage /></RequireAuth>} />
            <Route path="/admin/config/picklists" element={<RequireAuth><PicklistManagerPage /></RequireAuth>} />
            <Route path="/admin/config/status-model" element={<RequireAuth><StatusModelPage /></RequireAuth>} />
            <Route path="/admin/config/versions" element={<RequireAuth><ConfigVersionsPage /></RequireAuth>} />

            {/* Schema & Workflows */}
            <Route path="/admin/schema/migrations" element={<RequireAuth><SchemaMigrationLogPage /></RequireAuth>} />
            <Route path="/admin/workflows" element={<RequireAuth><WorkflowListPage /></RequireAuth>} />
            <Route path="/admin/workflows/:id" element={<RequireAuth><WorkflowDesignerPage /></RequireAuth>} />
            <Route path="/admin/workflows/:id/history" element={<RequireAuth><WorkflowDesignerPage /></RequireAuth>} />

            {/* Integrations */}
            <Route path="/admin/integrations/connections" element={<RequireAuth><ConnectionListPage /></RequireAuth>} />
            <Route path="/admin/integrations/jobs" element={<RequireAuth><IntegrationJobsPage /></RequireAuth>} />
            <Route path="/admin/integrations/webhooks" element={<RequireAuth><WebhookConfigPage /></RequireAuth>} />
            <Route path="/admin/integrations/history" element={<RequireAuth><IntegrationHistoryPage /></RequireAuth>} />
            <Route path="/admin/integrations/api-keys" element={<RequireAuth><ApiKeyManagerPage /></RequireAuth>} />

            {/* Attachments */}
            <Route path="/admin/attachments/document-types" element={<RequireAuth><DocumentTypesPage /></RequireAuth>} />
            <Route path="/admin/attachments/library" element={<RequireAuth><AttachmentLibraryPage /></RequireAuth>} />
            <Route path="/admin/attachments/scan-config" element={<RequireAuth><ScanConfigPage /></RequireAuth>} />
            <Route path="/admin/attachments/retention" element={<RequireAuth><RetentionPoliciesPage /></RequireAuth>} />

            {/* Reporting */}
            <Route path="/admin/reporting/designer" element={<RequireAuth><ReportDesignerPage /></RequireAuth>} />
            <Route path="/admin/reporting/library" element={<RequireAuth><ReportLibraryPage /></RequireAuth>} />
            <Route path="/admin/reporting/schedules" element={<RequireAuth><ScheduledReportsPage /></RequireAuth>} />
            <Route path="/admin/reporting/bi" element={<RequireAuth><BIConnectionsPage /></RequireAuth>} />
            <Route path="/admin/reporting/bi-rls" element={<RequireAuth><BIRlsViewsPage /></RequireAuth>} />

            {/* Org */}
            <Route path="/admin/org" element={<RequireAuth><OrgStructurePage /></RequireAuth>} />

            {/* Notifications */}
            <Route path="/admin/notifications/templates" element={<RequireAuth><NotificationTemplatesPage /></RequireAuth>} />
            <Route path="/admin/notifications/triggers" element={<RequireAuth><NotificationTriggersPage /></RequireAuth>} />
            <Route path="/admin/notifications/smtp" element={<RequireAuth><SmtpConfigPage /></RequireAuth>} />
            <Route path="/admin/identity/sms-config" element={<RequireAuth><SmsConfigPage /></RequireAuth>} />
            <Route path="/admin/notifications/my-prefs" element={<RequireAuth><UserNotificationPrefsPage /></RequireAuth>} />
            <Route path="/admin/notifications/delivery-log" element={<RequireAuth><DeliveryLogPage /></RequireAuth>} />
            <Route path="/admin/notifications/bounce-list" element={<RequireAuth><BounceListPage /></RequireAuth>} />

            {/* EAM modules */}
            <Route path="/locations" element={<RequireAuth><LocationTreePage /></RequireAuth>} />
            <Route path="/locations/:id" element={<RequireAuth><LocationDetailPage /></RequireAuth>} />
            <Route path="/failure-codes" element={<RequireAuth><FailureCodesPage /></RequireAuth>} />
            <Route path="/sr-categories" element={<RequireAuth><SRCategoriesPage /></RequireAuth>} />
            <Route path="/pm-routes" element={<RequireAuth><PMRouteListPage /></RequireAuth>} />
            <Route path="/pm-routes/:id" element={<RequireAuth><PMRouteDetailPage /></RequireAuth>} />
            <Route path="/admin/permit-types" element={<RequireAuth><PermitTypesPage /></RequireAuth>} />
            <Route path="/assets" element={<RequireAuth><AssetListPage /></RequireAuth>} />
            <Route path="/assets/new" element={<RequireAuth><AssetFormPage /></RequireAuth>} />
            <Route path="/assets/import" element={<RequireAuth><AssetImportPage /></RequireAuth>} />
            <Route path="/assets/:id" element={<RequireAuth><AssetDetailPage /></RequireAuth>} />
            <Route path="/assets/:id/edit" element={<RequireAuth><AssetFormPage /></RequireAuth>} />
            <Route path="/service-requests" element={<RequireAuth><SRListPage /></RequireAuth>} />
            <Route path="/service-requests/new" element={<RequireAuth><SRFormPage /></RequireAuth>} />
            <Route path="/service-requests/:id" element={<RequireAuth><SRDetailPage /></RequireAuth>} />
            <Route path="/service-requests/:id/edit" element={<RequireAuth><SRFormPage /></RequireAuth>} />
            <Route path="/work-orders" element={<RequireAuth><WOListPage /></RequireAuth>} />
            <Route path="/work-orders/new" element={<RequireAuth><WOFormPage /></RequireAuth>} />
            <Route path="/work-orders/:id" element={<RequireAuth><WODetailPage /></RequireAuth>} />
            <Route path="/work-orders/:id/edit" element={<RequireAuth><WOFormPage /></RequireAuth>} />
            <Route path="/job-plans" element={<RequireAuth><JobPlanListPage /></RequireAuth>} />
            <Route path="/job-plans/new" element={<RequireAuth><JobPlanFormPage /></RequireAuth>} />
            <Route path="/job-plans/:id" element={<RequireAuth><JobPlanDetailPage /></RequireAuth>} />
            <Route path="/job-plans/:id/edit" element={<RequireAuth><JobPlanDetailPage /></RequireAuth>} />
            <Route path="/pm" element={<RequireAuth><PMMasterListPage /></RequireAuth>} />
            <Route path="/pm/new" element={<RequireAuth><PMFormPage /></RequireAuth>} />
            <Route path="/pm/forecast" element={<RequireAuth><PMForecastPage /></RequireAuth>} />
            <Route path="/pm/:id" element={<RequireAuth><PMDetailPage /></RequireAuth>} />
            <Route path="/permits" element={<RequireAuth><PermitListPage /></RequireAuth>} />
            <Route path="/permits/new" element={<RequireAuth><PermitFormPage /></RequireAuth>} />
            <Route path="/permits/:id" element={<RequireAuth><PermitDetailPage /></RequireAuth>} />
            <Route path="/inventory" element={<RequireAuth><ItemMasterListPage /></RequireAuth>} />
            <Route path="/inventory/transactions" element={<RequireAuth><TransactionLogPage /></RequireAuth>} />
            <Route path="/inventory/storerooms" element={<RequireAuth><StoreroomListPage /></RequireAuth>} />
            <Route path="/inventory/storerooms/:id" element={<RequireAuth><StoreroomDetailPage /></RequireAuth>} />
            <Route path="/inventory/:id" element={<RequireAuth><ItemDetailPage /></RequireAuth>} />
            <Route path="/labour" element={<RequireAuth><LabourPage /></RequireAuth>} />
            <Route path="/reports/standard" element={<RequireAuth><StandardReportsPage /></RequireAuth>} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
