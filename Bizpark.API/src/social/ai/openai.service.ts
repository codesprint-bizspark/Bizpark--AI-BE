import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';

export type ChatCompletion = {
    text: string;
    promptTokens: number | null;
    completionTokens: number | null;
    model: string;
};

export type ImageGeneration = {
    url: string;
    promptUsed: string;
    model: string;
    size: string;
};

/**
 * Thin OpenAI wrapper — single source of truth for model selection, retries, and parsing.
 *
 * The OPENAI_API_KEY env var is required.
 *  - Set OPENAI_TEXT_MODEL (default: gpt-4o-mini) to control text generation.
 *  - Set OPENAI_IMAGE_MODEL (default: gpt-image-1) to control image generation.
 */
@Injectable()
export class OpenAiService {
    private readonly logger = new Logger(OpenAiService.name);
    private client: OpenAI | null = null;

    private getClient(): OpenAI {
        if (this.client) return this.client;
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
        }
        this.client = new OpenAI({ apiKey });
        return this.client;
    }

    async chatJson(prompt: string, options?: { temperature?: number; model?: string }): Promise<ChatCompletion> {
        const model = options?.model || process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';
        const temperature = options?.temperature ?? 0.7;
        const t0 = Date.now();
        try {
            const completion = await this.getClient().chat.completions.create({
                model,
                temperature,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: prompt }],
            });
            const text = completion.choices[0]?.message?.content ?? '';
            return {
                text,
                promptTokens: completion.usage?.prompt_tokens ?? null,
                completionTokens: completion.usage?.completion_tokens ?? null,
                model,
            };
        } catch (e) {
            this.logger.error(`OpenAI chat failed (${Date.now() - t0}ms): ${(e as Error).message}`);
            throw e;
        }
    }

    async generateImage(args: { prompt: string; size?: '1024x1024' | '1024x1792' | '1792x1024'; model?: string }): Promise<ImageGeneration> {
        const model = args.model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
        const size = args.size || '1024x1024';
        try {
            const result = await this.getClient().images.generate({
                model,
                prompt: args.prompt,
                size,
                n: 1,
            });
            const item = result.data?.[0];
            // gpt-image-1 returns base64 by default; dall-e-3 returns a URL.
            // We normalise to a data URL so the FE can preview without uploading anywhere.
            const url = item?.url
                || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : '');
            if (!url) throw new Error('OpenAI image response missing url and b64_json');
            return { url, promptUsed: args.prompt, model, size };
        } catch (e) {
            this.logger.error(`OpenAI image gen failed: ${(e as Error).message}`);
            throw e;
        }
    }

    /**
     * Strip code fences if the model wrapped its JSON despite response_format.
     */
    parseJson<T = unknown>(text: string): T {
        let body = text.trim();
        if (body.startsWith('```')) {
            body = body.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
        }
        return JSON.parse(body) as T;
    }
}
