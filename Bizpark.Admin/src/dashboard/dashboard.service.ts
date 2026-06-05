import { Injectable } from '@nestjs/common';
import {
  adminDb,
  applicationDb,
  BusinessStatus,
  getEffectiveSubscriptionPlanStatus,
  normalizeSubscriptionPlanSettings,
  runnerDb,
  SUBSCRIPTION_PLAN_SETTINGS_NAME,
  SubscriptionPlanType,
  SubscriptionPlanVisibility,
  SubscriptionStatus,
  SubscriptionTier,
  TaskStatus,
  WebsiteStatus,
} from 'bizpark.core';

type BusinessRow = Awaited<ReturnType<typeof applicationDb.business.findForAdmin>>[number];
type WebsiteRow = Awaited<ReturnType<typeof applicationDb.website.findMany>>[number];
type SubscriptionRow = Awaited<ReturnType<typeof applicationDb.subscription.findMany>>[number];
type TaskRow = Awaited<ReturnType<typeof runnerDb.agentTask.findMany>>[number];

@Injectable()
export class DashboardService {
  async getCommandCenter() {
    const [businesses, websites, subscriptions, tasks, planSettingsRow] = await Promise.all([
      applicationDb.business.findForAdmin({ orderBy: { createdAt: 'desc' } }),
      applicationDb.website.findMany({ orderBy: { createdAt: 'desc' } }),
      applicationDb.subscription.findMany({ orderBy: { createdAt: 'desc' } }),
      runnerDb.agentTask.findMany({ orderBy: { createdAt: 'desc' } }),
      this.getSubscriptionPlanSettingsRow(),
    ]);

    const plans = normalizeSubscriptionPlanSettings(planSettingsRow?.cmsSchema).plans;
    const now = new Date();
    const todayStart = this.startOfDay(now);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);
    const monthStart = this.daysAgo(30);

    const completedToday = tasks.filter(
      (task) => task.status === TaskStatus.COMPLETED && this.isInRange(task.updatedAt, todayStart, tomorrowStart),
    );
    const failedToday = tasks.filter(
      (task) => task.status === TaskStatus.FAILED && this.isInRange(task.updatedAt, todayStart, tomorrowStart),
    );

