import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Patch,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    AttachMediaDto,
    GenerateSocialContentDto,
    RegenerateContentFieldDto,
    SocialPlatform,
    SocialPostStatus,
    UpdatePostContentDto,
} from 'bizpark.core';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { SocialContentService } from './social-content.service';

@Controller('api/social/content')
@UseGuards(JwtAuthGuard)
export class SocialContentController {
    constructor(private readonly service: SocialContentService) { }

    @Post('generate')
    async generate(
        @Body() dto: GenerateSocialContentDto,
        @CurrentUser() user: { id: string },
    ) {
        if (!dto.businessId) throw new BadRequestException('businessId required');
        const result = await this.service.generateForBusiness({ dto, userId: user.id });
        return { success: true, data: result };
    }

    @Get(':businessId/posts')
    async list(
        @Param('businessId') businessId: string,
        @Query('status') status?: SocialPostStatus,
        @Query('platform') platform?: SocialPlatform,
        @Query('take') take?: string,
    ) {
        const posts = await this.service.listPosts({
            businessId,
            status,
            platform,
            take: take ? Math.min(parseInt(take, 10) || 50, 200) : 50,
        });
        return { success: true, data: posts };
    }

    @Get(':businessId/posts/:postId')
    async get(
        @Param('businessId') businessId: string,
        @Param('postId') postId: string,
    ) {
        const post = await this.service.getPost({ businessId, postId });
        return { success: true, data: post };
    }

    @Patch(':businessId/posts/:postId')
    async update(
        @Param('businessId') businessId: string,
        @Param('postId') postId: string,
        @Body() dto: UpdatePostContentDto,
    ) {
        const post = await this.service.updatePost({ businessId, postId, dto });
        return { success: true, data: post };
    }

    @Post(':businessId/posts/:postId/regenerate')
    async regenerateField(
        @Param('businessId') businessId: string,
        @Param('postId') postId: string,
        @Body() dto: RegenerateContentFieldDto,
        @CurrentUser() user: { id: string },
    ) {
        const post = await this.service.regenerateField({ businessId, postId, dto, userId: user.id });
        return { success: true, data: post };
    }

    @Post(':businessId/posts/:postId/media')
    async attachMedia(
        @Param('businessId') businessId: string,
        @Param('postId') postId: string,
        @Body() dto: AttachMediaDto,
    ) {
        const media = await this.service.attachMedia({ businessId, postId, dto });
        return { success: true, data: media };
    }

    @Post(':businessId/posts/:postId/media/ai-image')
    async aiGenerateImage(
        @Param('businessId') businessId: string,
        @Param('postId') postId: string,
        @Body() body: { prompt?: string },
    ) {
        const media = await this.service.generateImageForPost({ businessId, postId, prompt: body?.prompt });
        return { success: true, data: media };
    }

    @Delete(':businessId/posts/:postId/media/:mediaId')
    async removeMedia(
        @Param('businessId') businessId: string,
        @Param('postId') postId: string,
        @Param('mediaId') mediaId: string,
    ) {
        const media = await this.service.removeMedia({ businessId, postId, mediaId });
        return { success: true, data: media };
    }

    @Delete(':businessId/posts/:postId')
    async deletePost(
        @Param('businessId') businessId: string,
        @Param('postId') postId: string,
    ) {
        const post = await this.service.deletePost({ businessId, postId });
        return { success: true, data: post };
    }
}
