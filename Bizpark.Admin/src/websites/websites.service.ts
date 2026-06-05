import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import {
  applicationDb,
  runnerDb,
  BusinessStatus,
  TaskStatus,
  TaskType,
  WebsiteStatus,
} from 'bizpark.core';
import { AuditService } from '../common/audit.service';

type WebsiteRow = Awaited<ReturnType<typeof applicationDb.website.findMany>>[number];

export type WebsiteListQuery = {
  search?: string;
  business?: string;
  status?: string;
  template?: string;
  publishState?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
  businessId?: string;
};

@Injectable()
export class WebsitesService {
  constructor(
    @InjectQueue('agent-queue') private readonly agentQueue: Queue,
    private readonly audit: AuditService,
  ) {}

  async list(query: WebsiteListQuery = {}) {
    const websites = (await applicationDb.website.findMany({ orderBy: { createdAt: 'desc' } })).map((website) =>
      this.decorateWebsite(website),
    );
    const businesses = await applicationDb.business.findForAdmin({ orderBy: { createdAt: 'desc' } });
    const templates = [...new Set(websites.map((website) => website.templateId).filter(Boolean) as string[])].sort();
    const filtered = this.filterWebsites(websites, query);
    const sorted = this.sortWebsites(filtered, query.sort);
    const pageSize = this.toPositiveNumber(query.pageSize, 10);
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const page = Math.min(this.toPositiveNumber(query.page, 1), totalPages);
    const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

    return {
      websites: paginated,
      businesses: businesses.filter((business) => business.status !== BusinessStatus.ARCHIVED),
      templates,
      filters: {
        search: query.search ?? '',
        business: query.business ?? '',
        status: query.status ?? '',
        template: query.template ?? '',
        publishState: query.publishState ?? '',
        sort: query.sort ?? 'newest',
        page,
        pageSize,
        businessId: query.businessId ?? '',
      },
      pagination: {
        page,
        pageSize,
        total: sorted.length,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages,
      },
      stats: {
        total: websites.length,
        published: websites.filter((website) => website.status === WebsiteStatus.PUBLISHED).length,
        draft: websites.filter((website) => website.status === WebsiteStatus.DRAFT).length,
        generating: websites.filter((website) => website.status === WebsiteStatus.GENERATING).length,
      },
    };
  }

