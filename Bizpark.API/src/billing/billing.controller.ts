import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BillingService } from './billing.service';

type CurrentUserPayload = { id: string; email: string; name: string };

@Controller('api/billing')
export class BillingController {
    constructor(private readonly billingService: BillingService) {}

    @Post('checkout')
    @UseGuards(JwtAuthGuard)
    createCheckout(
        @Body() body: { businessId: string; planId: string },
        @CurrentUser() user: CurrentUserPayload,
    ) {
        return this.billingService.createCheckout(body.businessId, body.planId, user);
    }

    // Public — PayHere posts here server-to-server. No auth guard.
    @Post('notify')
    handleNotify(@Req() req: Request) {
        return this.billingService.handleNotify(req.body as Record<string, string>);
    }

    @Get('status')
    @UseGuards(JwtAuthGuard)
    getStatus(@Query('businessId') businessId: string, @CurrentUser() user: CurrentUserPayload) {
        return this.billingService.getStatus(businessId, user);
    }
}
