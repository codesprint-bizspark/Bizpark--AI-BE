import { Injectable } from '@nestjs/common';
import { applicationDb, CreateBusinessDto, WebsiteStatus } from 'bizpark.core';

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
}
