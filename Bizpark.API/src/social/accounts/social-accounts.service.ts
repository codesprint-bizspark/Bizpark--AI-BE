import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
    ApiSocialAccountEntity,
    applicationDb,
    SocialAccountStatus,
    SocialPlatform,
} from 'bizpark.core';
import { decryptToken, encryptToken } from '../common/token-crypto';
import { signOAuthState, verifyOAuthState } from '../common/oauth-state';
import { PlatformRegistry } from '../platforms/platform-registry.service';
import type { OAuthExchangeResult } from '../platforms/platform-client.types';

export type SocialAccountSafeView = Omit<ApiSocialAccountEntity, 'accessTokenCipher' | 'refreshTokenCipher' | 'business' | 'posts'> & {
    isConnected: boolean;
    requiresReauth: boolean;
};

@Injectable()
export class SocialAccountsService {
    private readonly logger = new Logger(SocialAccountsService.name);

    constructor(private readonly platforms: PlatformRegistry) { }

    async listForBusiness(businessId: string): Promise<SocialAccountSafeView[]> {
        const rows = await applicationDb.socialAccount.findMany({ where: { businessId } });
        const views = rows.map((r) => this.toSafeView(r));
        // Diagnostic: lets us verify GET /api/social/accounts/:businessId returns
        // what we expect when debugging connection-state issues. Remove once stable.
        this.logger.debug(
            `[list] businessId=${businessId} total=${rows.length} connected=${views
                .filter((v) => v.isConnected)
                .map((v) => `${v.platform}:${v.displayName ?? v.externalAccountId}`)
                .join(',') || 'none'}`,
        );
        return views;
    }

    /**
     * Build the OAuth authorization URL for the given platform + business.
     * Returns the URL the frontend should redirect to.
     */
    buildAuthorizationUrl(args: {
        businessId: string;
        userId: string;
        platform: SocialPlatform;
        redirectAfterConnect?: string;
    }): { authorizationUrl: string; state: string } {
        const client = this.platforms.get(args.platform);
        const state = signOAuthState({
            businessId: args.businessId,
            userId: args.userId,
            platform: args.platform,
            redirectAfterConnect: args.redirectAfterConnect,
        });
        return { authorizationUrl: client.getAuthorizationUrl(state), state };
    }

    /**
     * Exchange the OAuth code and persist the encrypted tokens.
     * Returns the updated safe view (no tokens).
     */
    async handleOAuthCallback(args: { code: string; state: string }): Promise<{
        account: SocialAccountSafeView;
        redirectAfterConnect?: string;
    }> {
        const payload = verifyOAuthState(args.state);
        const platform = payload.platform as SocialPlatform;
        this.logger.log(`[oauth-callback] platform=${platform} businessId=${payload.businessId} userId=${payload.userId}`);

        const client = this.platforms.get(platform);
        const result = await client.exchangeCode(args.code);
        this.logger.log(
            `[oauth-callback] token exchanged platform=${platform} externalAccountId=${result.externalAccountId} `
            + `externalPageId=${result.externalPageId ?? 'none'} display=${result.displayName ?? 'n/a'}`,
        );

        const saved = await this.saveOrUpdateAccount({
            businessId: payload.businessId,
            platform,
            result,
        });
        this.logger.log(
            `[oauth-callback] persisted id=${saved.id} businessId=${saved.businessId} platform=${saved.platform} `
            + `status=${saved.status} externalAccountId=${saved.externalAccountId}`,
        );

        return {
            account: this.toSafeView(saved),
            redirectAfterConnect: payload.redirectAfterConnect,
        };
    }

    async disconnect(args: { businessId: string; accountId: string }): Promise<void> {
        const account = await applicationDb.socialAccount.findUnique({ where: { id: args.accountId } });
        if (!account) throw new NotFoundException('Account not found');
        if (account.businessId !== args.businessId) throw new ForbiddenException('Account does not belong to this business');

        const client = this.platforms.get(account.platform);
        const token = decryptToken(account.accessTokenCipher);
        if (token) {
            try { await client.disconnect(token); } catch (e) { this.logger.warn(`Platform disconnect failed: ${(e as Error).message}`); }
        }
        await applicationDb.socialAccount.softDelete({ where: { id: account.id } });
    }

    private async saveOrUpdateAccount(args: {
        businessId: string;
        platform: SocialPlatform;
        result: OAuthExchangeResult;
    }): Promise<ApiSocialAccountEntity> {
        const { businessId, platform, result } = args;
        const tokenExpiresAt = result.expiresInSec
            ? new Date(Date.now() + result.expiresInSec * 1000)
            : null;

        return applicationDb.socialAccount.upsert({
            data: {
                businessId,
                platform,
                externalAccountId: result.externalAccountId,
                externalPageId: result.externalPageId ?? null,
                displayName: result.displayName ?? null,
                username: result.username ?? null,
                avatarUrl: result.avatarUrl ?? null,
                accessTokenCipher: encryptToken(result.accessToken)!,
                refreshTokenCipher: encryptToken(result.refreshToken ?? null),
                tokenExpiresAt,
                scope: result.scope ?? null,
                status: SocialAccountStatus.CONNECTED,
                metadata: result.metadata ?? null,
                lastRefreshedAt: new Date(),
            },
        });
    }

    /**
     * Resolve, validate, and decrypt the access token for a social account.
     * Throws a non-retryable error if the account is expired/revoked or has no token.
     */
    async getAccountForPublishing(args: {
        businessId: string;
        accountId: string | null | undefined;
        platform: SocialPlatform;
    }): Promise<{ account: ApiSocialAccountEntity; accessToken: string }> {
        if (!args.accountId) {
            const err = new Error('No account selected for this post — connect or pick an account first');
            (err as any).nonRetryable = true;
            throw err;
        }

        const account = await applicationDb.socialAccount.findUnique({ where: { id: args.accountId } });
        if (!account || account.deletedAt) {
            const err = new Error(`Social account ${args.accountId} not found`);
            (err as any).nonRetryable = true;
            throw err;
        }
        if (account.businessId !== args.businessId) {
            const err = new Error('Account does not belong to this business');
            (err as any).nonRetryable = true;
            throw err;
        }
        if (account.status === SocialAccountStatus.EXPIRED) {
            const err = new Error(`${args.platform} account token is expired — reconnect required`);
            (err as any).nonRetryable = true;
            throw err;
        }
        if (account.status === SocialAccountStatus.REVOKED) {
            const err = new Error(`${args.platform} account access was revoked — reconnect required`);
            (err as any).nonRetryable = true;
            throw err;
        }

        const accessToken = decryptToken(account.accessTokenCipher);
        if (!accessToken) {
            const err = new Error(`No access token stored for ${args.platform} account — reconnect required`);
            (err as any).nonRetryable = true;
            throw err;
        }

        return { account, accessToken };
    }

    private toSafeView(row: ApiSocialAccountEntity): SocialAccountSafeView {
        const { accessTokenCipher: _a, refreshTokenCipher: _r, ...rest } = row as ApiSocialAccountEntity & {
            accessTokenCipher: string;
            refreshTokenCipher: string | null;
        };
        const requiresReauth = rest.status === SocialAccountStatus.EXPIRED || rest.status === SocialAccountStatus.REVOKED;
        return {
            ...(rest as unknown as Omit<ApiSocialAccountEntity, 'accessTokenCipher' | 'refreshTokenCipher' | 'business' | 'posts'>),
            isConnected: rest.status === SocialAccountStatus.CONNECTED && !rest.deletedAt,
            requiresReauth,
        };
    }
}
