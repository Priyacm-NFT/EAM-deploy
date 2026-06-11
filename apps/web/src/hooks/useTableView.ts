import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export interface ColumnConfig {
  fieldKey: string;
  label: string;
  width?: number;
  aggregate?: 'none' | 'count' | 'sum' | 'avg';
}

export interface TableView {
  id: string;
  name: string;
  columnConfig: ColumnConfig[];
  defaultSort?: string | null;
  isDefault: boolean;
  roleId?: string | null;
}

/**
 * Loads saved table views for a given entity name.
 * Returns the active view, all views, and a setter to switch views.
 */
export function useTableView(entityName: string) {
  const [views, setViews] = useState<TableView[]>([]);
  const [activeView, setActiveView] = useState<TableView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityName) return;
    api<{ id: string; name: string }[]>('/admin/config/entities')
      .then((entities) => {
        const entity = entities.find((e) => e.name === entityName);
        if (!entity) { setLoading(false); return; }
        return api<TableView[]>(`/admin/config/entities/${entity.id}/views`);
      })
      .then((v) => {
        if (!v) return;
        setViews(v);
        const def = v.find((x) => x.isDefault) ?? v[0] ?? null;
        setActiveView(def);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entityName]);

  return { views, activeView, setActiveView, loading };
}
