import { Injectable } from '@nestjs/common';
import { TenantDataSourceFactory } from '../db/tenant-datasource.factory';
import { WebsiteConfigEntity, WebsiteConfigContent } from '../db/entities';

type ConfigPayload = Partial<{
  businessName: string;
  tagline: string | null;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  currency: string;
  locale: string;
  isPublished: boolean;
  content: Partial<WebsiteConfigContent>;
}>;

@Injectable()
export class WebsiteConfigService {
  constructor(private readonly tenantDb: TenantDataSourceFactory) {}

  async get(tenantId: string): Promise<WebsiteConfigEntity> {
    const repo = await this.repo(tenantId);
    let config = await repo.findOne({ where: {} });
    if (!config) {
      config = await repo.save(repo.create({}));
    }
    return config;
  }

  async update(tenantId: string, payload: ConfigPayload): Promise<WebsiteConfigEntity> {
    const repo = await this.repo(tenantId);
    let config = await repo.findOne({ where: {} });
    if (!config) config = repo.create({});

    if (payload.businessName !== undefined) config.businessName = payload.businessName;
    if (payload.tagline !== undefined) config.tagline = payload.tagline ?? null;
    if (payload.primaryColor !== undefined) config.primaryColor = payload.primaryColor;
    if (payload.secondaryColor !== undefined) config.secondaryColor = payload.secondaryColor;
    if (payload.logoUrl !== undefined) config.logoUrl = payload.logoUrl ?? null;
    if (payload.faviconUrl !== undefined) config.faviconUrl = payload.faviconUrl ?? null;
    if (payload.currency !== undefined) config.currency = payload.currency;
    if (payload.locale !== undefined) config.locale = payload.locale;
    if (payload.isPublished !== undefined) config.isPublished = payload.isPublished;

    // Deep-merge content so agent can update one section without wiping others
    if (payload.content !== undefined) {
      config.content = { ...(config.content ?? {}), ...payload.content };
    }

    return repo.save(config);
  }

  private async repo(tenantId: string) {
    const ds = await this.tenantDb.getDataSource(tenantId);
    return ds.getRepository(WebsiteConfigEntity);
  }
}
