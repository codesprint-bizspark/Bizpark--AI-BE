import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { applicationDb, runnerDb, TaskStatus, TaskType, WebsiteStatus } from 'bizpark.core';
import { AuditService } from '../common/audit.service';

type AgentTaskRow = Awaited<ReturnType<typeof runnerDb.agentTask.findMany>>[number];

type EnrichedAgentTask = AgentTaskRow & {
  businessName: string;
  taskLabel: string;
  statusLabel: string;
  taskTypeLabel: string;
};

type TaskSummaryPoint = {
  label: string;
  count: number;
};

@Injectable()
export class AgentTasksService {
  constructor(
    @InjectQueue('agent-queue') private readonly agentQueue: Queue,
    private readonly audit: AuditService,
  ) {}

  async dashboard() {
    const tasks = await this.enrichedTasks();
    const now = new Date();
    const todayStart = this.startOfDay(now);
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - 6);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    return {
      tasks,
      metrics: {
        totalToday: tasks.filter((task) => task.createdAt >= todayStart).length,
        totalWeek: tasks.filter((task) => task.createdAt >= weekStart).length,
        totalMonth: tasks.filter((task) => task.createdAt >= monthStart).length,
        completed: tasks.filter((task) => task.status === TaskStatus.COMPLETED).length,
        failed: tasks.filter((task) => task.status === TaskStatus.FAILED).length,
      },
      summaries: {
        perDay: this.groupByDay(tasks, 7),
        perWeek: this.groupByWeek(tasks, 6),
        perMonth: this.groupByMonth(tasks, 6),
      },
    };
  }

  async detail(id: string) {
    const task = await runnerDb.agentTask.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    const business = await applicationDb.business.findUnique({ where: { id: task.businessId } });
    return this.enrichTask(task, new Map([[task.businessId, business?.name ?? task.businessId]]));
  }

  async approve(id: string, adminId?: string) {
    const task = await this.detail(id);
    const output = task.outputData as Record<string, unknown> | null;
    const content = (output?.generatedContent ?? output?.approvedContent ?? {}) as Record<string, unknown>;
    if (!Object.keys(content).length) {
      throw new NotFoundException('Task has no generated content to approve');
    }

    await this.syncCommerce(task.businessId, { ...content, isPublished: true });
    const updatedTask = await runnerDb.agentTask.update({
      where: { id },
      data: { status: TaskStatus.COMPLETED, outputData: { approvedContent: content } },
    });
    const website = await applicationDb.website.findFirstByBusinessId({ businessId: task.businessId });
    if (website) {
      await applicationDb.website.update({
        where: { id: website.id },
        data: {
          cmsData: content,
          status: WebsiteStatus.PUBLISHED,
          publishedAt: new Date(),
          suspendedAt: null,
        },
      });
    }
    await this.audit.record({
      adminId,
      action: 'agent-task.approve',
      targetType: 'agent-task',
      targetId: id,
      beforeData: { status: task.status },
      afterData: { status: updatedTask.status },
    });
    return updatedTask;
  }

  async reject(id: string, adminId?: string) {
    const task = await this.detail(id);
    const updatedTask = await runnerDb.agentTask.update({
      where: { id },
      data: { status: TaskStatus.FAILED, outputData: { reason: 'Rejected by admin' } },
    });
    const website = await applicationDb.website.findFirstByBusinessId({ businessId: task.businessId });
    if (website) {
      await applicationDb.website.update({
        where: { id: website.id },
        data: { status: WebsiteStatus.FAILED },
      });
    }
    await this.audit.record({
      adminId,
      action: 'agent-task.reject',
      targetType: 'agent-task',
      targetId: id,
      beforeData: { status: task.status },
      afterData: { status: updatedTask.status },
    });
    return updatedTask;
  }

  async retry(id: string, adminId?: string) {
    const task = await this.detail(id);
    const taskId = randomUUID();
    await runnerDb.agentTask.create({
      data: {
        id: taskId,
        businessId: task.businessId,
        taskType: task.taskType,
        status: TaskStatus.QUEUED,
        inputData: task.inputData,
      },
    });
    await this.agentQueue.add('agent-job', {
      taskId,
      businessId: task.businessId,
      taskType: task.taskType,
      inputData: task.inputData,
    });
    const website = await applicationDb.website.findFirstByBusinessId({ businessId: task.businessId });
    if (website && task.taskType === TaskType.WEBSITE_GENERATION) {
      await applicationDb.website.update({
        where: { id: website.id },
        data: { status: WebsiteStatus.GENERATING },
      });
    }
    await this.audit.record({
      adminId,
      action: 'agent-task.retry',
      targetType: 'agent-task',
      targetId: id,
      afterData: { retryTaskId: taskId },
    });
    return taskId;
  }

  private async syncCommerce(businessId: string, payload: Record<string, unknown>) {
    const commerceUrl = process.env.COMMERCE_URL || 'http://localhost:3003';
    const internalKey = process.env.INTERNAL_API_KEY || '';
    try {
      await fetch(`${commerceUrl}/api/commerce/website-config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': businessId,
          'x-internal-key': internalKey,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Keep admin action successful if Commerce is offline in local development.
    }
  }

  private async enrichedTasks(): Promise<EnrichedAgentTask[]> {
    const [tasks, businesses] = await Promise.all([
      runnerDb.agentTask.findMany({ orderBy: { createdAt: 'desc' } }),
      applicationDb.business.findForAdmin({ orderBy: { createdAt: 'desc' } }),
    ]);
    const businessNames = new Map(businesses.map((business) => [business.id, business.name]));
    return tasks.map((task) => this.enrichTask(task, businessNames));
  }

  private enrichTask(task: AgentTaskRow, businessNames: Map<string, string>): EnrichedAgentTask {
    return {
      ...task,
      businessName: businessNames.get(task.businessId) ?? task.businessId,
      taskLabel: this.taskLabel(task.taskType),
      taskTypeLabel: this.taskLabel(task.taskType),
      statusLabel: this.statusLabel(task.status),
    };
  }

  private taskLabel(type: TaskType | string) {
    const labels: Record<string, string> = {
      [TaskType.WEBSITE_GENERATION]: 'Website Generation',
      [TaskType.MOBILE_APP_GENERATION]: 'Mobile App Generation',
      [TaskType.SOCIAL_MEDIA_CONTENT]: 'Social Media Content',
      [TaskType.BLOG_POST_WRITING]: 'Blog Post Writing',
      [TaskType.GOOGLE_REVIEW_REPLY]: 'Google Review Reply',
      [TaskType.SOCIAL_POST_PUBLISH]: 'Social Post Publish',
    };
    return labels[type] ?? String(type).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private statusLabel(status: TaskStatus | string) {
    return String(status).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private groupByDay(tasks: EnrichedAgentTask[], days: number): TaskSummaryPoint[] {
    const today = this.startOfDay(new Date());
    return Array.from({ length: days }).map((_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (days - 1 - index));
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      return {
        label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: tasks.filter((task) => task.createdAt >= day && task.createdAt < next).length,
      };
    });
  }

  private groupByWeek(tasks: EnrichedAgentTask[], weeks: number): TaskSummaryPoint[] {
    const today = this.startOfDay(new Date());
    return Array.from({ length: weeks }).map((_, index) => {
      const start = new Date(today);
      start.setDate(today.getDate() - (weeks - 1 - index) * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return {
        label: `Week ${index + 1}`,
        count: tasks.filter((task) => task.createdAt >= start && task.createdAt < end).length,
      };
    });
  }

  private groupByMonth(tasks: EnrichedAgentTask[], months: number): TaskSummaryPoint[] {
    const now = new Date();
    return Array.from({ length: months }).map((_, index) => {
      const start = new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return {
        label: start.toLocaleDateString('en-US', { month: 'short' }),
        count: tasks.filter((task) => task.createdAt >= start && task.createdAt < end).length,
      };
    });
  }
}
