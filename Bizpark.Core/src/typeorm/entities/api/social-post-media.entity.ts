import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityWithTimestamps, SocialMediaKind, SocialMediaSource } from '../shared';
import { ApiSocialPostEntity } from './social-post.entity';

@Entity({ name: 'SocialPostMedia' })
@Index('IDX_social_post_media_postId', ['postId'])
export class ApiSocialPostMediaEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid' })
    postId!: string;

    @Column({
        type: 'enum',
        enum: SocialMediaKind,
        enumName: 'SocialMediaKind',
    })
    kind!: SocialMediaKind;

    @Column({
        type: 'enum',
        enum: SocialMediaSource,
        enumName: 'SocialMediaSource',
        default: SocialMediaSource.USER_UPLOAD,
    })
    source!: SocialMediaSource;

    @Column({ type: 'text' })
    url!: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    mimeType!: string | null;

    @Column({ type: 'int', nullable: true })
    width!: number | null;

    @Column({ type: 'int', nullable: true })
    height!: number | null;

    @Column({ type: 'int', nullable: true })
    durationMs!: number | null;

    @Column({ type: 'int', default: 0 })
    position!: number;

    // Hints we keep around for re-generation / reproducibility.
    @Column({ type: 'text', nullable: true })
    prompt!: string | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata!: Record<string, unknown> | null;

    @Column({ type: 'timestamptz', nullable: true })
    deletedAt!: Date | null;

    @ManyToOne(() => ApiSocialPostEntity, (post) => post.media, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'postId' })
    post!: ApiSocialPostEntity;
}
