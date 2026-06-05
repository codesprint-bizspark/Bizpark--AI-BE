import { Body, Controller, ForbiddenException, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsageService } from './usage.service';

type CurrentUserPayload = { id: string; email: string; name: string };

@Controller('api/usage')
export class UsageController {
    constructor(private readonly usageService: UsageService) {}

    @Get()
    @UseGuards(JwtAuthGuard)
    getUsage(@Query('month') month: string | undefined, @CurrentUser() user: CurrentUserPayload) {
        return this.usageService.getUsage(user.id, month);
    }
}

@Controller('api/internal/usage')
export class InternalUsageController {
    constructor(private readonly usageService: UsageService) {}

    @Post('commit')
    commit(@Req() request: Request, @Body() body: {
        reservationId: string;
        status: 'COMMITTED' | 'RELEASED';
        promptTokens?: number | null;
        completionTokens?: number | null;
        totalTokens?: number | null;
        provider?: string | null;
        model?: string | null;
        metadata?: Record<string, unknown> | null;
    }) {
        const expected = process.env.INTERNAL_API_KEY || '';
        const received = String(request.headers['x-internal-key'] || '');
        if (!expected || received !== expected) {
            throw new ForbiddenException('Invalid internal API key');
        }
        return this.usageService.commitReservation(body);
    }
}
