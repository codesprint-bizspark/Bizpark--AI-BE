import { getTenantId } from './tenant';
import type {
  AuthUser, Cart, Category, Customer, InventoryItem, Order, PaginatedResponse,
  Product, ProductVariant, ShippingMethod, WebsiteConfig, WebsiteConfigContent,
} from '@/types';

const BASE = process.env.NEXT_PUBLIC_COMMERCE_URL || 'http://localhost:3003';

async function req<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  tenantOverride?: string,
): Promise<T> {
  const tenantId = tenantOverride || getTenantId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-tenant-id': tenantId,
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json?.message || `Request failed: ${res.status}`);
  }
  return json;
}

// ── Website Config ────────────────────────────────────────────────
export const getWebsiteConfig = (tenantOverride?: string): Promise<{ success: boolean; data: WebsiteConfig }> =>
  req('/api/commerce/website-config', {}, undefined, tenantOverride);

export const updateWebsiteConfig = (token: string, payload: Partial<{
  businessName: string;
  tagline: string | null;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  currency: string;
  locale: string;
  isPublished: boolean;
  content: Partial<WebsiteConfigContent>;
}>) =>
  req<{ success: boolean; data: WebsiteConfig }>('/api/commerce/website-config', {
    method: 'PATCH', body: JSON.stringify(payload),
  }, token);

// ── Auth ──────────────────────────────────────────────────────────
export const register = (email: string, password: string, name: string) =>
  req<{ access_token: string; user: AuthUser }>('/api/commerce/auth/register', {
    method: 'POST', body: JSON.stringify({ email, password, name }),
  });

