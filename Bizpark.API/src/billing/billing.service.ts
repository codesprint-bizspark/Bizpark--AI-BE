import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
    applicationDb,
    DEFAULT_SUBSCRIPTION_PLANS,
    SubscriptionStatus,
    SubscriptionTier,
} from 'bizpark.core';

type CurrentUser = { id: string; email: string; name: string };

const md5 = (s: string) => createHash('md5').update(s).digest('hex');
const md5Upper = (s: string) => md5(s).toUpperCase();

@Injectable()
export class BillingService {
    private readonly logger = new Logger(BillingService.name);

    private get merchantId() { return process.env.PAYHERE_MERCHANT_ID || ''; }
    private get merchantSecret() { return process.env.PAYHERE_MERCHANT_SECRET || ''; }
    private get sandbox() { return process.env.PAYHERE_SANDBOX !== 'false'; } // default sandbox
    private get checkoutUrl() {
        return this.sandbox
            ? 'https://sandbox.payhere.lk/pay/checkout'
            : 'https://www.payhere.lk/pay/checkout';
    }
    private get apiBase() { return (process.env.PUBLIC_API_URL || 'http://localhost:3000').replace(/\/+$/, ''); }
    private get frontendBase() { return (process.env.FRONTEND_URL || 'http://localhost:9002').replace(/\/+$/, ''); }

    private findPlan(planId: string) {
        const plan = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.id === planId);
        if (!plan) throw new BadRequestException(`Unknown plan: ${planId}`);
        return plan;
    }

    private async assertAccess(businessId: string, userId: string) {
        const rows = await applicationDb.business.findMany({ where: { users: { some: { userId } } } });
        const biz = rows.find((b) => b.id === businessId);
        if (!biz) throw new ForbiddenException('No access to this business');
        return biz;
    }

    /**
     * Build the PayHere checkout payload for a recurring subscription.
     * The frontend auto-submits these fields as a form POST to PayHere.
     */
    async createCheckout(businessId: string, planId: string, user: CurrentUser) {
        await this.assertAccess(businessId, user.id);
        if (!this.merchantId || !this.merchantSecret) {
            throw new BadRequestException('PayHere is not configured. Set PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET.');
        }

        const plan = this.findPlan(planId);
        const orderId = `sub_${businessId.slice(0, 8)}_${Date.now()}`;
        const amount = Number(plan.priceMonthly).toFixed(2);
        const currency = plan.currency || 'USD';

        // Record a pending subscription so the notify webhook can match it.
        await applicationDb.subscription.upsertForBusiness({
            businessId,
            data: {
                tier: plan.tier as SubscriptionTier,
                status: SubscriptionStatus.TRIALING, // pending until PayHere confirms
                paymentProvider: 'payhere',
                paymentReference: orderId,
            },
        });

        const hash = md5Upper(
            this.merchantId + orderId + amount + currency + md5Upper(this.merchantSecret),
        );

        const [firstName, ...rest] = (user.name || 'Customer').split(' ');

        return {
            checkoutUrl: this.checkoutUrl,
            sandbox: this.sandbox,
            fields: {
                merchant_id: this.merchantId,
                return_url: `${this.frontendBase}/dashboard/settings?billing=success`,
                cancel_url: `${this.frontendBase}/dashboard/settings?billing=cancelled`,
                notify_url: `${this.apiBase}/api/billing/notify`,
                order_id: orderId,
                items: `BizSpark ${plan.name} Plan`,
                currency,
                amount,
                first_name: firstName || 'Customer',
                last_name: rest.join(' ') || '-',
                email: user.email,
                phone: '0000000000',
                address: '-',
                city: '-',
                country: 'Sri Lanka',
                hash,
                // Recurring billing — charge monthly, forever until cancelled
                recurrence: '1 Month',
                duration: 'Forever',
                // custom fields echoed back in notify
                custom_1: businessId,
                custom_2: plan.id,
            },
        };
    }

    /**
     * PayHere server-to-server notify webhook.
     * Verifies md5sig, then activates the subscription on success.
     */
    async handleNotify(body: Record<string, string>) {
        const {
            merchant_id, order_id, payhere_amount, payhere_currency,
            status_code, md5sig, custom_1: businessId, custom_2: planId,
        } = body;

        const local = md5Upper(
            merchant_id + order_id + payhere_amount + payhere_currency + status_code + md5Upper(this.merchantSecret),
        );

        if (local !== (md5sig || '').toUpperCase()) {
            this.logger.warn(`[notify] md5sig mismatch for order ${order_id}`);
            return { ok: false };
        }

        // status_code: 2 = success, 0 = pending, -1 = cancelled, -2 = failed, -3 = chargedback
        if (status_code !== '2') {
            this.logger.log(`[notify] order ${order_id} status ${status_code} — not activating`);
            if (businessId && (status_code === '-1' || status_code === '-2')) {
                await applicationDb.subscription.upsertForBusiness({
                    businessId,
                    data: { status: SubscriptionStatus.PAST_DUE, paymentReference: order_id },
                });
            }
            return { ok: true };
        }

        if (!businessId) {
            this.logger.warn(`[notify] missing businessId (custom_1) for order ${order_id}`);
            return { ok: false };
        }

        const plan = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.id === planId);
        const now = new Date();
        const expires = new Date(now);
        expires.setMonth(expires.getMonth() + 1);

        await applicationDb.subscription.upsertForBusiness({
            businessId,
            data: {
                tier: (plan?.tier as SubscriptionTier) ?? SubscriptionTier.PRO,
                status: SubscriptionStatus.ACTIVE,
                startedAt: now,
                expiresAt: expires,
                paymentProvider: 'payhere',
                paymentReference: order_id,
            },
        });

        this.logger.log(`[notify] subscription ACTIVE for business ${businessId} (${planId})`);
        return { ok: true };
    }

    async getStatus(businessId: string, user: CurrentUser) {
        await this.assertAccess(businessId, user.id);
        const sub = await applicationDb.subscription.findLatestForBusiness({ businessId });
        const plan = sub ? DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.tier === sub.tier) : null;
        return {
            success: true,
            data: sub ? {
                tier: sub.tier,
                status: sub.status,
                planName: plan?.name ?? sub.tier,
                startedAt: sub.startedAt,
                expiresAt: sub.expiresAt,
                paymentProvider: sub.paymentProvider,
            } : null,
        };
    }
}
