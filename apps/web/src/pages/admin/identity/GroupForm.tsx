import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../api/client.js';

export function GroupFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!isNew && id) {
      api<{ name: string; description: string | null }>(`/admin/groups/${id}`).then((g) => {
        setName(g.name);
        setDescription(g.description ?? '');
      });
    }
  }, [id, isNew]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (isNew) {
      await api('/admin/groups', { method: 'POST', body: JSON.stringify({ name, description }) });
    } else {
      await api(`/admin/groups/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description }),
      });
    }
    navigate('/admin/identity/groups');
  }

  return (
    <form onSubmit={save} className="max-w-md space-y-3">
      <h1 className="text-xl font-semibold">{isNew ? 'New group' : 'Edit group'}</h1>
      <input
        className="border rounded w-full px-2 py-1"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <textarea
        className="border rounded w-full px-2 py-1"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button type="submit" className="bg-slate-800 text-white px-4 py-2 rounded text-sm">
        Save
      </button>
    </form>
  );
}
