import { AdminAuditLogEntity } from './audit-log.entity';
import { AdminTemplateEntity } from './template.entity';
import { AdminUserEntity } from './admin-user.entity';

export const ADMIN_ENTITIES = [AdminTemplateEntity, AdminUserEntity, AdminAuditLogEntity];

export * from './admin-user.entity';
export * from './audit-log.entity';
export * from './template.entity';
