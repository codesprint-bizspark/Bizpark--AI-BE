import { ApiBusinessEntity } from './business.entity';
import { ApiBusinessUserEntity } from './business-user.entity';
import { ApiSubscriptionEntity } from './subscription.entity';
import { ApiUserEntity } from './user.entity';
import { ApiWebsiteEntity } from './website.entity';
import { ApiSocialAccountEntity } from './social-account.entity';
import { ApiSocialPostEntity } from './social-post.entity';
import { ApiSocialPostMediaEntity } from './social-post-media.entity';
import { ApiAiGenerationEntity } from './ai-generation.entity';
import { ApiPublishingLogEntity } from './publishing-log.entity';

export const API_ENTITIES = [
    ApiUserEntity,
    ApiBusinessEntity,
    ApiBusinessUserEntity,
    ApiWebsiteEntity,
    ApiSubscriptionEntity,
    ApiSocialAccountEntity,
    ApiSocialPostEntity,
    ApiSocialPostMediaEntity,
    ApiAiGenerationEntity,
    ApiPublishingLogEntity,
];

export * from './business.entity';
export * from './business-user.entity';
export * from './subscription.entity';
export * from './user.entity';
export * from './website.entity';
export * from './social-account.entity';
export * from './social-post.entity';
export * from './social-post-media.entity';
export * from './ai-generation.entity';
export * from './publishing-log.entity';
