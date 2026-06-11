import React, { useState } from 'react';
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
import { DeliveryLogPage } from './pages/admin/notifications/DeliveryLog.js';
import { BounceListPage } from './pages/admin/notifications/BounceList.js';
import { UserNotificationPrefsPage } from './pages/admin/notifications/UserNotificationPrefs.js';
import { LocationTreePage } from './pages/assets/LocationTree.js';
import { AssetListPage } from './pages/assets/AssetList.js';
import { AssetFormPage } from './pages/assets/AssetForm.js';
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
import { StoreroomListPage } from './pages/inventory/StoreroomList.js';
import { TransactionLogPage } from './pages/inventory/TransactionLog.js';
import { LabourPage } from './pages/labour/LabourPage.js';
import { StandardReportsPage } from './pages/StandardReports.js';
import { OrgStructurePage } from './pages/admin/org/OrgStructure.js';
import { PicklistManagerPage } from './pages/admin/config/PicklistManager.js';
import { StatusModelPage } from './pages/admin/config/StatusModel.js';
import { ConfigVersionsPage } from './pages/admin/config/ConfigVersions.js';
import { TableDesignerPage } from './pages/admin/config/TableDesigner.js';

// ── Route guard — redirects unauthenticated users to /login ────────────────
function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function SidebarLink({ to, label }: { to: string; label: string }) {
  const { pathname } = useLocation();
  const active = pathname === to || pathname.startsWith(`${to}/`);
  return (
    <Link to={to} className={`app-sidebar-link ${active ? 'app-sidebar-link-active' : ''}`}>
      {label}
    </Link>
  );
}

function CollapsibleSection({
  label,
  children,
  paths = [],
}: {
  label: string;
  children: React.ReactNode;
  paths?: string[];
}) {
  const { pathname } = useLocation();
  const isChildActive = paths.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const [open, setOpen] = useState(isChildActive);

  return (
    <div style={{ marginBottom: '2px' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '8px 12px',
          background: isChildActive ? 'rgba(234, 88, 12, 0.25)' : 'rgba(255,255,255,0.07)',
          border: isChildActive ? '1px solid rgba(234,88,12,0.4)' : '1px solid transparent',
          borderLeft: isChildActive ? '3px solid rgb(234,88,12)' : '3px solid transparent',
          borderRadius: '6px',
          cursor: 'pointer',
          color: isChildActive ? 'rgb(255,255,255)' : 'rgba(255,255,255,0.75)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          transition: 'all 0.15s',
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: '9px', opacity: 0.7 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <nav
          className="app-sidebar-nav"
          style={{
            paddingTop: '4px',
            paddingLeft: '8px',
            paddingBottom: '4px',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            marginLeft: '10px',
          }}
        >
          {children}
        </nav>
      )}
    </div>
  );
}

