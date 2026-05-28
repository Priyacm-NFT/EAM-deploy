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
// P0-3: Schema & Workflows
import { SchemaMigrationLogPage } from './pages/admin/schema/SchemaMigrationLog.js';
import { WorkflowListPage } from './pages/admin/workflows/WorkflowList.js';
import { WorkflowDesignerPage } from './pages/admin/workflows/WorkflowDesigner.js';
// P0-4: Integrations
import { ConnectionListPage } from './pages/admin/integrations/ConnectionList.js';
import { IntegrationJobsPage } from './pages/admin/integrations/IntegrationJobs.js';
import { WebhookConfigPage } from './pages/admin/integrations/WebhookConfig.js';
import { IntegrationHistoryPage } from './pages/admin/integrations/IntegrationHistory.js';
// P0-5: Attachments
import { DocumentTypesPage } from './pages/admin/attachments/DocumentTypes.js';
import { AttachmentLibraryPage } from './pages/admin/attachments/AttachmentLibrary.js';
import { ScanConfigPage } from './pages/admin/attachments/ScanConfig.js';
import { RetentionPoliciesPage } from './pages/admin/attachments/RetentionPolicies.js';
// P0-8: Notifications
import { NotificationTemplatesPage } from './pages/admin/notifications/NotificationTemplates.js';
import { NotificationTriggersPage } from './pages/admin/notifications/NotificationTriggers.js';
import { SmtpConfigPage } from './pages/admin/notifications/SmtpConfig.js';
import { DeliveryLogPage } from './pages/admin/notifications/DeliveryLog.js';
// Org structure, config extras
import { OrgStructurePage } from './pages/admin/org/OrgStructure.js';
import { PicklistManagerPage } from './pages/admin/config/PicklistManager.js';
import { StatusModelPage } from './pages/admin/config/StatusModel.js';
import { ConfigVersionsPage } from './pages/admin/config/ConfigVersions.js';

function SidebarLink({ to, label }: { to: string; label: string }) {
  const { pathname } = useLocation();
  const active = pathname === to || pathname.startsWith(`${to}/`);
  return (
    <Link to={to} className={`app-sidebar-link ${active ? 'app-sidebar-link-active' : ''}`}>
      {label}
    </Link>
  );
}

function SidebarSection({ label }: { label: string }) {
  return <p className="app-sidebar-section mt-2">{label}</p>;
}