  async create(
    input: {
      businessId?: string;
      domain?: string;
      templateId?: string;
      status?: WebsiteStatus;
    },
    adminId?: string,
  ) {
    if (!input.businessId) {
      throw new NotFoundException('Business is required');
    }
    const business = await applicationDb.business.findUniqueForAdmin({ where: { id: input.businessId } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    const website = await applicationDb.website.upsert({
      where: { domain: input.domain?.trim() || null },
      update: {},
      create: {
        businessId: business.id,
        domain: input.domain?.trim() || null,
        templateId: input.templateId?.trim() || null,
        cmsData: { siteName: `${business.name} Website` },
        status: input.status ?? WebsiteStatus.DRAFT,
      },
    });
    await this.audit.record({
      adminId,
      action: 'website.create',
      targetType: 'website',
      targetId: website.id,
      afterData: website as unknown as Record<string, unknown>,
    });
    return website;
  }

  async detail(id: string) {
    const website = await applicationDb.website.findUnique({ where: { id } });
    if (!website) {
      throw new NotFoundException('Website not found');
    }
    return website;
  }

  async publish(id: string, adminId?: string) {
    const website = await this.detail(id);
    const content = (website.cmsData ?? {}) as Record<string, unknown>;
    await this.syncCommerce(website.businessId, { ...content, isPublished: true });
    const updated = await applicationDb.website.update({
      where: { id },
      data: {
        status: WebsiteStatus.PUBLISHED,
        publishedAt: new Date(),
        suspendedAt: null,
      },
    });
    await this.audit.record({
      adminId,
      action: 'website.publish',
      targetType: 'website',
      targetId: id,
      beforeData: { status: website.status },
      afterData: { status: updated.status },
    });
    return updated;
  }

  async unpublish(id: string, adminId?: string) {
    const website = await this.detail(id);
    await this.syncCommerce(website.businessId, { isPublished: false });
    const updated = await applicationDb.website.update({
      where: { id },
      data: { status: WebsiteStatus.UNPUBLISHED },
    });
    await this.audit.record({
      adminId,
      action: 'website.unpublish',
      targetType: 'website',
      targetId: id,
      beforeData: { status: website.status },
      afterData: { status: updated.status },
    });
    return updated;
  }

  async suspend(id: string, adminId?: string) {
    const website = await this.detail(id);
    await this.syncCommerce(website.businessId, { isPublished: false });
    const updated = await applicationDb.website.update({
      where: { id },
      data: { status: WebsiteStatus.SUSPENDED, suspendedAt: new Date() },
    });
    await this.audit.record({
      adminId,
      action: 'website.suspend',
      targetType: 'website',
      targetId: id,
      beforeData: { status: website.status },
      afterData: { status: updated.status },
    });
    return updated;
  }

  async redeploy(id: string, adminId?: string) {
    const website = await this.detail(id);
    const business = website.business;
    const taskId = randomUUID();
    const inputData = {
      business: {
        id: business.id,
        name: business.name,
        category: business.category,
        description: business.description,
        logoUrl: business.logoUrl,
      },
      websiteConfig: {
        templateId: website.templateId,
        cmsData: website.cmsData || {},
      },
      tone: 'professional',
    };

    await runnerDb.agentTask.create({
      data: {
        id: taskId,
        businessId: website.businessId,
        taskType: TaskType.WEBSITE_GENERATION,
        status: TaskStatus.QUEUED,
        inputData,
      },
    });
    await this.agentQueue.add('agent-job', {
      taskId,
      businessId: website.businessId,
      taskType: TaskType.WEBSITE_GENERATION,
      inputData,
    });
    const updated = await applicationDb.website.update({
      where: { id },
      data: { status: WebsiteStatus.GENERATING },
    });
    await this.audit.record({
      adminId,
      action: 'website.redeploy',
      targetType: 'website',
      targetId: id,
      beforeData: { status: website.status },
      afterData: { status: updated.status, taskId },
    });
    return { website: updated, taskId };
  }

  async delete(id: string, adminId?: string) {
    const website = await this.detail(id);
    await applicationDb.website.delete({ where: { id } });
    await this.audit.record({
      adminId,
      action: 'website.delete',
      targetType: 'website',
      targetId: id,
      beforeData: website as unknown as Record<string, unknown>,
    });
  }

  private decorateWebsite(website: WebsiteRow) {
    return {
      ...website,
      displayName: this.websiteName(website),
      displayUrl: this.websiteUrl(website),
      isTechnicalDomain: this.isTechnicalDomain(website.domain),
    };
  }

  private filterWebsites(websites: ReturnType<WebsitesService['decorateWebsite']>[], query: WebsiteListQuery) {
    const search = query.search?.trim().toLowerCase();
    const businessSearch = query.business?.trim().toLowerCase();
    return websites.filter((website) => {
      const businessName = website.business?.name ?? '';
      const businessCategory = website.business?.category ?? '';
      const matchesSearch =
        !search ||
        website.displayName.toLowerCase().includes(search) ||
        website.displayUrl.toLowerCase().includes(search) ||
        String(website.templateId ?? '').toLowerCase().includes(search);
      const matchesBusinessSearch =
        !businessSearch ||
        businessName.toLowerCase().includes(businessSearch) ||
        businessCategory.toLowerCase().includes(businessSearch);
      const matchesBusinessId = !query.businessId || website.businessId === query.businessId;
      const matchesStatus = !query.status || website.status === query.status;
      const matchesTemplate = !query.template || website.templateId === query.template;
      const matchesPublishState =
        !query.publishState ||
        (query.publishState === 'published' && website.status === WebsiteStatus.PUBLISHED) ||
        (query.publishState === 'unpublished' && website.status === WebsiteStatus.UNPUBLISHED) ||
        (query.publishState === 'not_published' && website.status !== WebsiteStatus.PUBLISHED);

      return matchesSearch && matchesBusinessSearch && matchesBusinessId && matchesStatus && matchesTemplate && matchesPublishState;
    });
  }

  private sortWebsites(websites: ReturnType<WebsitesService['decorateWebsite']>[], sort = 'newest') {
    return [...websites].sort((left, right) => {
      if (sort === 'oldest') return left.createdAt.getTime() - right.createdAt.getTime();
      if (sort === 'name') return left.displayName.localeCompare(right.displayName);
      if (sort === 'business') return (left.business?.name ?? '').localeCompare(right.business?.name ?? '');
      if (sort === 'status') return left.status.localeCompare(right.status);
      if (sort === 'updated') return right.updatedAt.getTime() - left.updatedAt.getTime();
      return right.createdAt.getTime() - left.createdAt.getTime();
    });
  }

  private websiteName(website: WebsiteRow) {
    const cmsData = (website.cmsData ?? {}) as Record<string, unknown>;
    const cmsName = cmsData.siteName || cmsData.name || cmsData.title || cmsData.businessName;
    if (typeof cmsName === 'string' && cmsName.trim()) {
      return cmsName.trim();
    }
    if (website.business?.name) {
      return `${website.business.name} Website`;
    }
    if (website.domain && !this.isTechnicalDomain(website.domain)) {
      return website.domain.replace(/^https?:\/\//, '').split('.')[0].replace(/[-_]/g, ' ');
    }
    return 'Untitled Website';
  }

  private websiteUrl(website: WebsiteRow) {
    return website.vercelUrl || website.domain || 'No URL assigned';
  }

  private isTechnicalDomain(domain?: string | null) {
    if (!domain) return false;
    const cleaned = domain.replace(/^https?:\/\//, '').split('.')[0];
    return /^[0-9a-f]{8}-[0-9a-f-]{13,}$/i.test(cleaned) || /^[0-9a-f]{24,}$/i.test(cleaned);
  }

  private toPositiveNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async syncCommerce(businessId: string, payload: Record<string, unknown>) {
    const commerceUrl = process.env.COMMERCE_URL || 'http://localhost:3003';
    const internalKey = process.env.INTERNAL_API_KEY || '';
    try {
      await fetch(`${commerceUrl}/api/commerce/website-config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': businessId,
          'x-internal-key': internalKey,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Commerce can be offline in local development; the database state still records intent.
    }
  }
}
