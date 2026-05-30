import { Injectable, NotFoundException } from '@nestjs/common';
import {
  adminDb,
  getEffectiveSubscriptionPlanStatus,
  normalizeSubscriptionPlanSettings,
  SUBSCRIPTION_PLAN_SETTINGS_NAME,
  SubscriptionPlan,
  SubscriptionPlanSettings,
  SubscriptionPlanType,
  SubscriptionPlanVisibility,
  TemplateType,
} from 'bizpark.core';
import { AuditService } from '../common/audit.service';

export type SubscriptionPlanFormInput = {
  name?: string;
  tier?: string;
  type?: SubscriptionPlanType;
  status?: SubscriptionPlanVisibility;
  priceMonthly?: string;
  originalPriceMonthly?: string;
  discountPercentage?: string;
  currency?: string;
  description?: string;
  ctaText?: string;
  badgeText?: string;
  isPopular?: string;
  benefits?: string | string[];
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
};

type PlanSettingsRow = {
  id: string;
  cmsSchema: unknown;
};

type AdminSubscriptionPlan = SubscriptionPlan & {
  effectiveStatus: SubscriptionPlanVisibility;
  countdownLabel: string;
};

@Injectable()
export class SubscriptionsService {
  constructor(private readonly audit: AuditService) {}

  getTimezones() {
    return ['UTC', 'Asia/Colombo', 'America/New_York', 'Europe/London', 'Europe/Berlin', 'Asia/Singapore'];
  }

  async getPlans(): Promise<AdminSubscriptionPlan[]> {
    const settings = await this.getSettings();
    return settings.plans.map((plan) => this.decoratePlan(plan));
  }

  async createPlan(input: SubscriptionPlanFormInput, adminId?: string) {
    const row = await this.getSettingsRow();
    const before = normalizeSubscriptionPlanSettings(row?.cmsSchema);
    const plan = this.planFromInput(input, `plan-${Date.now()}`);
    const after = {
      ...before,
      plans: [...before.plans, plan],
    };

    await this.saveSettings(after, row);
    await this.record(adminId, 'subscription.plan.create', plan.id, before, after);
    return plan;
  }

  async updatePlan(id: string, input: SubscriptionPlanFormInput, adminId?: string) {
    const row = await this.getSettingsRow();
    const before = normalizeSubscriptionPlanSettings(row?.cmsSchema);
    const existing = before.plans.find((plan) => plan.id === id);
    if (!existing) {
      throw new NotFoundException('Subscription plan not found');
    }

    const after = {
      ...before,
      plans: before.plans.map((plan) => (plan.id === id ? this.planFromInput(input, id, plan) : plan)),
    };

    await this.saveSettings(after, row);
    await this.record(adminId, 'subscription.plan.update', id, before, after);
    return after;
  }

  async deletePlan(id: string, adminId?: string) {
    const row = await this.getSettingsRow();
    const before = normalizeSubscriptionPlanSettings(row?.cmsSchema);
    const after = {
      ...before,
      plans: before.plans.filter((plan) => plan.id !== id),
      deletedPlanIds: [...new Set([...(before.deletedPlanIds ?? []), id])],
    };

    await this.saveSettings(after, row);
    await this.record(adminId, 'subscription.plan.delete', id, before, after);
    return after;
  }

  async togglePlan(id: string, adminId?: string) {
    const row = await this.getSettingsRow();
    const before = normalizeSubscriptionPlanSettings(row?.cmsSchema);
    const after = {
      ...before,
      plans: before.plans.map((plan) =>
        plan.id === id
          ? {
              ...plan,
              status:
                getEffectiveSubscriptionPlanStatus(plan) === SubscriptionPlanVisibility.ACTIVE
                  ? SubscriptionPlanVisibility.INACTIVE
                  : SubscriptionPlanVisibility.ACTIVE,
            }
          : plan,
      ),
    };

    await this.saveSettings(after, row);
    await this.record(adminId, 'subscription.plan.toggle', id, before, after);
    return after;
  }

  private async getSettings(): Promise<SubscriptionPlanSettings> {
    const row = await this.getSettingsRow();
    return normalizeSubscriptionPlanSettings(row?.cmsSchema);
  }