export default function App() {
  const { user, authenticated } = useCurrentUser();

  const canReadAssets         = hasPermission(user, 'assets:read');
  const canReadWO             = hasPermission(user, 'work_orders:read');
  const canReadSR             = hasPermission(user, 'service_requests:read');
  const canReadInventory      = hasPermission(user, 'inventory:read');
  const canReadPermits        = hasPermission(user, 'permits:read');
  const canReadPM             = hasPermission(user, 'pm:read');
  const canManageIdentity     = hasPermission(user, 'admin:users:manage');
  const canManageConfig       = hasPermission(user, 'admin:config:manage');
  const canManageReporting    = hasPermission(user, 'admin:reporting:manage');
  const { pathname } = useLocation();

  // Map current route to a page title shown in the topbar
  const PAGE_TITLES: [string, string, string?][] = [
    ['/assets', 'Assets', 'Equipment, machinery and infrastructure register'],
    ['/locations', 'Locations'],
    ['/service-requests', 'Service Requests', 'Customer and internal service tickets'],
    ['/work-orders', 'Work Orders', 'Maintenance and corrective work'],
    ['/job-plans', 'Job Plans', 'Reusable task and resource templates'],
    ['/pm', 'Preventive Maintenance', 'Scheduled maintenance programs'],
    ['/permits', 'Permits to Work', 'Safety authorisation for hazardous work'],
    ['/inventory', 'Inventory', 'Stock, items and storerooms'],
    ['/people', 'People', 'Crew, contractors and contacts'],
    ['/reports', 'Reports'],
    ['/admin/dashboard-templates', 'Dashboard Templates', 'Set default layouts per role'],
    ['/dashboard', 'Dashboard'],
    ['/admin/identity', 'Identity & Access'],
    ['/admin/config', 'Configuration'],
    ['/admin/notifications', 'Notifications'],
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
  const topbarSub = matched?.[2];

  const canManageWorkflows    = hasPermission(user, 'admin:workflows:manage');
  const canManageIntegrations = hasPermission(user, 'admin:integrations:manage');
  const canManageAttachments  = hasPermission(user, 'admin:attachments:manage');
  const canManageNotifications = hasPermission(user, 'admin:notifications:manage');

  const showEamNav =
    authenticated &&
    (canReadAssets || canReadWO || canReadSR || canReadInventory || canReadPermits || canReadPM);

  const showAdminNav =
    authenticated &&
    (canManageIdentity || canManageConfig || canManageReporting ||
     canManageWorkflows || canManageIntegrations || canManageAttachments || canManageNotifications);

  const publicPaths = ['/', '/login', '/login/mfa', '/register', '/forgot-password', '/reset-password'];
  const isPublicPage = publicPaths.some(p => pathname === p);

  return (
    <div className={isPublicPage ? '' : 'app-shell'}>
      {!isPublicPage && (
      <aside className="app-sidebar">
        <Link to="/" className="app-sidebar-logo">
          <span className="app-logo-mark" />
          <span className="app-sidebar-logo-text">EAM PLATFORM</span>
        </Link>

        {authenticated && (
          <nav className="app-sidebar-nav" aria-label="Main">
            <SidebarLink to="/dashboard" label="Dashboard" />
            <SidebarLink to="/account" label="Account" />
            <SidebarLink to="/chat" label="Chat" />
          </nav>
        )}

        {showEamNav && (
          <>
            <div className="app-sidebar-divider" />

            {canReadAssets && (
              <CollapsibleSection label="Assets" paths={['/assets', '/locations']}>
                <SidebarLink to="/assets" label="Assets" />
                <SidebarLink to="/locations" label="Locations" />
              </CollapsibleSection>
            )}

            {canReadSR && (
              <CollapsibleSection label="Service" paths={['/service-requests']}>
                <SidebarLink to="/service-requests" label="Service Requests" />
              </CollapsibleSection>
            )}

            {canReadWO && (
              <CollapsibleSection label="Maintenance" paths={['/work-orders', '/job-plans', '/pm']}>
                <SidebarLink to="/work-orders" label="Work Orders" />
                <SidebarLink to="/job-plans" label="Job Plans" />
                <SidebarLink to="/pm" label="PM Masters" />
                <SidebarLink to="/pm/forecast" label="PM Forecast" />
              </CollapsibleSection>
            )}

            {canReadPermits && (
              <CollapsibleSection label="Safety" paths={['/permits']}>
                <SidebarLink to="/permits" label="Permits to Work" />
              </CollapsibleSection>
            )}

            {canReadInventory && (
              <CollapsibleSection label="Inventory" paths={['/inventory']}>
                <SidebarLink to="/inventory" label="Item Master" />
                <SidebarLink to="/inventory/transactions" label="Transactions" />
              </CollapsibleSection>
            )}

            {canReadWO && (
              <CollapsibleSection label="People" paths={['/labour']}>
                <SidebarLink to="/labour" label="Labour & Crews" />
              </CollapsibleSection>
            )}

            {canReadWO && (
              <CollapsibleSection label="Reports" paths={['/reports']}>
                <SidebarLink to="/reports/standard" label="Standard Reports" />
              </CollapsibleSection>
            )}
          </>
        )}

        {showAdminNav && (
          <>
            <div className="app-sidebar-divider" />

            {canManageIdentity && (
              <CollapsibleSection label="Identity" paths={['/admin/identity']}>
                <SidebarLink to="/admin/identity/users" label="Users" />
                <SidebarLink to="/admin/identity/groups" label="Groups" />
                <SidebarLink to="/admin/identity/roles" label="Roles" />
                <SidebarLink to="/admin/identity/providers" label="SSO" />
              </CollapsibleSection>
            )}

            {canManageConfig && (
              <CollapsibleSection label="Configuration" paths={['/admin/config', '/admin/org']}>
                <SidebarLink to="/admin/config" label="Entities & Fields" />
                <SidebarLink to="/admin/config/picklists" label="Picklists" />
                <SidebarLink to="/admin/config/status-model" label="Status Model" />
                <SidebarLink to="/admin/dashboard-templates" label="Dashboard Templates" />
                <SidebarLink to="/admin/config/versions" label="Config Versions" />
                <SidebarLink to="/admin/org" label="Org & Sites" />
              </CollapsibleSection>
            )}

            {canManageWorkflows && (
              <CollapsibleSection label="Schema & Workflows" paths={['/admin/schema', '/admin/workflows']}>
                <SidebarLink to="/admin/schema/migrations" label="Schema Migrations" />
                <SidebarLink to="/admin/workflows" label="Workflows" />
              </CollapsibleSection>
            )}

            {canManageIntegrations && (
              <CollapsibleSection label="Integrations" paths={['/admin/integrations']}>
                <SidebarLink to="/admin/integrations/connections" label="Connections" />
                <SidebarLink to="/admin/integrations/jobs" label="Scheduled Jobs" />
                <SidebarLink to="/admin/integrations/webhooks" label="Webhooks" />
                <SidebarLink to="/admin/integrations/api-keys" label="API Keys" />
                <SidebarLink to="/admin/integrations/history" label="Run History" />
              </CollapsibleSection>
            )}

            {canManageAttachments && (
              <CollapsibleSection label="Attachments" paths={['/admin/attachments']}>
                <SidebarLink to="/admin/attachments/document-types" label="Document Types" />
                <SidebarLink to="/admin/attachments/library" label="File Library" />
                <SidebarLink to="/admin/attachments/scan-config" label="Scan Config" />
                <SidebarLink to="/admin/attachments/retention" label="Retention" />
              </CollapsibleSection>
            )}

            {canManageReporting && (
              <CollapsibleSection label="Reporting" paths={['/admin/reporting']}>
                <SidebarLink to="/admin/reporting/library" label="Reports" />
                <SidebarLink to="/admin/reporting/designer" label="Report Designer" />
                <SidebarLink to="/admin/reporting/schedules" label="Schedules" />
                <SidebarLink to="/admin/reporting/bi" label="BI Connections" />
                <SidebarLink to="/admin/reporting/bi-rls" label="BI RLS Views" />
              </CollapsibleSection>
            )}

            {canManageConfig && (
              <CollapsibleSection label="Org Management" paths={['/admin/org']}>
                <SidebarLink to="/admin/org" label="Organisations & Sites" />
                <SidebarLink to="/admin/config/status-model" label="Status Model" />
              </CollapsibleSection>
            )}

            {canManageNotifications && (
              <CollapsibleSection label="Notifications" paths={['/admin/notifications']}>
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
      </aside>
      )}

      <div className={isPublicPage ? 'w-full' : 'app-main'}>
        {!isPublicPage && (
        <header className="app-topbar">
          <div className="flex flex-col justify-center">
            <span className="text-white font-bold text-base leading-tight">{topbarTitle}</span>
            {topbarSub && <span className="text-white/50 text-xs mt-0.5">{topbarSub}</span>}
          </div>
          <div className="app-topbar-actions" style={{display:'flex',alignItems:'center',gap:'8px'}}>
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
            {/* ── All routes below require login ── */}
            <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
            <Route path="/account/mfa/setup" element={<RequireAuth><MfaSetupPage /></RequireAuth>} />
            <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
            <Route path="/admin/dashboard-templates" element={<RequireAuth><DashboardTemplatePage /></RequireAuth>} />
            <Route path="/chat" element={<RequireAuth><ChatPage /></RequireAuth>} />
            <Route path="/admin/identity/users" element={<RequireAuth><AdminIdentityPage /></RequireAuth>} />
            <Route path="/admin/identity/users/:id" element={<RequireAuth><UserFormPage /></RequireAuth>} />
            <Route path="/admin/identity/groups" element={<RequireAuth><GroupListPage /></RequireAuth>} />
            <Route path="/admin/identity/groups/:id" element={<RequireAuth><GroupFormPage /></RequireAuth>} />
            <Route path="/admin/identity/roles" element={<RequireAuth><RoleListPage /></RequireAuth>} />
            <Route path="/admin/identity/roles/:id" element={<RequireAuth><RoleFormPage /></RequireAuth>} />
            <Route path="/admin/identity/providers" element={<RequireAuth><SsoConfigPage /></RequireAuth>} />
            <Route path="/admin/config" element={<RequireAuth><ConfigEntityListPage /></RequireAuth>} />
            <Route path="/admin/config/entities/:entityId/fields" element={<RequireAuth><ConfigFieldListPage /></RequireAuth>} />
            <Route path="/admin/config/entities/:entityId/forms" element={<RequireAuth><FormDesignerPage /></RequireAuth>} />
            <Route path="/admin/config/entities/:entityId/table" element={<RequireAuth><TableDesignerPage /></RequireAuth>} />
            <Route path="/admin/schema/migrations" element={<RequireAuth><SchemaMigrationLogPage /></RequireAuth>} />
            <Route path="/admin/workflows" element={<RequireAuth><WorkflowListPage /></RequireAuth>} />
            <Route path="/admin/workflows/:id" element={<RequireAuth><WorkflowDesignerPage /></RequireAuth>} />
            <Route path="/admin/workflows/:id/history" element={<RequireAuth><WorkflowDesignerPage /></RequireAuth>} />
            <Route path="/admin/integrations/connections" element={<RequireAuth><ConnectionListPage /></RequireAuth>} />
            <Route path="/admin/integrations/jobs" element={<RequireAuth><IntegrationJobsPage /></RequireAuth>} />
            <Route path="/admin/integrations/webhooks" element={<RequireAuth><WebhookConfigPage /></RequireAuth>} />
            <Route path="/admin/integrations/history" element={<RequireAuth><IntegrationHistoryPage /></RequireAuth>} />
            <Route path="/admin/integrations/api-keys" element={<RequireAuth><ApiKeyManagerPage /></RequireAuth>} />
            <Route path="/admin/attachments/document-types" element={<RequireAuth><DocumentTypesPage /></RequireAuth>} />
            <Route path="/admin/attachments/library" element={<RequireAuth><AttachmentLibraryPage /></RequireAuth>} />
            <Route path="/admin/attachments/scan-config" element={<RequireAuth><ScanConfigPage /></RequireAuth>} />
            <Route path="/admin/attachments/retention" element={<RequireAuth><RetentionPoliciesPage /></RequireAuth>} />
            <Route path="/admin/reporting/designer" element={<RequireAuth><ReportDesignerPage /></RequireAuth>} />
            <Route path="/admin/reporting/library" element={<RequireAuth><ReportLibraryPage /></RequireAuth>} />
            <Route path="/admin/reporting/schedules" element={<RequireAuth><ScheduledReportsPage /></RequireAuth>} />
            <Route path="/admin/reporting/bi" element={<RequireAuth><BIConnectionsPage /></RequireAuth>} />
            <Route path="/admin/reporting/bi-rls" element={<RequireAuth><BIRlsViewsPage /></RequireAuth>} />
            <Route path="/admin/org" element={<RequireAuth><OrgStructurePage /></RequireAuth>} />
            <Route path="/admin/config/picklists" element={<RequireAuth><PicklistManagerPage /></RequireAuth>} />
            <Route path="/admin/config/status-model" element={<RequireAuth><StatusModelPage /></RequireAuth>} />
            <Route path="/admin/config/versions" element={<RequireAuth><ConfigVersionsPage /></RequireAuth>} />
            <Route path="/admin/notifications/templates" element={<RequireAuth><NotificationTemplatesPage /></RequireAuth>} />
            <Route path="/admin/notifications/triggers" element={<RequireAuth><NotificationTriggersPage /></RequireAuth>} />
            <Route path="/admin/notifications/smtp" element={<RequireAuth><SmtpConfigPage /></RequireAuth>} />
            <Route path="/admin/notifications/my-prefs" element={<RequireAuth><UserNotificationPrefsPage /></RequireAuth>} />
            <Route path="/admin/notifications/delivery-log" element={<RequireAuth><DeliveryLogPage /></RequireAuth>} />
            <Route path="/admin/notifications/bounce-list" element={<RequireAuth><BounceListPage /></RequireAuth>} />
            <Route path="/locations" element={<RequireAuth><LocationTreePage /></RequireAuth>} />
            <Route path="/assets" element={<RequireAuth><AssetListPage /></RequireAuth>} />
            <Route path="/assets/new" element={<RequireAuth><AssetFormPage /></RequireAuth>} />
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
            <Route path="/labour" element={<RequireAuth><LabourPage /></RequireAuth>} />
            <Route path="/reports/standard" element={<RequireAuth><StandardReportsPage /></RequireAuth>} />
          </Routes>
        </div>
      </div>
    </div>
  );
}





