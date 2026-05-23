import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import {
    BaseEntityWithTimestamps,
    SocialPlatform,
    SocialPostStatus,
    SocialPostType,
} from '../shared';
import { ApiBusinessEntity } from './business.entity';
import { ApiSocialAccountEntity } from './social-account.entity';
import { ApiSocialPostMediaEntity } from './social-post-media.entity';
import { ApiPublishingLogEntity } from './publishing-log.entity';

@Entity({ name: 'SocialPost' })
@Index('IDX_social_post_business_status', ['businessId', 'status'])
@Index('IDX_social_post_scheduled_at', ['scheduledAt'])
export class ApiSocialPostEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid' })
    businessId!: string;

    // The account this post will be published to. Nullable until user picks one.
    @Column({ type: 'uuid', nullable: true })
    accountId!: string | null;

    @Column({
        type: 'enum',
        enum: SocialPlatform,
        enumName: 'SocialPlatform',
    })
    platform!: SocialPlatform;

    @Column({
        type: 'enum',
        enum: SocialPostType,
        enumName: 'SocialPostType',
        default: SocialPostType.TEXT,
    })
    postType!: SocialPostType;

    @Column({
        type: 'enum',
        enum: SocialPostStatus,
        enumName: 'SocialPostStatus',
        default: SocialPostStatus.DRAFT,
    })
    status!: SocialPostStatus;

    @Column({ type: 'text', nullable: true })
    caption!: string | null;

    @Column({ type: 'text', nullable: true })
    cta!: string | null;

    @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
    hashtags!: string[];

    // Free-form AI metadata — image prompt, flyer prompt, video script, scenes, …
    @Column({ type: 'jsonb', nullable: true })
    aiMetadata!: Record<string, unknown> | null;

    // The originating AiGeneration id (latest one) — useful for traceability.
    @Column({ type: 'uuid', nullable: true })
    sourceGenerationId!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    scheduledAt!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    publishedAt!: Date | null;

    // Platform-side post id once published (eg fb post id, ig media id, tiktok video id).
    @Column({ type: 'varchar', length: 255, nullable: true })
    externalPostId!: string | null;

    @Column({ type: 'text', nullable: true })
    externalPostUrl!: string | null;

    @Column({ type: 'text', nullable: true })
    lastError!: string | null;

    @Column({ type: 'int', default: 0 })
    retryCount!: number;

    // Soft-delete + audit
    @Column({ type: 'varchar', length: 255, nullable: true })
    createdByUserId!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    deletedAt!: Date | null;

    @ManyToOne(() => ApiBusinessEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business!: ApiBusinessEntity;

    @ManyToOne(() => ApiSocialAccountEntity, (acct) => acct.posts, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'accountId' })
    account!: ApiSocialAccountEntity | null;

    @OneToMany(() => ApiSocialPostMediaEntity, (media) => media.post)
    media!: ApiSocialPostMediaEntity[];

    @OneToMany(() => ApiPublishingLogEntity, (log) => log.post)
    publishingLogs!: ApiPublishingLogEntity[];
}
