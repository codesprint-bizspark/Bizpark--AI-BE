import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
    AiGenerationKind,
    ApiSocialPostEntity,
    applicationDb,
    AttachMediaDto,
    GenerateSocialContentDto,
    RegenerateContentFieldDto,
    SocialMediaKind,
    SocialMediaSource,
    SocialPlatform,
    SocialPostStatus,
    SocialPostType,
    UpdatePostContentDto,
} from 'bizpark.core';
import { OpenAiService } from '../ai/openai.service';
import {
    BusinessBrief,
    buildFieldRegenerationPrompt,
    buildSocialContentPrompt,
} from '../ai/prompts';

type VariantPayload = {
    caption?: string;
    cta?: string;
    hashtags?: string[];
    imagePrompt?: string;
    flyerPrompt?: string;
    videoConcept?: string;
    videoScript?: Array<{ scene: number; visual: string; subtitle?: string }>;
    notes?: string;
};

@Injectable()
export class SocialContentService {
    private readonly logger = new Logger(SocialContentService.name);

    constructor(private readonly openai: OpenAiService) { }

    async generateForBusiness(args: { dto: GenerateSocialContentDto; userId: string }): Promise<{
        posts: Array<ApiSocialPostEntity & { mediaItems?: unknown[] }>;
        generationId: string;
    }> {
        const dto = args.dto;
        const business = await applicationDb.business.findUnique({ where: { id: dto.businessId }, include: { websites: true } });
        if (!business) throw new NotFoundException('Business not found');
        if (!dto.platforms?.length) throw new BadRequestException('At least one platform required');
        if (!dto.postType) throw new BadRequestException('postType required');

        const brief = this.buildBusinessBrief(business);
        const prompt = buildSocialContentPrompt(brief, {
            platforms: dto.platforms,
            postType: dto.postType,
            topic: dto.topic,
            tone: dto.tone,
            audience: dto.audience,
            hashtagLimit: dto.hashtagLimit,
        });

        const t0 = Date.now();
        const completion = await this.openai.chatJson(prompt, { temperature: 0.85 });
        const parsed = this.openai.parseJson<{ variants: Record<string, VariantPayload> }>(completion.text);
        const latencyMs = Date.now() - t0;

        const generation = await applicationDb.aiGeneration.create({
            data: {
                businessId: dto.businessId,
                kind: AiGenerationKind.FULL_POST,
                model: completion.model,
                input: { dto, brief },
                output: parsed as unknown as Record<string, unknown>,
                promptTokens: completion.promptTokens,
                completionTokens: completion.completionTokens,
                latencyMs,
                createdByUserId: args.userId,
            },
        });

        // Persist one draft post per platform.
        const posts: ApiSocialPostEntity[] = [];
        for (const platform of dto.platforms) {
            const variant: VariantPayload = parsed.variants?.[platform] ?? {};
            const account = await applicationDb.socialAccount.findActiveByBusinessAndPlatform({
                businessId: dto.businessId,
                platform,
            });
            const post = await applicationDb.socialPost.create({
                data: {
                    businessId: dto.businessId,
                    accountId: account?.id ?? null,
                    platform,
                    postType: dto.postType,
                    status: SocialPostStatus.DRAFT,
                    caption: variant.caption ?? null,
                    cta: variant.cta ?? null,
                    hashtags: this.sanitiseHashtags(variant.hashtags ?? []),
                    aiMetadata: this.aiMetadataFromVariant(variant, dto.postType),
                    sourceGenerationId: generation.id,
                    createdByUserId: args.userId,
                },
            });

            // For IMAGE and FLYER, kick off an image generation right away so the
            // FE can preview something. VIDEO is left to the user to provide media —
            // we surface the script and let them film/upload.
            if (dto.generateMedia && (dto.postType === SocialPostType.IMAGE || dto.postType === SocialPostType.FLYER)) {
                const imagePrompt = dto.postType === SocialPostType.FLYER ? variant.flyerPrompt : variant.imagePrompt;
                if (imagePrompt) {
                    try {
                        const img = await this.openai.generateImage({ prompt: imagePrompt });
                        await applicationDb.socialPostMedia.create({
                            data: {
                                postId: post.id,
                                kind: SocialMediaKind.IMAGE,
                                source: SocialMediaSource.AI_GENERATED,
                                url: img.url,
                                mimeType: 'image/png',
                                prompt: img.promptUsed,
                                position: 0,
                                metadata: { model: img.model, size: img.size },
                            },
                        });
                    } catch (e) {
                        this.logger.warn(`Image gen failed for post ${post.id}: ${(e as Error).message}`);
                    }
                }
            }

            posts.push(post);
        }

        return { posts, generationId: generation.id };
    }

