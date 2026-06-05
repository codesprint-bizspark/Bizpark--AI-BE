import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntityWithTimestamps } from '../shared';

@Entity({ name: 'AiUsagePeriod' })
@Unique('UIDX_ai_usage_period_user_month', ['userId', 'month'])
@Index('IDX_ai_usage_period_user', ['userId'])
export class ApiAiUsagePeriodEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid' })
    userId!: string;

    @Column({ type: 'varchar', length: 7 })
    month!: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    planId!: string | null;

    @Column({ type: 'int', default: 0 })
    tokensUsed!: number;

    @Column({ type: 'int', default: 0 })
    tokensReserved!: number;

    @Column({ type: 'int', default: 0 })
    websiteGenerationsUsed!: number;

    @Column({ type: 'int', default: 0 })
    websiteGenerationsReserved!: number;

    @Column({ type: 'int', default: 0 })
    mobileAppGenerationsUsed!: number;

    @Column({ type: 'int', default: 0 })
    mobileAppGenerationsReserved!: number;

    @Column({ type: 'int', default: 0 })
    socialPostGenerationsUsed!: number;

    @Column({ type: 'int', default: 0 })
    socialPostGenerationsReserved!: number;
}
