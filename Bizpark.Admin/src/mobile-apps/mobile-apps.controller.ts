import { Body, Controller, Get, Param, Post, Redirect, Render, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import type { AdminRequest } from '../common/admin-request';
import { MobileAppsService } from './mobile-apps.service';

@Controller('admin/mobile-apps')
@UseGuards(AdminAuthGuard)
export class MobileAppsController {
  constructor(private readonly mobileAppsService: MobileAppsService) {}

  @Get()
  @Render('mobile-apps/index')
  async index(@Req() request: AdminRequest) {
    const data = await this.mobileAppsService.listStoreRequests();
    return {
      title: 'Mobile App Store Requests',
      admin: request.adminUser,
      ...data,
    };
  }

  @Post(':id/update')
  @Redirect('/admin/mobile-apps')
  async update(
    @Param('id') id: string,
    @Body() body: { storeStatus?: string; playStoreUrl?: string; appStoreUrl?: string; storeNote?: string },
    @Req() request: AdminRequest,
  ) {
    await this.mobileAppsService.updateStore(id, body, request.adminUser?.id);
  }
}
