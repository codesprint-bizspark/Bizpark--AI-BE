import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityWithTimestamps } from '../shared';
import { ApiBusinessEntity } from './business.entity';

@Entity({ name: 'GoogleBusinessConnection' })
export class ApiGoogleBusinessConnectionEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'uuid' })
    businessId!: string;

    @Column({ type: 'varchar', length: 32, default: 'mock' })
    provider!: 'mock' | 'real';

    @Column({ type: 'text', nullable: true })
    googleAccountName!: string | null;

    @Column({ type: 'text', nullable: true })
    locationName!: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    locationTitle!: string | null;

    @Column({ type: 'text', nullable: true })
    address!: string | null;

    @Column({ type: 'text', nullable: true })
    encryptedRefreshToken!: string | null;

    @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
    scopes!: string[];

    @Column({ type: 'timestamptz', nullable: true })
    lastSyncedAt!: Date | null;

    @Column({ type: 'varchar', length: 32, default: 'CONNECTED' })
    status!: 'CONNECTED' | 'NEEDS_REAUTH' | 'FAILED';

    @ManyToOne(() => ApiBusinessEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business!: ApiBusinessEntity;
}
