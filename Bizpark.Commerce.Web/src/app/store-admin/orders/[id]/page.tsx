'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { getOrder, adminUpdateOrderStatus } from '@/lib/api';
import type { Order } from '@/types';

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-blue-100 text-blue-800',
  FULFILLED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['FULFILLED', 'CANCELLED'],
  FULFILLED: [],
  CANCELLED: [],
};

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { token, config } = useApp();
  const primary = config?.primaryColor ?? '#2563eb';
  const currency = config?.currency ?? 'USD';
  const [order, setOrder] = useState<Order | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

  useEffect(() => {
    if (!token) return;
    getOrder(id, token).then(r => setOrder(r.data)).catch(() => router.push('/store-admin/orders'));
  }, [id, token, router]);

  const handleStatus = async (status: 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED') => {
    if (!token || !order) return;
    setError(''); setUpdating(true);
    try {
      const res = await adminUpdateOrderStatus(token, order.id, status);
      setOrder(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  if (!order) return <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>;

  const nextStatuses = TRANSITIONS[order.status] ?? [];
  const shipping = order.shippingLine1
    ? [order.shippingName, order.shippingLine1, order.shippingLine2, `${order.shippingCity}, ${order.shippingState} ${order.shippingPostalCode}`, order.shippingCountry].filter(Boolean).join('\n')
    : null;

  return (
    <div>
      <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1">← Back to Orders</button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order #{order.id.slice(0, 8).toUpperCase()}</h1>
          <p className="text-sm text-gray-500 mt-1">{new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <span className={`text-sm font-semibold px-3 py-1 rounded-full ${STATUS_STYLE[order.status] ?? ''}`}>{order.status}</span>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Items */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50"><p className="text-sm font-semibold text-gray-700">Items</p></div>
            {order.items.map(item => (
              <div key={item.id} className="flex justify-between px-5 py-3 border-b last:border-0 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{item.unitTitle}</p>
                  <p className="text-xs text-gray-500">{fmt(item.unitPrice)} × {item.quantity}</p>
                </div>
                <p className="font-medium">{fmt(item.subtotal)}</p>
              </div>
            ))}
            <div className="flex justify-between px-5 py-3 bg-gray-50 font-bold text-gray-900 text-sm">
              <span>Total</span><span>{fmt(order.totalAmount)}</span>
            </div>
          </div>

          {/* Shipping */}
          {shipping && (
            <div className="bg-white border rounded-xl p-5">
              <p className="text-sm font-semibold text-gray-700 mb-2">Shipping Address</p>
              <p className="text-sm text-gray-600 whitespace-pre-line">{shipping}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <div className="bg-white border rounded-xl p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Update Status</p>
            {nextStatuses.length === 0 ? (
              <p className="text-xs text-gray-400">Terminal state — no further transitions</p>
            ) : (
              <div className="space-y-2">
                {nextStatuses.map(s => (
                  <button
                    key={s}
                    onClick={() => handleStatus(s as 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED')}
                    disabled={updating}
                    className="w-full py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    Mark as {s}
                  </button>
                ))}
              </div>
            )}
            {error && <p className="text-xs text-red-500 mt-3 bg-red-50 px-2 py-1.5 rounded">{error}</p>}
          </div>

          <div className="bg-white border rounded-xl p-5 text-sm">
            <p className="font-semibold text-gray-700 mb-2">Customer</p>
            <p className="text-gray-500 text-xs font-mono">{order.customerId.slice(0, 16)}…</p>
          </div>
        </div>
      </div>
    </div>
  );
}
