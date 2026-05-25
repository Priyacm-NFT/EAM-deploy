import { Routes, Route, Link } from 'react-router-dom';
import { HomePage } from './pages/HomePage.js';
import { AdminIdentityPage } from './pages/admin/identity/UserList.js';
import { UserFormPage } from './pages/admin/identity/UserForm.js';
import { GroupListPage } from './pages/admin/identity/GroupList.js';
import { GroupFormPage } from './pages/admin/identity/GroupForm.js';
import { RoleListPage } from './pages/admin/identity/RoleList.js';
import { RoleFormPage } from './pages/admin/identity/RoleForm.js';
import { SsoConfigPage } from './pages/admin/identity/SsoConfig.js';
import { DashboardPage } from './pages/DashboardPage.js';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-6 py-3 flex gap-4">
        <Link to="/">EAM</Link>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/admin/identity/users">Users</Link>
        <Link to="/admin/identity/groups">Groups</Link>
        <Link to="/admin/identity/roles">Roles</Link>
        <Link to="/admin/identity/providers">SSO</Link>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/admin/identity/users" element={<AdminIdentityPage />} />
          <Route path="/admin/identity/users/:id" element={<UserFormPage />} />
          <Route path="/admin/identity/groups" element={<GroupListPage />} />
          <Route path="/admin/identity/groups/:id" element={<GroupFormPage />} />
          <Route path="/admin/identity/roles" element={<RoleListPage />} />
          <Route path="/admin/identity/roles/:id" element={<RoleFormPage />} />
          <Route path="/admin/identity/providers" element={<SsoConfigPage />} />
        </Routes>
      </main>
    </div>
  );
}
