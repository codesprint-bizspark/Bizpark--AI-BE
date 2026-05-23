import { Injectable, NotFoundException } from '@nestjs/common';
import { SocialPlatform } from 'bizpark.core';
import { FacebookClient } from './facebook.client';
import { InstagramClient } from './instagram.client';
import { TikTokClient } from './tiktok.client';
import { PlatformClient } from './platform-client.types';

/**
 * Single point of indirection so adding LinkedIn / X / YouTube Shorts later means:
 *   1. Implement a new PlatformClient
 *   2. Add it to the constructor injection list
 *   3. Add a new SocialPlatform enum value + migration
 */
@Injectable()
export class PlatformRegistry {
    private readonly clients: Map<SocialPlatform, PlatformClient>;

    constructor(
        facebook: FacebookClient,
        instagram: InstagramClient,
        tiktok: TikTokClient,
    ) {
        this.clients = new Map<SocialPlatform, PlatformClient>([
            [SocialPlatform.FACEBOOK, facebook],
            [SocialPlatform.INSTAGRAM, instagram],
            [SocialPlatform.TIKTOK, tiktok],
        ]);
    }

    get(platform: SocialPlatform): PlatformClient {
        const client = this.clients.get(platform);
        if (!client) throw new NotFoundException(`Unsupported social platform: ${platform}`);
        return client;
    }

    list(): SocialPlatform[] {
        return Array.from(this.clients.keys());
    }
}
