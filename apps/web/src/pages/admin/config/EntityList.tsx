import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';

interface Entity {
  id: string;
  name: string;
  label: string;
  tableName: string;
}

export function ConfigEntityListPage() {
  const [entities, setEntities] = useState<Entity[]>([]);

  useEffect(() => {
    api<Entity[]>('/admin/config/entities').then(setEntities).catch(() => setEntities([]));
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Application configuration</h1>
      <p className="text-sm text-slate-600 mb-4">
        Manage entity fields, validation rules, and form layouts.
      </p>
      <ul className="space-y-2">
        {entities.map((e) => (
          <li key={e.id} className="border rounded bg-white px-4 py-3 flex justify-between items-center">
            <div>
              <span className="font-medium">{e.label}</span>
              <span className="text-slate-500 text-sm ml-2">({e.name})</span>
            </div>
            <div className="flex gap-3 text-sm">
              <Link to={`/admin/config/entities/${e.id}/fields`} className="text-blue-600">
                Fields
              </Link>
              <Link to={`/admin/config/entities/${e.id}/forms`} className="text-blue-600">
                Form designer
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
