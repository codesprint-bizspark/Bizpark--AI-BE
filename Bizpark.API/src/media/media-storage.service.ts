import { BadRequestException, Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/svg+xml',
    'image/gif',
]);

const MAX_BYTES = 5 * 1024 * 1024;

/** Per-tenant path: `{businessId}/website/{filename}` */
function objectKey(businessId: string, filename: string): string {
    return `${businessId}/website/${filename}`;
}

@Injectable()
export class MediaStorageService {
    private readonly uploadRoot = join(process.cwd(), 'uploads');
    private s3Client: S3Client | null = null;

    async uploadWebsiteMedia(businessId: string, file: Express.Multer.File): Promise<string> {
        if (!file?.buffer?.length) {
            throw new BadRequestException('No file provided');
        }
        if (file.size > MAX_BYTES) {
            throw new BadRequestException('File exceeds 5MB limit');
        }
        if (!ALLOWED_MIME.has(file.mimetype)) {
            throw new BadRequestException('Only JPEG, PNG, WebP, SVG, and GIF images are allowed');
        }

        const supabaseUrl = await this.trySupabaseUpload(businessId, file);
        if (supabaseUrl) return supabaseUrl;

        return this.saveLocal(businessId, file);
    }

    private getSupabaseConfig() {
        const endpoint = process.env.SUPABASE_STORAGE_S3_ENDPOINT;
        const accessKeyId = process.env.SUPABASE_STORAGE_ACCESS_KEY_ID;
        const secretAccessKey = process.env.SUPABASE_STORAGE_SECRET_ACCESS_KEY;
        const bucket = process.env.SUPABASE_STORAGE_BUCKET;
        const region = process.env.SUPABASE_STORAGE_REGION || 'ap-northeast-1';
        const projectUrl = (process.env.SUPABASE_PROJECT_URL || '').replace(/\/$/, '');

        if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !projectUrl) {
            return null;
        }

        return { endpoint, accessKeyId, secretAccessKey, bucket, region, projectUrl };
    }

    private getS3Client(cfg: NonNullable<ReturnType<typeof this.getSupabaseConfig>>): S3Client {
        if (!this.s3Client) {
            this.s3Client = new S3Client({
                forcePathStyle: true,
                region: cfg.region,
                endpoint: cfg.endpoint,
                credentials: {
                    accessKeyId: cfg.accessKeyId,
                    secretAccessKey: cfg.secretAccessKey,
                },
            });
        }
        return this.s3Client;
    }

    private publicObjectUrl(projectUrl: string, bucket: string, key: string): string {
        return `${projectUrl}/storage/v1/object/public/${bucket}/${key}`;
    }

    private async trySupabaseUpload(businessId: string, file: Express.Multer.File): Promise<string | null> {
        const cfg = this.getSupabaseConfig();
        if (!cfg) return null;

        const ext = extname(file.originalname) || this.extFromMime(file.mimetype);
        const filename = `${randomUUID()}${ext}`;
        const key = objectKey(businessId, filename);

        try {
            const client = this.getS3Client(cfg);
            await client.send(
                new PutObjectCommand({
                    Bucket: cfg.bucket,
                    Key: key,
                    Body: file.buffer,
                    ContentType: file.mimetype,
                    CacheControl: 'public, max-age=31536000, immutable',
                }),
            );
            return this.publicObjectUrl(cfg.projectUrl, cfg.bucket, key);
        } catch (err) {
            console.warn('[MediaStorage] Supabase upload failed, falling back to local:', err);
            return null;
        }
    }

    private async saveLocal(businessId: string, file: Express.Multer.File): Promise<string> {
        const dir = join(this.uploadRoot, businessId, 'website');
        await mkdir(dir, { recursive: true });

        const ext = extname(file.originalname) || this.extFromMime(file.mimetype);
        const filename = `${randomUUID()}${ext}`;
        await writeFile(join(dir, filename), file.buffer);

        const baseUrl = (process.env.API_PUBLIC_URL || process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, '');
        return `${baseUrl}/uploads/${businessId}/website/${filename}`;
    }

    private extFromMime(mime: string): string {
        switch (mime) {
            case 'image/jpeg': return '.jpg';
            case 'image/png': return '.png';
            case 'image/webp': return '.webp';
            case 'image/svg+xml': return '.svg';
            case 'image/gif': return '.gif';
            default: return '.bin';
        }
    }
}
