import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityWithTimestamps, MobileAppStatus } from '../shared';
import { ApiBusinessEntity } from './business.entity';

@Entity({ name: 'MobileApp' })
export class ApiMobileAppEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid' })
    businessId!: string;

    @Column({ type: 'jsonb', nullable: true })
    cmsData!: Record<string, unknown> | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    templateId!: string | null;

    @Column({
        type: 'enum',
        enum: MobileAppStatus,
        enumName: 'MobileAppStatus',
        default: MobileAppStatus.DRAFT,
    })
    status!: MobileAppStatus;

    @Column({ type: 'timestamptz', nullable: true })
    publishedAt!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    suspendedAt!: Date | null;

    @ManyToOne(() => ApiBusinessEntity, (business) => business.mobileApps, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business!: ApiBusinessEntity;
}
