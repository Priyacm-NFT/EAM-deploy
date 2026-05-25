import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';

interface Group {
  id: string;
  name: string;
  description: string | null;
  source: string;
}

export function GroupListPage() {
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    api<Group[]>('/admin/groups').then(setGroups);
  }, []);

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h1 className="text-xl font-semibold">Groups</h1>
        <Link to="/admin/identity/groups/new" className="text-blue-600 text-sm">
          New group
        </Link>
      </div>
      <ul className="bg-white border rounded divide-y">
        {groups.map((g) => (
          <li key={g.id} className="p-3 flex justify-between">
            <div>
              <p className="font-medium">{g.name}</p>
              <p className="text-sm text-slate-500">{g.description ?? g.source}</p>
            </div>
            <Link to={`/admin/identity/groups/${g.id}`} className="text-blue-600 text-sm">
              Edit
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
