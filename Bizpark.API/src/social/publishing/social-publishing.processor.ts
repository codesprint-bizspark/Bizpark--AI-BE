import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import {
    applicationDb,
    PublishingLogStatus,
    SocialAccountStatus,
    SocialPostStatus,
} from 'bizpark.core';
import { SocialAccountsService } from '../accounts/social-accounts.service';
import { PlatformRegistry } from '../platforms/platform-registry.service';
import { SOCIAL_PUBLISH_QUEUE, SocialPublishJob } from './social-publishing.service';

/**
 * BullMQ worker for social publishing.
 * Uses Node.js fetch() via the platform clients — runs entirely in NestJS,
 * no Python Runner involvement.
 *
 * Per-job lifecycle:
 *   1. Mark post as PUBLISHING.
 *   2. Open a PublishingLog row in PENDING.
 *   3. Resolve account + decrypted access token (refreshing if needed).
 *   4. Fetch media list and pass through to the platform client.
 *   5. On success: update post → PUBLISHED + log → SUCCESS.
 *   6. On failure: throw — BullMQ retry policy decides whether we retry.
 *      Final failure (after retries exhausted) is captured by `onFailed`.
 */
@Processor(SOCIAL_PUBLISH_QUEUE)
export class SocialPublishingProcessor extends WorkerHost {
    private readonly logger = new Logger(SocialPublishingProcessor.name);

    constructor(
        private readonly accountsService: SocialAccountsService,
        private readonly platforms: PlatformRegistry,
    ) {
        super();
    }

    async process(job: Job<SocialPublishJob>): Promise<unknown> {
        const { postId } = job.data;
        const attempt = (job.attemptsMade ?? 0) + 1;
        this.logger.log(`[publish] post ${postId} (attempt ${attempt})`);

        const post = await applicationDb.socialPost.findUnique({ where: { id: postId }, include: { media: true } });
        if (!post || post.deletedAt) {
            this.logger.warn(`Post ${postId} not found or deleted — skipping job`);
            return { skipped: true };
        }
        if (post.status === SocialPostStatus.PUBLISHED) {
            this.logger.warn(`Post ${postId} already published — skipping job`);
            return { skipped: true };
        }

        if (post.status !== SocialPostStatus.PUBLISHING) {
            await applicationDb.socialPost.update({
                where: { id: post.id },
                data: { status: SocialPostStatus.PUBLISHING, lastError: null },
            });
        }

        const log = await applicationDb.publishingLog.create({
            data: {
                postId: post.id,
                platform: post.platform,
                status: PublishingLogStatus.PENDING,
                attempt,
                startedAt: new Date(),
            },
        });

        try {
            const { account, accessToken } = await this.accountsService.getAccountForPublishing({
                businessId: post.businessId,
                accountId: post.accountId,
                platform: post.platform,
            });

            const client = this.platforms.get(post.platform);
            const media = await applicationDb.socialPostMedia.findManyByPost({ postId: post.id });

            const result = await client.publish({
                accessToken,
                externalPageId: account.externalPageId,
                externalAccountId: account.externalAccountId,
                caption: post.caption ?? '',
                hashtags: post.hashtags ?? [],
                cta: post.cta,
                media: media.map((m) => ({ kind: m.kind, url: m.url, mimeType: m.mimeType })),
                aiMetadata: post.aiMetadata,
            });

            await applicationDb.publishingLog.update({
                where: { id: log.id },
                data: {
                    status: PublishingLogStatus.SUCCESS,
                    externalPostId: result.externalPostId,
                    externalPostUrl: result.externalPostUrl ?? null,
                    response: result.raw as Record<string, unknown>,
                    finishedAt: new Date(),
                },
            });

            await applicationDb.socialPost.update({
                where: { id: post.id },
                data: {
                    status: SocialPostStatus.PUBLISHED,
                    publishedAt: new Date(),
                    externalPostId: result.externalPostId,
                    externalPostUrl: result.externalPostUrl ?? null,
                    lastError: null,
                },
            });

            this.logger.log(`[publish ok] post ${postId} → ${result.externalPostId}`);
            return result;
        } catch (e) {
            const err = e as Error & { nonRetryable?: boolean; metaCode?: number };
            // Log full error including fetch cause (e.g. ECONNRESET, ENOTFOUND)
            const cause = (err as any).cause;
            const detail = cause ? ` [cause: ${cause.code ?? cause.message ?? cause}]` : '';
            const willRetry = !err.nonRetryable && (job.attemptsMade ?? 0) + 1 < (job.opts?.attempts ?? 1);

            this.logger.error(`[publish fail] post ${postId} (attempt ${attempt}, retry=${willRetry}): ${err.message}${detail}`);

            await applicationDb.publishingLog.update({
                where: { id: log.id },
                data: {
                    status: willRetry ? PublishingLogStatus.RETRYING : PublishingLogStatus.FAILED,
                    errorMessage: err.message + detail,
                    errorCode: err.metaCode !== undefined ? String(err.metaCode) : null,
                    finishedAt: new Date(),
                },
            });

            if (/token|auth|expired|permission/i.test(err.message)) {
                if (post.accountId) {
                    await applicationDb.socialAccount.update({
                        where: { id: post.accountId },
                        data: { status: SocialAccountStatus.EXPIRED },
                    });
                }
            }

            if (err.nonRetryable) {
                throw new UnrecoverableError(err.message);
            }
            throw err;
        }
    }

    @OnWorkerEvent('failed')
    async onFailed(job: Job<SocialPublishJob>, error: Error) {
        if (!job) return;
        const isFinal = (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 1);
        if (!isFinal) return;
        try {
            await applicationDb.socialPost.update({
                where: { id: job.data.postId },
                data: {
                    status: SocialPostStatus.FAILED,
                    lastError: error.message,
                },
            });
        } catch (e) {
            this.logger.error(`Failed to mark post ${job.data.postId} as FAILED: ${(e as Error).message}`);
        }
    }
}
