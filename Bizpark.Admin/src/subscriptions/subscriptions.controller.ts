import { Body, Controller, Get, Param, Post, Redirect, Render, Req, UseGuards } from '@nestjs/common';
import { SubscriptionTier } from 'bizpark.core';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import type { AdminRequest } from '../common/admin-request';
import { SubscriptionsService } from './subscriptions.service';

@Controller('admin/subscriptions')
@UseGuards(AdminAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @Render('subscriptions/index')
  async index(@Req() request: AdminRequest) {
    return {
      title: 'Subscriptions',
      admin: request.adminUser,
      plans: await this.subscriptionsService.getPlans(),
    };
  }

  @Post('plans/:tier')
  @Redirect('/admin/subscriptions')
  async update(
    @Param('tier') tier: SubscriptionTier,
    @Body()
    body: {
      name?: string;
      priceMonthly?: string;
      currency?: string;
      description?: string;
      ctaText?: string;
      isPopular?: string;
      benefits?: string;
    },
    @Req() request: AdminRequest,
  ) {
    await this.subscriptionsService.updatePlan(tier, body, request.adminUser?.id);
  }
}
