import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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

    /**
     * Fetch a connected account ready to publish through.
     * Decrypts the access token (server-side only) and auto-refreshes if expired
     * and a refresh token is available.
     *
     * Returns the decrypted token along with the account.
     */
    async getAccountForPublishing(args: {
        businessId: string;
        accountId?: string | null;
        platform?: SocialPlatform;
    }): Promise<{ account: ApiSocialAccountEntity; accessToken: string }> {
        let account: ApiSocialAccountEntity | null = null;
        if (args.accountId) {
            account = await applicationDb.socialAccount.findUnique({ where: { id: args.accountId } });
        } else if (args.platform) {
            account = await applicationDb.socialAccount.findActiveByBusinessAndPlatform({
                businessId: args.businessId,
                platform: args.platform,
            });
        }
        if (!account || account.deletedAt) throw new NotFoundException('No connected social account found');
        if (account.businessId !== args.businessId) throw new ForbiddenException('Account does not belong to this business');
        if (account.status === SocialAccountStatus.DISCONNECTED || account.status === SocialAccountStatus.REVOKED) {
            throw new BadRequestException('Account is disconnected — reconnect required');
        }

        let accessToken = decryptToken(account.accessTokenCipher);
        if (!accessToken) throw new BadRequestException('No access token stored — reconnect required');

        const expired = account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now() + 60_000;
        if (expired) {
            const refresh = decryptToken(account.refreshTokenCipher);
            if (refresh) {
                try {
                    const result = await this.platforms.get(account.platform).refreshAccessToken(refresh);
                    account = await this.saveOrUpdateAccount({
                        businessId: account.businessId,
                        platform: account.platform,
                        result,
                    });
                    accessToken = decryptToken(account.accessTokenCipher)!;
                } catch (e) {
                    // Mark expired so the UI can prompt the user to reconnect.
                    await applicationDb.socialAccount.update({
                        where: { id: account.id },
                        data: {
                            status: SocialAccountStatus.EXPIRED,
                            metadata: { ...(account.metadata ?? {}), lastRefreshError: (e as Error).message },
                        },
                    });
                    throw new BadRequestException(`Token expired and refresh failed: ${(e as Error).message}`);
                }
            } else {
                await applicationDb.socialAccount.update({
                    where: { id: account.id },
                    data: { status: SocialAccountStatus.EXPIRED },
                });
                throw new BadRequestException('Access token expired and no refresh token available — reconnect required');
            }
        }

        return { account, accessToken };
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
