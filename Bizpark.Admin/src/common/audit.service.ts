import { Injectable } from '@nestjs/common';
import { adminDb } from 'bizpark.core';

@Injectable()
export class AuditService {
  async record(input: {
    adminId?: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    beforeData?: Record<string, unknown> | null;
    afterData?: Record<string, unknown> | null;
  }) {
    return adminDb.auditLog.create({
      data: {
        adminId: input.adminId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        beforeData: input.beforeData ?? null,
        afterData: input.afterData ?? null,
      },
    });
  }
}
