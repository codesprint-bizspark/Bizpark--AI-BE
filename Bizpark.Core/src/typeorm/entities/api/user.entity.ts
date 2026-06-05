import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntityWithTimestamps } from '../shared';
import { ApiBusinessUserEntity } from './business-user.entity';

@Entity({ name: 'User' })
export class ApiUserEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'varchar', length: 255, unique: true })
    email!: string;

    @Column({ type: 'varchar', length: 255 })
    passwordHash!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    @OneToMany(() => ApiBusinessUserEntity, (businessUser) => businessUser.user)
    businesses!: ApiBusinessUserEntity[];
}