export default function App() {
  const { user, authenticated } = useCurrentUser();

  const canManageIdentity   = hasPermission(user, 'admin:users:manage');
  const canManageConfig     = hasPermission(user, 'admin:config:manage');
  const canManageReporting  = hasPermission(user, 'admin:reporting:manage');
  const canManageWorkflows  = hasPermission(user, 'admin:workflows:manage');
  const canManageIntegrations = hasPermission(user, 'admin:integrations:manage');
  const canManageAttachments  = hasPermission(user, 'admin:attachments:manage');
  const canManageNotifications = hasPermission(user, 'admin:notifications:manage');

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

        {showAdminNav && (
          <>
            <div className="app-sidebar-divider" />
            <p className="app-sidebar-section">Administration</p>

            {/* P0-1: Identity */}
            {canManageIdentity && (
              <>
                <SidebarSection label="Identity" />
                <nav className="app-sidebar-nav" aria-label="Identity">
                  <SidebarLink to="/admin/identity/users" label="Users" />
                  <SidebarLink to="/admin/identity/groups" label="Groups" />
                  <SidebarLink to="/admin/identity/roles" label="Roles" />
                  <SidebarLink to="/admin/identity/providers" label="SSO" />
                </nav>
              </>
            )}

            {/* P0-2: Configuration */}
            {canManageConfig && (
              <>
                <SidebarSection label="Configuration" />
                <nav className="app-sidebar-nav" aria-label="Configuration">
                  <SidebarLink to="/admin/config" label="Entities & Fields" />
                  <SidebarLink to="/admin/config/picklists" label="Picklists" />
                  <SidebarLink to="/admin/config/status-model" label="Status Model" />
                  <SidebarLink to="/admin/config/versions" label="Config Versions" />
                  <SidebarLink to="/admin/org" label="Org & Sites" />
                </nav>
              </>
            )}

            {/* P0-3: Schema & Workflows */}
            {canManageWorkflows && (
              <>
                <SidebarSection label="Schema & Workflows" />
                <nav className="app-sidebar-nav" aria-label="Schema & Workflows">
                  <SidebarLink to="/admin/schema/migrations" label="Schema Migrations" />
                  <SidebarLink to="/admin/workflows" label="Workflows" />
                </nav>
              </>
            )}

            {/* P0-4: Integrations */}
            {canManageIntegrations && (
              <>
                <SidebarSection label="Integrations" />
                <nav className="app-sidebar-nav" aria-label="Integrations">
                  <SidebarLink to="/admin/integrations/connections" label="Connections" />
                  <SidebarLink to="/admin/integrations/jobs" label="Scheduled Jobs" />
                  <SidebarLink to="/admin/integrations/webhooks" label="Webhooks" />
                  <SidebarLink to="/admin/integrations/history" label="Run History" />
                </nav>
              </>
            )}

            {/* P0-5: Attachments */}
            {canManageAttachments && (
              <>
                <SidebarSection label="Attachments" />
                <nav className="app-sidebar-nav" aria-label="Attachments">
                  <SidebarLink to="/admin/attachments/document-types" label="Document Types" />
                  <SidebarLink to="/admin/attachments/library" label="File Library" />
                  <SidebarLink to="/admin/attachments/scan-config" label="Virus Scan" />
                  <SidebarLink to="/admin/attachments/retention" label="Retention" />
                </nav>
              </>
            )}

            {/* P0-6: Reporting */}
            {canManageReporting && (
              <>
                <SidebarSection label="Reporting" />
                <nav className="app-sidebar-nav" aria-label="Reporting">
                  <SidebarLink to="/admin/reporting/library" label="Reports" />
                  <SidebarLink to="/admin/reporting/designer" label="Report Designer" />
                  <SidebarLink to="/admin/reporting/schedules" label="Schedules" />
                  <SidebarLink to="/admin/reporting/bi" label="BI Connections" />
                </nav>
              </>
            )}

            {/* P0-7: Dashboard / Chat (admin) */}
            {canManageConfig && (
              <>
                <SidebarSection label="Org Management" />
                <nav className="app-sidebar-nav" aria-label="Org">
                  <SidebarLink to="/admin/org" label="Organisations & Sites" />
                  <SidebarLink to="/admin/config/status-model" label="Status Model" />
                </nav>
              </>
            )}

            {/* P0-8: Notifications */}
            {canManageNotifications && (
              <>
                <SidebarSection label="Notifications" />
                <nav className="app-sidebar-nav" aria-label="Notifications">
                  <SidebarLink to="/admin/notifications/templates" label="Templates" />
                  <SidebarLink to="/admin/notifications/triggers" label="Triggers" />
                  <SidebarLink to="/admin/notifications/smtp" label="SMTP Config" />
                  <SidebarLink to="/admin/notifications/delivery-log" label="Delivery Log" />
                </nav>
              </>
            )}
          </>
        )}
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-actions">
            <AuthNav />
          </div>
        </header>

        <div className="app-content">
          <Routes>
            {/* Public / auth */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/login/mfa" element={<MfaChallengePage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/account/mfa/setup" element={<MfaSetupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* P0-7: Dashboard & Chat */}
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/chat" element={<ChatPage />} />

            {/* P0-1: Identity admin */}
            <Route path="/admin/identity/users" element={<AdminIdentityPage />} />
            <Route path="/admin/identity/users/:id" element={<UserFormPage />} />
            <Route path="/admin/identity/groups" element={<GroupListPage />} />
            <Route path="/admin/identity/groups/:id" element={<GroupFormPage />} />
            <Route path="/admin/identity/roles" element={<RoleListPage />} />
            <Route path="/admin/identity/roles/:id" element={<RoleFormPage />} />
            <Route path="/admin/identity/providers" element={<SsoConfigPage />} />

            {/* P0-2: Config admin */}
            <Route path="/admin/config" element={<ConfigEntityListPage />} />
            <Route path="/admin/config/entities/:entityId/fields" element={<ConfigFieldListPage />} />
            <Route path="/admin/config/entities/:entityId/forms" element={<FormDesignerPage />} />

            {/* P0-3: Schema & Workflows */}
            <Route path="/admin/schema/migrations" element={<SchemaMigrationLogPage />} />
            <Route path="/admin/workflows" element={<WorkflowListPage />} />
            <Route path="/admin/workflows/:id" element={<WorkflowDesignerPage />} />
            <Route path="/admin/workflows/:id/history" element={<WorkflowDesignerPage />} />

            {/* P0-4: Integrations */}
            <Route path="/admin/integrations/connections" element={<ConnectionListPage />} />
            <Route path="/admin/integrations/jobs" element={<IntegrationJobsPage />} />
            <Route path="/admin/integrations/webhooks" element={<WebhookConfigPage />} />
            <Route path="/admin/integrations/history" element={<IntegrationHistoryPage />} />

            {/* P0-5: Attachments */}
            <Route path="/admin/attachments/document-types" element={<DocumentTypesPage />} />
            <Route path="/admin/attachments/library" element={<AttachmentLibraryPage />} />
            <Route path="/admin/attachments/scan-config" element={<ScanConfigPage />} />
            <Route path="/admin/attachments/retention" element={<RetentionPoliciesPage />} />

            {/* P0-6: Reporting */}
            <Route path="/admin/reporting/designer" element={<ReportDesignerPage />} />
            <Route path="/admin/reporting/library" element={<ReportLibraryPage />} />
            <Route path="/admin/reporting/schedules" element={<ScheduledReportsPage />} />
            <Route path="/admin/reporting/bi" element={<BIConnectionsPage />} />

            {/* Org structure & Status model */}
            <Route path="/admin/org" element={<OrgStructurePage />} />
            <Route path="/admin/config/picklists" element={<PicklistManagerPage />} />
            <Route path="/admin/config/status-model" element={<StatusModelPage />} />
            <Route path="/admin/config/versions" element={<ConfigVersionsPage />} />

            {/* P0-8: Notifications */}
            <Route path="/admin/notifications/templates" element={<NotificationTemplatesPage />} />
            <Route path="/admin/notifications/triggers" element={<NotificationTriggersPage />} />
            <Route path="/admin/notifications/smtp" element={<SmtpConfigPage />} />
            <Route path="/admin/notifications/delivery-log" element={<DeliveryLogPage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
