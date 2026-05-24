import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentService } from '../agent/agent.service';
import { applicationDb, runnerDb, TaskType } from 'bizpark.core';
import {
  createGoogleBusinessProvider,
  GoogleBusinessProvider,
  GoogleBusinessReview,
} from './google-business.provider';

type CurrentUser = { id: string; email: string; name: string };

const toDate = (value?: string | null) => value ? new Date(value) : null;
const REVIEW_REPLY_LIMIT = 4096;

@Injectable()
export class GoogleBusinessService {
  private readonly provider: GoogleBusinessProvider = createGoogleBusinessProvider();

  constructor(private readonly agentService: AgentService) {}

  async getStatus(businessId: string, user: CurrentUser) {
    await this.assertBusinessAccess(businessId, user.id);
    const connection = await applicationDb.googleBusinessConnection.findFirst({ where: { businessId } });
    return {
      connected: Boolean(connection),
      provider: this.provider.provider,
      connection,
    };
  }

  async connectMock(businessId: string, user: CurrentUser) {
    await this.assertBusinessAccess(businessId, user.id);
    if (this.provider.provider !== 'mock') {
      throw new BadRequestException('Mock connect is only available when GOOGLE_BUSINESS_PROVIDER=mock.');
    }

    const connection = await applicationDb.googleBusinessConnection.upsertByBusinessId({
      businessId,
      create: {
        provider: 'mock',
        googleAccountName: 'accounts/mock-account',
        scopes: ['https://www.googleapis.com/auth/business.manage'],
        status: 'CONNECTED',
      },
      update: {
        provider: 'mock',
        googleAccountName: 'accounts/mock-account',
        scopes: ['https://www.googleapis.com/auth/business.manage'],
        status: 'CONNECTED',
      },
    });

    return { success: true, data: connection };
  }

  async listLocations(businessId: string, user: CurrentUser) {
    await this.assertBusinessAccess(businessId, user.id);
    return { success: true, data: await this.provider.listLocations(businessId) };
  }

  async selectLocation(businessId: string, locationName: string, user: CurrentUser) {
    await this.assertBusinessAccess(businessId, user.id);
    const locations = await this.provider.listLocations(businessId);
    const selected = locations.find((location) => location.name === locationName);
    if (!selected) throw new NotFoundException('Google Business location not found');
    if (!selected.verified) throw new BadRequestException('Only verified Google Business locations can receive review replies.');

    const connection = await applicationDb.googleBusinessConnection.upsertByBusinessId({
      businessId,
      create: {
        provider: this.provider.provider,
        googleAccountName: selected.name.split('/locations/')[0],
        locationName: selected.name,
        locationTitle: selected.title,
        address: selected.address,
        scopes: ['https://www.googleapis.com/auth/business.manage'],
        status: 'CONNECTED',
      },
      update: {
        provider: this.provider.provider,
        googleAccountName: selected.name.split('/locations/')[0],
        locationName: selected.name,
        locationTitle: selected.title,
        address: selected.address,
        status: 'CONNECTED',
      },
    });

    return { success: true, data: connection };
  }

  async syncReviews(businessId: string, user: CurrentUser) {
    const business = await this.assertBusinessAccess(businessId, user.id);
    const connection = await this.requireConnection(businessId);
    if (!connection.locationName) throw new BadRequestException('Select a Google Business location before syncing reviews.');

    await this.reconcileReviewTasks(businessId);

    const providerReviews = await this.provider.listReviews(connection.locationName);
    const records = [];

    for (const review of providerReviews) {
      const existing = await applicationDb.googleBusinessReview.findUnique({ where: { reviewName: review.name } });
      const mapped = this.mapReview(businessId, connection.locationName, review);

      const saved = await applicationDb.googleBusinessReview.upsertByReviewName({
        reviewName: review.name,
        create: mapped,
        update: {
          ...mapped,
          status: existing?.status && existing.status !== 'SYNCED' ? existing.status : mapped.status,
          aiReply: existing?.aiReply ?? null,
          agentTaskId: existing?.agentTaskId ?? null,
          failureReason: existing?.failureReason ?? null,
          repliedAt: existing?.repliedAt ?? null,
        },
      });

      if (!saved.googleReply && !saved.agentTaskId && saved.status === 'SYNCED') {
        const task = await this.agentService.queueTask({
          businessId,
          taskType: TaskType.GOOGLE_REVIEW_REPLY,
          inputData: {
            business: {
              id: business.id,
              name: business.name,
              category: business.category,
              description: business.description,
            },
            review: {
              id: saved.id,
              reviewName: saved.reviewName,
              reviewerDisplayName: saved.reviewerDisplayName,
              reviewerIsAnonymous: saved.reviewerIsAnonymous,
              rating: saved.rating,
              comment: saved.comment,
            },
            policy: { autoReplyMinRating: 4 },
          },
        });
        records.push(await applicationDb.googleBusinessReview.update({
          where: { id: saved.id },
          data: { status: 'AI_PENDING', agentTaskId: task.taskId, failureReason: null },
        }));
      } else {
        records.push(saved);
      }
    }

    await applicationDb.googleBusinessConnection.upsertByBusinessId({
      businessId,
      create: { businessId, lastSyncedAt: new Date(), provider: this.provider.provider },
      update: { lastSyncedAt: new Date() },
    });

    return { success: true, data: records };
  }

