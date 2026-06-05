import { NextRequest, NextResponse } from 'next/server';

/**
 * Tenant resolution middleware.
 *
 * Priority order:
 *   1. Query param  → ?tenant=<uuid>  (fixed store host, e.g. store.bizspark.online)
 *   2. Subdomain    → olybella.bizspark.online extracts "olybella" (a slug) and
 *                     resolves it to the tenant id via the Application API.
 *   3. Existing cookie (already a resolved tenant id)
 *
 * The resolved tenant id is forwarded as:
 *   - x-tenant-id request header  → consumed by the Commerce API (schema scope)
 *   - bizpark_tenant cookie        → caches the resolution for future requests
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve a storefront slug ("olybella") to its tenant id via the API. */
async function resolveSlug(slug: string): Promise<string | null> {
  const base =
    process.env.INTERNAL_API_URL ||
    `https://${process.env.NEXT_PUBLIC_BASE_DOMAIN || 'bizspark.online'}`;
  try {
    const res = await fetch(
      `${base}/api/storefront/resolve/${encodeURIComponent(slug)}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.tenantId ?? null;
  } catch {
    return null;
  }
}

export default async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'bizspark.online';
  const { searchParams } = request.nextUrl;

  // 1. Explicit ?tenant= (a uuid) wins.
  let tenant: string | null = searchParams.get('tenant');
  let fromSubdomain = false;

  // 2. Otherwise derive from the subdomain (skip bare IPs and reserved labels).
  const isIp = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(hostname);
  if (!tenant && !isIp) {
    const parts = hostname.split('.');
    if (parts.length >= 3 || (parts.length === 2 && hostname.endsWith(baseDomain))) {
      const sub = parts[0];
      if (sub !== 'www' && sub !== 'app' && sub !== 'store' && sub !== baseDomain.split('.')[0]) {
        tenant = sub;
        fromSubdomain = true;
      }
    }
  }

  // 3. Fallback: existing cookie (already a resolved tenant id).
  if (!tenant) {
    tenant = request.cookies.get('bizpark_tenant')?.value ?? null;
  }

  if (!tenant) {
    return NextResponse.next();
  }

  // A subdomain label is a slug — resolve to the tenant id (unless cached / a uuid).
  if (fromSubdomain && !UUID_RE.test(tenant)) {
    const cached = request.cookies.get('bizpark_tenant')?.value;
    if (cached && UUID_RE.test(cached)) {
      tenant = cached;
    } else {
      const resolved = await resolveSlug(tenant);
      if (!resolved) {
        // Unknown store — let the app render its empty/not-found state.
        return NextResponse.next();
      }
      tenant = resolved;
    }
  }

  // Forward tenant via header + refresh cookie.
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
