import { Controller, Post, Body, Get, Param, BadRequestException, NotFoundException, UseGuards } from '@nestjs/common';
import { AgentService } from './agent.service';
import { applicationDb, runnerDb, CreateAgentTaskDto, WebsiteStatus, MobileAppStatus } from 'bizpark.core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('api/agents')
export class AgentController {
    constructor(private readonly agentService: AgentService) { }

    @Post('tasks')
    async queueTask(@Body() body: CreateAgentTaskDto) {
        return this.agentService.queueTask(body);
    }

    @Get('tasks/:taskId')
    async getTaskStatus(@Param('taskId') taskId: string): Promise<any> {
        const task = await runnerDb.agentTask.findUnique({ where: { id: taskId } });
        return { success: true, data: task };
    }

    @Get('tasks')
    @UseGuards(JwtAuthGuard)
    async getAllTasks(): Promise<any> {
        return runnerDb.agentTask.findMany({ orderBy: { createdAt: 'desc' } });
    }

    @Post('tasks/:taskId/approve')
    @UseGuards(JwtAuthGuard)
    async approveTask(
        @Param('taskId') taskId: string,
        @Body() body: { content: Record<string, any> },
        @CurrentUser() currentUser: { id: string; email: string; name: string },
    ): Promise<any> {
        const task = await runnerDb.agentTask.findUnique({ where: { id: taskId } });
        if (!task) throw new NotFoundException('Task not found');

        // Use explicitly provided content, or fall back to what the AI generated
        const taskOutput = task.outputData as Record<string, any> | null;
        const content = body.content ?? taskOutput?.generatedContent;
        if (!content) throw new BadRequestException('No content to publish — task has no generated output');

        const commerceUrl = process.env.COMMERCE_URL || 'http://localhost:3003';
        const internalKey = process.env.INTERNAL_API_KEY || '';

        // Mark completed immediately — syncing is non-blocking
        await runnerDb.agentTask.update({
            where: { id: taskId },
            data: { status: 'COMPLETED', outputData: { approvedContent: content } },
        });

        if (task.taskType === 'MOBILE_APP_GENERATION') {
            // ── Mobile App approval path ──────────────────────────────────────
            const mobileApp = await applicationDb.mobileApp.findFirstByBusinessId({ businessId: task.businessId });
            if (mobileApp) {
                await applicationDb.mobileApp.update({
                    where: { id: mobileApp.id },
                    data: {
                        status: MobileAppStatus.PUBLISHED,
                        cmsData: content,
                        publishedAt: new Date(),
                        suspendedAt: null,
                    },
                });
            }

            // Push to Commerce so Bizpark.Mobile template can fetch it
            const commerceUrl = process.env.COMMERCE_URL || 'http://localhost:3003';
            const internalKey = process.env.INTERNAL_API_KEY || '';
            void fetch(`${commerceUrl}/api/commerce/mobile-app-config`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-tenant-id': task.businessId, 'x-internal-key': internalKey },
                body: JSON.stringify({
                    businessName: content.businessName,
                    tagline: content.tagline,
                    primaryColor: content.primaryColor,
                    accentColor: content.accentColor,
                    backgroundColor: content.backgroundColor,
                    isPublished: true,
                    config: content,
                }),
            }).catch((e) => console.warn('[Approve] Mobile app Commerce sync failed:', e));
        } else {
            // ── Website approval path (existing) ─────────────────────────────
            const website = await applicationDb.website.findFirstByBusinessId({ businessId: task.businessId });
            if (website) {
                await applicationDb.website.update({
                    where: { id: website.id },
                    data: {
                        status: WebsiteStatus.PUBLISHED,
                        cmsData: content,
                        publishedAt: new Date(),
                        suspendedAt: null,
                    },
                });
            }

            // Push generated config to Commerce in background
            const commerceUrl = process.env.COMMERCE_URL || 'http://localhost:3003';
            const internalKey = process.env.INTERNAL_API_KEY || '';
            void fetch(`${commerceUrl}/api/commerce/website-config`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-tenant-id': task.businessId, 'x-internal-key': internalKey },
                body: JSON.stringify(content),
            }).catch((e) => console.warn('[Approve] Commerce config sync failed:', e));
        }

        return { success: true, message: 'Published successfully', adminCredentials: null };
    }

    @Post('tasks/:taskId/reject')
    @UseGuards(JwtAuthGuard)
    async rejectTask(@Param('taskId') taskId: string): Promise<any> {
        const task = await runnerDb.agentTask.findUnique({ where: { id: taskId } });
        if (!task) throw new NotFoundException('Task not found');

        await runnerDb.agentTask.update({
            where: { id: taskId },
            data: { status: 'FAILED', outputData: { reason: 'Rejected by user' } },
        });

        if (task.taskType === 'MOBILE_APP_GENERATION') {
            const mobileApp = await applicationDb.mobileApp.findFirstByBusinessId({ businessId: task.businessId });
            if (mobileApp) {
                await applicationDb.mobileApp.update({
                    where: { id: mobileApp.id },
                    data: { status: MobileAppStatus.FAILED },
                });
            }
        } else {
            const website = await applicationDb.website.findFirstByBusinessId({ businessId: task.businessId });
            if (website) {
                await applicationDb.website.update({
                    where: { id: website.id },
                    data: { status: WebsiteStatus.FAILED },
                });
            }
        }

        return { success: true, message: 'Task rejected' };
    }
}
