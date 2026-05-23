import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AiGenerationKind, BaseEntityWithTimestamps, SocialPlatform } from '../shared';
import { ApiBusinessEntity } from './business.entity';
import { ApiSocialPostEntity } from './social-post.entity';

@Entity({ name: 'AiGeneration' })
@Index('IDX_ai_generation_business', ['businessId'])
@Index('IDX_ai_generation_post', ['postId'])
export class ApiAiGenerationEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid' })
    businessId!: string;

    @Column({ type: 'uuid', nullable: true })
    postId!: string | null;

    @Column({
        type: 'enum',
        enum: SocialPlatform,
        enumName: 'SocialPlatform',
        nullable: true,
    })
    platform!: SocialPlatform | null;

    @Column({
        type: 'enum',
        enum: AiGenerationKind,
        enumName: 'AiGenerationKind',
    })
    kind!: AiGenerationKind;

    @Column({ type: 'varchar', length: 100, nullable: true })
    model!: string | null;

    @Column({ type: 'jsonb' })
    input!: Record<string, unknown>;

    @Column({ type: 'jsonb' })
    output!: Record<string, unknown>;

    @Column({ type: 'int', nullable: true })
    promptTokens!: number | null;

    @Column({ type: 'int', nullable: true })
    completionTokens!: number | null;

    @Column({ type: 'int', nullable: true })
    latencyMs!: number | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    createdByUserId!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    deletedAt!: Date | null;

    @ManyToOne(() => ApiBusinessEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business!: ApiBusinessEntity;

    @ManyToOne(() => ApiSocialPostEntity, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'postId' })
    post!: ApiSocialPostEntity | null;
}
