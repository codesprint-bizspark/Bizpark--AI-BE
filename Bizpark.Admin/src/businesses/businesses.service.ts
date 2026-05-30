import { Injectable, NotFoundException } from '@nestjs/common';
import {
  applicationDb,
  BusinessStatus,
  SubscriptionStatus,
  SubscriptionTier,
} from 'bizpark.core';
import { AuditService } from '../common/audit.service';

type BusinessRow = Awaited<ReturnType<typeof applicationDb.business.findForAdmin>>[number];

export type BusinessListQuery = {
  search?: string;
  status?: string;
  tier?: string;
  category?: string;
  websiteStatus?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
};

@Injectable()
export class BusinessesService {
  constructor(private readonly audit: AuditService) {}

  async list(query: BusinessListQuery = {}) {
    const rawBusinesses = await applicationDb.business.findForAdmin({ orderBy: { createdAt: 'desc' } });
    const businesses = this.dedupe(rawBusinesses).map((business) => ({
      ...business,
      category: this.cleanCategory(business.category),
    }));
    const categories = [...new Set(businesses.map((business) => business.category).filter(Boolean) as string[])].sort();
    const filtered = this.filterBusinesses(businesses, query);
    const sorted = this.sortBusinesses(filtered, query.sort);
    const pageSize = this.toPositiveNumber(query.pageSize, 10);
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const page = Math.min(this.toPositiveNumber(query.page, 1), totalPages);
    const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

    return {
      businesses: paginated,
      categories,
      filters: {
        search: query.search ?? '',
        status: query.status ?? '',
        tier: query.tier ?? '',
        category: query.category ?? '',
        websiteStatus: query.websiteStatus ?? '',
        sort: query.sort ?? 'newest',
        page,
        pageSize,
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
        total: businesses.filter((business) => business.status !== BusinessStatus.ARCHIVED).length,
        active: businesses.filter((business) => business.status === BusinessStatus.ACTIVE).length,
        suspended: businesses.filter((business) => business.status === BusinessStatus.SUSPENDED).length,
        withWebsites: businesses.filter((business) => (business.websites?.length ?? 0) > 0).length,
        withoutWebsites: businesses.filter(
          (business) => business.status !== BusinessStatus.ARCHIVED && (business.websites?.length ?? 0) === 0,
        ).length,
      },
    };
  }

  async create(
    input: {
      name?: string;
      category?: string;
      description?: string;
      subscriptionTier?: SubscriptionTier;
      status?: BusinessStatus;
    },
    adminId?: string,
  ) {
    const business = await applicationDb.business.create({
      data: {
        name: input.name?.trim() || 'Untitled Business',
        category: this.cleanCategory(input.category),
        description: input.description?.trim() || null,
        subscriptionTier: input.subscriptionTier ?? SubscriptionTier.FREE,
        status: input.status ?? BusinessStatus.ACTIVE,
      },
    });
    await this.audit.record({
      adminId,
      action: 'business.create',
      targetType: 'business',
      targetId: business.id,
      afterData: business as unknown as Record<string, unknown>,
    });
    return business;
  }

  async detail(id: string) {
    const business = await applicationDb.business.findUniqueForAdmin({ where: { id } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  async updateStatus(id: string, status: BusinessStatus, adminId?: string) {
    const before = await this.detail(id);
    const updated = await applicationDb.business.update({ where: { id }, data: { status } });
    await this.audit.record({
      adminId,
      action: 'business.status.update',
      targetType: 'business',
      targetId: id,
      beforeData: { status: before.status },
      afterData: { status: updated.status },
    });
    return updated;
  }

  async bulkUpdateStatus(ids: string[], status: BusinessStatus, adminId?: string) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    for (const id of uniqueIds) {
      await this.updateStatus(id, status, adminId);
    }
  }

  async delete(id: string, adminId?: string) {
    await this.updateStatus(id, BusinessStatus.ARCHIVED, adminId);
    await this.audit.record({
      adminId,
      action: 'business.delete',
      targetType: 'business',
      targetId: id,
      afterData: { status: BusinessStatus.ARCHIVED },
    });
  }

  async bulkDelete(ids: string[], adminId?: string) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    for (const id of uniqueIds) {
      await this.delete(id, adminId);
    }
  }

  async updateSubscription(
    id: string,
    input: { tier: SubscriptionTier; status: SubscriptionStatus; expiresAt?: string },
    adminId?: string,
  ) {
    const before = await applicationDb.subscription.findLatestForBusiness({ businessId: id });
    await applicationDb.business.update({
      where: { id },
      data: { subscriptionTier: input.tier },
    });
    const subscription = await applicationDb.subscription.upsertForBusiness({
      businessId: id,
      data: {
        tier: input.tier,
        status: input.status,
        startedAt: before?.startedAt ?? new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
    await this.audit.record({
      adminId,
      action: 'business.subscription.update',
      targetType: 'business',
      targetId: id,
      beforeData: before as unknown as Record<string, unknown> | null,
      afterData: subscription as unknown as Record<string, unknown>,
    });
    return subscription;
  }

  private filterBusinesses(businesses: BusinessRow[], query: BusinessListQuery) {
    const search = query.search?.trim().toLowerCase();
    return businesses.filter((business) => {
      if (business.status === BusinessStatus.ARCHIVED && query.status !== BusinessStatus.ARCHIVED) {
        return false;
      }
      const owner = this.ownerLabel(business).toLowerCase();
      const matchesSearch =
        !search ||
        business.name.toLowerCase().includes(search) ||
        owner.includes(search) ||
        (business.category ?? '').toLowerCase().includes(search);
      const matchesStatus = !query.status || business.status === query.status;
      const matchesTier = !query.tier || business.subscriptionTier === query.tier;
      const matchesCategory = !query.category || business.category === query.category;
      const matchesWebsiteStatus =
        !query.websiteStatus || business.websites?.some((website) => website.status === query.websiteStatus);

      return matchesSearch && matchesStatus && matchesTier && matchesCategory && matchesWebsiteStatus;
    });
  }

  private sortBusinesses(businesses: BusinessRow[], sort = 'newest') {
    return [...businesses].sort((left, right) => {
      if (sort === 'oldest') return left.createdAt.getTime() - right.createdAt.getTime();
      if (sort === 'name') return left.name.localeCompare(right.name);
      if (sort === 'status') return left.status.localeCompare(right.status);
      if (sort === 'tier') return left.subscriptionTier.localeCompare(right.subscriptionTier);
      if (sort === 'websites') return (right.websites?.length ?? 0) - (left.websites?.length ?? 0);
      return right.createdAt.getTime() - left.createdAt.getTime();
    });
  }

  private dedupe(businesses: BusinessRow[]) {
    const seen = new Map<string, BusinessRow>();
    for (const business of businesses) {
      if (!seen.has(business.id)) {
        seen.set(business.id, business);
      }
    }
    return [...seen.values()];
  }

  private cleanCategory(category?: string | null) {
    if (!category) return null;
    return category.trim().replace(/Caf�|CafÃ©/gi, 'Café').replace(/�/g, 'é');
  }

  private ownerLabel(business: BusinessRow) {
    const owner = business.users?.find((businessUser) => businessUser.role === 'OWNER') ?? business.users?.[0];
    return owner?.user?.name || owner?.user?.email || '';
  }

  private toPositiveNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
