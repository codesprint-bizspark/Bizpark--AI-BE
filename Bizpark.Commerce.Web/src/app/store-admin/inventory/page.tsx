'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { adminGetInventory, adminUpsertInventory, getProducts } from '@/lib/api';
import type { InventoryItem, Product } from '@/types';

type UpsertForm = { productId: string; variantId: string; sku: string; availableQuantity: string };
const EMPTY: UpsertForm = { productId: '', variantId: '', sku: '', availableQuantity: '' };

export default function AdminInventoryPage() {
  const { token, config } = useApp();
  const primary = config?.primaryColor ?? '#2563eb';
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<UpsertForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    if (!token) return;
    adminGetInventory(token, page).then(r => { setItems(r.data); setTotal(r.total); setTotalPages(r.totalPages); }).catch(() => {});
  };

  useEffect(() => { load(); }, [token, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { getProducts({ limit: 100 }).then(r => setProducts(r.data)).catch(() => {}); }, []);

  const handleSave = async () => {
    if (!token) return;
    setError(''); setSaving(true);
    try {
      await adminUpsertInventory(token, {
        productId: form.productId,
        sku: form.sku.trim(),
        availableQuantity: parseInt(form.availableQuantity, 10),
        variantId: form.variantId || undefined,
      });
      setModal(false);
      setForm(EMPTY);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 bg-white';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} items</p>
        </div>
        <button onClick={() => { setForm(EMPTY); setError(''); setModal(true); }} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: primary }}>
          + Add / Update Stock
        </button>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        {items.length === 0 ? (
          <p className="p-8 text-center text-gray-400 text-sm">No inventory records yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">SKU</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600 hidden sm:table-cell">Product</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Available</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Reserved</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const product = products.find(p => p.id === item.productId);
                return (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-700">{item.sku}</td>
                    <td className="px-5 py-3 text-gray-600 hidden sm:table-cell">{product?.title ?? item.productId.slice(0, 8)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-bold ${item.availableQuantity <= 0 ? 'text-red-500' : item.availableQuantity <= 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {item.availableQuantity}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500">{item.reservedQuantity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 border rounded-lg text-sm disabled:opacity-40">Previous</button>
          <span className="px-4 py-2 text-sm text-gray-600">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-2 border rounded-lg text-sm disabled:opacity-40">Next</button>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Add / Update Stock</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Product *</label>
                <select className={inputCls} value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}>
                  <option value="">Select product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">SKU *</label>
                <input className={inputCls} value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="e.g. PROD-001" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Available Quantity *</label>
                <input className={inputCls} type="number" min="0" value={form.availableQuantity} onChange={e => setForm(f => ({ ...f, availableQuantity: e.target.value }))} placeholder="100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Variant ID <span className="text-gray-400">(optional)</span></label>
                <input className={inputCls} value={form.variantId} onChange={e => setForm(f => ({ ...f, variantId: e.target.value }))} placeholder="UUID — leave blank for product-level stock" />
              </div>
              {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.productId || !form.sku || !form.availableQuantity} className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: primary }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
