// ── Website Config ─────────────────────────────────────────────────

export interface WebsiteConfigContent {
  announcement?: {
    enabled: boolean;
    text: string;
    bgColor?: string;
    textColor?: string;
  };
  hero?: {
    title?: string;
    subtitle?: string;
    imageUrl?: string;
    ctaText?: string;   // e.g. "Shop Now"
    ctaLink?: string;   // e.g. "/shop"
  };
  features?: Array<{
    icon: string;       // 'truck' | 'refresh' | 'shield' | 'sparkles' | 'headphones'
    title: string;
    description: string;
  }>;
  about?: {
    title?: string;
    text?: string;
    imageUrl?: string;
  };
  footer?: {
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    socialLinks?: {
      instagram?: string;
      facebook?: string;
      twitter?: string;
      tiktok?: string;
    };
    policies?: {
      returns?: string;
      shipping?: string;
    };
  };
  seo?: {
    metaDescription?: string;
    ogImageUrl?: string;
    keywords?: string;
  };
}

export interface WebsiteConfig {
  id: string;
  businessName: string;
  tagline: string | null;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  currency: string;
  locale: string;
  isPublished: boolean;
  content: WebsiteConfigContent | null;
  updatedAt: string;
}

// ── Catalog ────────────────────────────────────────────────────────

export interface Product {
  id: string;
  title: string;
  description: string | null;
  price: number | string; // backend returns decimal as string; JS coercion handles math
  currency: string;
  categoryId: string | null;
  imageUrl?: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  title: string;
  attributes: Record<string, string>;
  price: number | string | null; // backend returns decimal as string
  sku: string;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  children: Category[];
}

// ── Cart ───────────────────────────────────────────────────────────

export interface CartItem {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  unitTitle: string;
}

export interface Cart {
  id: string;
  customerId: string;
  items: CartItem[];
}

// ── Orders ─────────────────────────────────────────────────────────

export interface OrderItem {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  unitTitle: string;
  subtotal: number;
}

export interface Order {
  id: string;
  customerId: string;
  status: 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED';
  totalAmount: number;
  shippingName: string | null;
  shippingLine1: string | null;
  shippingLine2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  items: OrderItem[];
  createdAt: string;
}

// ── Auth ───────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'CUSTOMER';
  tenantId: string;
}

// ── Inventory ──────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  productId: string;
  variantId: string | null;
  sku: string;
  availableQuantity: number;
  reservedQuantity: number;
  createdAt: string;
  updatedAt: string;
}

// ── Customers ──────────────────────────────────────────────────────

export interface Customer {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

// ── Shipping ───────────────────────────────────────────────────────

export interface ShippingMethod {
  id: string;
  code: string;
  label: string;
  flatRate: number;
  currency: string;
  active: boolean;
}

// ── Shared ─────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
