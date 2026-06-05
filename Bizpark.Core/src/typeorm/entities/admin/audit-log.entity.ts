import { Column, Entity } from 'typeorm';
import { BaseEntityWithTimestamps } from '../shared';

@Entity({ name: 'AdminAuditLog' })
export class AdminAuditLogEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid', nullable: true })
    adminId!: string | null;

    @Column({ type: 'varchar', length: 255 })
    action!: string;

    @Column({ type: 'varchar', length: 100 })
    targetType!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    targetId!: string | null;

    @Column({ type: 'jsonb', nullable: true })
    beforeData!: Record<string, unknown> | null;

    @Column({ type: 'jsonb', nullable: true })
    afterData!: Record<string, unknown> | null;
}
