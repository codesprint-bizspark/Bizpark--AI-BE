'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Product } from '@/types';
import { useApp } from '@/context/AppContext';
import { addToCart } from '@/lib/api';
import { useState } from 'react';

interface Props {
  product: Product;
  currency?: string;
}

export default function ProductCard({ product, currency = 'USD' }: Props) {
  const { config, user, token, refreshCart } = useApp();
  const router = useRouter();
  const primary = config?.primaryColor ?? '#2563eb';
  const [adding, setAdding] = useState(false);

  const price = new Intl.NumberFormat('en-US', {
    style: 'currency', currency,
  }).format(Number(product.price));

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user || !token) {
      router.push('/auth');
      return;
    }
    setAdding(true);
    try {
      await addToCart(user.id, product.id, 1, token);
      await refreshCart();
    } catch {
      // silent — user can retry
    } finally {
      setAdding(false);
    }
  };

  return (
    <Link href={`/shop/${product.id}`} className="group flex flex-col bg-white rounded-xl border hover:shadow-md transition-shadow overflow-hidden">
      {/* Product image — falls back to a placeholder when none is set */}
      <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden" style={{ backgroundColor: `${primary}10` }}>
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
          </svg>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-medium text-gray-900 text-sm line-clamp-2 flex-1">{product.title}</h3>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="font-bold text-gray-900">{price}</span>
          <button
            onClick={handleAddToCart}
            disabled={adding}
            className="text-xs px-3 py-1.5 rounded-lg font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: primary }}
          >
            {adding ? '...' : '+ Cart'}
          </button>
        </div>
      </div>
    </Link>
  );
}
