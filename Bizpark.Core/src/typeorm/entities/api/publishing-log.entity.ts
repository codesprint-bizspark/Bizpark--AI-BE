import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import {
    BaseEntityWithTimestamps,
    PublishingLogStatus,
    SocialPlatform,
} from '../shared';
import { ApiSocialPostEntity } from './social-post.entity';

@Entity({ name: 'PublishingLog' })
@Index('IDX_publishing_log_post', ['postId'])
@Index('IDX_publishing_log_status', ['status'])
export class ApiPublishingLogEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid' })
    postId!: string;

    @Column({
        type: 'enum',
        enum: SocialPlatform,
        enumName: 'SocialPlatform',
    })
    platform!: SocialPlatform;

    @Column({
        type: 'enum',
        enum: PublishingLogStatus,
        enumName: 'PublishingLogStatus',
        default: PublishingLogStatus.PENDING,
    })
    status!: PublishingLogStatus;

    @Column({ type: 'int', default: 0 })
    attempt!: number;

    @Column({ type: 'varchar', length: 255, nullable: true })
    externalPostId!: string | null;

    @Column({ type: 'text', nullable: true })
    externalPostUrl!: string | null;

    @Column({ type: 'jsonb', nullable: true })
    response!: Record<string, unknown> | null;

    @Column({ type: 'text', nullable: true })
    errorMessage!: string | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    errorCode!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    startedAt!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    finishedAt!: Date | null;

    @ManyToOne(() => ApiSocialPostEntity, (post) => post.publishingLogs, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'postId' })
    post!: ApiSocialPostEntity;
}
