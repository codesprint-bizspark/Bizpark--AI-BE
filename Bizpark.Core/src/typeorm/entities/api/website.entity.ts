import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityWithTimestamps, WebsiteStatus } from '../shared';
import { ApiBusinessEntity } from './business.entity';

@Entity({ name: 'Website' })
export class ApiWebsiteEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid' })
    businessId!: string;

    @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
    domain!: string | null;

    @Column({ type: 'text', nullable: true })
    vercelUrl!: string | null;

    @Column({ type: 'jsonb', nullable: true })
    cmsData!: Record<string, unknown> | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    templateId!: string | null;

    @Column({
        type: 'enum',
        enum: WebsiteStatus,
        enumName: 'WebsiteStatus',
        default: WebsiteStatus.DRAFT,
    })
    status!: WebsiteStatus;

    @Column({ type: 'timestamptz', nullable: true })
    publishedAt!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    suspendedAt!: Date | null;

    @ManyToOne(() => ApiBusinessEntity, (business) => business.websites, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business!: ApiBusinessEntity;
}
