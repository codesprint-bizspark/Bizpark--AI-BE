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
    UploadedFiles,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
    AttachMediaDto,
    BulkAttachMediaDto,
    GenerateSocialContentDto,
    RegenerateContentFieldDto,
    SocialPlatform,
    SocialPostStatus,
    UpdatePostContentDto,
} from 'bizpark.core';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { SocialContentService } from './social-content.service';

// Lightweight shim — we don't pull in @types/multer, so type the minimal
// shape we actually read off each uploaded file.
type UploadedMulterFile = {
    fieldname: string;
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
};

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

    @Post(':businessId/posts/:postId/media/bulk')
    async bulkAttachMedia(
        @Param('businessId') businessId: string,
        @Param('postId') postId: string,
        @Body() dto: BulkAttachMediaDto,
    ) {
        const media = await this.service.bulkAttachMedia({ businessId, postId, dto });
        return { success: true, data: media };
    }

    /**
     * Upload one or more files (images / videos) directly as multipart/form-data.
     * The bytes are converted to base64 data URLs so they slot straight into the
     * same `SocialPostMedia.url` column the AI image flow already uses.
     *
     * 50MB per file is comfortable headroom for a Reels-length video; the limit
     * matches the JSON body parser cap so users can't bypass one and trip the
     * other.
     */
    @Post(':businessId/posts/:postId/media/upload')
    @UseInterceptors(FilesInterceptor('files', 12, {
        limits: { fileSize: 50 * 1024 * 1024 },
    }))
    async uploadMediaFiles(
        @Param('businessId') businessId: string,
        @Param('postId') postId: string,
        @UploadedFiles() files: UploadedMulterFile[],
    ) {
        const media = await this.service.uploadMediaFiles({
            businessId,
            postId,
            files: (files ?? []).map((f) => ({
                originalName: f.originalname,
                mimeType: f.mimetype,
                size: f.size,
                buffer: f.buffer,
            })),
        });
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
