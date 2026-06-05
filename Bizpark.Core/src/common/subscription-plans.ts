import { SubscriptionTier } from '../typeorm/entities/shared';

export const SUBSCRIPTION_PLAN_SETTINGS_NAME = 'subscription-plan-settings';

export const SubscriptionPlanType = {
    REGULAR: 'REGULAR',
    PROMOTIONAL: 'PROMOTIONAL',
    SEASONAL: 'SEASONAL',
    LIMITED_TIME: 'LIMITED_TIME',
} as const;
export type SubscriptionPlanType = (typeof SubscriptionPlanType)[keyof typeof SubscriptionPlanType];

export const SubscriptionPlanVisibility = {
    ACTIVE: 'ACTIVE',
    SCHEDULED: 'SCHEDULED',
    EXPIRED: 'EXPIRED',
    DRAFT: 'DRAFT',
    INACTIVE: 'INACTIVE',
} as const;
export type SubscriptionPlanVisibility =
    (typeof SubscriptionPlanVisibility)[keyof typeof SubscriptionPlanVisibility];

export type SubscriptionPlan = {
    id: string;
    tier: string;
    name: string;
    type: SubscriptionPlanType;
    status: SubscriptionPlanVisibility;
    priceMonthly: number;
    originalPriceMonthly: number | null;
    discountPercentage: number | null;
    currency: string;
    description: string;
    ctaText: string;
    badgeText: string;
    isPopular: boolean;
    benefits: string[];
    quotas: SubscriptionPlanQuotas;
    startsAt: string | null;
    endsAt: string | null;
    timezone: string;
};

export type SubscriptionPlanQuotas = {
    monthlyTokens: number;
    websiteGenerations: number;
    mobileAppGenerations: number;
    socialPostGenerations: number;
    businesses: number;
    mcpKeys: number;
};

export type SubscriptionPlanSettings = {
    plans: SubscriptionPlan[];
    deletedPlanIds?: string[];
};

export const DEFAULT_AI_IMAGE_TOKEN_COST = 5000;

export const DEFAULT_SUBSCRIPTION_PLAN_QUOTAS: Record<string, SubscriptionPlanQuotas> = {
    starter: {
        monthlyTokens: 150_000,
        websiteGenerations: 3,
        mobileAppGenerations: 0,
        socialPostGenerations: 15,
        businesses: 3,
        mcpKeys: 2,
    },
    growth: {
        monthlyTokens: 500_000,
        websiteGenerations: 3,
        mobileAppGenerations: 3,
        socialPostGenerations: 40,
        businesses: 3,
        mcpKeys: 3,
    },
    pro: {
        monthlyTokens: 1_200_000,
        websiteGenerations: 6,
        mobileAppGenerations: 6,
        socialPostGenerations: 100,
        businesses: 5,
        mcpKeys: 5,
    },
    business: {
        monthlyTokens: 3_000_000,
        websiteGenerations: 6,
        mobileAppGenerations: 6,
        socialPostGenerations: 250,
        businesses: 10,
        mcpKeys: 8,
    },
};

