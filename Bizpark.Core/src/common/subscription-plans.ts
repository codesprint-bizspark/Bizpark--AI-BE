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
    startsAt: string | null;
    endsAt: string | null;
    timezone: string;
};

export type SubscriptionPlanSettings = {
    plans: SubscriptionPlan[];
    deletedPlanIds?: string[];
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
            '1 Business',
            '2 Website generations',
            'Facebook connection',
            '10 Post generations',
            '1 AI Connect (MCP) key',
        ],
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
            '1 Business',
            '2 Website generations',
            '2 Mobile app generations',
            'All social platforms (FB, IG, TikTok)',
            '25 Post generations',
            '2 AI Connect (MCP) keys',
        ],
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
            '1 Business',
            '4 Website generations',
            '4 Mobile app generations',
            'All social platforms',
            '60 Post generations',
            '3 AI Connect (MCP) keys',
        ],
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
            '2 Businesses',
            '4 Website generations',
            '4 Mobile app generations',
            'All social platforms',
            '150 Post generations',
            '5 AI Connect (MCP) keys',
        ],
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
