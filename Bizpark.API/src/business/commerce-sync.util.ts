export function getCommerceConfig() {
    return {
        commerceUrl: (process.env.COMMERCE_URL || 'http://localhost:3003').replace(/\/$/, ''),
        internalKey: process.env.INTERNAL_API_KEY || '',
    };
}

export async function fetchCommerceWebsiteConfig(businessId: string): Promise<Record<string, unknown> | null> {
    const { commerceUrl, internalKey } = getCommerceConfig();
    try {
        const resp = await fetch(`${commerceUrl}/api/commerce/website-config`, {
            headers: {
                'Content-Type': 'application/json',
                'x-tenant-id': businessId,
                ...(internalKey ? { 'x-internal-key': internalKey } : {}),
            },
        });
        if (!resp.ok) return null;
        const json = await resp.json();
        return (json?.data ?? json) as Record<string, unknown>;
    } catch {
        return null;
    }
}

export async function patchCommerceWebsiteConfig(
    businessId: string,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const { commerceUrl, internalKey } = getCommerceConfig();
    const resp = await fetch(`${commerceUrl}/api/commerce/website-config`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': businessId,
            'x-internal-key': internalKey,
        },
        body: JSON.stringify(payload),
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || `Commerce sync failed (${resp.status})`);
    }
    const json = await resp.json();
    return (json?.data ?? json) as Record<string, unknown>;
}
