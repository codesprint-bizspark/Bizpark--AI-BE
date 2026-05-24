'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getShippingMethods, adminCreateShippingMethod, adminUpdateShippingMethod, adminDeleteShippingMethod } from '@/lib/api';
import type { ShippingMethod } from '@/types';

type Form = { code: string; label: string; flatRate: string; currency: string; active: boolean };
const EMPTY: Form = { code: '', label: '', flatRate: '', currency: 'USD', active: true };

export default function AdminShippingPage() {
  const { token, config } = useApp();
  const primary = config?.primaryColor ?? '#2563eb';
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<ShippingMethod | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    getShippingMethods().then(r => setMethods(r.data)).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setError(''); setModal(true); };
  const openEdit = (m: ShippingMethod) => {
    setEditing(m);
    setForm({ code: m.code, label: m.label, flatRate: String(m.flatRate), currency: m.currency, active: m.active });
    setError(''); setModal(true);
  };

  const handleSave = async () => {
    if (!token) return;
    setError(''); setSaving(true);
    try {
      if (editing) {
        await adminUpdateShippingMethod(token, editing.id, {
          label: form.label.trim(), flatRate: parseFloat(form.flatRate), currency: form.currency.toUpperCase(), active: form.active,
        });
      } else {
        await adminCreateShippingMethod(token, {
          code: form.code.trim(), label: form.label.trim(), flatRate: parseFloat(form.flatRate), currency: form.currency.toUpperCase(), active: form.active,
        });
      }
      setModal(false); load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Delete this shipping method?')) return;
    try { await adminDeleteShippingMethod(token, id); load(); } catch { /* ignore */ }
  };

  const fmt = (n: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 bg-white';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shipping Methods</h1>
          <p className="text-sm text-gray-500 mt-0.5">{methods.length} methods</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: primary }}>
          + Add Method
        </button>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        {methods.length === 0 ? (
          <p className="p-8 text-center text-gray-400 text-sm">No shipping methods yet. Add one to enable checkout shipping options.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Code</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Label</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Flat Rate</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {methods.map(m => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs text-gray-700">{m.code}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{m.label}</td>
                  <td className="px-5 py-3 text-right font-medium">{fmt(m.flatRate, m.currency)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(m)} className="text-xs text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => handleDelete(m.id)} className="text-xs text-red-500 hover:underline">Delete</button>
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
              <h2 className="font-semibold text-gray-900">{editing ? 'Edit Shipping Method' : 'Add Shipping Method'}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {!editing && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Code * <span className="text-gray-400">(unique, e.g. standard, express)</span></label>
                  <input className={inputCls} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="standard" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Label *</label>
                <input className={inputCls} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Standard Shipping (3-5 days)" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Flat Rate *</label>
                  <input type="number" min="0" step="0.01" className={inputCls} value={form.flatRate} onChange={e => setForm(f => ({ ...f, flatRate: e.target.value }))} placeholder="5.99" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Currency</label>
                  <input className={inputCls} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} maxLength={3} placeholder="USD" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded" />
                Active (visible to customers at checkout)
              </label>
              {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.label || !form.flatRate || (!editing && !form.code)}
                className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: primary }}
              >
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Method'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
