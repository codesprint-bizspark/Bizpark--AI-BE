import { Injectable } from '@nestjs/common';
import {
  adminDb,
  normalizeSubscriptionPlanSettings,
  SUBSCRIPTION_PLAN_SETTINGS_NAME,
  SubscriptionPlan,
  SubscriptionTier,
  TemplateType,
} from 'bizpark.core';
import { AuditService } from '../common/audit.service';

type PlanSettingsRow = {
  id: string;
  cmsSchema: unknown;
};

@Injectable()
export class SubscriptionsService {
  constructor(private readonly audit: AuditService) {}

  async getPlans(): Promise<SubscriptionPlan[]> {
    const settings = await this.getSettingsRow();
    return normalizeSubscriptionPlanSettings(settings?.cmsSchema).plans;
  }

  async updatePlan(
    tier: SubscriptionTier,
    input: {
      name?: string;
      priceMonthly?: string;
      currency?: string;
      description?: string;
      ctaText?: string;
      isPopular?: string;
      benefits?: string;
    },
    adminId?: string,
  ) {
    const before = await this.getSettingsRow();
    const currentSettings = normalizeSubscriptionPlanSettings(before?.cmsSchema);
    const nextPlans = currentSettings.plans.map((plan) => {
      if (plan.tier !== tier) {
        return {
          ...plan,
          isPopular: input.isPopular ? false : plan.isPopular,
        };
      }

      return {
        ...plan,
        name: String(input.name || plan.name).trim(),
        priceMonthly: Number(input.priceMonthly || plan.priceMonthly),
        currency: String(input.currency || plan.currency).trim().toUpperCase(),
        description: String(input.description || plan.description).trim(),
        ctaText: String(input.ctaText || plan.ctaText).trim(),
        isPopular: input.isPopular === 'on',
        benefits: String(input.benefits || '')
          .split(/\r?\n/)
          .map((benefit) => benefit.trim())
          .filter(Boolean),
      };
    });
    const nextSettings = normalizeSubscriptionPlanSettings({ plans: nextPlans });

    if (before) {
      await adminDb.template.update({
        where: { id: before.id },
        data: { cmsSchema: nextSettings },
      });
    } else {
      await adminDb.template.create({
        data: {
          name: SUBSCRIPTION_PLAN_SETTINGS_NAME,
          description: 'Editable pricing and benefits for subscription plans.',
          type: TemplateType.SHOWCASE,
          cmsSchema: nextSettings,
          deployment: {},
        },
      });
    }

    await this.audit.record({
      adminId,
      action: 'subscription.plan.update',
      targetType: 'subscription-plan',
      targetId: tier,
      beforeData: currentSettings as unknown as Record<string, unknown>,
      afterData: nextSettings as unknown as Record<string, unknown>,
    });

    return nextSettings;
  }

  private async getSettingsRow() {
    const rows = await adminDb.template.findMany({
      where: { name: { in: [SUBSCRIPTION_PLAN_SETTINGS_NAME] } },
      orderBy: { createdAt: 'desc' },
    });
    return (rows[0] as PlanSettingsRow | undefined) ?? null;
  }
}
