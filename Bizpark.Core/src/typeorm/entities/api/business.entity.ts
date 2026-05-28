import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntityWithTimestamps, BusinessStatus, SubscriptionTier } from '../shared';
import { ApiBusinessUserEntity } from './business-user.entity';
import { ApiSubscriptionEntity } from './subscription.entity';
import { ApiWebsiteEntity } from './website.entity';
import { ApiMobileAppEntity } from './mobile-app.entity';

@Entity({ name: 'businesses' })
export class ApiBusinessEntity extends BaseEntityWithTimestamps {
    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    category!: string | null;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @Column({ type: 'text', nullable: true })
    logoUrl!: string | null;

    @Column({
        type: 'enum',
        enum: SubscriptionTier,
        enumName: 'SubscriptionTier',
        default: SubscriptionTier.FREE,
    })
    subscriptionTier!: SubscriptionTier;

    @Column({
        type: 'enum',
        enum: BusinessStatus,
        enumName: 'BusinessStatus',
        default: BusinessStatus.ACTIVE,
    })
    status!: BusinessStatus;

    @OneToMany(() => ApiBusinessUserEntity, (businessUser) => businessUser.business)
    users!: ApiBusinessUserEntity[];

    @OneToMany(() => ApiWebsiteEntity, (website) => website.business)
    websites!: ApiWebsiteEntity[];

    @OneToMany(() => ApiMobileAppEntity, (mobileApp) => mobileApp.business)
    mobileApps!: ApiMobileAppEntity[];

    @OneToMany(() => ApiSubscriptionEntity, (subscription) => subscription.business)
    subscriptions!: ApiSubscriptionEntity[];
}
