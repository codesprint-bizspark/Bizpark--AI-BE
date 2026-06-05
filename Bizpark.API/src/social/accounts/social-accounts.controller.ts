import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Logger,
    Param,
    Post,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { InitiateOAuthDto, SocialPlatform } from 'bizpark.core';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { SocialAccountsService } from './social-accounts.service';

@Controller('api/social/accounts')
export class SocialAccountsController {
    private readonly logger = new Logger(SocialAccountsController.name);
    constructor(private readonly service: SocialAccountsService) { }

    /**
     * Returns the URL the frontend should redirect the browser to.
     * Frontend opens the OAuth window — no tokens or secrets transit through the FE.
     */
    @Post('connect')
    @UseGuards(JwtAuthGuard)
    async connect(
        @Body() body: InitiateOAuthDto,
        @CurrentUser() user: { id: string; email: string; name: string },
    ) {
        if (!body.businessId || !body.platform) throw new BadRequestException('businessId and platform required');
        const validPlatforms = Object.values(SocialPlatform);
        if (!validPlatforms.includes(body.platform)) {
            throw new BadRequestException(`Unsupported platform. Must be one of: ${validPlatforms.join(', ')}`);
        }
        const { authorizationUrl } = this.service.buildAuthorizationUrl({
            businessId: body.businessId,
            userId: user.id,
            platform: body.platform,
            redirectAfterConnect: body.redirectAfterConnect,
        });
        return { success: true, data: { authorizationUrl } };
    }

    /**
     * OAuth provider redirects the user's browser here after consent.
     * We exchange the code for tokens, persist (encrypted), then redirect the
     * browser back to the frontend.
     *
     * This route is intentionally PUBLIC — the OAuth state is HMAC-signed and
     * carries the businessId + userId. No JWT is available on this redirect.
     *
     * IMPORTANT: must be declared before @Get(':businessId') so NestJS
     * matches the literal 'callback' before the param wildcard.
     */
    @Get('callback')
    async callback(
        @Query('code') code: string,
        @Query('state') state: string,
        @Query('error') error: string | undefined,
        @Query('error_description') errorDescription: string | undefined,
        @Res() res: Response,
    ) {
        const fe = process.env.FRONTEND_URL || 'http://localhost:9002';
        const fallbackRedirect = `${fe}/dashboard/social`;
        this.logger.log(`[callback] received code=${code ? code.slice(0, 10) + '…' : 'none'} state=${state ? 'present' : 'none'} error=${error ?? 'none'}`);

        if (error) {
            this.logger.warn(`[callback] provider error: ${error} — ${errorDescription ?? ''}`);
            const url = new URL(fallbackRedirect);
            url.searchParams.set('connect_status', 'error');
            url.searchParams.set('connect_error', errorDescription || error);
            return res.redirect(url.toString());
        }

        if (!code || !state) {
            this.logger.warn(`[callback] missing code or state`);
            return res.redirect(`${fallbackRedirect}?connect_status=error&connect_error=missing_code_or_state`);
        }

        try {
            const result = await this.service.handleOAuthCallback({ code, state });
            const target = result.redirectAfterConnect || fallbackRedirect;
            const url = new URL(target);
            url.searchParams.set('connect_status', 'success');
            url.searchParams.set('platform', result.account.platform);
            this.logger.log(`[callback] success → ${url.toString()}`);
            return res.redirect(url.toString());
        } catch (e) {
            const err = e as Error;
            // Log full stack so the operator can see what failed. The redirect
            // only carries the human-readable message for the UI banner.
            this.logger.error(`[callback] handler failed: ${err.message}`, err.stack);
            const url = new URL(fallbackRedirect);
            url.searchParams.set('connect_status', 'error');
            url.searchParams.set('connect_error', err.message);
            return res.redirect(url.toString());
        }
    }

    @Get(':businessId')
    @UseGuards(JwtAuthGuard)
    async list(@Param('businessId') businessId: string) {
        const accounts = await this.service.listForBusiness(businessId);
        return { success: true, data: accounts };
    }

    @Delete(':businessId/:accountId')
    @UseGuards(JwtAuthGuard)
    async disconnect(
        @Param('businessId') businessId: string,
        @Param('accountId') accountId: string,
    ) {
        await this.service.disconnect({ businessId, accountId });
        return { success: true, message: 'Account disconnected' };
    }
}
