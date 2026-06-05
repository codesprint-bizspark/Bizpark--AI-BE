import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
    adminDb,
    applicationDb,
    DEFAULT_AI_IMAGE_TOKEN_COST,
    DEFAULT_SUBSCRIPTION_PLANS,
    getApplicationDataSource,
    getDefaultPlanIdForTier,
    normalizeSubscriptionPlanSettings,
    SUBSCRIPTION_PLAN_SETTINGS_NAME,
    SubscriptionPlan,
    SubscriptionPlanQuotas,
    SubscriptionStatus,
    TaskType,
    UserRole,
} from 'bizpark.core';

export type UsageCounterKey = 'websiteGenerations' | 'mobileAppGenerations' | 'socialPostGenerations';

export type UsageActivityType =
    | 'WEBSITE_GENERATION'
    | 'MOBILE_APP_GENERATION'
    | 'SOCIAL_POST_GENERATION'
    | 'SOCIAL_FIELD_REGENERATION'
    | 'SOCIAL_AI_IMAGE'
    | 'GOOGLE_REVIEW_REPLY'
    | 'BUSINESS_CREATE'
    | 'MCP_KEY_CREATE';

type EffectivePlan = SubscriptionPlan & { ownedBusinessIds: string[] };

type ReserveArgs = {
    userId: string;
    businessId?: string | null;
    activityType: UsageActivityType;
    counterKey?: UsageCounterKey | null;
    counterAmount?: number;
    tokenEstimate?: number;
    taskId?: string | null;
    metadata?: Record<string, unknown> | null;
};

