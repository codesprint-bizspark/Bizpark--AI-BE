import { Injectable, NotFoundException } from '@nestjs/common';
import { applicationDb, CreateBusinessDto, WebsiteStatus } from 'bizpark.core';
import { fetchCommerceWebsiteConfig, patchCommerceWebsiteConfig } from './commerce-sync.util';

@Injectable()
export class BusinessService {
    async createBusiness(dto: CreateBusinessDto, userId: string) {
        return applicationDb.business.create({
            data: {
                ...dto,
                users: {
                    create: {
                        userId,
                        role: 'OWNER'
                    }
                }
            }
        });
    }
    async getBusinessesForUser(userId: string) {
        return applicationDb.business.findMany({
            where: {
                users: {
                    some: { userId: userId }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async getBusinessById(id: string): Promise<any> {
        return applicationDb.business.findUnique({
            where: { id },
            include: { websites: true, mobileApps: true }
        });
    }

    async saveWebsiteConfig(businessId: string, dto: any): Promise<any> {
        // Upsert website info.
        // In this iteration, we assume one website per business.
        const domain = `${businessId}-local`;
        return applicationDb.website.upsert({
            where: { domain },
            update: {
                templateId: dto.templateId,
                cmsData: dto.cmsData || {},
                status: WebsiteStatus.DRAFT,
            },
            create: {
                businessId,
                domain,
                templateId: dto.templateId,
                cmsData: dto.cmsData || {},
                status: WebsiteStatus.DRAFT,
            }
        });
    }

    async assertUserOwnsBusiness(userId: string, businessId: string): Promise<void> {
        const businesses = await this.getBusinessesForUser(userId);
        if (!businesses.find((b) => b.id === businessId)) {
            throw new NotFoundException('Business not found');
        }
    }

    async getWebsiteConfigForBusiness(businessId: string): Promise<Record<string, unknown>> {
        const commerceConfig = await fetchCommerceWebsiteConfig(businessId);
        if (commerceConfig) return commerceConfig;

        const website = await applicationDb.website.findFirstByBusinessId({ businessId });
        const business = await applicationDb.business.findUnique({ where: { id: businessId } });
        const cmsData = (website?.cmsData ?? {}) as Record<string, unknown>;

        return {
            businessName: cmsData.businessName ?? business?.name ?? 'My Store',
            tagline: cmsData.tagline ?? null,
            primaryColor: cmsData.primaryColor ?? '#2563eb',
            secondaryColor: cmsData.secondaryColor ?? '#1e40af',
            logoUrl: cmsData.logoUrl ?? business?.logoUrl ?? null,
            faviconUrl: cmsData.faviconUrl ?? null,
            content: cmsData.content ?? {},
            isPublished: website?.status === WebsiteStatus.PUBLISHED,
        };
    }

    async patchWebsiteConfigForBusiness(
        businessId: string,
        payload: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        const synced = await patchCommerceWebsiteConfig(businessId, payload);

        const domain = `${businessId}-local`;
        const existing = await applicationDb.website.findFirstByBusinessId({ businessId });
        const cmsData = { ...payload };

        if (existing) {
            await applicationDb.website.update({
                where: { id: existing.id },
                data: { cmsData: cmsData as Record<string, unknown> },
            });
        } else {
            await applicationDb.website.upsert({
                where: { domain },
                update: { cmsData: cmsData as Record<string, unknown> },
                create: {
                    businessId,
                    domain,
                    cmsData: cmsData as Record<string, unknown>,
                    status: WebsiteStatus.DRAFT,
                },
            });
        }

        return synced;
    }
}
