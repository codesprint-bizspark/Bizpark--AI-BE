import { Controller, Get, Post, Body, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { BusinessService } from './business.service';
import { applicationDb, CreateBusinessDto, SaveWebsiteConfigDto, WebsiteStatus, MobileAppStatus, MobileAppStoreStatus } from 'bizpark.core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AgentService } from '../agent/agent.service';
import { randomBytes } from 'node:crypto';

@Controller('api/business')
@UseGuards(JwtAuthGuard)
export class BusinessController {
    constructor(
        private readonly businessService: BusinessService,
        private readonly agentService: AgentService
    ) { }

    @Post()
    async createBusiness(@Body() dto: CreateBusinessDto, @CurrentUser() user: { id: string; email: string; name: string }) {
        const business = await this.businessService.createBusiness(dto, user.id);

        // Provision Commerce schema + bootstrap admin account (best-effort, non-blocking)
        const commerceUrl = process.env.COMMERCE_URL || 'http://localhost:3003';
        const adminPassword = 'Biz-' + randomBytes(4).toString('hex');
        const internalKey = process.env.INTERNAL_API_KEY || '';

        // Fire Commerce provisioning in the background — do NOT await.
        // Bootstrap + schema sync on Neon can take 10-30s on cold start;
        // credentials are returned by the approve endpoint after AI generation anyway.
        void (async () => {
            try {
                const bootstrapResp = await fetch(`${commerceUrl}/api/commerce/auth/bootstrap`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-tenant-id': business.id },
                    body: JSON.stringify({ email: user.email, password: adminPassword, name: user.name }),
                });
                if (!bootstrapResp.ok) {
                    console.warn(`[Business] Commerce bootstrap failed for tenant ${business.id}: ${bootstrapResp.status}`);
                }
            } catch { /* Commerce offline — provisioned on first website publish */ }

            try {
                await fetch(`${commerceUrl}/api/commerce/website-config`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-tenant-id': business.id,
                        'x-internal-key': internalKey,
                    },
                    body: JSON.stringify({ businessName: business.name }),
                });
            } catch { /* non-critical */ }
        })();

        const commerceWebUrl = (process.env.COMMERCE_WEB_URL || 'http://localhost:3004').replace(/\/$/, '');
        return {
            success: true,
            message: 'Business created successfully',
            data: { ...business, storefrontUrl: `${commerceWebUrl}/?tenant=${business.id}`, adminUrl: `${commerceWebUrl}/auth?tenant=${business.id}` },
            adminCredentials: { email: user.email, password: adminPassword },
        };
    }

    @Get()
    async getMyBusinesses(@CurrentUser() user: any) {
        const businesses = await this.businessService.getBusinessesForUser(user.id);
        return {
            success: true,
            data: businesses
        };
    }

    @Get(':id')
    async getBusinessById(@Param('id') id: string): Promise<any> {
        const business = await this.businessService.getBusinessById(id);
        return {
            success: true,
            data: business
        };
    }

    @Post(':id/website')
    async saveWebsiteConfig(
        @Param('id') id: string,
        @Body() dto: SaveWebsiteConfigDto,
        @CurrentUser() user: any
    ): Promise<any> {
        // Basic security check to ensure this is the user's business
        const businesses = await this.businessService.getBusinessesForUser(user.id);
        if (!businesses.find(b => b.id === id)) {
            throw new Error('Unauthorized');
        }
        const website = await this.businessService.saveWebsiteConfig(id, dto);
        return {
            success: true,
            message: 'Website configuration saved',
            data: website
        };
    }

    @Post(':id/website/deploy')
    async deployWebsite(
        @Param('id') id: string,
        @Body() body: { tone?: string },
        @CurrentUser() user: any
    ): Promise<any> {
        // Basic security check
        const businesses = await this.businessService.getBusinessesForUser(user.id);
        if (!businesses.find(b => b.id === id)) {
            throw new Error('Unauthorized');
        }

        // Just fetching to make sure it exists before we queue
        const business = await this.businessService.getBusinessById(id);
        const websiteConfig = business?.websites?.[0];
        if (!websiteConfig) {
            throw new BadRequestException('Website configuration not found. Save configuration first.');
        }

        // Queue the agent task via BullMQ wrapper
        const queuedTask = await this.agentService.queueTask({
            businessId: id,
            taskType: "WEBSITE_GENERATION",
            inputData: {
                business: {
                    id: business.id,
                    name: business.name,
                    category: (business as any).category,
                    description: (business as any).description,
                    logoUrl: (business as any).logoUrl,
                },
                websiteConfig: {
                    templateId: websiteConfig.templateId,
                    cmsData: (websiteConfig as any).cmsData || {},
                },
                tone: body?.tone || 'professional',
            },
        });

        await applicationDb.website.update({
            where: { id: websiteConfig.id },
            data: { status: WebsiteStatus.GENERATING },
        });

        return {
            success: true,
            message: 'Website build queued',
            data: queuedTask
        };
    }

    @Post(':id/mobile-app')
    async saveMobileAppConfig(
        @Param('id') id: string,
        @Body() body: { primaryColor?: string },
        @CurrentUser() user: any
    ): Promise<any> {
        const businesses = await this.businessService.getBusinessesForUser(user.id);
        if (!businesses.find(b => b.id === id)) throw new Error('Unauthorized');

        const mobileApp = await applicationDb.mobileApp.upsert({
            where: { businessId: id },
            update: { status: MobileAppStatus.DRAFT },
            create: {
                businessId: id,
                status: MobileAppStatus.DRAFT,
                cmsData: body.primaryColor ? { 'brand.primaryColor': body.primaryColor } : {},
            },
        });
        return { success: true, message: 'Mobile app configuration saved', data: mobileApp };
    }

    @Post(':id/mobile-app/deploy')
    async deployMobileApp(
        @Param('id') id: string,
        @Body() body: { tone?: string; primaryColor?: string },
        @CurrentUser() user: any
    ): Promise<any> {
        const businesses = await this.businessService.getBusinessesForUser(user.id);
        if (!businesses.find(b => b.id === id)) throw new Error('Unauthorized');

        const business = await this.businessService.getBusinessById(id);

        // Ensure a MobileApp record exists before we queue
        const mobileApp = await applicationDb.mobileApp.upsert({
            where: { businessId: id },
            update: { status: MobileAppStatus.GENERATING },
            create: { businessId: id, status: MobileAppStatus.GENERATING },
        });

        const queuedTask = await this.agentService.queueTask({
            businessId: id,
            taskType: 'MOBILE_APP_GENERATION',
            inputData: {
                business: {
                    id: business.id,
                    name: business.name,
                    category: (business as any).category,
                    description: (business as any).description,
                    logoUrl: (business as any).logoUrl,
                },
                mobileAppConfig: { cmsData: (mobileApp as any).cmsData || {} },
                tone: body?.tone || 'professional',
            },
        });

        return { success: true, message: 'Mobile app build queued', data: queuedTask };
    }

    // ── App-store publishing: user requests, admin fulfils ────────────────────
    @Post(':id/mobile-app/store-request')
    async requestStorePublish(
        @Param('id') id: string,
        @Body() body: { platforms?: string[]; note?: string },
        @CurrentUser() user: any,
    ): Promise<any> {
        const businesses = await this.businessService.getBusinessesForUser(user.id);
        if (!businesses.find(b => b.id === id)) throw new Error('Unauthorized');

        const mobileApp = await applicationDb.mobileApp.findFirstByBusinessId({ businessId: id });
        if (!mobileApp) {
            throw new BadRequestException('Generate and publish your mobile app config before requesting store publishing.');
        }
        if (mobileApp.status !== MobileAppStatus.PUBLISHED) {
            throw new BadRequestException('Your mobile app config must be published first.');
        }
        if (mobileApp.storeStatus === MobileAppStoreStatus.REQUESTED || mobileApp.storeStatus === MobileAppStoreStatus.IN_REVIEW) {
            throw new BadRequestException('A store publishing request is already in progress.');
        }

        const updated = await applicationDb.mobileApp.update({
            where: { id: mobileApp.id },
            data: {
                storeStatus: MobileAppStoreStatus.REQUESTED,
                storeRequestedAt: new Date(),
                storeReviewedAt: null,
                storeNote: body?.note?.trim() || null,
            },
        });

        return { success: true, message: 'Store publishing requested — our team will review it.', data: updated };
    }

    @Get(':id/mobile-app/store-status')
    async getStoreStatus(@Param('id') id: string, @CurrentUser() user: any): Promise<any> {
        const businesses = await this.businessService.getBusinessesForUser(user.id);
        if (!businesses.find(b => b.id === id)) throw new Error('Unauthorized');

        const mobileApp = await applicationDb.mobileApp.findFirstByBusinessId({ businessId: id });
        return {
            success: true,
            data: mobileApp ? {
                configStatus: mobileApp.status,
                storeStatus: mobileApp.storeStatus,
                playStoreUrl: mobileApp.playStoreUrl,
                appStoreUrl: mobileApp.appStoreUrl,
                storeNote: mobileApp.storeNote,
                storeRequestedAt: mobileApp.storeRequestedAt,
                storeReviewedAt: mobileApp.storeReviewedAt,
            } : null,
        };
    }
}
