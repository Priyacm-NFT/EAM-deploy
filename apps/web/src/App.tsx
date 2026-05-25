import { Routes, Route, Link } from 'react-router-dom';
import { HomePage } from './pages/HomePage.js';
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

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-6 py-3 flex gap-4">
        <Link to="/">EAM</Link>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/chat">Chat</Link>
        <Link to="/admin/identity/users">Users</Link>
        <Link to="/admin/identity/groups">Groups</Link>
        <Link to="/admin/identity/roles">Roles</Link>
        <Link to="/admin/identity/providers">SSO</Link>
        <Link to="/admin/config">Configuration</Link>
        <Link to="/admin/reporting/library">Reports</Link>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
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
      </main>
    </div>
  );
}
