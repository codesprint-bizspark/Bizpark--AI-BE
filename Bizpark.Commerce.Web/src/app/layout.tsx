import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cookies, headers } from 'next/headers';
import { AppProvider } from '@/context/AppContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getWebsiteConfig } from '@/lib/api';
import type { WebsiteConfig } from '@/types';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

// The storefront is per-tenant: the layout resolves the tenant from the request
// (cookie / x-tenant-id header) and fetches that tenant's website config. It must
// render per request — never statically prerendered at build time (which hangs on
// the config fetch with no tenant context).
export const dynamic = 'force-dynamic';

async function getTenantFromCookie(): Promise<string | undefined> {
  try {
    const headersList = await headers();
    const tenantFromHeader = headersList.get('x-tenant-id');
    if (tenantFromHeader) return tenantFromHeader;
    const cookieStore = await cookies();
    return cookieStore.get('bizpark_tenant')?.value || undefined;
  } catch {
    return undefined;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const tenantOverride = await getTenantFromCookie();
    const res = await getWebsiteConfig(tenantOverride);
    const cfg = res.data;
    const seo = cfg?.content?.seo;
    return {
      title: cfg?.businessName ?? 'BizStore',
      description: seo?.metaDescription ?? cfg?.tagline ?? 'Your online store',
      keywords: seo?.keywords ?? undefined,
      openGraph: seo?.ogImageUrl ? { images: [seo.ogImageUrl] } : undefined,
    };
  } catch {
    return { title: 'BizStore', description: 'Your online store' };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let config: WebsiteConfig | null = null;
  try {
    const tenantOverride = await getTenantFromCookie();
    const res = await getWebsiteConfig(tenantOverride);
    config = res.data ?? null;
  } catch {
    config = null;
  }

  const primary = config?.primaryColor ?? '#2563eb';
  const secondary = config?.secondaryColor ?? '#1e40af';

  return (
    <html lang={config?.locale ?? 'en'} className={inter.variable}>
      <head>
        {config?.faviconUrl && <link rel="icon" href={config.faviconUrl} />}
        <style>{`
          :root {
            --color-primary: ${primary};
            --color-secondary: ${secondary};
            --color-primary-hover: ${secondary};
          }
          .btn-primary {
            background-color: var(--color-primary);
            color: #fff;
          }
          .btn-primary:hover {
            background-color: var(--color-secondary);
          }
          .text-primary { color: var(--color-primary); }
          .bg-primary { background-color: var(--color-primary); }
          .border-primary { border-color: var(--color-primary); }
          .ring-primary { --tw-ring-color: var(--color-primary); }
        `}</style>
      </head>
      <body className="min-h-screen flex flex-col bg-gray-50 antialiased">
        <AppProvider initialConfig={config}>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </AppProvider>
      </body>
    </html>
  );
}
