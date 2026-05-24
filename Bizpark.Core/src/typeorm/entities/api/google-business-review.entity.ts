import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityWithTimestamps } from '../shared';
import { ApiBusinessEntity } from './business.entity';

export type GoogleBusinessReviewStatus =
    | 'SYNCED'
    | 'AI_PENDING'
    | 'PENDING_APPROVAL'
    | 'REPLIED'
    | 'FAILED';

@Entity({ name: 'GoogleBusinessReview' })
export class ApiGoogleBusinessReviewEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid' })
    businessId!: string;

    @Column({ type: 'text' })
    locationName!: string;

    @Column({ type: 'text', unique: true })
    reviewName!: string;

    @Column({ type: 'varchar', length: 255 })
    reviewId!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    reviewerDisplayName!: string | null;

    @Column({ type: 'boolean', default: false })
    reviewerIsAnonymous!: boolean;

    @Column({ type: 'int' })
    rating!: number;

    @Column({ type: 'text', nullable: true })
    comment!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    reviewCreateTime!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    reviewUpdateTime!: Date | null;

    @Column({ type: 'text', nullable: true })
    googleReply!: string | null;

    @Column({ type: 'text', nullable: true })
    aiReply!: string | null;

    @Column({ type: 'varchar', length: 32, default: 'SYNCED' })
    status!: GoogleBusinessReviewStatus;

    @Column({ type: 'uuid', nullable: true })
    agentTaskId!: string | null;

    @Column({ type: 'text', nullable: true })
    failureReason!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    repliedAt!: Date | null;

    @ManyToOne(() => ApiBusinessEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business!: ApiBusinessEntity;
}
