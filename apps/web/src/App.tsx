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

function SidebarLink({ to, label }: { to: string; label: string }) {
  const { pathname } = useLocation();
  const active = pathname === to || pathname.startsWith(`${to}/`);
  return (
    <Link to={to} className={`app-sidebar-link ${active ? 'app-sidebar-link-active' : ''}`}>
      {label}
    </Link>
  );
}

export default function App() {
  const { user, authenticated } = useCurrentUser();

  const canManageIdentity = hasPermission(user, 'admin:users:manage');
  const canManageConfig = hasPermission(user, 'admin:config:manage');
  const canManageReporting = hasPermission(user, 'admin:reporting:manage');

  // Regular users: Dashboard, Account, Chat only.
  // Admin users: show Administration section when permissions are present.
  const showAdminNav =
    authenticated && (canManageIdentity || canManageConfig || canManageReporting);

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
            <nav className="app-sidebar-nav" aria-label="Administration">
              {canManageIdentity && (
                <>
                  <SidebarLink to="/admin/identity/users" label="Users" />
                  <SidebarLink to="/admin/identity/groups" label="Groups" />
                  <SidebarLink to="/admin/identity/roles" label="Roles" />
                  <SidebarLink to="/admin/identity/providers" label="SSO" />
                </>
              )}
              {canManageConfig && <SidebarLink to="/admin/config" label="Configuration" />}
              {canManageReporting && <SidebarLink to="/admin/reporting/library" label="Reports" />}
            </nav>
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
            <Route path="/admin/reporting/designer" element={<ReportDesignerPage />} />
            <Route path="/admin/reporting/library" element={<ReportLibraryPage />} />
            <Route path="/admin/reporting/schedules" element={<ScheduledReportsPage />} />
            <Route path="/admin/reporting/bi" element={<BIConnectionsPage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
