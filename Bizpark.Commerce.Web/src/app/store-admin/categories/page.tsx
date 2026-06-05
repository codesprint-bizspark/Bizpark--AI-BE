'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getCategories, adminCreateCategory, adminUpdateCategory, adminDeleteCategory } from '@/lib/api';
import type { Category } from '@/types';

type CatForm = { name: string; slug: string; description: string; isActive: boolean };
const EMPTY: CatForm = { name: '', slug: '', description: '', isActive: true };

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function AdminCategoriesPage() {
  const { token, config } = useApp();
  const primary = config?.primaryColor ?? '#2563eb';
  const [categories, setCategories] = useState<Category[]>([]);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; cat?: Category } | null>(null);
  const [form, setForm] = useState<CatForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => getCategories().then(r => setCategories(r.data)).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => { setForm(EMPTY); setError(''); setModal({ mode: 'create' }); };
  const openEdit = (c: Category) => {
    setForm({ name: c.name, slug: c.slug, description: c.description ?? '', isActive: c.isActive });
    setError('');
    setModal({ mode: 'edit', cat: c });
  };

  const handleSave = async () => {
    if (!token) return;
    setError(''); setSaving(true);
    try {
      if (modal?.mode === 'create') {
        await adminCreateCategory(token, { name: form.name.trim(), slug: form.slug.trim(), description: form.description.trim() || undefined });
      } else if (modal?.cat) {
        await adminUpdateCategory(token, modal.cat.id, { name: form.name.trim(), slug: form.slug.trim(), description: form.description.trim(), isActive: form.isActive });
      }
      setModal(null);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: Category) => {
    if (!token || !confirm(`Delete category "${c.name}"?`)) return;
    try { await adminDeleteCategory(token, c.id); load(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Delete failed'); }
  };

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 bg-white';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        <button onClick={openCreate} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: primary }}>+ New Category</button>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        {categories.length === 0 ? (
          <p className="p-8 text-center text-gray-400 text-sm">No categories yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600 hidden sm:table-cell">Slug</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs font-mono hidden sm:table-cell">{c.slug}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(c)} className="text-xs px-3 py-1 border rounded-lg hover:bg-gray-50">Edit</button>
                      <button onClick={() => handleDelete(c)} className="text-xs px-3 py-1 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{modal.mode === 'create' ? 'New Category' : 'Edit Category'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                <input className={inputCls} value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: modal.mode === 'create' ? slugify(e.target.value) : f.slug }))}
                  placeholder="e.g. Electronics" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Slug *</label>
                <input className={inputCls} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))} placeholder="e.g. electronics" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea className={inputCls} rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              {modal.mode === 'edit' && (
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded" />
                  Active
                </label>
              )}
              {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setModal(null)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.slug} className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: primary }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
