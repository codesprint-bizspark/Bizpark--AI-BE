import { Column, Entity } from 'typeorm';
import { AdminRole, BaseEntityWithTimestamps } from '../shared';

@Entity({ name: 'AdminUser' })
export class AdminUserEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'varchar', length: 255, unique: true })
    email!: string;

    @Column({ type: 'varchar', length: 255 })
    passwordHash!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({
        type: 'enum',
        enum: AdminRole,
        enumName: 'AdminRole',
        default: AdminRole.ADMIN,
    })
    role!: AdminRole;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;
}
