import { Body, Controller, Get, Param, Post, Query, Redirect, Render, Req, UseGuards } from '@nestjs/common';
import { BusinessStatus, SubscriptionStatus, SubscriptionTier, WebsiteStatus } from 'bizpark.core';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import type { AdminRequest } from '../common/admin-request';
import { BusinessesService } from './businesses.service';
import type { BusinessListQuery } from './businesses.service';

@Controller('admin/businesses')
@UseGuards(AdminAuthGuard)
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Get()
  @Render('businesses/index')
  async index(@Req() request: AdminRequest, @Query() query: BusinessListQuery) {
    const businessManagement = await this.businessesService.list(query);
    return {
      title: 'Businesses',
      admin: request.adminUser,
      ...businessManagement,
      statuses: Object.values(BusinessStatus),
      subscriptionTiers: Object.values(SubscriptionTier),
      websiteStatuses: Object.values(WebsiteStatus),
    };
  }

  @Post()
  @Redirect('/admin/businesses')
  async create(
    @Body()
    body: {
      name?: string;
      category?: string;
      description?: string;
      subscriptionTier?: SubscriptionTier;
      status?: BusinessStatus;
    },
    @Req() request: AdminRequest,
  ) {
    await this.businessesService.create(body, request.adminUser?.id);
  }

  @Post('bulk')
  @Redirect('/admin/businesses')
  async bulkAction(
    @Body() body: { action?: string; businessIds?: string | string[] },
    @Req() request: AdminRequest,
  ) {
    const ids = Array.isArray(body.businessIds) ? body.businessIds : body.businessIds ? [body.businessIds] : [];
    if (body.action === 'activate') {
      await this.businessesService.bulkUpdateStatus(ids, BusinessStatus.ACTIVE, request.adminUser?.id);
    }
    if (body.action === 'suspend') {
      await this.businessesService.bulkUpdateStatus(ids, BusinessStatus.SUSPENDED, request.adminUser?.id);
    }
    if (body.action === 'delete') {
      await this.businessesService.bulkDelete(ids, request.adminUser?.id);
    }
  }

  @Get(':id')
  @Render('businesses/detail')
  async detail(@Param('id') id: string, @Req() request: AdminRequest) {
    return {
      title: 'Business Detail',
      admin: request.adminUser,
      business: await this.businessesService.detail(id),
      businessStatuses: Object.values(BusinessStatus),
      subscriptionTiers: Object.values(SubscriptionTier),
      subscriptionStatuses: Object.values(SubscriptionStatus),
    };
  }

  @Post(':id/status')
  @Redirect()
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: BusinessStatus,
    @Req() request: AdminRequest,
  ) {
    await this.businessesService.updateStatus(id, status, request.adminUser?.id);
    return { url: `/admin/businesses/${id}` };
  }

  @Post(':id/delete')
  @Redirect('/admin/businesses')
  async delete(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.businessesService.delete(id, request.adminUser?.id);
  }

  @Post(':id/subscription')
  @Redirect()
  async updateSubscription(
    @Param('id') id: string,
    @Body() body: { tier: SubscriptionTier; status: SubscriptionStatus; expiresAt?: string },
    @Req() request: AdminRequest,
  ) {
    await this.businessesService.updateSubscription(id, body, request.adminUser?.id);
    return { url: `/admin/businesses/${id}` };
  }
}
