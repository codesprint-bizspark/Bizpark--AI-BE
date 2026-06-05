// commerce storefront entry
import { cookies } from 'next/headers';
import { getWebsiteConfig, getProducts } from '@/lib/api';
import HomeClient from './HomeClient';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const sp = await searchParams;
  // ?tenant= takes priority; fall back to cookie set by middleware on prior visit
  const cookieStore = await cookies();
  const tenantOverride = sp?.tenant || cookieStore.get('bizpark_tenant')?.value || undefined;

  const [configRes, productsRes] = await Promise.all([
    getWebsiteConfig(tenantOverride).catch(() => null),
    getProducts({ limit: 8 }, tenantOverride).catch(() => null),
  ]);

  if (configRes?.data?.isPublished === false) {
    return (
      <main className="min-h-screen grid place-items-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-bold">This store is currently unavailable</h1>
          <p className="mt-3 text-gray-600">Please check back later.</p>
        </div>
      </main>
    );
  }

  return (
    <HomeClient
      config={configRes?.data ?? null}
      featuredProducts={productsRes?.data ?? []}
    />
  );
}