  async listReviews(businessId: string, user: CurrentUser) {
    await this.assertBusinessAccess(businessId, user.id);
    await this.reconcileReviewTasks(businessId);
    const reviews = await applicationDb.googleBusinessReview.findMany({
      where: { businessId },
      orderBy: { reviewCreateTime: 'desc' },
    });
    return { success: true, data: reviews };
  }

  async approveReply(reviewId: string, replyText: string | undefined, user: CurrentUser) {
    const review = await applicationDb.googleBusinessReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    await this.assertBusinessAccess(review.businessId, user.id);

    const finalReply = (replyText || review.aiReply || '').trim();
    if (!finalReply) throw new BadRequestException('Reply text is required');
    if (Buffer.byteLength(finalReply, 'utf8') > REVIEW_REPLY_LIMIT) {
      throw new BadRequestException('Reply is too long for Google Business Profile.');
    }

    const posted = await this.provider.replyToReview(review.reviewName, finalReply);
    const updated = await applicationDb.googleBusinessReview.update({
      where: { id: review.id },
      data: {
        aiReply: finalReply,
        googleReply: posted.comment,
        status: 'REPLIED',
        failureReason: null,
        repliedAt: new Date(posted.updateTime),
      },
    });

    return { success: true, data: updated };
  }

  private async reconcileReviewTasks(businessId: string) {
    const pending = await applicationDb.googleBusinessReview.findMany({
      where: { businessId, status: 'AI_PENDING' },
      orderBy: { createdAt: 'asc' },
    });

    for (const review of pending) {
      if (!review.agentTaskId) continue;
      const task = await runnerDb.agentTask.findUnique({ where: { id: review.agentTaskId } });
      if (!task) continue;

      if (task.status === 'FAILED') {
        await applicationDb.googleBusinessReview.update({
          where: { id: review.id },
          data: { status: 'FAILED', failureReason: String((task.outputData as any)?.error || 'AI reply generation failed') },
        });
        continue;
      }

      if (task.status !== 'COMPLETED') continue;

      const output = task.outputData as { replyText?: string; error?: string } | null;
      const replyText = output?.replyText?.trim();
      if (!replyText) {
        await applicationDb.googleBusinessReview.update({
          where: { id: review.id },
          data: { status: 'FAILED', failureReason: output?.error || 'AI did not return a reply' },
        });
        continue;
      }

      if (review.rating >= 4) {
        const posted = await this.provider.replyToReview(review.reviewName, replyText);
        await applicationDb.googleBusinessReview.update({
          where: { id: review.id },
          data: {
            aiReply: replyText,
            googleReply: posted.comment,
            status: 'REPLIED',
            failureReason: null,
            repliedAt: new Date(posted.updateTime),
          },
        });
      } else {
        await applicationDb.googleBusinessReview.update({
          where: { id: review.id },
          data: { aiReply: replyText, status: 'PENDING_APPROVAL', failureReason: null },
        });
      }
    }
  }

  private mapReview(businessId: string, locationName: string, review: GoogleBusinessReview) {
    return {
      businessId,
      locationName,
      reviewName: review.name,
      reviewId: review.reviewId,
      reviewerDisplayName: review.reviewerDisplayName,
      reviewerIsAnonymous: review.reviewerIsAnonymous,
      rating: review.rating,
      comment: review.comment,
      reviewCreateTime: toDate(review.createTime),
      reviewUpdateTime: toDate(review.updateTime),
      googleReply: review.reviewReply?.comment ?? null,
      status: review.reviewReply?.comment ? 'REPLIED' : 'SYNCED',
    } as const;
  }

  private async requireConnection(businessId: string) {
    const connection = await applicationDb.googleBusinessConnection.findFirst({ where: { businessId } });
    if (!connection) throw new BadRequestException('Connect Google Business Profile before syncing reviews.');
    return connection;
  }

  private async assertBusinessAccess(businessId: string, userId: string) {
    const businesses = await applicationDb.business.findMany({
      where: { users: { some: { userId } } },
    });
    const business = businesses.find((item) => item.id === businessId);
    if (!business) throw new ForbiddenException('You do not have access to this business');
    return business;
  }
}
