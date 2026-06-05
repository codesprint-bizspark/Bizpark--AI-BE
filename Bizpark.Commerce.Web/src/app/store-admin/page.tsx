'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getProducts, getOrders, getCategories, adminGetInventory } from '@/lib/api';
import Link from 'next/link';

interface Stat { label: string; value: string | number; href: string }

export default function AdminDashboard() {
  const { token, config } = useApp();
  const primary = config?.primaryColor ?? '#2563eb';
  const [stats, setStats] = useState<Stat[]>([]);
  const [recentOrders, setRecentOrders] = useState<{ id: string; status: string; totalAmount: number; createdAt: string }[]>([]);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      getProducts({ limit: 1 }).catch(() => null),
      getOrders(token, 1).catch(() => null),
      getCategories().catch(() => null),
      adminGetInventory(token, 1).catch(() => null),
    ]).then(([products, orders, cats, inv]) => {
      setStats([
        { label: 'Total Products', value: products?.total ?? 'â€”', href: '/store-admin/products' },
        { label: 'Total Orders', value: orders?.total ?? 'â€”', href: '/store-admin/orders' },
        { label: 'Categories', value: cats?.data?.length ?? 'â€”', href: '/store-admin/categories' },
        { label: 'Inventory Items', value: inv?.total ?? 'â€”', href: '/store-admin/inventory' },
      ]);
      if (orders?.data) setRecentOrders(orders.data.slice(0, 5));
    });
  }, [token]);

  const STATUS_STYLE: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    PAID: 'bg-blue-100 text-blue-800',
    FULFILLED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-gray-100 text-gray-500',
  };

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: config?.currency ?? 'USD' }).format(n);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {stats.map(s => (
          <Link key={s.label} href={s.href} className="bg-white border rounded-xl p-5 hover:shadow-sm transition-shadow">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-3xl font-bold mt-1" style={{ color: primary }}>{s.value}</p>
          </Link>
        ))}
      </div>

      {/* Recent Orders */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <p className="font-semibold text-gray-900">Recent Orders</p>
          <Link href="/store-admin/orders" className="text-sm font-medium hover:underline" style={{ color: primary }}>View all â†’</Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">No orders yet</p>
        ) : (
          recentOrders.map(o => (
            <Link key={o.id} href={`/store-admin/orders/${o.id}`} className="flex items-center px-6 py-4 border-b last:border-0 hover:bg-gray-50 transition-colors">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">#{o.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-xs text-gray-500">{new Date(o.createdAt).toLocaleDateString()}</p>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full mr-4 ${STATUS_STYLE[o.status] ?? ''}`}>{o.status}</span>
              <p className="font-bold text-gray-900 text-sm">{fmt(o.totalAmount)}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
