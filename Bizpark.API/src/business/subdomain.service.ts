import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Client } from 'pg';
import { applicationDb } from 'bizpark.core';
import { CloudflareService } from './cloudflare.service';

type CurrentUser = { id: string };

// System subdomains a tenant must never be able to claim.
const RESERVED = new Set([
  'www', 'app', 'api', 'admin', 'store', 'commerce', 'mcp', 'argocd',
  'bizspark', 'mail', 'ftp', 'dashboard', 'cdn', 'assets', 'static',
  'blog', 'help', 'support', 'status', 'dev', 'staging', 'test', 'auth',
]);

// DNS label rules: lowercase letters/digits/hyphens, no leading/trailing hyphen.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

/** Normalise arbitrary input into a DNS-safe slug. */
export function slugify(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}

@Injectable()
export class SubdomainService implements OnModuleInit {
  private readonly logger = new Logger(SubdomainService.name);

  constructor(private readonly cloudflare: CloudflareService) {}

  async onModuleInit() {
    // Ensure the slug column + a partial unique index exist (idempotent),
    // so we don't depend on a separate migration run at deploy time.
    try {
      await this.withAppDb(async (c) => {
        await c.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS slug VARCHAR(63)`);
        await c.query(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_slug ON businesses (slug) WHERE slug IS NOT NULL`,
        );
      });
    } catch (e) {
      this.logger.error(`Failed to ensure businesses.slug column: ${(e as Error).message}`);
    }
  }

  private async withAppDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }

  private async assertAccess(businessId: string, userId: string) {
    const rows = await applicationDb.business.findMany({
      where: { users: { some: { userId } } },
    });
    const biz = rows.find((b: any) => b.id === businessId);
    if (!biz) throw new ForbiddenException('No access to this business');
    return biz;
  }

  private validateFormat(slug: string): string | null {
    if (!slug) return 'Enter a name';
    if (slug.length < 3) return 'At least 3 characters';
    if (slug.length > 63) return 'Too long (max 63 characters)';
    if (!SLUG_RE.test(slug)) return 'Use lowercase letters, numbers and hyphens only';
    if (RESERVED.has(slug)) return 'This name is reserved';
    return null;
  }

  private async isTaken(slug: string, exceptBusinessId?: string): Promise<boolean> {
    const existing = await applicationDb.business.findBySlug({ where: { slug } });
    if (!existing) return false;
    return existing.id !== exceptBusinessId;
  }

  private async suggest(base: string): Promise<string[]> {
    const candidates = [`${base}-store`, `${base}-shop`, `${base}-lk`, `${base}-2`, `${base}-online`];
    const out: string[] = [];
    for (const candidate of candidates) {
      const s = candidate.slice(0, 63);
      if (!this.validateFormat(s) && !(await this.isTaken(s))) out.push(s);
      if (out.length >= 3) break;
    }
    return out;
  }

  /** Live availability check used by the dashboard as the user types. */
  async check(rawSlug: string, businessId: string, user: CurrentUser) {
    await this.assertAccess(businessId, user.id);
    const slug = slugify(rawSlug);

    const formatErr = this.validateFormat(slug);
    if (formatErr) {
      return { available: false, slug, reason: formatErr, suggestions: [] as string[] };
    }
    if (await this.isTaken(slug, businessId)) {
      return { available: false, slug, reason: 'Already taken', suggestions: await this.suggest(slug) };
    }
    return { available: true, slug, reason: null, suggestions: [] as string[] };
  }

  /** Claim a subdomain: validate, persist, create the proxied DNS record. */
  async claim(rawSlug: string, businessId: string, user: CurrentUser) {
    await this.assertAccess(businessId, user.id);
    const slug = slugify(rawSlug);

    const formatErr = this.validateFormat(slug);
    if (formatErr) throw new BadRequestException(formatErr);
    if (await this.isTaken(slug, businessId)) throw new ConflictException('Already taken');

    // Persist first — the partial UNIQUE index is the final guard against races.
    try {
      await applicationDb.business.update({ where: { id: businessId }, data: { slug } });
    } catch {
      throw new ConflictException('Already taken');
    }

    // Create the storefront subdomain in Cloudflare.
    await this.cloudflare.createSubdomain(slug);

    const baseDomain = process.env.BIZSPARK_BASE_DOMAIN || 'bizspark.online';
    return { success: true, slug, url: `https://${slug}.${baseDomain}` };
  }

  /** Public: resolve a storefront slug to the tenant id (business id). */
  async resolveBySlug(rawSlug: string) {
    const slug = slugify(rawSlug);
    const biz = await applicationDb.business.findBySlug({ where: { slug } });
    if (!biz) throw new NotFoundException('Unknown store');
    return { tenantId: biz.id, name: biz.name, slug };
  }
}