  private planFromInput(input: SubscriptionPlanFormInput, fallbackId: string, existing?: SubscriptionPlan): SubscriptionPlan {
    const name = String(input.name || existing?.name || 'New Plan').trim();
    const id = existing?.id ?? this.createPlanId(input.tier || name || fallbackId);
    const startsAt = this.parseDateInput(input.startsAt);
    const endsAt = this.parseDateInput(input.endsAt);
    const status = (input.status || existing?.status || SubscriptionPlanVisibility.DRAFT) as SubscriptionPlanVisibility;

    return {
      id,
      tier: String(input.tier || existing?.tier || id.toUpperCase()).trim(),
      name,
      type: (input.type || existing?.type || SubscriptionPlanType.REGULAR) as SubscriptionPlanType,
      status,
      priceMonthly: this.parseNumber(input.priceMonthly, existing?.priceMonthly ?? 0) ?? 0,
      originalPriceMonthly: this.parseNumber(input.originalPriceMonthly, existing?.originalPriceMonthly ?? null),
      discountPercentage: this.parseNumber(input.discountPercentage, existing?.discountPercentage ?? null),
      currency: String(input.currency || existing?.currency || 'USD').trim().toUpperCase(),
      description: String(input.description || existing?.description || '').trim(),
      ctaText: String(input.ctaText || existing?.ctaText || 'Get Started').trim(),
      badgeText: String(input.badgeText || existing?.badgeText || '').trim(),
      isPopular: input.isPopular === 'on',
      benefits: this.parseBenefits(input.benefits, existing?.benefits ?? []),
      startsAt,
      endsAt,
      timezone: String(input.timezone || existing?.timezone || 'UTC').trim(),
    };
  }

  private decoratePlan(plan: SubscriptionPlan): AdminSubscriptionPlan {
    const effectiveStatus = getEffectiveSubscriptionPlanStatus(plan);
    return {
      ...plan,
      effectiveStatus,
      countdownLabel: this.getCountdownLabel(plan, effectiveStatus),
    };
  }

  private getCountdownLabel(plan: SubscriptionPlan, status: SubscriptionPlanVisibility) {
    const target =
      status === SubscriptionPlanVisibility.SCHEDULED
        ? plan.startsAt
        : status === SubscriptionPlanVisibility.ACTIVE
          ? plan.endsAt
          : null;
    if (!target) {
      return '';
    }

    const diff = new Date(target).getTime() - Date.now();
    if (diff <= 0) {
      return status === SubscriptionPlanVisibility.SCHEDULED ? 'Starts soon' : 'Ends soon';
    }

    const days = Math.floor(diff / 86400000);
    if (days > 0) {
      return status === SubscriptionPlanVisibility.SCHEDULED ? `Starts in ${days} day${days === 1 ? '' : 's'}` : `Ends in ${days} day${days === 1 ? '' : 's'}`;
    }

    const hours = Math.max(1, Math.ceil(diff / 3600000));
    return status === SubscriptionPlanVisibility.SCHEDULED ? `Starts in ${hours}h` : `Ends in ${hours}h`;
  }

  private parseBenefits(value: string | string[] | undefined, fallback: string[]) {
    const lines = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
    const benefits = lines.map((benefit) => String(benefit).trim()).filter(Boolean);
    return benefits.length ? benefits : fallback;
  }

  private parseNumber(value: string | number | null | undefined, fallback: number | null) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private parseDateInput(value?: string) {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private createPlanId(value: string) {
    const slug = String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 42);
    return `${slug || 'plan'}-${Date.now().toString(36)}`;
  }

  private async saveSettings(settings: SubscriptionPlanSettings, existingRow: PlanSettingsRow | null) {
    if (existingRow) {
      await adminDb.template.update({
        where: { id: existingRow.id },
        data: { cmsSchema: settings },
      });
      return;
    }

    await adminDb.template.create({
      data: {
        name: SUBSCRIPTION_PLAN_SETTINGS_NAME,
        description: 'Editable pricing, benefits, and promotional subscription plans.',
        type: TemplateType.SHOWCASE,
        cmsSchema: settings,
        deployment: {},
      },
    });
  }

  private async record(
    adminId: string | undefined,
    action: string,
    targetId: string,
    before: SubscriptionPlanSettings,
    after: SubscriptionPlanSettings,
  ) {
    await this.audit.record({
      adminId,
      action,
      targetType: 'subscription-plan',
      targetId,
      beforeData: before as unknown as Record<string, unknown>,
      afterData: after as unknown as Record<string, unknown>,
    });
  }

  private async getSettingsRow() {
    const rows = await adminDb.template.findMany({
      where: { name: { in: [SUBSCRIPTION_PLAN_SETTINGS_NAME] } },
      orderBy: { createdAt: 'desc' },
    });
    return (rows[0] as PlanSettingsRow | undefined) ?? null;
  }
}
