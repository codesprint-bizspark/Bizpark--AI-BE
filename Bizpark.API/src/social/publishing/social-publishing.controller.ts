import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { PublishNowDto, SchedulePostDto } from 'bizpark.core';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SocialPublishingService } from './social-publishing.service';

@Controller('api/social/publishing')
@UseGuards(JwtAuthGuard)
export class SocialPublishingController {
    constructor(private readonly service: SocialPublishingService) { }

    @Post(':businessId/posts/:postId/publish-now')
    async publishNow(
        @Param('businessId') businessId: string,
        @Param('postId') postId: string,
        @Body() dto: PublishNowDto,
    ) {
        const result = await this.service.publishNow({ businessId, postId, dto });
        return { success: true, data: result };
    }

    @Post(':businessId/posts/:postId/schedule')
    async schedule(
        @Param('businessId') businessId: string,
        @Param('postId') postId: string,
        @Body() dto: SchedulePostDto,
    ) {
        const post = await this.service.schedule({ businessId, postId, dto });
        return { success: true, data: post };
    }

    @Post(':businessId/posts/:postId/cancel-scheduled')
    async cancel(
        @Param('businessId') businessId: string,
        @Param('postId') postId: string,
    ) {
        const post = await this.service.cancelScheduled({ businessId, postId });
        return { success: true, data: post };
    }

    @Get(':businessId/scheduled')
    async listScheduled(@Param('businessId') businessId: string) {
        const posts = await this.service.listScheduled(businessId);
        return { success: true, data: posts };
    }

    @Get(':businessId/history')
    async listHistory(
        @Param('businessId') businessId: string,
        @Query('take') take?: string,
    ) {
        const posts = await this.service.listHistory({
            businessId,
            take: take ? Math.min(parseInt(take, 10) || 50, 200) : 50,
        });
        return { success: true, data: posts };
    }

    @Get(':businessId/posts/:postId/logs')
    async listLogs(
        @Param('businessId') businessId: string,
        @Param('postId') postId: string,
    ) {
        const logs = await this.service.listPublishingLogs({ businessId, postId });
        return { success: true, data: logs };
    }
}
