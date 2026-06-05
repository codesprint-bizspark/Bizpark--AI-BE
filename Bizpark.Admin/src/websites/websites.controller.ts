import { Body, Controller, Get, Param, Post, Query, Redirect, Render, Req, UseGuards } from '@nestjs/common';
import { WebsiteStatus } from 'bizpark.core';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import type { AdminRequest } from '../common/admin-request';
import { WebsitesService } from './websites.service';
import type { WebsiteListQuery } from './websites.service';

@Controller('admin/websites')
@UseGuards(AdminAuthGuard)
export class WebsitesController {
  constructor(private readonly websitesService: WebsitesService) {}

  @Get()
  @Render('websites/index')
  async index(@Req() request: AdminRequest, @Query() query: WebsiteListQuery) {
    const websiteManagement = await this.websitesService.list(query);
    return {
      title: 'Websites',
      admin: request.adminUser,
      ...websiteManagement,
      statuses: Object.values(WebsiteStatus),
    };
  }

  @Post()
  @Redirect('/admin/websites')
  async create(
    @Body() body: { businessId?: string; domain?: string; templateId?: string; status?: WebsiteStatus },
    @Req() request: AdminRequest,
  ) {
    await this.websitesService.create(body, request.adminUser?.id);
  }

  @Get(':id')
  @Render('websites/detail')
  async detail(@Param('id') id: string, @Req() request: AdminRequest) {
    return {
      title: 'Website Detail',
      admin: request.adminUser,
      website: await this.websitesService.detail(id),
    };
  }

  @Post(':id/publish')
  @Redirect()
  async publish(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.websitesService.publish(id, request.adminUser?.id);
    return { url: `/admin/websites/${id}` };
  }

  @Post(':id/unpublish')
  @Redirect()
  async unpublish(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.websitesService.unpublish(id, request.adminUser?.id);
    return { url: `/admin/websites/${id}` };
  }

  @Post(':id/suspend')
  @Redirect()
  async suspend(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.websitesService.suspend(id, request.adminUser?.id);
    return { url: `/admin/websites/${id}` };
  }

  @Post(':id/redeploy')
  @Redirect()
  async redeploy(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.websitesService.redeploy(id, request.adminUser?.id);
    return { url: `/admin/websites/${id}` };
  }

  @Post(':id/delete')
  @Redirect('/admin/websites')
  async delete(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.websitesService.delete(id, request.adminUser?.id);
  }
}
