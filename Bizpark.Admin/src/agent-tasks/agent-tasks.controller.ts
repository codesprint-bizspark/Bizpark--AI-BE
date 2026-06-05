import { Controller, Get, Param, Post, Redirect, Render, Req, UseGuards } from '@nestjs/common';
import { TaskStatus, TaskType } from 'bizpark.core';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import type { AdminRequest } from '../common/admin-request';
import { AgentTasksService } from './agent-tasks.service';

@Controller('admin/agent-tasks')
@UseGuards(AdminAuthGuard)
export class AgentTasksController {
  constructor(private readonly tasksService: AgentTasksService) {}

  @Get()
  @Render('agent-tasks/index')
  async index(@Req() request: AdminRequest) {
    const dashboard = await this.tasksService.dashboard();
    return {
      title: 'Agent Tasks',
      admin: request.adminUser,
      tasks: dashboard.tasks,
      metrics: dashboard.metrics,
      summaries: dashboard.summaries,
      statusOptions: [
        TaskStatus.COMPLETED,
        TaskStatus.FAILED,
        TaskStatus.PENDING_APPROVAL,
        TaskStatus.QUEUED,
        TaskStatus.PROCESSING,
      ],
      typeOptions: [
        TaskType.WEBSITE_GENERATION,
        TaskType.MOBILE_APP_GENERATION,
        TaskType.SOCIAL_MEDIA_CONTENT,
      ],
    };
  }

  @Get(':id')
  @Render('agent-tasks/detail')
  async detail(@Param('id') id: string, @Req() request: AdminRequest) {
    return {
      title: 'Agent Task Detail',
      admin: request.adminUser,
      task: await this.tasksService.detail(id),
    };
  }

  @Post(':id/approve')
  @Redirect()
  async approve(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.tasksService.approve(id, request.adminUser?.id);
    return { url: `/admin/agent-tasks/${id}` };
  }

  @Post(':id/reject')
  @Redirect()
  async reject(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.tasksService.reject(id, request.adminUser?.id);
    return { url: `/admin/agent-tasks/${id}` };
  }

  @Post(':id/retry')
  @Redirect()
  async retry(@Param('id') id: string, @Req() request: AdminRequest) {
    const retryTaskId = await this.tasksService.retry(id, request.adminUser?.id);
    return { url: `/admin/agent-tasks/${retryTaskId}` };
  }
}
