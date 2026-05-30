import { SubscriptionTier } from '../typeorm/entities/shared';

export const SUBSCRIPTION_PLAN_SETTINGS_NAME = 'subscription-plan-settings';

export type SubscriptionPlan = {
    tier: SubscriptionTier;
    name: string;
    priceMonthly: number;
    currency: string;
    description: string;
    ctaText: string;
    isPopular: boolean;
    benefits: string[];
};

export type SubscriptionPlanSettings = {
    plans: SubscriptionPlan[];
};

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
    {
        tier: SubscriptionTier.FREE,
        name: 'Starter',
        priceMonthly: 0,
        currency: 'USD',
        description: 'Start free, upgrade when you spark.',
        ctaText: 'Get Started',
        isPopular: false,
        benefits: ['1 AI Website', '2 Social Accounts', 'Basic Analytics', 'Community Support'],
    },
    {
        tier: SubscriptionTier.PRO,
        name: 'Spark Pro',
        priceMonthly: 29,
        currency: 'USD',
        description: 'For growing businesses using AI every day.',
        ctaText: 'Get Started',
        isPopular: true,
        benefits: [
            'Unlimited AI Websites',
            'All Social Platforms',
            'AI Agent Content Manager',
            'Custom Domain',
            'Priority Support',
        ],
    },
    {
        tier: SubscriptionTier.AGENCY,
        name: 'Agency',
        priceMonthly: 99,
        currency: 'USD',
        description: 'Run multiple clients with advanced controls.',
        ctaText: 'Get Started',
        isPopular: false,
        benefits: ['Manage 10 Businesses', 'White-label reports', 'API Access', 'Dedicated Account Manager'],
    },
];

const validTiers = new Set<string>(Object.values(SubscriptionTier));

const normalizePlan = (plan: Partial<SubscriptionPlan>, fallback: SubscriptionPlan): SubscriptionPlan => ({
    tier: validTiers.has(String(plan.tier)) ? (plan.tier as SubscriptionTier) : fallback.tier,
    name: String(plan.name || fallback.name).trim(),
    priceMonthly: Number.isFinite(Number(plan.priceMonthly)) ? Number(plan.priceMonthly) : fallback.priceMonthly,
    currency: String(plan.currency || fallback.currency).trim().toUpperCase(),
    description: String(plan.description || fallback.description).trim(),
    ctaText: String(plan.ctaText || fallback.ctaText).trim(),
    isPopular: Boolean(plan.isPopular),
    benefits: Array.isArray(plan.benefits)
        ? plan.benefits.map((benefit) => String(benefit).trim()).filter(Boolean)
        : fallback.benefits,
});

export const normalizeSubscriptionPlanSettings = (value: unknown): SubscriptionPlanSettings => {
    const maybeSettings = value as Partial<SubscriptionPlanSettings> | null;
    const inputPlans = Array.isArray(maybeSettings?.plans) ? maybeSettings.plans : [];

    return {
        plans: DEFAULT_SUBSCRIPTION_PLANS.map((fallback) => {
            const override = inputPlans.find((plan) => plan?.tier === fallback.tier);
            return normalizePlan(override ?? {}, fallback);
        }),
    };
};