export const getDefaultPlanIdForTier = (tier?: string | null) => {
    switch (tier) {
        case SubscriptionTier.AGENCY:
            return 'business';
        case SubscriptionTier.PRO:
            return 'growth';
        case SubscriptionTier.FREE:
        default:
            return 'starter';
    }
};

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
    {
        id: 'starter',
        tier: SubscriptionTier.FREE,
        name: 'Starter',
        type: SubscriptionPlanType.REGULAR,
        status: SubscriptionPlanVisibility.ACTIVE,
        priceMonthly: 10,
        originalPriceMonthly: null,
        discountPercentage: null,
        currency: 'USD',
        description: 'Launch your first business online.',
        ctaText: 'Subscribe',
        badgeText: '',
        isPopular: false,
        benefits: [
            '3 Businesses',
            '3 Website generations',
            'Facebook connection',
            '15 Post generations',
            '2 AI Connect (MCP) keys',
        ],
        quotas: DEFAULT_SUBSCRIPTION_PLAN_QUOTAS.starter,
        startsAt: null,
        endsAt: null,
        timezone: 'UTC',
    },
    {
        id: 'growth',
        tier: SubscriptionTier.PRO,
        name: 'Growth',
        type: SubscriptionPlanType.REGULAR,
        status: SubscriptionPlanVisibility.ACTIVE,
        priceMonthly: 20,
        originalPriceMonthly: null,
        discountPercentage: null,
        currency: 'USD',
        description: 'Add a mobile app and all social platforms.',
        ctaText: 'Subscribe',
        badgeText: 'Popular',
        isPopular: true,
        benefits: [
            '3 Businesses',
            '3 Website generations',
            '3 Mobile app generations',
            'All social platforms (FB, IG, TikTok)',
            '40 Post generations',
            '3 AI Connect (MCP) keys',
        ],
        quotas: DEFAULT_SUBSCRIPTION_PLAN_QUOTAS.growth,
        startsAt: null,
        endsAt: null,
        timezone: 'UTC',
    },
    {
        id: 'pro',
        tier: SubscriptionTier.PRO,
        name: 'Pro',
        type: SubscriptionPlanType.REGULAR,
        status: SubscriptionPlanVisibility.ACTIVE,
        priceMonthly: 50,
        originalPriceMonthly: null,
        discountPercentage: null,
        currency: 'USD',
        description: 'More generations for a scaling business.',
        ctaText: 'Subscribe',
        badgeText: '',
        isPopular: false,
        benefits: [
            '5 Businesses',
            '6 Website generations',
            '6 Mobile app generations',
            'All social platforms',
            '100 Post generations',
            '5 AI Connect (MCP) keys',
        ],
        quotas: DEFAULT_SUBSCRIPTION_PLAN_QUOTAS.pro,
        startsAt: null,
        endsAt: null,
        timezone: 'UTC',
    },
    {
        id: 'business',
        tier: SubscriptionTier.AGENCY,
        name: 'Business',
        type: SubscriptionPlanType.REGULAR,
        status: SubscriptionPlanVisibility.ACTIVE,
        priceMonthly: 100,
        originalPriceMonthly: null,
        discountPercentage: null,
        currency: 'USD',
        description: 'Run multiple businesses at scale.',
        ctaText: 'Subscribe',
        badgeText: '',
        isPopular: false,
        benefits: [
            '10 Businesses',
            '6 Website generations',
            '6 Mobile app generations',
            'All social platforms',
            '250 Post generations',
            '8 AI Connect (MCP) keys',
        ],
        quotas: DEFAULT_SUBSCRIPTION_PLAN_QUOTAS.business,
        startsAt: null,
        endsAt: null,
        timezone: 'UTC',
    },
];

const validTypes = new Set<string>(Object.values(SubscriptionPlanType));
const validStatuses = new Set<string>(Object.values(SubscriptionPlanVisibility));

const slugify = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 48);

const parseNullableNumber = (value: unknown) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const parseQuotaNumber = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
};

const normalizeQuotas = (
    value: unknown,
    fallback?: SubscriptionPlanQuotas,
    planId?: string,
): SubscriptionPlanQuotas => {
    const input = (value ?? {}) as Partial<SubscriptionPlanQuotas>;
    const defaults = fallback ?? DEFAULT_SUBSCRIPTION_PLAN_QUOTAS[planId ?? ''] ?? DEFAULT_SUBSCRIPTION_PLAN_QUOTAS.starter;

    return {
        monthlyTokens: parseQuotaNumber(input.monthlyTokens, defaults.monthlyTokens),
        websiteGenerations: parseQuotaNumber(input.websiteGenerations, defaults.websiteGenerations),
        mobileAppGenerations: parseQuotaNumber(input.mobileAppGenerations, defaults.mobileAppGenerations),
        socialPostGenerations: parseQuotaNumber(input.socialPostGenerations, defaults.socialPostGenerations),
        businesses: parseQuotaNumber(input.businesses, defaults.businesses),
        mcpKeys: parseQuotaNumber(input.mcpKeys, defaults.mcpKeys),
    };
};

