import { InjectQueue } from '@nestjs/bullmq';
import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import {
    applicationDb,
    PublishNowDto,
    SchedulePostDto,
    SocialPostStatus,
} from 'bizpark.core';

export const SOCIAL_PUBLISH_QUEUE = 'social-publish';

export type SocialPublishJob = { postId: string; attempt: number };

/**
 * Classify a BullMQ/ioredis failure so the caller gets a meaningful HTTP
 * response instead of an opaque 500. Connection-class errors usually mean
 * Redis is down or REDIS_HOST/REDIS_PORT is wrong.
 */
function isRedisConnectionError(e: unknown): boolean {
    if (!e || typeof e !== 'object') return false;
    const err = e as { code?: string; message?: string; name?: string };
    if (err.code && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNRESET'].includes(err.code)) return true;
    const msg = (err.message || '').toLowerCase();
    return msg.includes('econnrefused')
        || msg.includes('redis')
        || msg.includes('connection is closed')
        || msg.includes('stream isn')
        || err.name === 'MaxRetriesPerRequestError';
}

@Injectable()
export class SocialPublishingService {
    private readonly logger = new Logger(SocialPublishingService.name);

    constructor(@InjectQueue(SOCIAL_PUBLISH_QUEUE) private readonly queue: Queue<SocialPublishJob>) { }

    /**
     * Wrap queue.add() so a dead Redis surfaces as 503 + actionable message
     * instead of a generic 500 "Internal server error".
     */
    private async enqueue(jobName: string, data: SocialPublishJob, opts: Parameters<Queue['add']>[2]) {
        try {
            await this.queue.add(jobName, data, opts);
        } catch (e) {
            if (isRedisConnectionError(e)) {
                this.logger.error(`[queue] Redis unreachable when adding job: ${(e as Error).message}`);
                throw new ServiceUnavailableException(
                    'Scheduling is temporarily unavailable — the publishing queue (Redis) is unreachable. '
                    + 'Start Redis on REDIS_HOST/REDIS_PORT (default localhost:6379), or set REDIS_URL, then retry.',
                );
            }
            throw e;
        }
    }

    async publishNow(args: { businessId: string; postId: string; dto: PublishNowDto }) {
        const post = await applicationDb.socialPost.findUnique({ where: { id: args.postId }, include: { media: true } });
        if (!post) throw new NotFoundException('Post not found');
        if (post.businessId !== args.businessId) throw new ForbiddenException('Forbidden');
        if (post.status === SocialPostStatus.PUBLISHED) throw new BadRequestException('Already published');
        if (post.status === SocialPostStatus.PUBLISHING) throw new BadRequestException('Already publishing');

        const accountId = args.dto?.accountId ?? post.accountId;
        if (!accountId) {
            throw new BadRequestException('No account selected for this post — connect or pick an account first');
        }
        if (accountId !== post.accountId) {
            await applicationDb.socialPost.update({ where: { id: post.id }, data: { accountId } });
        }

        // Enqueue FIRST so we don't leave the post in PUBLISHING state if Redis
        // is down. The enqueue throws 503 if Redis can't be reached.
        try {
            await this.enqueue(
                'publish',
                { postId: post.id, attempt: 0 },
                {
                    attempts: 4,
                    backoff: { type: 'exponential', delay: 5000 },
                    removeOnComplete: { count: 100, age: 60 * 60 * 24 * 7 },
                    removeOnFail: { count: 100 },
                },
            );
        } catch (e) {
            // Rollback the PUBLISHING marker on enqueue failure isn't needed here
            // because we move the marker AFTER enqueue succeeds (next line).
            throw e;
        }

        await applicationDb.socialPost.update({
            where: { id: post.id },
            data: { status: SocialPostStatus.PUBLISHING, lastError: null, scheduledAt: null },
        });

        return { queued: true, postId: post.id };
    }

    async schedule(args: { businessId: string; postId: string; dto: SchedulePostDto }) {
        const post = await applicationDb.socialPost.findUnique({ where: { id: args.postId } });
        if (!post) throw new NotFoundException('Post not found');
        if (post.businessId !== args.businessId) throw new ForbiddenException('Forbidden');
        if (post.status === SocialPostStatus.PUBLISHED) throw new BadRequestException('Already published');
        if (!post.accountId) throw new BadRequestException('Pick a social account before scheduling');

        const when = new Date(args.dto.scheduledAt);
        if (Number.isNaN(when.getTime())) throw new BadRequestException('Invalid scheduledAt');
        if (when.getTime() < Date.now() + 30_000) {
            throw new BadRequestException('scheduledAt must be at least 30 seconds in the future');
        }

        const delay = when.getTime() - Date.now();
        // Enqueue BEFORE marking SCHEDULED so we never leave the DB in a state
        // where the row says SCHEDULED but no job exists.
        await this.enqueue(
            'publish',
            { postId: post.id, attempt: 0 },
            {
                delay,
                attempts: 4,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { count: 100, age: 60 * 60 * 24 * 7 },
                removeOnFail: { count: 100 },
                jobId: `scheduled:${post.id}`,
            },
        );

        return applicationDb.socialPost.update({
            where: { id: post.id },
            data: { status: SocialPostStatus.SCHEDULED, scheduledAt: when, lastError: null },
        });
    }

    async cancelScheduled(args: { businessId: string; postId: string }) {
        const post = await applicationDb.socialPost.findUnique({ where: { id: args.postId } });
        if (!post) throw new NotFoundException('Post not found');
        if (post.businessId !== args.businessId) throw new ForbiddenException('Forbidden');
        if (post.status !== SocialPostStatus.SCHEDULED) {
            throw new BadRequestException('Only SCHEDULED posts can be cancelled');
        }

        try {
            const job = await this.queue.getJob(`scheduled:${post.id}`);
            if (job) await job.remove();
        } catch (e) {
            this.logger.warn(`Failed to remove scheduled job for post ${post.id}: ${(e as Error).message}`);
        }

        return applicationDb.socialPost.update({
            where: { id: post.id },
            data: { status: SocialPostStatus.DRAFT, scheduledAt: null },
        });
    }

    async listScheduled(businessId: string) {
        return applicationDb.socialPost.findMany({
            where: { businessId, status: SocialPostStatus.SCHEDULED },
            orderBy: { scheduledAt: 'asc' },
        });
    }

    async listHistory(args: { businessId: string; take?: number }) {
        return applicationDb.socialPost.findMany({
            where: { businessId: args.businessId, status: SocialPostStatus.PUBLISHED },
            orderBy: { createdAt: 'desc' },
            take: args.take ?? 50,
        });
    }

    async listPublishingLogs(args: { businessId: string; postId: string }) {
        const post = await applicationDb.socialPost.findUnique({ where: { id: args.postId } });
        if (!post || post.businessId !== args.businessId) throw new NotFoundException('Post not found');
        return applicationDb.publishingLog.findManyByPost({ postId: post.id });
    }
}
