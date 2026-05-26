import { Controller, Get, Logger, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { applicationDb } from 'bizpark.core';

/**
 * Public (no JWT) endpoint that serves SocialPostMedia bytes.
 *
 * Reason: Instagram's Graph API only accepts a publicly fetchable URL for the
 * image_url / video_url parameter — it can't consume data URIs. We store
 * uploaded / AI-generated media as base64 data URIs in the database, so we
 * decode them on demand and serve the raw bytes here. With ngrok exposing
 * this API, Instagram can reach this URL and download the media.
 *
 * Security: The media ID is a uuid, so the URL is effectively unguessable.
 * Access is read-only and limited to media rows that already exist for a
 * post the operator created.
 */
@Controller('api/social/media')
export class PublicMediaController {
    private readonly logger = new Logger(PublicMediaController.name);

    @Get(':mediaId/raw')
    async raw(@Param('mediaId') mediaId: string, @Res() res: Response) {
        const media = await applicationDb.socialPostMedia.findUnique({ where: { id: mediaId } });
        if (!media || media.deletedAt) {
            this.logger.warn(`[public-media] not found id=${mediaId}`);
            throw new NotFoundException('Media not found');
        }

        const url = media.url || '';

        if (url.startsWith('data:')) {
            const match = url.match(/^data:([^;,]+)(?:;base64)?,(.*)$/);
            if (!match) {
                this.logger.warn(`[public-media] malformed data URI id=${mediaId}`);
                throw new NotFoundException('Malformed media data URI');
            }
            const mimeType = match[1] || media.mimeType || 'application/octet-stream';
            const buffer = Buffer.from(match[2], 'base64');
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Length', buffer.length);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(buffer);
        }

        // Already a public URL — just redirect.
        return res.redirect(url);
    }
}