const parseDateString = (value: unknown) => {
    if (!value) {
        return null;
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizePlan = (plan: Partial<SubscriptionPlan>, fallback?: SubscriptionPlan): SubscriptionPlan => {
    const name = String(plan.name || fallback?.name || 'New Plan').trim();
    const id = String(plan.id || fallback?.id || slugify(name) || `plan-${Date.now()}`).trim();

    return {
        id,
        tier: String(plan.tier || fallback?.tier || id).trim(),
        name,
        type: validTypes.has(String(plan.type))
            ? (plan.type as SubscriptionPlanType)
            : fallback?.type ?? SubscriptionPlanType.REGULAR,
        status: validStatuses.has(String(plan.status))
            ? (plan.status as SubscriptionPlanVisibility)
            : fallback?.status ?? SubscriptionPlanVisibility.DRAFT,
        priceMonthly: Number.isFinite(Number(plan.priceMonthly))
            ? Number(plan.priceMonthly)
            : fallback?.priceMonthly ?? 0,
        originalPriceMonthly: parseNullableNumber(plan.originalPriceMonthly ?? fallback?.originalPriceMonthly),
        discountPercentage: parseNullableNumber(plan.discountPercentage ?? fallback?.discountPercentage),
        currency: String(plan.currency || fallback?.currency || 'USD').trim().toUpperCase(),
        description: String(plan.description || fallback?.description || '').trim(),
        ctaText: String(plan.ctaText || fallback?.ctaText || 'Get Started').trim(),
        badgeText: String(plan.badgeText || fallback?.badgeText || '').trim(),
        isPopular: Boolean(plan.isPopular ?? fallback?.isPopular),
        benefits: Array.isArray(plan.benefits)
            ? plan.benefits.map((benefit) => String(benefit).trim()).filter(Boolean)
            : fallback?.benefits ?? [],
        quotas: normalizeQuotas(plan.quotas, fallback?.quotas, id),
        startsAt: parseDateString(plan.startsAt ?? fallback?.startsAt),
        endsAt: parseDateString(plan.endsAt ?? fallback?.endsAt),
        timezone: String(plan.timezone || fallback?.timezone || 'UTC').trim(),
    };
};

export const getEffectiveSubscriptionPlanStatus = (
    plan: Pick<SubscriptionPlan, 'status' | 'startsAt' | 'endsAt'>,
    now = new Date(),
): SubscriptionPlanVisibility => {
    if (plan.status === SubscriptionPlanVisibility.DRAFT || plan.status === SubscriptionPlanVisibility.INACTIVE) {
        return plan.status;
    }

    const startsAt = plan.startsAt ? new Date(plan.startsAt) : null;
    const endsAt = plan.endsAt ? new Date(plan.endsAt) : null;

    if (endsAt && endsAt.getTime() <= now.getTime()) {
        return SubscriptionPlanVisibility.EXPIRED;
    }

    if (startsAt && startsAt.getTime() > now.getTime()) {
        return SubscriptionPlanVisibility.SCHEDULED;
    }

    return SubscriptionPlanVisibility.ACTIVE;
};

export const normalizeSubscriptionPlanSettings = (value: unknown): SubscriptionPlanSettings => {
    const maybeSettings = value as Partial<SubscriptionPlanSettings> | null;
    const inputPlans = Array.isArray(maybeSettings?.plans) ? maybeSettings.plans : [];
    const deletedPlanIds = new Set(
        Array.isArray(maybeSettings?.deletedPlanIds) ? maybeSettings.deletedPlanIds.map(String) : [],
    );

    const regularPlans = DEFAULT_SUBSCRIPTION_PLANS.filter((fallback) => !deletedPlanIds.has(fallback.id)).map(
        (fallback) => {
            const override = inputPlans.find((plan) => plan?.id === fallback.id || plan?.tier === fallback.tier);
            return normalizePlan(override ?? {}, fallback);
        },
    );

    const defaultIds = new Set(regularPlans.map((plan) => plan.id));
    const defaultTiers = new Set(regularPlans.map((plan) => plan.tier));
    const customPlans = inputPlans
        .filter((plan) => plan && !defaultIds.has(String(plan.id)) && !defaultTiers.has(String(plan.tier)))
        .map((plan) => normalizePlan(plan));

    return {
        plans: [...regularPlans, ...customPlans],
        deletedPlanIds: [...deletedPlanIds],
    };
};
