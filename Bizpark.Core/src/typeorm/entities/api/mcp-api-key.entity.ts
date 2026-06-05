import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityWithTimestamps } from '../shared';
import { ApiBusinessEntity } from './business.entity';

@Entity({ name: 'McpApiKey' })
@Index('IDX_mcp_api_key_business', ['businessId'])
export class ApiMcpApiKeyEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid' })
    businessId!: string;

    @Column({ type: 'text', unique: true })
    keyHash!: string;

    @Column({ type: 'varchar', length: 24 })
    keyPrefix!: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    label!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    lastUsedAt!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    revokedAt!: Date | null;

    @ManyToOne(() => ApiBusinessEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business!: ApiBusinessEntity;
}
