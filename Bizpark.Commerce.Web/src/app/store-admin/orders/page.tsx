'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getOrders } from '@/lib/api';
import type { Order } from '@/types';
import Link from 'next/link';

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-blue-100 text-blue-800',
  FULFILLED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export default function AdminOrdersPage() {
  const { token, config } = useApp();
  const primary = config?.primaryColor ?? '#2563eb';
  const currency = config?.currency ?? 'USD';
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getOrders(token, page, statusFilter || undefined).then(r => {
      setOrders(r.data); setTotalPages(r.totalPages); setTotal(r.total);
    }).finally(() => setLoading(false));
  }, [token, page, statusFilter]);

  const filtered = orders;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} total</p>
        </div>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2"
        >
          <option value="">All statuses</option>
          {['PENDING', 'PAID', 'FULFILLED', 'CANCELLED'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-gray-400 text-sm">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-400 text-sm">No orders found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Order</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600 hidden md:table-cell">Date</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Total</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">#{o.id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-gray-500">{o.items.length} item{o.items.length !== 1 ? 's' : ''}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[o.status] ?? ''}`}>{o.status}</span>
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(o.totalAmount)}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/orders/${o.id}`} className="text-xs px-3 py-1 border rounded-lg hover:bg-gray-50" style={{ color: primary }}>Manage</Link>
                  </td>
                </tr>
              ))}
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
    </div>
  );
}
