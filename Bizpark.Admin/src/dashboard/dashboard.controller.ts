import { Controller, Get, Render, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import type { AdminRequest } from '../common/admin-request';
import { DashboardService } from './dashboard.service';

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @Render('dashboard')
  async dashboard(@Req() request: AdminRequest) {
    const commandCenter = await this.dashboardService.getCommandCenter();
    return {
      title: 'Dashboard',
      admin: request.adminUser,
      dashboard: commandCenter,
    };
  }
}
