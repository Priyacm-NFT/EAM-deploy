import { Routes, Route, Link } from 'react-router-dom';
import { HomePage } from './pages/HomePage.js';
import { AdminIdentityPage } from './pages/admin/identity/UserList.js';
import { DashboardPage } from './pages/DashboardPage.js';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-6 py-3 flex gap-4">
        <Link to="/">EAM</Link>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/admin/identity/users">Admin</Link>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/admin/identity/users" element={<AdminIdentityPage />} />
        </Routes>
      </main>
    </div>
  );
}
