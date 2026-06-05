'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getProduct, getVariants, addToCart } from '@/lib/api';
import type { Product, ProductVariant } from '@/types';
import { useApp } from '@/context/AppContext';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { config, user, token, refreshCart } = useApp();
  const primary = config?.primaryColor ?? '#2563eb';
  const currency = config?.currency ?? 'USD';

  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>();
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getProduct(id).then(r => setProduct(r.data)).catch(() => router.push('/shop'));
    getVariants(id).then(r => setVariants(r.data)).catch(() => {});
  }, [id, router]);

  if (!product) {
    return <div className="flex items-center justify-center min-h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: primary }} /></div>;
  }

  const price = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    Number(selectedVariant
      ? (variants.find(v => v.id === selectedVariant)?.price ?? product.price)
      : product.price)
  );

  const handleAddToCart = async () => {
    if (!user || !token) { router.push('/auth'); return; }
    setError('');
    setAdding(true);
    try {
      await addToCart(user.id, product.id, quantity, token, selectedVariant);
      await refreshCart();
      router.push('/cart');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add to cart');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1">
        ← Back
      </button>

      <div className="grid md:grid-cols-2 gap-12">
        {/* Product image — falls back to a placeholder when none is set */}
        <div className="aspect-square rounded-2xl flex items-center justify-center overflow-hidden" style={{ backgroundColor: `${primary}10` }}>
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover" />
          ) : (
            <svg className="w-24 h-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold text-gray-900">{product.title}</h1>
          <p className="text-3xl font-bold mt-3" style={{ color: primary }}>{price}</p>

          {product.description && (
            <p className="mt-4 text-gray-600 leading-relaxed">{product.description}</p>
          )}

          {/* Variants */}
          {variants.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-medium text-gray-700 mb-2">Variant</p>
              <div className="flex flex-wrap gap-2">
                {variants.filter(v => v.isActive).map(v => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariant(v.id)}
                    className="px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors"
                    style={
                      selectedVariant === v.id
                        ? { backgroundColor: primary, color: '#fff', borderColor: primary }
                        : {}
                    }
                  >
                    {v.title}
                    {v.price != null && Number(v.price) !== Number(product.price) && (
                      <span className="ml-1 text-xs opacity-75">
                        (+{new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(v.price) - Number(product.price))})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div className="mt-6 flex items-center gap-3">
            <p className="text-sm font-medium text-gray-700">Qty</p>
            <div className="flex items-center border rounded-lg overflow-hidden">
              <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="px-3 py-2 text-gray-600 hover:bg-gray-50">−</button>
              <span className="px-4 py-2 text-sm font-medium">{quantity}</span>
              <button onClick={() => setQuantity(q => q + 1)} className="px-3 py-2 text-gray-600 hover:bg-gray-50">+</button>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

          <button
            onClick={handleAddToCart}
            disabled={adding}
            className="mt-8 w-full py-3 rounded-xl font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: primary }}
          >
            {adding ? 'Adding...' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
}
