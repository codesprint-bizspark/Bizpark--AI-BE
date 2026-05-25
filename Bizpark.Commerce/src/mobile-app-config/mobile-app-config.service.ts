import { Injectable } from '@nestjs/common';
import { TenantDataSourceFactory } from '../db/tenant-datasource.factory';
import { MobileAppConfigEntity } from '../db/entities';

type ConfigPayload = Partial<{
  businessName: string;
  tagline: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  isPublished: boolean;
  config: Record<string, unknown>;
}>;

@Injectable()
export class MobileAppConfigService {
  constructor(private readonly tenantDb: TenantDataSourceFactory) {}

  async get(tenantId: string): Promise<MobileAppConfigEntity> {
    const repo = await this.repo(tenantId);
    let config = await repo.findOne({ where: {} });
    if (!config) {
      config = await repo.save(repo.create({}));
    }
    return config;
  }

  async update(tenantId: string, payload: ConfigPayload): Promise<MobileAppConfigEntity> {
    const repo = await this.repo(tenantId);
    let config = await repo.findOne({ where: {} });
    if (!config) config = repo.create({});

    if (payload.businessName !== undefined) config.businessName = payload.businessName;
    if (payload.tagline !== undefined) config.tagline = payload.tagline ?? null;
    if (payload.primaryColor !== undefined) config.primaryColor = payload.primaryColor;
    if (payload.accentColor !== undefined) config.accentColor = payload.accentColor;
    if (payload.backgroundColor !== undefined) config.backgroundColor = payload.backgroundColor;
    if (payload.isPublished !== undefined) config.isPublished = payload.isPublished;

    // Deep-merge config so agent can update one section without wiping others
    if (payload.config !== undefined) {
      config.config = { ...(config.config ?? {}), ...payload.config };
    }

    return repo.save(config);
  }

  private async repo(tenantId: string) {
    const ds = await this.tenantDb.getDataSource(tenantId);
    return ds.getRepository(MobileAppConfigEntity);
  }
}