    async regenerateField(args: {
        postId: string;
        businessId: string;
        userId: string;
        dto: RegenerateContentFieldDto;
    }): Promise<ApiSocialPostEntity> {
        const post = await applicationDb.socialPost.findUnique({ where: { id: args.postId } });
        if (!post) throw new NotFoundException('Post not found');
        if (post.businessId !== args.businessId) throw new ForbiddenException('Post does not belong to this business');

        const business = await applicationDb.business.findUnique({ where: { id: post.businessId }, include: { websites: true } });
        if (!business) throw new NotFoundException('Business not found');
        const brief = this.buildBusinessBrief(business);

        const prompt = buildFieldRegenerationPrompt({
            business: brief,
            platform: post.platform,
            field: args.dto.field,
            current: {
                caption: post.caption,
                cta: post.cta,
                hashtags: post.hashtags,
                aiMetadata: post.aiMetadata,
            },
            instructions: args.dto.instructions,
        });

        const t0 = Date.now();
        const completion = await this.openai.chatJson(prompt, { temperature: 0.95 });
        const parsed = this.openai.parseJson<Record<string, unknown>>(completion.text);
        const latencyMs = Date.now() - t0;

        await applicationDb.aiGeneration.create({
            data: {
                businessId: post.businessId,
                postId: post.id,
                platform: post.platform,
                kind: this.kindFromField(args.dto.field),
                model: completion.model,
                input: { current: post, instructions: args.dto.instructions, field: args.dto.field },
                output: parsed,
                promptTokens: completion.promptTokens,
                completionTokens: completion.completionTokens,
                latencyMs,
                createdByUserId: args.userId,
            },
        });

        const patch: Partial<ApiSocialPostEntity> = {};
        if (typeof parsed.caption === 'string') patch.caption = parsed.caption;
        if (Array.isArray(parsed.hashtags)) patch.hashtags = this.sanitiseHashtags(parsed.hashtags as string[]);
        if (typeof parsed.cta === 'string') patch.cta = parsed.cta;
        if (parsed.imagePrompt || parsed.flyerPrompt || parsed.videoScript || parsed.videoConcept) {
            patch.aiMetadata = {
                ...(post.aiMetadata ?? {}),
                ...(typeof parsed.imagePrompt === 'string' ? { imagePrompt: parsed.imagePrompt } : {}),
                ...(typeof parsed.flyerPrompt === 'string' ? { flyerPrompt: parsed.flyerPrompt } : {}),
                ...(parsed.videoScript ? { videoScript: parsed.videoScript } : {}),
                ...(typeof parsed.videoConcept === 'string' ? { videoConcept: parsed.videoConcept } : {}),
            };
        }

        return applicationDb.socialPost.update({ where: { id: post.id }, data: patch });
    }

    async updatePost(args: { postId: string; businessId: string; dto: UpdatePostContentDto }): Promise<ApiSocialPostEntity> {
        const post = await applicationDb.socialPost.findUnique({ where: { id: args.postId } });
        if (!post) throw new NotFoundException('Post not found');
        if (post.businessId !== args.businessId) throw new ForbiddenException('Forbidden');
        if (post.status === SocialPostStatus.PUBLISHED) throw new BadRequestException('Cannot edit a published post');

        const patch: Partial<ApiSocialPostEntity> = {};
        if (args.dto.caption !== undefined) patch.caption = args.dto.caption;
        if (args.dto.cta !== undefined) patch.cta = args.dto.cta;
        if (args.dto.hashtags !== undefined) patch.hashtags = this.sanitiseHashtags(args.dto.hashtags);
        if (args.dto.scheduledAt !== undefined) {
            patch.scheduledAt = args.dto.scheduledAt ? new Date(args.dto.scheduledAt) : null;
        }
        if (args.dto.platform !== undefined) patch.platform = args.dto.platform;
        if (args.dto.postType !== undefined) patch.postType = args.dto.postType;
        if (args.dto.accountId !== undefined) patch.accountId = args.dto.accountId;
        if (args.dto.aiMetadata !== undefined) patch.aiMetadata = args.dto.aiMetadata;

        return applicationDb.socialPost.update({ where: { id: args.postId }, data: patch });
    }

    async listPosts(args: { businessId: string; status?: SocialPostStatus; platform?: SocialPlatform; take?: number }) {
        return applicationDb.socialPost.findMany({
            where: { businessId: args.businessId, status: args.status, platform: args.platform },
            orderBy: { createdAt: 'desc' },
            take: args.take,
        });
    }

    async getPost(args: { businessId: string; postId: string }) {
        const post = await applicationDb.socialPost.findUnique({
            where: { id: args.postId },
            include: { media: true, logs: true },
        });
        if (!post) throw new NotFoundException('Post not found');
        if (post.businessId !== args.businessId) throw new ForbiddenException('Forbidden');
        return post;
    }

