'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { adminListCustomers, adminCreateCustomer, adminUpdateCustomer } from '@/lib/api';
import type { Customer } from '@/types';

type CreateForm = { email: string; password: string; name: string };
type EditForm = { name: string; role: string };

const EMPTY_CREATE: CreateForm = { email: '', password: '', name: '' };

export default function AdminCustomersPage() {
  const { token, config } = useApp();
  const primary = config?.primaryColor ?? '#2563eb';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', role: 'CUSTOMER' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    if (!token) return;
    adminListCustomers(token).then(r => setCustomers(r.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = customers.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!token) return;
    setError(''); setSaving(true);
    try {
      await adminCreateCustomer(token, { email: createForm.email.trim(), password: createForm.password, name: createForm.name.trim() || undefined });
      setCreateModal(false);
      setCreateForm(EMPTY_CREATE);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (c: Customer) => {
    setEditTarget(c);
    setEditForm({ name: c.name ?? '', role: c.role });
    setError('');
  };

  const handleEdit = async () => {
    if (!token || !editTarget) return;
    setError(''); setSaving(true);
    try {
      await adminUpdateCustomer(token, editTarget.id, { name: editForm.name.trim() || undefined, role: editForm.role });
      setEditTarget(null);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 bg-white';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{customers.length} registered</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            className="border rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 w-56 bg-white"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            onClick={() => { setCreateForm(EMPTY_CREATE); setError(''); setCreateModal(true); }}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium shrink-0"
            style={{ backgroundColor: primary }}
          >
            + New Customer
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-gray-400 text-sm">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-400 text-sm">{search ? 'No customers match your search.' : 'No customers yet.'}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600 hidden sm:table-cell">Role</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600 hidden md:table-cell">Joined</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{c.name || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{c.email}</td>
                  <td className="px-5 py-3 hidden sm:table-cell">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {c.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs hidden md:table-cell">
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => openEdit(c)} className="text-xs px-3 py-1 border rounded-lg hover:bg-gray-50">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Customer Modal */}
      {createModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">New Customer</h2>
              <button onClick={() => setCreateModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                <input className={inputCls} value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                <input className={inputCls} type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password *</label>
                <input className={inputCls} type="password" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters" />
              </div>
              {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setCreateModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={saving || !createForm.email || !createForm.password}
                className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: primary }}
              >
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Edit Customer</h2>
              <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input className={inputCls + ' opacity-60'} value={editTarget.email} disabled />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                <input className={inputCls} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Display name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                <select className={inputCls} value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="CUSTOMER">CUSTOMER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setEditTarget(null)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button
                onClick={handleEdit}
                disabled={saving}
                className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: primary }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
