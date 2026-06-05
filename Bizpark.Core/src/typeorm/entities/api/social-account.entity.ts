import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntityWithTimestamps, SocialAccountStatus, SocialPlatform } from '../shared';
import { ApiBusinessEntity } from './business.entity';
import { ApiSocialPostEntity } from './social-post.entity';

@Entity({ name: 'SocialAccount' })
@Index('IDX_social_account_business_platform', ['businessId', 'platform'])
export class ApiSocialAccountEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid' })
    businessId!: string;

    @Column({
        type: 'enum',
        enum: SocialPlatform,
        enumName: 'SocialPlatform',
    })
    platform!: SocialPlatform;

    // The platform-side identity (Facebook user id, IG business id, TikTok open_id, …)
    @Column({ type: 'varchar', length: 255 })
    externalAccountId!: string;

    // Page / IG-business / TikTok creator account id we actually publish to.
    @Column({ type: 'varchar', length: 255, nullable: true })
    externalPageId!: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    displayName!: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    username!: string | null;

    @Column({ type: 'text', nullable: true })
    avatarUrl!: string | null;

    // OAuth tokens — ENCRYPTED at rest (envelope via TOKEN_ENCRYPTION_KEY).
    // We store ciphertext; never expose to the frontend.
    @Column({ type: 'text' })
    accessTokenCipher!: string;

    @Column({ type: 'text', nullable: true })
    refreshTokenCipher!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    tokenExpiresAt!: Date | null;

    @Column({ type: 'text', nullable: true })
    scope!: string | null;

    @Column({
        type: 'enum',
        enum: SocialAccountStatus,
        enumName: 'SocialAccountStatus',
        default: SocialAccountStatus.CONNECTED,
    })
    status!: SocialAccountStatus;

    @Column({ type: 'jsonb', nullable: true })
    metadata!: Record<string, unknown> | null;

    @Column({ type: 'timestamptz', nullable: true })
    lastRefreshedAt!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    deletedAt!: Date | null;

    @ManyToOne(() => ApiBusinessEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business!: ApiBusinessEntity;

    @OneToMany(() => ApiSocialPostEntity, (post) => post.account)
    posts!: ApiSocialPostEntity[];
}
