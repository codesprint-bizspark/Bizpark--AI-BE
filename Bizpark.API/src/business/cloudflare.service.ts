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

  /**
   * No-op. A DNS-only wildcard `*.bizspark.online` -> VM now resolves every
   * tenant subdomain instantly (served with a Let's Encrypt wildcard cert), so
   * we no longer create a per-tenant record. Creating one (a proxied CNAME)
   * would actually *override* the wildcard and re-introduce the propagation /
   * NXDOMAIN delay, so we deliberately do nothing here.
   */
  async createSubdomain(slug: string): Promise<void> {
    this.logger.log(
      `Subdomain ${slug}.${this.baseDomain} is served by the wildcard DNS — no per-record needed`,
    );
  }
}
