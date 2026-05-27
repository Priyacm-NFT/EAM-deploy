import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface Entity {
  id: string;
  name: string;
  label: string;
  tableName: string;
}

export function ConfigEntityListPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<Entity[]>('/admin/config/entities')
      .then(setEntities)
      .catch((e) => setError(String(e)));
  }, []);

  const filtered = entities.filter(
    (e) =>
      e.label.toLowerCase().includes(filter.toLowerCase()) ||
      e.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <IdentityPageLayout
      title="Application configuration"
      subtitle="Choose an entity, then add fields and design forms for your users"
    >
      {error && <MessageBanner type="error" text={error} />}

      <div className="admin-section">
        <h2 className="admin-section-title">Entities</h2>
        <p className="text-sm text-slate-600">
          Select an entity to configure its fields, validation rules, and form layouts. All configuration
          is entered and saved by you through the designer screens.
        </p>
        <FormField label="Search entities" htmlFor="entity-search">
          <input
            id="entity-search"
            type="search"
            className="form-input max-w-md"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </FormField>

        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
            No entities match your search.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            {filtered.map((e) => (
              <li
                key={e.id}
                className="px-4 py-4 flex flex-wrap justify-between items-center gap-3 bg-white hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{e.label}</p>
                  <p className="text-sm text-slate-500">
                    Internal name: <code className="text-xs bg-slate-100 px-1 rounded">{e.name}</code>
                    {' · '}
                    Table: <code className="text-xs bg-slate-100 px-1 rounded">{e.tableName}</code>
                  </p>
                </div>
                <div className="flex gap-4 text-sm">
                  <Link to={`/admin/config/entities/${e.id}/fields`} className="btn-link">
                    Manage fields
                  </Link>
                  <Link to={`/admin/config/entities/${e.id}/forms`} className="btn-link">
                    Form designer
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </IdentityPageLayout>
  );
}
