import { Injectable } from '@nestjs/common';
import {
    adminDb,
    normalizeSubscriptionPlanSettings,
    SUBSCRIPTION_PLAN_SETTINGS_NAME,
} from 'bizpark.core';

type PlanSettingsRow = {
    cmsSchema: unknown;
};

@Injectable()
export class SubscriptionPlansService {
    async list() {
        const rows = await adminDb.template.findMany({
            where: { name: { in: [SUBSCRIPTION_PLAN_SETTINGS_NAME] } },
            orderBy: { createdAt: 'desc' },
        });

        const settings = rows[0] as PlanSettingsRow | undefined;
        return normalizeSubscriptionPlanSettings(settings?.cmsSchema).plans;
    }
}
