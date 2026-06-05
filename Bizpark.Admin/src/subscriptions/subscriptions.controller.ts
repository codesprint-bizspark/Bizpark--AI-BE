import { Body, Controller, Get, Param, Post, Redirect, Render, Req, UseGuards } from '@nestjs/common';
import {
  SubscriptionPlanType,
  SubscriptionPlanVisibility,
} from 'bizpark.core';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import type { AdminRequest } from '../common/admin-request';
import { SubscriptionsService } from './subscriptions.service';
import type { SubscriptionPlanFormInput } from './subscriptions.service';

@Controller('admin/subscriptions')
@UseGuards(AdminAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @Render('subscriptions/index')
  async index(@Req() request: AdminRequest) {
    const plans = await this.subscriptionsService.getPlans();

    return {
      title: 'Subscriptions',
      admin: request.adminUser,
      plans,
      totalPlans: plans.length,
      planTypes: Object.values(SubscriptionPlanType),
      planStatuses: Object.values(SubscriptionPlanVisibility),
      timezones: this.subscriptionsService.getTimezones(),
    };
  }

  @Post('plans')
  @Redirect('/admin/subscriptions')
  async create(@Body() body: SubscriptionPlanFormInput, @Req() request: AdminRequest) {
    await this.subscriptionsService.createPlan(body, request.adminUser?.id);
  }

  @Post('plans/:id')
  @Redirect('/admin/subscriptions')
  async update(
    @Param('id') id: string,
    @Body() body: SubscriptionPlanFormInput,
    @Req() request: AdminRequest,
  ) {
    await this.subscriptionsService.updatePlan(id, body, request.adminUser?.id);
  }

  @Post('plans/:id/delete')
  @Redirect('/admin/subscriptions')
  async delete(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.subscriptionsService.deletePlan(id, request.adminUser?.id);
  }

  @Post('plans/:id/toggle')
  @Redirect('/admin/subscriptions')
  async toggle(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.subscriptionsService.togglePlan(id, request.adminUser?.id);
  }
}
