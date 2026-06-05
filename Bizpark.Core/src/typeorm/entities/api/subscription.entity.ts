import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityWithTimestamps, SubscriptionStatus, SubscriptionTier } from '../shared';
import { ApiBusinessEntity } from './business.entity';

@Entity({ name: 'Subscription' })
export class ApiSubscriptionEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid' })
    businessId!: string;

    @Column({
        type: 'enum',
        enum: SubscriptionTier,
        enumName: 'SubscriptionTier',
        default: SubscriptionTier.FREE,
    })
    tier!: SubscriptionTier;

    @Column({
        type: 'enum',
        enum: SubscriptionStatus,
        enumName: 'SubscriptionStatus',
        default: SubscriptionStatus.TRIALING,
    })
    status!: SubscriptionStatus;

    @Column({ type: 'timestamptz', nullable: true })
    startedAt!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    expiresAt!: Date | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    paymentProvider!: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    paymentReference!: string | null;

    @ManyToOne(() => ApiBusinessEntity, (business) => business.subscriptions, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business!: ApiBusinessEntity;
}
