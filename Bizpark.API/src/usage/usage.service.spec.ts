import { HttpException } from '@nestjs/common';
import { UsageService } from './usage.service';

jest.mock('bizpark.core', () => ({
    DEFAULT_AI_IMAGE_TOKEN_COST: 5000,
    DEFAULT_SUBSCRIPTION_PLANS: [{
        id: 'starter',
        timezone: 'UTC',
        quotas: {
            monthlyTokens: 100,
            websiteGenerations: 2,
            mobileAppGenerations: 1,
            socialPostGenerations: 3,
            businesses: 1,
            mcpKeys: 1,
        },
    }],
    TaskType: {
        WEBSITE_GENERATION: 'WEBSITE_GENERATION',
        SOCIAL_MEDIA_CONTENT: 'SOCIAL_MEDIA_CONTENT',
        GOOGLE_REVIEW_REPLY: 'GOOGLE_REVIEW_REPLY',
        MOBILE_APP_GENERATION: 'MOBILE_APP_GENERATION',
    },
    SubscriptionStatus: {
        ACTIVE: 'ACTIVE',
        TRIALING: 'TRIALING',
    },
    UserRole: {
        OWNER: 'OWNER',
    },
    SUBSCRIPTION_PLAN_SETTINGS_NAME: 'subscription-plan-settings',
    applicationDb: {
        business: { findMany: jest.fn() },
        subscription: { findLatestForBusiness: jest.fn() },
    },
    adminDb: {
        template: { findMany: jest.fn() },
    },
    getApplicationDataSource: jest.fn(),
    getDefaultPlanIdForTier: jest.fn(() => 'starter'),
    normalizeSubscriptionPlanSettings: jest.fn(() => ({ plans: [] })),
}), { virtual: true });

const DEFAULT_AI_IMAGE_TOKEN_COST = 5000;
const TaskType = {
    WEBSITE_GENERATION: 'WEBSITE_GENERATION',
    SOCIAL_MEDIA_CONTENT: 'SOCIAL_MEDIA_CONTENT',
    GOOGLE_REVIEW_REPLY: 'GOOGLE_REVIEW_REPLY',
    MOBILE_APP_GENERATION: 'MOBILE_APP_GENERATION',
} as const;

const quotas = {
    monthlyTokens: 100,
    websiteGenerations: 2,
    mobileAppGenerations: 1,
    socialPostGenerations: 3,
    businesses: 1,
    mcpKeys: 1,
};

describe('UsageService', () => {
    let service: UsageService;

    beforeEach(() => {
        service = new UsageService();
    });

    it('estimates social generation by selected platform and AI image cost', () => {
        const estimate = service.estimateTask(TaskType.SOCIAL_MEDIA_CONTENT, {
            dto: {
                platforms: ['FACEBOOK', 'INSTAGRAM'],
                postType: 'IMAGE',
                generateMedia: true,
            },
        });

        expect(estimate).toMatchObject({
            activityType: 'SOCIAL_POST_GENERATION',
            counterKey: 'socialPostGenerations',
            counterAmount: 2,
            tokens: 1500 * 2 + DEFAULT_AI_IMAGE_TOKEN_COST * 2,
        });
    });

    it('estimates fixed async task costs for website, mobile app, and review replies', () => {
        expect(service.estimateTask(TaskType.WEBSITE_GENERATION)).toMatchObject({
            counterKey: 'websiteGenerations',
            counterAmount: 1,
            tokens: 3000,
        });
        expect(service.estimateTask(TaskType.MOBILE_APP_GENERATION)).toMatchObject({
            counterKey: 'mobileAppGenerations',
            counterAmount: 1,
            tokens: 2500,
        });
        expect(service.estimateTask(TaskType.GOOGLE_REVIEW_REPLY)).toMatchObject({
            counterKey: 'socialPostGenerations',
            counterAmount: 1,
            tokens: 700,
        });
    });

    it('falls back to ceil text length divided by four for missing token metadata', () => {
        expect(service.tokenFallbackFromText('12345')).toBe(2);
        expect(service.tokenFallbackFromText('')).toBe(0);
    });

    it('throws a 402 quota payload when projected tokens exceed the monthly limit', () => {
        expect(() => (service as any).assertWithinQuota({
            period: { tokensUsed: 90, tokensReserved: 5 },
            quotas,
            activityType: 'WEBSITE_GENERATION',
            counterKey: null,
            counterAmount: 0,
            tokenEstimate: 10,
            planId: 'starter',
            resetAt: '2026-07-01T00:00:00.000Z',
        })).toThrow(HttpException);

        try {
            (service as any).assertWithinQuota({
                period: { tokensUsed: 90, tokensReserved: 5 },
                quotas,
                activityType: 'WEBSITE_GENERATION',
                counterKey: null,
                counterAmount: 0,
                tokenEstimate: 10,
                planId: 'starter',
                resetAt: '2026-07-01T00:00:00.000Z',
            });
        } catch (error) {
            const exception = error as HttpException;
            expect(exception.getStatus()).toBe(402);
            expect(exception.getResponse()).toMatchObject({
                code: 'QUOTA_EXCEEDED',
                limitKey: 'monthlyTokens',
                upgradeRequired: true,
            });
        }
    });

    it('blocks counters using used plus reserved amounts', () => {
        try {
            (service as any).assertWithinQuota({
                period: {
                    tokensUsed: 10,
                    tokensReserved: 0,
                    socialPostGenerationsUsed: 2,
                    socialPostGenerationsReserved: 1,
                },
                quotas,
                activityType: 'SOCIAL_POST_GENERATION',
                counterKey: 'socialPostGenerations',
                counterAmount: 1,
                tokenEstimate: 1,
                planId: 'starter',
                resetAt: '2026-07-01T00:00:00.000Z',
            });
        } catch (error) {
            const exception = error as HttpException;
            expect(exception.getStatus()).toBe(402);
            expect(exception.getResponse()).toMatchObject({
                code: 'QUOTA_EXCEEDED',
                limitKey: 'socialPostGenerations',
                used: 3,
                remaining: 0,
            });
            return;
        }
        throw new Error('Expected quota exception');
    });
});