export const login = (email: string, password: string) =>
  req<{ access_token: string; user: AuthUser }>('/api/commerce/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  });

export const getMe = (token: string) =>
  req<{ success: boolean; data: AuthUser }>('/api/commerce/auth/me', {}, token);

// ── Catalog — Public ──────────────────────────────────────────────
export const getProducts = (params?: { search?: string; categoryId?: string; page?: number; limit?: number }, tenantOverride?: string) => {
  const q = new URLSearchParams();
  if (params?.search) q.set('search', params.search);
  if (params?.categoryId) q.set('categoryId', params.categoryId);
  if (params?.page) q.set('page', String(params.page));
  if (params?.limit) q.set('limit', String(params.limit));
  return req<{ success: boolean } & PaginatedResponse<Product>>(`/api/commerce/catalog/products?${q}`, {}, undefined, tenantOverride);
};

export const getProduct = (id: string) =>
  req<{ success: boolean; data: Product }>(`/api/commerce/catalog/products/${id}`);

export const getVariants = (productId: string) =>
  req<{ success: boolean; data: ProductVariant[] }>(`/api/commerce/catalog/products/${productId}/variants`);

export const getCategories = () =>
  req<{ success: boolean; data: Category[] }>('/api/commerce/catalog/categories');

// ── Catalog — Admin ───────────────────────────────────────────────
export const adminCreateProduct = (token: string, dto: { title: string; description?: string; price: number; currency?: string; categoryId?: string; imageUrl?: string | null }) =>
  req<{ success: boolean; data: Product }>('/api/commerce/catalog/products', {
    method: 'POST', body: JSON.stringify(dto),
  }, token);

export const adminUpdateProduct = (token: string, id: string, dto: Partial<{ title: string; description: string | null; price: number; currency: string; categoryId: string | null; imageUrl: string | null }>) =>
  req<{ success: boolean; data: Product }>(`/api/commerce/catalog/products/${id}`, {
    method: 'PATCH', body: JSON.stringify(dto),
  }, token);

/** Uploads a product image to Supabase Storage; returns the public URL. */
export const adminUploadProductImage = async (token: string, file: File): Promise<string> => {
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = {
    'x-tenant-id': getTenantId(),
    Authorization: `Bearer ${token}`,
  };
  const res = await fetch(`${BASE}/api/commerce/catalog/products/media`, {
    method: 'POST', headers, body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || `Upload failed: ${res.status}`);
  const url = json?.data?.url;
  if (!url) throw new Error('No URL returned from upload');
  return url;
};

export const adminDeleteProduct = (token: string, id: string) =>
  req<{ success: boolean; data: Product }>(`/api/commerce/catalog/products/${id}`, {
    method: 'DELETE',
  }, token);

export const adminCreateCategory = (token: string, dto: { name: string; slug: string; description?: string; parentId?: string | null; sortOrder?: number }) =>
  req<{ success: boolean; data: Category }>('/api/commerce/catalog/categories', {
    method: 'POST', body: JSON.stringify(dto),
  }, token);

export const adminUpdateCategory = (token: string, id: string, dto: Partial<{ name: string; slug: string; description: string; isActive: boolean; sortOrder: number }>) =>
  req<{ success: boolean; data: Category }>(`/api/commerce/catalog/categories/${id}`, {
    method: 'PATCH', body: JSON.stringify(dto),
  }, token);

export const adminDeleteCategory = (token: string, id: string) =>
  req<{ success: boolean; data: Category }>(`/api/commerce/catalog/categories/${id}`, {
    method: 'DELETE',
  }, token);

export const adminCreateVariant = (token: string, productId: string, dto: { title: string; sku: string; price?: number | null; attributes?: Record<string, string> }) =>
  req<{ success: boolean; data: ProductVariant }>(`/api/commerce/catalog/products/${productId}/variants`, {
    method: 'POST', body: JSON.stringify(dto),
  }, token);

export const adminUpdateVariant = (token: string, productId: string, variantId: string, dto: Partial<{ title: string; sku: string; price: number | null; isActive: boolean; attributes: Record<string, string> }>) =>
  req<{ success: boolean; data: ProductVariant }>(`/api/commerce/catalog/products/${productId}/variants/${variantId}`, {
    method: 'PATCH', body: JSON.stringify(dto),
  }, token);

export const adminDeleteVariant = (token: string, productId: string, variantId: string) =>
  req<{ success: boolean; data: ProductVariant }>(`/api/commerce/catalog/products/${productId}/variants/${variantId}`, {
    method: 'DELETE',
  }, token);

// ── Cart ──────────────────────────────────────────────────────────
export const getCart = (customerId: string, token: string) =>
  req<{ success: boolean; data: Cart }>(`/api/commerce/cart/${customerId}`, {}, token);

export const addToCart = (customerId: string, productId: string, quantity: number, token: string, variantId?: string) =>
  req<{ success: boolean; data: Cart }>(`/api/commerce/cart/${customerId}/items`, {
    method: 'POST',
    body: JSON.stringify({ productId, quantity, variantId: variantId ?? null }),
  }, token);

export const updateCartItem = (customerId: string, itemId: string, quantity: number, token: string) =>
  req<{ success: boolean; data: Cart }>(`/api/commerce/cart/${customerId}/items/${itemId}`, {
    method: 'PATCH', body: JSON.stringify({ quantity }),
  }, token);

export const removeCartItem = (customerId: string, itemId: string, token: string) =>
  req<{ success: boolean; data: Cart }>(`/api/commerce/cart/${customerId}/items/${itemId}`, {
    method: 'DELETE',
  }, token);

// ── Checkout ──────────────────────────────────────────────────────
export const beginCheckout = (customerId: string, token: string) =>
  req<{ success: boolean; data: object }>('/api/commerce/checkout/begin', {
    method: 'POST', body: JSON.stringify({ customerId }),
  }, token);

export const completeCheckout = (
  customerId: string,
  token: string,
  shippingAddress?: {
    name: string; line1: string; line2?: string;
    city: string; state?: string; postalCode: string; country: string;
  },
) =>
  req<{ success: boolean; order: Order }>('/api/commerce/checkout/complete', {
    method: 'POST', body: JSON.stringify({ customerId, shippingAddress }),
  }, token);

// ── Orders ────────────────────────────────────────────────────────
export const getOrders = (token: string, page = 1, status?: string) => {
  const q = new URLSearchParams({ page: String(page) });
  if (status) q.set('status', status);
  return req<{ success: boolean } & PaginatedResponse<Order>>(`/api/commerce/orders?${q}`, {}, token);
};

export const getOrder = (id: string, token: string) =>
  req<{ success: boolean; data: Order }>(`/api/commerce/orders/${id}`, {}, token);

export const cancelOrder = (id: string, token: string) =>
  req<{ success: boolean; data: Order }>(`/api/commerce/orders/${id}/cancel`, { method: 'PATCH' }, token);

export const adminUpdateOrderStatus = (token: string, id: string, status: 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED') =>
  req<{ success: boolean; data: Order }>(`/api/commerce/orders/${id}/status`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  }, token);

// ── Inventory — Admin ─────────────────────────────────────────────
export const adminGetInventory = (token: string, page = 1) =>
  req<{ success: boolean } & PaginatedResponse<InventoryItem>>(`/api/commerce/inventory?page=${page}`, {}, token);

export const adminGetInventoryByProduct = (token: string, productId: string) =>
  req<{ success: boolean; data: InventoryItem[] }>(`/api/commerce/inventory/items/${productId}`, {}, token);

export const adminUpsertInventory = (token: string, dto: { productId: string; sku: string; availableQuantity: number; variantId?: string }) =>
  req<{ success: boolean; data: InventoryItem }>('/api/commerce/inventory/upsert', {
    method: 'POST', body: JSON.stringify(dto),
  }, token);

// ── Auth — Profile ────────────────────────────────────────────────
export const updateProfile = (token: string, dto: { name?: string; currentPassword?: string; newPassword?: string }) =>
  req<{ success: boolean; data: AuthUser }>('/api/commerce/auth/profile', {
    method: 'PATCH', body: JSON.stringify(dto),
  }, token);

// ── Auth — Logout / Admin Register ────────────────────────────────
export const apiLogout = (token: string) =>
  req<{ success: boolean }>('/api/commerce/auth/logout', { method: 'POST' }, token);

export const adminRegisterAdmin = (token: string, dto: { email: string; password: string; name: string }) =>
  req<{ access_token: string; user: AuthUser }>('/api/commerce/auth/admin/register', {
    method: 'POST', body: JSON.stringify(dto),
  }, token);

// ── Customers — Admin ─────────────────────────────────────────────
export const adminListCustomers = (token: string) =>
  req<{ success: boolean; data: Customer[] }>('/api/commerce/customers', {}, token);

export const adminGetCustomer = (token: string, id: string) =>
  req<{ success: boolean; data: Customer }>(`/api/commerce/customers/${id}`, {}, token);

export const adminCreateCustomer = (token: string, dto: { email: string; password: string; name?: string }) =>
  req<{ success: boolean; data: Customer }>('/api/commerce/customers', {
    method: 'POST', body: JSON.stringify(dto),
  }, token);

export const adminUpdateCustomer = (token: string, id: string, dto: { name?: string; role?: string }) =>
  req<{ success: boolean; data: Customer }>(`/api/commerce/customers/${id}`, {
    method: 'PATCH', body: JSON.stringify(dto),
  }, token);

// ── Shipping ──────────────────────────────────────────────────────
export const getShippingMethods = () =>
  req<{ success: boolean; data: ShippingMethod[] }>('/api/commerce/shipping/methods');

export const adminCreateShippingMethod = (token: string, dto: { code: string; label: string; flatRate: number; currency?: string; active?: boolean }) =>
  req<{ success: boolean; data: ShippingMethod }>('/api/commerce/shipping/methods', {
    method: 'POST', body: JSON.stringify(dto),
  }, token);

export const adminUpdateShippingMethod = (token: string, id: string, dto: { label?: string; flatRate?: number; currency?: string; active?: boolean }) =>
  req<{ success: boolean; data: ShippingMethod }>(`/api/commerce/shipping/methods/${id}`, {
    method: 'PATCH', body: JSON.stringify(dto),
  }, token);

export const adminDeleteShippingMethod = (token: string, id: string) =>
  req<{ success: boolean; data: ShippingMethod }>(`/api/commerce/shipping/methods/${id}`, {
    method: 'DELETE',
  }, token);
