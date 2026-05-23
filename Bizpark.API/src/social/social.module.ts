import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { SocialAccountsController } from './accounts/social-accounts.controller';
import { SocialAccountsService } from './accounts/social-accounts.service';
import { OpenAiService } from './ai/openai.service';
import { SocialContentController } from './content/social-content.controller';
import { SocialContentService } from './content/social-content.service';
import { FacebookClient } from './platforms/facebook.client';
import { InstagramClient } from './platforms/instagram.client';
import { TikTokClient } from './platforms/tiktok.client';
import { PlatformRegistry } from './platforms/platform-registry.service';
import { SocialPublishingController } from './publishing/social-publishing.controller';
import { SocialPublishingService, SOCIAL_PUBLISH_QUEUE } from './publishing/social-publishing.service';
import { SocialPublishingProcessor } from './publishing/social-publishing.processor';

@Module({
    imports: [
        AuthModule,
        BullModule.registerQueue({
            name: SOCIAL_PUBLISH_QUEUE,
            defaultJobOptions: {
                removeOnComplete: { count: 100, age: 60 * 60 * 24 * 7 },
                removeOnFail: { count: 200 },
            },
        }),
    ],
    controllers: [
        SocialAccountsController,
        SocialContentController,
        SocialPublishingController,
    ],
    providers: [
        FacebookClient,
        InstagramClient,
        TikTokClient,
        PlatformRegistry,
        OpenAiService,
        SocialAccountsService,
        SocialContentService,
        SocialPublishingService,
        SocialPublishingProcessor,
    ],
    exports: [SocialAccountsService, SocialContentService, SocialPublishingService],
})
export class SocialModule { }