    const activeBusinesses = businesses.filter((business) => business.status === BusinessStatus.ACTIVE);
    const totalWebsites = websites.length;
    const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === SubscriptionStatus.ACTIVE);

    const pendingWebsiteReviews = websites.filter((website) => website.status === WebsiteStatus.PENDING_APPROVAL);
    const failedTasks = tasks.filter((task) => task.status === TaskStatus.FAILED);
    const suspendedBusinesses = businesses.filter((business) => business.status === BusinessStatus.SUSPENDED);
    const expiringSubscriptions = subscriptions.filter((subscription) => {
      if (!subscription.expiresAt) return false;
      const expiresAt = subscription.expiresAt.getTime();
      return expiresAt >= now.getTime() && expiresAt <= this.daysFromNow(14).getTime();
    });
    const scheduledPromotions = plans.filter(
      (plan) =>
        plan.type !== SubscriptionPlanType.REGULAR &&
        getEffectiveSubscriptionPlanStatus(plan) === SubscriptionPlanVisibility.SCHEDULED,
    );

    return {
      hero: {
        attentionCount:
          pendingWebsiteReviews.length +
          failedTasks.length +
          suspendedBusinesses.length +
          expiringSubscriptions.length +
          scheduledPromotions.length,
      },
      kpis: [
        this.kpi('Total Businesses', businesses.length, 'building', businesses, monthStart),
        this.kpi('Active Businesses', activeBusinesses.length, 'pulse', activeBusinesses, monthStart),
        this.kpi('Total Websites', totalWebsites, 'window', websites, monthStart),
        this.kpi('Active Subscriptions', activeSubscriptions.length, 'card', activeSubscriptions, monthStart),
        this.kpi('Tasks Completed Today', completedToday.length, 'check', completedToday, todayStart, this.daysAgo(1)),
        this.kpi('Failed Tasks Today', failedToday.length, 'alert', failedToday, todayStart, this.daysAgo(1)),
      ],
      health: [
        this.healthCard('Pending Website Reviews', pendingWebsiteReviews.length, '/admin/websites', 'attention'),
        this.healthCard('Failed AI Tasks', failedTasks.length, '/admin/agent-tasks', failedTasks.length ? 'critical' : 'healthy'),
        this.healthCard('Suspended Businesses', suspendedBusinesses.length, '/admin/businesses', suspendedBusinesses.length ? 'critical' : 'healthy'),
        this.healthCard('Expiring Subscriptions', expiringSubscriptions.length, '/admin/subscriptions', expiringSubscriptions.length ? 'attention' : 'healthy'),
        this.healthCard('Scheduled Promotions', scheduledPromotions.length, '/admin/subscriptions', scheduledPromotions.length ? 'attention' : 'healthy'),
      ],
      activity: this.activityFeed(businesses, websites, subscriptions, tasks),
      quickActions: [
        { label: 'Add Business', href: '/admin/businesses' },
        { label: 'Create Website', href: '/admin/websites' },
        { label: 'Create Subscription Plan', href: '/admin/subscriptions' },
      ],
      subscriptions: {
        free: businesses.filter((business) => business.subscriptionTier === SubscriptionTier.FREE).length,
        pro: businesses.filter((business) => business.subscriptionTier === SubscriptionTier.PRO).length,
        agency: businesses.filter((business) => business.subscriptionTier === SubscriptionTier.AGENCY).length,
        promotional: activeSubscriptions.filter(
          (subscription) => !Object.values(SubscriptionTier).includes(subscription.tier as SubscriptionTier),
        ).length,
      },
    };
  }

  private kpi(label: string, value: number, icon: string, rows: Array<{ createdAt: Date }>, currentStart: Date, previousStart?: Date) {
    const previousPeriodStart = previousStart ?? new Date(currentStart.getTime() - (Date.now() - currentStart.getTime()));
    const currentCount = rows.filter((row) => row.createdAt >= currentStart).length;
    const previousCount = rows.filter((row) => row.createdAt >= previousPeriodStart && row.createdAt < currentStart).length;
    const change = previousCount === 0 ? (currentCount > 0 ? 100 : 0) : Math.round(((currentCount - previousCount) / previousCount) * 100);
    return {
      label,
      value,
      icon,
      change,
      trend: change >= 0 ? 'up' : 'down',
    };
  }

  private healthCard(label: string, value: number, href: string, state: 'healthy' | 'attention' | 'critical') {
    return { label, value, href, state };
  }

  private activityFeed(
    businesses: BusinessRow[],
    websites: WebsiteRow[],
    subscriptions: SubscriptionRow[],
    tasks: TaskRow[],
  ) {
    const businessNames = new Map(businesses.map((business) => [business.id, business.name]));
    const activities = [
      ...businesses.slice(0, 8).map((business) => ({
        icon: 'building',
        label: `Business "${business.name}" registered`,
        timestamp: business.createdAt,
        status: business.status,
        href: `/admin/businesses/${business.id}`,
      })),
      ...websites.slice(0, 8).map((website) => ({
        icon: 'window',
        label: `Website ${website.status === WebsiteStatus.PUBLISHED ? 'published' : 'updated'} for ${website.business?.name ?? businessNames.get(website.businessId) ?? 'a business'}`,
        timestamp: website.updatedAt ?? website.createdAt,
        status: website.status,
        href: `/admin/websites/${website.id}`,
      })),
      ...subscriptions.slice(0, 8).map((subscription) => ({
        icon: 'card',
        label: `Subscription ${subscription.status.toLowerCase()} for ${subscription.business?.name ?? businessNames.get(subscription.businessId) ?? 'a business'}`,
        timestamp: subscription.updatedAt ?? subscription.createdAt,
        status: subscription.tier,
        href: `/admin/businesses/${subscription.businessId}`,
      })),
      ...tasks.slice(0, 8).map((task) => ({
        icon: task.status === TaskStatus.FAILED ? 'alert' : 'spark',
        label: `AI task ${this.labelize(task.status)}: ${this.labelize(task.taskType)}`,
        timestamp: task.updatedAt ?? task.createdAt,
        status: task.status,
        href: `/admin/agent-tasks/${task.id}`,
      })),
    ];

    return activities.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime()).slice(0, 12);
  }

  private async getSubscriptionPlanSettingsRow() {
    const rows = await adminDb.template.findMany({
      where: { name: { in: [SUBSCRIPTION_PLAN_SETTINGS_NAME] } },
      orderBy: { createdAt: 'desc' },
    });
    return (rows[0] as { cmsSchema: unknown } | undefined) ?? null;
  }

  private isInRange(date: Date, start: Date, end: Date) {
    return date >= start && date < end;
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private daysAgo(days: number) {
    const date = this.startOfDay(new Date());
    date.setDate(date.getDate() - days);
    return date;
  }

  private daysFromNow(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private labelize(value: string) {
    return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}
