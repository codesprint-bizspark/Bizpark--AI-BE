import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityWithTimestamps, MobileAppStatus, MobileAppStoreStatus } from '../shared';
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

    // ── App-store publishing ──────────────────────────────────────────────
    @Column({
        type: 'enum',
        enum: MobileAppStoreStatus,
        enumName: 'MobileAppStoreStatus',
        default: MobileAppStoreStatus.NONE,
    })
    storeStatus!: MobileAppStoreStatus;

    @Column({ type: 'text', nullable: true })
    playStoreUrl!: string | null;

    @Column({ type: 'text', nullable: true })
    appStoreUrl!: string | null;

    // Admin note shown to the user (e.g. rejection reason, review ETA)
    @Column({ type: 'text', nullable: true })
    storeNote!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    storeRequestedAt!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    storeReviewedAt!: Date | null;

    @ManyToOne(() => ApiBusinessEntity, (business) => business.mobileApps, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business!: ApiBusinessEntity;
}
