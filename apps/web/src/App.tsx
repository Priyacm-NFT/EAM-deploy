import { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
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
import { DashboardPage } from './pages/DashboardPage.js';
import { ChatPage } from './pages/ChatPage.js';
import { SchemaMigrationLogPage } from './pages/admin/schema/SchemaMigrationLog.js';
import { WorkflowListPage } from './pages/admin/workflows/WorkflowList.js';
import { WorkflowDesignerPage } from './pages/admin/workflows/WorkflowDesigner.js';
import { ConnectionListPage } from './pages/admin/integrations/ConnectionList.js';
import { IntegrationJobsPage } from './pages/admin/integrations/IntegrationJobs.js';
import { WebhookConfigPage } from './pages/admin/integrations/WebhookConfig.js';
import { IntegrationHistoryPage } from './pages/admin/integrations/IntegrationHistory.js';
import { DocumentTypesPage } from './pages/admin/attachments/DocumentTypes.js';
import { AttachmentLibraryPage } from './pages/admin/attachments/AttachmentLibrary.js';
import { RetentionPoliciesPage } from './pages/admin/attachments/RetentionPolicies.js';
import { NotificationTemplatesPage } from './pages/admin/notifications/NotificationTemplates.js';
import { NotificationBell } from './components/NotificationBell.js';
import { NotificationTriggersPage } from './pages/admin/notifications/NotificationTriggers.js';
import { SmtpConfigPage } from './pages/admin/notifications/SmtpConfig.js';
import { DeliveryLogPage } from './pages/admin/notifications/DeliveryLog.js';
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

  return (
    <div className="app-shell">
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
                <SidebarLink to="/admin/integrations/history" label="Run History" />
              </CollapsibleSection>
            )}

            {canManageAttachments && (
              <CollapsibleSection label="Attachments" paths={['/admin/attachments']}>
                <SidebarLink to="/admin/attachments/document-types" label="Document Types" />
                <SidebarLink to="/admin/attachments/library" label="File Library" />
                <SidebarLink to="/admin/attachments/retention" label="Retention" />
              </CollapsibleSection>
            )}

            {canManageReporting && (
              <CollapsibleSection label="Reporting" paths={['/admin/reporting']}>
                <SidebarLink to="/admin/reporting/library" label="Reports" />
                <SidebarLink to="/admin/reporting/designer" label="Report Designer" />
                <SidebarLink to="/admin/reporting/schedules" label="Schedules" />
                <SidebarLink to="/admin/reporting/bi" label="BI Connections" />
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
              </CollapsibleSection>
            )}
          </>
        )}
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-actions" style={{display:'flex',alignItems:'center',gap:'8px'}}>
            {user && <NotificationBell />}
            <AuthNav />
          </div>
        </header>

        <div className="app-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/login/mfa" element={<MfaChallengePage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/account/mfa/setup" element={<MfaSetupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/admin/identity/users" element={<AdminIdentityPage />} />
            <Route path="/admin/identity/users/:id" element={<UserFormPage />} />
            <Route path="/admin/identity/groups" element={<GroupListPage />} />
            <Route path="/admin/identity/groups/:id" element={<GroupFormPage />} />
            <Route path="/admin/identity/roles" element={<RoleListPage />} />
            <Route path="/admin/identity/roles/:id" element={<RoleFormPage />} />
            <Route path="/admin/identity/providers" element={<SsoConfigPage />} />
            <Route path="/admin/config" element={<ConfigEntityListPage />} />
            <Route path="/admin/config/entities/:entityId/fields" element={<ConfigFieldListPage />} />
            <Route path="/admin/config/entities/:entityId/forms" element={<FormDesignerPage />} />
            <Route path="/admin/config/entities/:entityId/table" element={<TableDesignerPage />} />
            <Route path="/admin/schema/migrations" element={<SchemaMigrationLogPage />} />
            <Route path="/admin/workflows" element={<WorkflowListPage />} />
            <Route path="/admin/workflows/:id" element={<WorkflowDesignerPage />} />
            <Route path="/admin/workflows/:id/history" element={<WorkflowDesignerPage />} />
            <Route path="/admin/integrations/connections" element={<ConnectionListPage />} />
            <Route path="/admin/integrations/jobs" element={<IntegrationJobsPage />} />
            <Route path="/admin/integrations/webhooks" element={<WebhookConfigPage />} />
            <Route path="/admin/integrations/history" element={<IntegrationHistoryPage />} />
            <Route path="/admin/attachments/document-types" element={<DocumentTypesPage />} />
            <Route path="/admin/attachments/library" element={<AttachmentLibraryPage />} />
            <Route path="/admin/attachments/retention" element={<RetentionPoliciesPage />} />
            <Route path="/admin/reporting/designer" element={<ReportDesignerPage />} />
            <Route path="/admin/reporting/library" element={<ReportLibraryPage />} />
            <Route path="/admin/reporting/schedules" element={<ScheduledReportsPage />} />
            <Route path="/admin/reporting/bi" element={<BIConnectionsPage />} />
            <Route path="/admin/org" element={<OrgStructurePage />} />
            <Route path="/admin/config/picklists" element={<PicklistManagerPage />} />
            <Route path="/admin/config/status-model" element={<StatusModelPage />} />
            <Route path="/admin/config/versions" element={<ConfigVersionsPage />} />
            <Route path="/admin/notifications/templates" element={<NotificationTemplatesPage />} />
            <Route path="/admin/notifications/triggers" element={<NotificationTriggersPage />} />
            <Route path="/admin/notifications/smtp" element={<SmtpConfigPage />} />
            <Route path="/admin/notifications/delivery-log" element={<DeliveryLogPage />} />
            <Route path="/locations" element={<LocationTreePage />} />
            <Route path="/assets" element={<AssetListPage />} />
            <Route path="/assets/new" element={<AssetFormPage />} />
            <Route path="/assets/:id" element={<AssetDetailPage />} />
            <Route path="/assets/:id/edit" element={<AssetFormPage />} />
            <Route path="/service-requests" element={<SRListPage />} />
            <Route path="/service-requests/new" element={<SRFormPage />} />
            <Route path="/service-requests/:id" element={<SRDetailPage />} />
            <Route path="/service-requests/:id/edit" element={<SRFormPage />} />
            <Route path="/work-orders" element={<WOListPage />} />
            <Route path="/work-orders/new" element={<WOFormPage />} />
            <Route path="/work-orders/:id" element={<WODetailPage />} />
            <Route path="/work-orders/:id/edit" element={<WOFormPage />} />
            <Route path="/job-plans" element={<JobPlanListPage />} />
            <Route path="/job-plans/new" element={<JobPlanFormPage />} />
            <Route path="/job-plans/:id" element={<JobPlanDetailPage />} />
            <Route path="/job-plans/:id/edit" element={<JobPlanDetailPage />} />
            <Route path="/pm" element={<PMMasterListPage />} />
            <Route path="/pm/new" element={<PMFormPage />} />
            <Route path="/pm/forecast" element={<PMForecastPage />} />
            <Route path="/pm/:id" element={<PMDetailPage />} />
            <Route path="/permits" element={<PermitListPage />} />
            <Route path="/permits/new" element={<PermitFormPage />} />
            <Route path="/permits/:id" element={<PermitDetailPage />} />
            <Route path="/inventory" element={<ItemMasterListPage />} />
            <Route path="/inventory/transactions" element={<TransactionLogPage />} />
            <Route path="/inventory/storerooms" element={<StoreroomListPage />} />
            <Route path="/labour" element={<LabourPage />} />
            <Route path="/reports/standard" element={<StandardReportsPage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}


