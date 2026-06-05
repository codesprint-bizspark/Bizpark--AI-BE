import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityWithTimestamps } from '../shared';
import { ApiBusinessEntity } from './business.entity';
import { ApiUserEntity } from './user.entity';

@Entity({ name: 'AiUsageEvent' })
@Index('IDX_ai_usage_event_user_month', ['userId', 'month'])
@Index('IDX_ai_usage_event_business', ['businessId'])
@Index('IDX_ai_usage_event_task', ['taskId'])
export class ApiAiUsageEventEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid' })
    userId!: string;

    @Column({ type: 'uuid', nullable: true })
    businessId!: string | null;

    @Column({ type: 'varchar', length: 7 })
    month!: string;

    @Column({ type: 'varchar', length: 80 })
    activityType!: string;

    @Column({ type: 'varchar', length: 32, default: 'RESERVED' })
    status!: 'RESERVED' | 'COMMITTED' | 'RELEASED';

    @Column({ type: 'uuid', nullable: true })
    taskId!: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    counterKey!: string | null;

    @Column({ type: 'int', default: 0 })
    counterAmount!: number;

    @Column({ type: 'int', default: 0 })
    tokenEstimate!: number;

    @Column({ type: 'int', nullable: true })
    promptTokens!: number | null;

    @Column({ type: 'int', nullable: true })
    completionTokens!: number | null;

    @Column({ type: 'int', nullable: true })
    totalTokens!: number | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    provider!: string | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    model!: string | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata!: Record<string, unknown> | null;

    @ManyToOne(() => ApiUserEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user!: ApiUserEntity;

    @ManyToOne(() => ApiBusinessEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business!: ApiBusinessEntity | null;
}
