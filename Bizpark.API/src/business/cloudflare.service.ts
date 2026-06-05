import { Injectable, Logger } from '@nestjs/common';

/**
 * Minimal Cloudflare DNS client — creates a proxied CNAME for each tenant
 * storefront subdomain (<slug>.bizspark.online -> bizspark.online). Using a
 * CNAME to the apex means we never need the origin IP here; Cloudflare proxies
 * it to the same origin as the apex, and the free Universal SSL (*.bizspark.online)
 * covers the edge certificate.
 */
@Injectable()
export class CloudflareService {
  private readonly logger = new Logger(CloudflareService.name);

  private get token(): string {
    return process.env.CLOUDFLARE_API_TOKEN || '';
  }
  private get zoneId(): string {
    return process.env.CLOUDFLARE_ZONE_ID || '';
  }
  private get baseDomain(): string {
    return process.env.BIZSPARK_BASE_DOMAIN || 'bizspark.online';
  }

  get enabled(): boolean {
    return Boolean(this.token && this.zoneId);
  }

  /** Create a proxied CNAME <slug>.<baseDomain> -> <baseDomain>. Idempotent. */
  async createSubdomain(slug: string): Promise<void> {
    if (!this.enabled) {
      this.logger.warn(
        'Cloudflare not configured (CLOUDFLARE_API_TOKEN/CLOUDFLARE_ZONE_ID) — skipping DNS record',
      );
      return;
    }

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/dns_records`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'CNAME',
          name: slug,
          content: this.baseDomain,
          proxied: true,
          ttl: 1,
          comment: 'tenant storefront subdomain',
        }),
      },
    );

    const data: any = await res.json().catch(() => ({}));
    if (!data?.success) {
      // 81053 / 81057 = "record already exists" → treat as success (idempotent).
      const codes: number[] = (data?.errors || []).map((e: any) => e?.code);
      if (codes.includes(81053) || codes.includes(81057)) {
        this.logger.log(`DNS record ${slug}.${this.baseDomain} already exists — ok`);
        return;
      }
      throw new Error(
        `Cloudflare DNS create failed: ${JSON.stringify(data?.errors ?? data)}`,
      );
    }
    this.logger.log(`Created DNS record ${slug}.${this.baseDomain}`);
  }
}
