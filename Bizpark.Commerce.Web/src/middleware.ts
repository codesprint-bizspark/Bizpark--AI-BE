import { NextRequest, NextResponse } from 'next/server';

/**
 * Tenant resolution middleware.
 *
 * Priority order:
 *   1. Subdomain  → mybiz.bizpark.app extracts "mybiz"
 *   2. Query param → ?tenant=mybiz  (fallback for local dev / preview)
 *   3. Existing cookie (already set from a previous visit)
 *
 * The resolved tenant is forwarded as:
 *   - x-tenant-id request header  → consumed by Commerce API
 *   - bizpark_tenant cookie        → persisted for future requests
 */
export default function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'adeepak.me';
  const { searchParams } = request.nextUrl;

  // 1. Explicit ?tenant= wins — lets a single fixed storefront host
  //    (e.g. store.bizspark.randitha.net/?tenant=<id>) serve any tenant.
  let tenant: string | null = searchParams.get('tenant');

  // 2. Otherwise derive from the subdomain (skip bare IPs and reserved labels)
  const isIp = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(hostname);
  if (!tenant && !isIp) {
    const parts = hostname.split('.');
    if (
      parts.length >= 3 ||
      (parts.length === 2 && hostname.endsWith(baseDomain))
    ) {
      const sub = parts[0];
      // Ignore www, app, store and the root domain itself
      if (sub !== 'www' && sub !== 'app' && sub !== 'store' && sub !== baseDomain.split('.')[0]) {
        tenant = sub;
      }
    }
  }

  // 3. Fallback: existing cookie
  if (!tenant) {
    tenant = request.cookies.get('bizpark_tenant')?.value ?? null;
  }

  if (!tenant) {
    return NextResponse.next();
  }

  // Forward tenant via header + refresh cookie
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-id', tenant);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set('bizpark_tenant', tenant, {
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    sameSite: 'lax',
    secure: process.env.SECURE_COOKIE === 'true',
  });

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
