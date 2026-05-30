import Constants from 'expo-constants';
import type { MobileAppConfig, CommerceConfigResponse } from '../types/config';

const COMMERCE_URL =
  (Constants.expoConfig?.extra?.COMMERCE_URL as string | undefined) ??
  process.env.EXPO_PUBLIC_COMMERCE_URL ??
  'http://localhost:3003';

/**
 * Fetch the AI-generated mobile app config for a specific tenant.
 * The React Native template calls this on boot; each business gets its own config.
 *
 * @param tenantId - the business UUID (from deep-link, QR code, or baked-in env var)
 */
export async function fetchMobileAppConfig(tenantId: string): Promise<MobileAppConfig | null> {
  try {
    const res = await fetch(`${COMMERCE_URL}/api/commerce/mobile-app-config`, {
      headers: {
        'x-tenant-id': tenantId,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.warn(`[MobileConfig] Failed to fetch config for tenant ${tenantId}: ${res.status}`);
      return null;
    }

    const json = await res.json();
    const data: CommerceConfigResponse = json.data;

    // Merge top-level branding into the config blob for convenience
    if (data?.config) {
      return {
        ...data.config,
        businessName: data.businessName ?? data.config.businessName,
        primaryColor: data.primaryColor ?? data.config.primaryColor,
        accentColor: data.accentColor ?? data.config.accentColor,
        backgroundColor: data.backgroundColor ?? data.config.backgroundColor,
        tagline: data.tagline ?? data.config.tagline,
      };
    }

    return null;
  } catch (err) {
    console.error('[MobileConfig] Fetch error:', err);
    return null;
  }
}

/** Default fallback config shown when no tenant config is available */
export const DEFAULT_CONFIG: MobileAppConfig = {
  businessName: 'My Business',
  tagline: 'Welcome to our app',
  primaryColor: '#2563eb',
  accentColor: '#f59e0b',
  backgroundColor: '#ffffff',
  appIcon: { emoji: '🏪', backgroundColor: '#2563eb' },
  splashScreen: { title: 'My Business', subtitle: 'Welcome' },
  navigation: [
    { key: 'home',    label: 'Home',    icon: 'home' },
    { key: 'menu',    label: 'Menu',    icon: 'grid' },
    { key: 'orders',  label: 'Orders',  icon: 'receipt' },
    { key: 'profile', label: 'Profile', icon: 'person' },
  ],
  screens: {
    home: {
      heroTitle: 'Welcome!',
      heroSubtitle: 'Explore what we have to offer.',
      ctaText: 'Get Started',
      promoText: 'Check out our latest offers',
    },
    about: {
      title: 'About Us',
      text: 'We are a passionate business dedicated to serving you.',
    },
  },
  appStoreDescription: 'The official app for My Business.',
  appStoreKeywords: 'business, shop, order',
  notificationMessages: {
    orderConfirmed: 'Your order is confirmed!',
    orderReady: 'Your order is ready for pickup!',
  },
};
