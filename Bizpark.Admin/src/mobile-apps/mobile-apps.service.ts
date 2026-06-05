import { Injectable, NotFoundException } from '@nestjs/common';
import { applicationDb, MobileAppStoreStatus } from 'bizpark.core';
import { AuditService } from '../common/audit.service';

@Injectable()
export class MobileAppsService {
  constructor(private readonly audit: AuditService) {}

  /** All mobile apps that have ever interacted with store publishing. */
  async listStoreRequests() {
    const apps = await applicationDb.mobileApp.findMany({
      orderBy: { storeRequestedAt: 'desc' },
    });

    const rows = apps.map((app) => {
      const cms = (app.cmsData ?? {}) as Record<string, any>;
      return {
        id: app.id,
        businessId: app.businessId,
        businessName: app.business?.name ?? cms.businessName ?? 'Unknown business',
        configStatus: app.status,
        storeStatus: app.storeStatus,
        playStoreUrl: app.playStoreUrl,
        appStoreUrl: app.appStoreUrl,
        storeNote: app.storeNote,
        storeRequestedAt: app.storeRequestedAt,
        storeReviewedAt: app.storeReviewedAt,
      };
    });

    const active = rows.filter((r) => r.storeStatus !== MobileAppStoreStatus.NONE);

    return {
      requests: active,
      stats: {
        total: active.length,
        requested: active.filter((r) => r.storeStatus === MobileAppStoreStatus.REQUESTED).length,
        inReview: active.filter((r) => r.storeStatus === MobileAppStoreStatus.IN_REVIEW).length,
        published: active.filter((r) => r.storeStatus === MobileAppStoreStatus.PUBLISHED).length,
        rejected: active.filter((r) => r.storeStatus === MobileAppStoreStatus.REJECTED).length,
      },
      statuses: Object.values(MobileAppStoreStatus),
    };
  }

  async updateStore(
    id: string,
    input: {
      storeStatus?: string;
      playStoreUrl?: string;
      appStoreUrl?: string;
      storeNote?: string;
    },
    adminId?: string,
  ) {
    const app = await applicationDb.mobileApp.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('Mobile app not found');

    const before = { storeStatus: app.storeStatus };
    const data: Record<string, unknown> = {};

    if (input.storeStatus) data.storeStatus = input.storeStatus;
    if (input.playStoreUrl !== undefined) data.playStoreUrl = input.playStoreUrl.trim() || null;
    if (input.appStoreUrl !== undefined) data.appStoreUrl = input.appStoreUrl.trim() || null;
    if (input.storeNote !== undefined) data.storeNote = input.storeNote.trim() || null;

    // Stamp the review time when an admin moves it past REQUESTED
    if (input.storeStatus && input.storeStatus !== MobileAppStoreStatus.REQUESTED) {
      data.storeReviewedAt = new Date();
    }

    const updated = await applicationDb.mobileApp.update({ where: { id }, data });

    await this.audit.record({
      adminId,
      action: 'mobile-app.store-update',
      targetType: 'mobile-app',
      targetId: id,
      beforeData: before,
      afterData: { storeStatus: updated.storeStatus, playStoreUrl: updated.playStoreUrl, appStoreUrl: updated.appStoreUrl },
    });

    return updated;
  }
}
