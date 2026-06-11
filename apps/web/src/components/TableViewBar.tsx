import { Link } from 'react-router-dom';
import type { TableView } from '../hooks/useTableView.js';

interface Props {
  views: TableView[];
  activeView: TableView | null;
  onSwitch: (view: TableView) => void;
}

/**
 * Renders the view switcher bar above a list table.
 * Shows active view name, default badge, switcher dropdown if multiple views,
 * and a "Customise columns →" link to the table designer.
 */
export function TableViewBar({ views, activeView, onSwitch }: Props) {
  if (!activeView) return null;
  return (
    <div className="flex items-center gap-3 mb-2 text-xs text-slate-500">
      <span>
        View: <span className="font-medium text-slate-700">{activeView.name}</span>
        {activeView.isDefault && (
          <span className="ml-1.5 text-green-600 font-medium">● default</span>
        )}
      </span>

      {views.length > 1 && (
        <select
          className="text-xs border border-slate-200 rounded px-2 py-0.5 text-slate-600"
          value={activeView.id}
          onChange={(e) => {
            const v = views.find((x) => x.id === e.target.value);
            if (v) onSwitch(v);
          }}
        >
          {views.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      )}

      <Link to="/admin/config" className="text-accent hover:underline ml-auto">
        Customise columns →
      </Link>
    </div>
  );
}