type CommitArgs = {
    reservationId: string;
    status: 'COMMITTED' | 'RELEASED';
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    provider?: string | null;
    model?: string | null;
    metadata?: Record<string, unknown> | null;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set<string>([
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.TRIALING,
]);

const TASK_ESTIMATES: Record<string, { tokens: number; counterKey: UsageCounterKey; counterAmount: number; activityType: UsageActivityType }> = {
    [TaskType.WEBSITE_GENERATION]: {
        tokens: 3000,
        counterKey: 'websiteGenerations',
        counterAmount: 1,
        activityType: 'WEBSITE_GENERATION',
    },
    [TaskType.MOBILE_APP_GENERATION]: {
        tokens: 2500,
        counterKey: 'mobileAppGenerations',
        counterAmount: 1,
        activityType: 'MOBILE_APP_GENERATION',
    },
    [TaskType.GOOGLE_REVIEW_REPLY]: {
        tokens: 700,
        counterKey: 'socialPostGenerations',
        counterAmount: 1,
        activityType: 'GOOGLE_REVIEW_REPLY',
    },
};

let usageDataSourceInit: Promise<unknown> | null = null;

@Injectable()
export class UsageService {
    async getUsage(userId: string, requestedMonth?: string) {
        const effectivePlan = await this.getEffectivePlanForUser(userId);
        const month = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth)
            ? requestedMonth
            : this.monthForTimezone(effectivePlan.timezone);
        const period = await this.ensurePeriod(userId, month, effectivePlan.id);
        const recentEvents = await this.getRecentEvents(userId, month);

        return {
            effectivePlan: this.publicPlan(effectivePlan),
            planId: effectivePlan.id,
            month,
            resetAt: this.resetAt(month),
            quotas: effectivePlan.quotas,
            usage: this.periodUsage(period),
            remaining: this.remaining(effectivePlan.quotas, period),
            recentEvents,
        };
    }

    async assertCanCreateBusiness(userId: string) {
        const effectivePlan = await this.getEffectivePlanForUser(userId);
        const current = effectivePlan.ownedBusinessIds.length;
        if (current + 1 > effectivePlan.quotas.businesses) {
            this.throwQuotaExceeded({
                activityType: 'BUSINESS_CREATE',
                limitKey: 'businesses',
                limit: effectivePlan.quotas.businesses,
                used: current,
                remaining: Math.max(0, effectivePlan.quotas.businesses - current),
                resetAt: null,
                planId: effectivePlan.id,
            });
        }
    }

    async assertCanCreateMcpKey(userId: string, activeKeyCount: number) {
        const effectivePlan = await this.getEffectivePlanForUser(userId);
        if (activeKeyCount + 1 > effectivePlan.quotas.mcpKeys) {
            this.throwQuotaExceeded({
                activityType: 'MCP_KEY_CREATE',
                limitKey: 'mcpKeys',
                limit: effectivePlan.quotas.mcpKeys,
                used: activeKeyCount,
                remaining: Math.max(0, effectivePlan.quotas.mcpKeys - activeKeyCount),
                resetAt: null,
                planId: effectivePlan.id,
            });
        }
    }

    async reserveForTask(dto: { businessId: string; taskType: TaskType | string; inputData?: any; createdByUserId?: string; taskId?: string }) {
        if (!dto.createdByUserId) return null;
        const estimate = this.estimateTask(dto.taskType, dto.inputData);
        if (!estimate) return null;
        return this.reserve({
            userId: dto.createdByUserId,
            businessId: dto.businessId,
            activityType: estimate.activityType,
            counterKey: estimate.counterKey,
            counterAmount: estimate.counterAmount,
            tokenEstimate: estimate.tokens,
            taskId: dto.taskId ?? null,
            metadata: { taskType: dto.taskType },
        });
    }

    estimateTask(taskType: TaskType | string, inputData?: any) {
        if (taskType === TaskType.SOCIAL_MEDIA_CONTENT) {
            const dto = inputData?.dto ?? inputData ?? {};
            const platforms = Array.isArray(dto.platforms) ? dto.platforms : [];
            const platformCount = Math.max(1, platforms.length);
            const mediaTokens = dto.generateMedia && ['IMAGE', 'FLYER'].includes(String(dto.postType))
                ? DEFAULT_AI_IMAGE_TOKEN_COST * platformCount
                : 0;
            return {
                activityType: 'SOCIAL_POST_GENERATION' as UsageActivityType,
                counterKey: 'socialPostGenerations' as UsageCounterKey,
                counterAmount: platformCount,
                tokens: 1500 * platformCount + mediaTokens,
            };
        }
        return TASK_ESTIMATES[String(taskType)] ?? null;
    }

    async reserve(args: ReserveArgs) {
        if (args.businessId) {
            await this.assertBusinessAccess(args.userId, args.businessId);
        }

        const effectivePlan = await this.getEffectivePlanForUser(args.userId);
        const month = this.monthForTimezone(effectivePlan.timezone);
        const reservationId = randomUUID();
        const counterAmount = Math.max(0, Math.floor(args.counterAmount ?? 0));
        const tokenEstimate = Math.max(0, Math.floor(args.tokenEstimate ?? 0));
        const schema = this.applicationSchema();

        await this.withPeriodLock(args.userId, month, effectivePlan.id, async (manager, period) => {
            this.assertWithinQuota({
                period,
                quotas: effectivePlan.quotas,
                activityType: args.activityType,
                counterKey: args.counterKey ?? null,
                counterAmount,
                tokenEstimate,
                planId: effectivePlan.id,
                resetAt: this.resetAt(month),
            });

            const counterReservedColumn = args.counterKey ? `${args.counterKey}Reserved` : null;
            await manager.query(
                `
UPDATE "${schema}"."AiUsagePeriod"
SET
  "tokensReserved" = "tokensReserved" + $2,
  ${counterReservedColumn ? `"${counterReservedColumn}" = "${counterReservedColumn}" + $3,` : ''}
  "planId" = ${counterReservedColumn ? '$4' : '$3'},
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = $1
`,
                counterReservedColumn
                    ? [period.id, tokenEstimate, counterAmount, effectivePlan.id]
                    : [period.id, tokenEstimate, effectivePlan.id],
            );

            await manager.query(
                `
INSERT INTO "${schema}"."AiUsageEvent"
  (id, "userId", "businessId", month, "activityType", status, "taskId",
   "counterKey", "counterAmount", "tokenEstimate", metadata, "createdAt", "updatedAt")
VALUES
  ($1, $2, $3, $4, $5, 'RESERVED', $6, $7, $8, $9, CAST($10 AS jsonb), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`,
                [
                    reservationId,
                    args.userId,
                    args.businessId ?? null,
                    month,
                    args.activityType,
                    args.taskId ?? null,
                    args.counterKey ?? null,
                    counterAmount,
                    tokenEstimate,
                    JSON.stringify(args.metadata ?? {}),
                ],
            );
        });

        return { reservationId, tokenEstimate, counterAmount, activityType: args.activityType };
    }

    async consumeImmediate<T>(
        args: ReserveArgs,
        fn: () => Promise<{ result: T; usage?: Partial<CommitArgs> | null }>,
    ): Promise<T> {
        const reservation = await this.reserve(args);
        try {
            const { result, usage } = await fn();
            await this.commitReservation({
                reservationId: reservation.reservationId,
                status: 'COMMITTED',
                ...usage,
            });
            return result;
        } catch (error) {
            await this.commitReservation({ reservationId: reservation.reservationId, status: 'RELEASED' }).catch(() => undefined);
            throw error;
        }
    }

    async commitReservation(args: CommitArgs) {
        const schema = this.applicationSchema();
        await (await this.getDataSource()).transaction(async (manager) => {
            const rows = await manager.query(
                `SELECT * FROM "${schema}"."AiUsageEvent" WHERE id = $1 FOR UPDATE`,
                [args.reservationId],
            );
            const event = rows[0];
            if (!event || event.status !== 'RESERVED') return;

            const periodRows = await manager.query(
                `SELECT * FROM "${schema}"."AiUsagePeriod" WHERE "userId" = $1 AND month = $2 FOR UPDATE`,
                [event.userId, event.month],
            );
            const period = periodRows[0];
            if (!period) return;

            const counterKey = event.counterKey as UsageCounterKey | null;
            const counterReservedColumn = counterKey ? `${counterKey}Reserved` : null;
            const counterUsedColumn = counterKey ? `${counterKey}Used` : null;
            const promptTokens = this.nullableInt(args.promptTokens);
            const completionTokens = this.nullableInt(args.completionTokens);
            const totalTokens = this.resolveTotalTokens({
                totalTokens: args.totalTokens,
                promptTokens,
                completionTokens,
                fallback: event.tokenEstimate,
            });

            if (args.status === 'RELEASED') {
                await manager.query(
                    `
UPDATE "${schema}"."AiUsagePeriod"
SET
  "tokensReserved" = GREATEST(0, "tokensReserved" - $2),
  ${counterReservedColumn ? `"${counterReservedColumn}" = GREATEST(0, "${counterReservedColumn}" - $3),` : ''}
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = $1
`,
                    counterReservedColumn
                        ? [period.id, event.tokenEstimate, event.counterAmount]
                        : [period.id, event.tokenEstimate],
                );
            } else {
                await manager.query(
                    `
UPDATE "${schema}"."AiUsagePeriod"
SET
  "tokensReserved" = GREATEST(0, "tokensReserved" - $2),
  "tokensUsed" = "tokensUsed" + $3,
  ${counterReservedColumn && counterUsedColumn ? `"${counterReservedColumn}" = GREATEST(0, "${counterReservedColumn}" - $4), "${counterUsedColumn}" = "${counterUsedColumn}" + $5,` : ''}
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = $1
`,
                    counterReservedColumn && counterUsedColumn
                        ? [period.id, event.tokenEstimate, totalTokens, event.counterAmount, event.counterAmount]
                        : [period.id, event.tokenEstimate, totalTokens],
                );
            }

            await manager.query(
                `
UPDATE "${schema}"."AiUsageEvent"
SET status = $2,
    "promptTokens" = $3,
    "completionTokens" = $4,
    "totalTokens" = $5,
    provider = $6,
    model = $7,
    metadata = COALESCE(metadata, '{}'::jsonb) || CAST($8 AS jsonb),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE id = $1
`,
                [
                    args.reservationId,
                    args.status,
                    args.status === 'COMMITTED' ? promptTokens : null,
                    args.status === 'COMMITTED' ? completionTokens : null,
                    args.status === 'COMMITTED' ? totalTokens : null,
                    args.provider ?? null,
                    args.model ?? null,
                    JSON.stringify(args.metadata ?? {}),
                ],
            );
        });
        return { success: true };
    }

    tokenFallbackFromText(text: string | null | undefined) {
        return Math.ceil((text ?? '').length / 4);
    }

    private async getEffectivePlanForUser(userId: string): Promise<EffectivePlan> {
        const [plans, businesses] = await Promise.all([
            this.getPlans(),
            applicationDb.business.findMany({ where: { users: { some: { userId, role: UserRole.OWNER } } } }),
        ]);
        const planById = new Map(plans.map((plan) => [plan.id, plan]));
        const ownedBusinessIds = businesses.map((business) => business.id);
        let best: SubscriptionPlan | null = null;

        for (const business of businesses) {
            const sub = await applicationDb.subscription.findLatestForBusiness({ businessId: business.id });
            if (!sub || !ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status)) continue;
            const planId = sub.planId || getDefaultPlanIdForTier(sub.tier);
            const plan = planById.get(planId) || planById.get(getDefaultPlanIdForTier(sub.tier));
            if (!plan) continue;
            if (!best || plan.priceMonthly > best.priceMonthly) best = plan;
        }

        const fallback = planById.get('starter') || DEFAULT_SUBSCRIPTION_PLANS[0];
        return { ...(best ?? fallback), ownedBusinessIds };
    }

    private async getPlans() {
        const rows = await adminDb.template.findMany({
            where: { name: { in: [SUBSCRIPTION_PLAN_SETTINGS_NAME] } },
            orderBy: { createdAt: 'desc' },
        });
        return normalizeSubscriptionPlanSettings((rows[0] as { cmsSchema?: unknown } | undefined)?.cmsSchema).plans;
    }

    private async assertBusinessAccess(userId: string, businessId: string) {
        const businesses = await applicationDb.business.findMany({ where: { users: { some: { userId } } } });
        if (!businesses.some((business) => business.id === businessId)) {
            throw new HttpException({ message: 'No access to this business' }, HttpStatus.FORBIDDEN);
        }
    }

    private async ensurePeriod(userId: string, month: string, planId: string) {
        const schema = this.applicationSchema();
        const rows = await (await this.getDataSource()).query(
            `
INSERT INTO "${schema}"."AiUsagePeriod" ("userId", month, "planId")
VALUES ($1, $2, $3)
ON CONFLICT ("userId", month) DO UPDATE SET "planId" = EXCLUDED."planId", "updatedAt" = CURRENT_TIMESTAMP
RETURNING *
`,
            [userId, month, planId],
        );
        return rows[0];
    }

    private async withPeriodLock<T>(
        userId: string,
        month: string,
        planId: string,
        fn: (manager: any, period: any) => Promise<T>,
    ): Promise<T> {
        const schema = this.applicationSchema();
        return (await this.getDataSource()).transaction(async (manager) => {
            await manager.query(
                `
INSERT INTO "${schema}"."AiUsagePeriod" ("userId", month, "planId")
VALUES ($1, $2, $3)
ON CONFLICT ("userId", month) DO NOTHING
`,
                [userId, month, planId],
            );
            const rows = await manager.query(
                `SELECT * FROM "${schema}"."AiUsagePeriod" WHERE "userId" = $1 AND month = $2 FOR UPDATE`,
                [userId, month],
            );
            return fn(manager, rows[0]);
        });
    }

    private assertWithinQuota(args: {
        period: any;
        quotas: SubscriptionPlanQuotas;
        activityType: UsageActivityType;
        counterKey: UsageCounterKey | null;
        counterAmount: number;
        tokenEstimate: number;
        planId: string;
        resetAt: string;
    }) {
        const tokenProjected = Number(args.period.tokensUsed ?? 0) + Number(args.period.tokensReserved ?? 0) + args.tokenEstimate;
        if (tokenProjected > args.quotas.monthlyTokens) {
            this.throwQuotaExceeded({
                activityType: args.activityType,
                limitKey: 'monthlyTokens',
                limit: args.quotas.monthlyTokens,
                used: Number(args.period.tokensUsed ?? 0) + Number(args.period.tokensReserved ?? 0),
                remaining: Math.max(0, args.quotas.monthlyTokens - Number(args.period.tokensUsed ?? 0) - Number(args.period.tokensReserved ?? 0)),
                resetAt: args.resetAt,
                planId: args.planId,
            });
        }

        if (!args.counterKey || args.counterAmount === 0) return;
        const used = Number(args.period[`${args.counterKey}Used`] ?? 0);
        const reserved = Number(args.period[`${args.counterKey}Reserved`] ?? 0);
        const limit = Number(args.quotas[args.counterKey] ?? 0);
        if (used + reserved + args.counterAmount > limit) {
            this.throwQuotaExceeded({
                activityType: args.activityType,
                limitKey: args.counterKey,
                limit,
                used: used + reserved,
                remaining: Math.max(0, limit - used - reserved),
                resetAt: args.resetAt,
                planId: args.planId,
            });
        }
    }

    private throwQuotaExceeded(payload: {
        activityType: UsageActivityType;
        limitKey: string;
        limit: number;
        used: number;
        remaining: number;
        resetAt: string | null;
        planId: string;
    }): never {
        throw new HttpException(
            {
                code: 'QUOTA_EXCEEDED',
                message: 'Your plan limit has been reached. Upgrade your plan to continue.',
                upgradeRequired: true,
                ...payload,
            },
            HttpStatus.PAYMENT_REQUIRED,
        );
    }

    private async getRecentEvents(userId: string, month: string) {
        const schema = this.applicationSchema();
        return (await this.getDataSource()).query(
            `
SELECT id, "businessId", month, "activityType", status, "counterKey", "counterAmount",
       "tokenEstimate", "promptTokens", "completionTokens", "totalTokens", provider, model, metadata, "createdAt", "updatedAt"
FROM "${schema}"."AiUsageEvent"
WHERE "userId" = $1 AND month = $2
ORDER BY "createdAt" DESC
LIMIT 25
`,
            [userId, month],
        );
    }

    private publicPlan(plan: EffectivePlan) {
        const { ownedBusinessIds: _ownedBusinessIds, ...publicPlan } = plan;
        return publicPlan;
    }

    private periodUsage(period: any) {
        return {
            monthlyTokens: {
                used: Number(period.tokensUsed ?? 0),
                reserved: Number(period.tokensReserved ?? 0),
            },
            websiteGenerations: {
                used: Number(period.websiteGenerationsUsed ?? 0),
                reserved: Number(period.websiteGenerationsReserved ?? 0),
            },
            mobileAppGenerations: {
                used: Number(period.mobileAppGenerationsUsed ?? 0),
                reserved: Number(period.mobileAppGenerationsReserved ?? 0),
            },
            socialPostGenerations: {
                used: Number(period.socialPostGenerationsUsed ?? 0),
                reserved: Number(period.socialPostGenerationsReserved ?? 0),
            },
        };
    }

    private remaining(quotas: SubscriptionPlanQuotas, period: any) {
        return {
            monthlyTokens: Math.max(0, quotas.monthlyTokens - Number(period.tokensUsed ?? 0) - Number(period.tokensReserved ?? 0)),
            websiteGenerations: Math.max(0, quotas.websiteGenerations - Number(period.websiteGenerationsUsed ?? 0) - Number(period.websiteGenerationsReserved ?? 0)),
            mobileAppGenerations: Math.max(0, quotas.mobileAppGenerations - Number(period.mobileAppGenerationsUsed ?? 0) - Number(period.mobileAppGenerationsReserved ?? 0)),
            socialPostGenerations: Math.max(0, quotas.socialPostGenerations - Number(period.socialPostGenerationsUsed ?? 0) - Number(period.socialPostGenerationsReserved ?? 0)),
            businesses: quotas.businesses,
            mcpKeys: quotas.mcpKeys,
        };
    }

    private monthForTimezone(timezone: string) {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone || 'UTC',
            year: 'numeric',
            month: '2-digit',
        }).formatToParts(new Date());
        const year = parts.find((part) => part.type === 'year')?.value ?? new Date().getUTCFullYear().toString();
        const month = parts.find((part) => part.type === 'month')?.value ?? String(new Date().getUTCMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }

    private resetAt(month: string) {
        const [year, monthNumber] = month.split('-').map(Number);
        return new Date(Date.UTC(year, monthNumber, 1)).toISOString();
    }

    private resolveTotalTokens(args: {
        totalTokens?: number | null;
        promptTokens?: number | null;
        completionTokens?: number | null;
        fallback: number;
    }) {
        const total = this.nullableInt(args.totalTokens);
        if (total !== null) return total;
        const prompt = this.nullableInt(args.promptTokens) ?? 0;
        const completion = this.nullableInt(args.completionTokens) ?? 0;
        const sum = prompt + completion;
        return sum > 0 ? sum : Math.max(0, Math.floor(args.fallback));
    }

    private nullableInt(value: unknown) {
        if (value === null || value === undefined) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
    }

    private async getDataSource() {
        const ds = getApplicationDataSource();
        if (!ds.isInitialized) {
            usageDataSourceInit ??= ds.initialize();
            try {
                await usageDataSourceInit;
            } finally {
                usageDataSourceInit = null;
            }
        }
        return ds;
    }

    private applicationSchema() {
        return process.env.APPLICATION_DB_SCHEMA || 'api';
    }
}
