import { ApiBusinessEntity } from './business.entity';
import { ApiBusinessUserEntity } from './business-user.entity';
import { ApiSubscriptionEntity } from './subscription.entity';
import { ApiGoogleBusinessConnectionEntity } from './google-business-connection.entity';
import { ApiGoogleBusinessReviewEntity } from './google-business-review.entity';
import { ApiUserEntity } from './user.entity';
import { ApiWebsiteEntity } from './website.entity';
import { ApiMobileAppEntity } from './mobile-app.entity';
import { ApiSocialAccountEntity } from './social-account.entity';
import { ApiSocialPostEntity } from './social-post.entity';
import { ApiSocialPostMediaEntity } from './social-post-media.entity';
import { ApiAiGenerationEntity } from './ai-generation.entity';
import { ApiPublishingLogEntity } from './publishing-log.entity';
import { ApiMcpApiKeyEntity } from './mcp-api-key.entity';

export const API_ENTITIES = [
    ApiUserEntity,
    ApiBusinessEntity,
    ApiBusinessUserEntity,
    ApiWebsiteEntity,
    ApiMobileAppEntity,
    ApiSubscriptionEntity,
    ApiSocialAccountEntity,
    ApiSocialPostEntity,
    ApiSocialPostMediaEntity,
    ApiAiGenerationEntity,
    ApiPublishingLogEntity,
    ApiGoogleBusinessConnectionEntity,
    ApiGoogleBusinessReviewEntity,
    ApiMcpApiKeyEntity,
];

export * from './business.entity';
export * from './business-user.entity';
export * from './subscription.entity';
export * from './google-business-connection.entity';
export * from './google-business-review.entity';
export * from './user.entity';
export * from './website.entity';
export * from './mobile-app.entity';
export * from './social-account.entity';
export * from './social-post.entity';
export * from './social-post-media.entity';
export * from './ai-generation.entity';
export * from './publishing-log.entity';
export * from './mcp-api-key.entity';
