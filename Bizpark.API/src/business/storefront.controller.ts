import { Controller, Get, Param } from '@nestjs/common';
import { SubdomainService } from './subdomain.service';

/**
 * Public (no-auth) storefront helpers. The commerce-web middleware calls
 * `GET /api/storefront/resolve/:slug` to turn a tenant subdomain label
 * (e.g. "olybella") into the tenant id used to scope the Commerce schema.
 */
@Controller('api/storefront')
export class StorefrontController {
  constructor(private readonly subdomain: SubdomainService) {}

  @Get('resolve/:slug')
  resolve(@Param('slug') slug: string) {
    return this.subdomain.resolveBySlug(slug);
  }
}