    async deletePost(args: { businessId: string; postId: string }) {
        const post = await applicationDb.socialPost.findUnique({ where: { id: args.postId } });
        if (!post) throw new NotFoundException('Post not found');
        if (post.businessId !== args.businessId) throw new ForbiddenException('Forbidden');
        if (post.status === SocialPostStatus.PUBLISHING) {
            throw new BadRequestException('Cannot cancel a post that is currently publishing');
        }
        return applicationDb.socialPost.softDelete({ where: { id: post.id } });
    }

    async attachMedia(args: { businessId: string; postId: string; dto: AttachMediaDto }) {
        const post = await applicationDb.socialPost.findUnique({ where: { id: args.postId } });
        if (!post) throw new NotFoundException('Post not found');
        if (post.businessId !== args.businessId) throw new ForbiddenException('Forbidden');
        if (post.status === SocialPostStatus.PUBLISHED) throw new BadRequestException('Cannot modify a published post');

        return applicationDb.socialPostMedia.create({
            data: {
                postId: post.id,
                kind: args.dto.kind,
                source: args.dto.source ?? SocialMediaSource.USER_UPLOAD,
                url: args.dto.url,
                mimeType: args.dto.mimeType ?? null,
                width: args.dto.width ?? null,
                height: args.dto.height ?? null,
                durationMs: args.dto.durationMs ?? null,
                position: args.dto.position ?? 0,
                prompt: args.dto.prompt ?? null,
                metadata: args.dto.metadata ?? null,
            },
        });
    }

    async removeMedia(args: { businessId: string; postId: string; mediaId: string }) {
        const post = await applicationDb.socialPost.findUnique({ where: { id: args.postId } });
        if (!post) throw new NotFoundException('Post not found');
        if (post.businessId !== args.businessId) throw new ForbiddenException('Forbidden');
        return applicationDb.socialPostMedia.softDelete({ where: { id: args.mediaId } });
    }

    async generateImageForPost(args: { businessId: string; postId: string; prompt?: string }) {
        const post = await applicationDb.socialPost.findUnique({ where: { id: args.postId } });
        if (!post) throw new NotFoundException('Post not found');
        if (post.businessId !== args.businessId) throw new ForbiddenException('Forbidden');

        const meta = (post.aiMetadata ?? {}) as Record<string, unknown>;
        const fallbackPrompt = (meta.imagePrompt as string | undefined) || (meta.flyerPrompt as string | undefined);
        const finalPrompt = args.prompt || fallbackPrompt;
        if (!finalPrompt) throw new BadRequestException('No image prompt available — provide one explicitly or regenerate image_prompt first');

        const img = await this.openai.generateImage({ prompt: finalPrompt });
        return applicationDb.socialPostMedia.create({
            data: {
                postId: post.id,
                kind: SocialMediaKind.IMAGE,
                source: SocialMediaSource.AI_GENERATED,
                url: img.url,
                mimeType: 'image/png',
                prompt: img.promptUsed,
                metadata: { model: img.model, size: img.size },
            },
        });
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private buildBusinessBrief(business: any): BusinessBrief {
        const website = business.websites?.[0];
        const cms = website?.cmsData as Record<string, any> | null | undefined;
        return {
            id: business.id,
            name: business.name,
            category: business.category ?? null,
            description: business.description ?? null,
            logoUrl: business.logoUrl ?? null,
            websiteSnapshot: cms ?? null,
            primaryColor: cms?.primaryColor ?? null,
            secondaryColor: cms?.secondaryColor ?? null,
            keywords: cms?.content?.seo?.keywords ?? null,
        };
    }

    private sanitiseHashtags(input: string[]): string[] {
        return input
            .map((h) => h.trim().replace(/^#+/, '').replace(/\s+/g, '').toLowerCase())
            .filter(Boolean)
            .slice(0, 30);
    }

    private aiMetadataFromVariant(v: VariantPayload, postType: SocialPostType): Record<string, unknown> {
        const md: Record<string, unknown> = {};
        if (v.notes) md.notes = v.notes;
        if (postType === SocialPostType.IMAGE && v.imagePrompt) md.imagePrompt = v.imagePrompt;
        if (postType === SocialPostType.FLYER && v.flyerPrompt) md.flyerPrompt = v.flyerPrompt;
        if (postType === SocialPostType.VIDEO) {
            if (v.videoConcept) md.videoConcept = v.videoConcept;
            if (v.videoScript) md.videoScript = v.videoScript;
        }
        return md;
    }

    private kindFromField(field: RegenerateContentFieldDto['field']): AiGenerationKind {
        switch (field) {
            case 'caption': return AiGenerationKind.CAPTION;
            case 'hashtags': return AiGenerationKind.HASHTAGS;
            case 'cta': return AiGenerationKind.CAPTION;
            case 'image_prompt': return AiGenerationKind.IMAGE_PROMPT;
            case 'flyer_prompt': return AiGenerationKind.FLYER_PROMPT;
            case 'video_script': return AiGenerationKind.VIDEO_SCRIPT;
        }
    }
}
