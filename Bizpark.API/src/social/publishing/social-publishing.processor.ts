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
 *
 * Per-job lifecycle:
 *   1. Mark post as PUBLISHING (the API service does this for `publish-now`;
 *      we do it here for scheduled posts that were already SCHEDULED).
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

        // Ensure post is marked publishing (e.g. scheduled path).
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
                    response: result.raw,
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
            // Platform clients flag permission / token / 4xx errors as
            // nonRetryable. Honor that so we don't burn the remaining 3 retries
            // hitting Meta with a request we KNOW will keep failing.
            const willRetry = !err.nonRetryable && (job.attemptsMade ?? 0) + 1 < (job.opts.attempts ?? 1);

            await applicationDb.publishingLog.update({
                where: { id: log.id },
                data: {
                    status: willRetry ? PublishingLogStatus.RETRYING : PublishingLogStatus.FAILED,
                    errorMessage: err.message,
                    errorCode: err.metaCode !== undefined ? String(err.metaCode) : null,
                    finishedAt: new Date(),
                },
            });

            // If the failure is auth-related, mark the account so the UI surfaces a "reconnect" prompt.
            if (/token|auth|expired|permission/i.test(err.message)) {
                if (post.accountId) {
                    await applicationDb.socialAccount.update({
                        where: { id: post.accountId },
                        data: { status: SocialAccountStatus.EXPIRED },
                    });
                }
            }

            this.logger.error(`[publish fail] post ${postId} (attempt ${attempt}, retry=${willRetry}): ${err.message}`);

            // UnrecoverableError tells BullMQ to skip remaining attempts and go
            // straight to the failed state — exactly what we want for permission
            // and 4xx errors.
            if (err.nonRetryable) {
                throw new UnrecoverableError(err.message);
            }
            throw err;
        }
    }

    @OnWorkerEvent('failed')
    async onFailed(job: Job<SocialPublishJob>, error: Error) {
        if (!job) return;
        const isFinal = (job.attemptsMade ?? 0) >= (job.opts.attempts ?? 1);
        if (!isFinal) return;
        // Final failure — mark the post FAILED and stash the last error.
        try {
            await applicationDb.socialPost.update({
                where: { id: job.data.postId },
                data: {
                    status: SocialPostStatus.FAILED,
                    lastError: error.message,
                    retryCount: job.attemptsMade ?? 0,
                },
            });
        } catch (e) {
            this.logger.error(`Failed to mark post ${job.data.postId} as FAILED: ${(e as Error).message}`);
        }
    }
}
