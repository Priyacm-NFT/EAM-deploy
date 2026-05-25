import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';

interface Role {
  id: string;
  name: string;
  description: string | null;
  requireMfa: boolean;
}

export function RoleListPage() {
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    api<Role[]>('/admin/roles').then(setRoles);
  }, []);

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h1 className="text-xl font-semibold">Roles</h1>
        <Link to="/admin/identity/roles/new" className="text-blue-600 text-sm">
          New role
        </Link>
      </div>
      <ul className="bg-white border rounded divide-y">
        {roles.map((r) => (
          <li key={r.id} className="p-3 flex justify-between items-center">
            <div>
              <p className="font-medium">{r.name}</p>
              {r.requireMfa && (
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">MFA required</span>
              )}
            </div>
            <Link to={`/admin/identity/roles/${r.id}`} className="text-blue-600 text-sm">
              Edit
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
