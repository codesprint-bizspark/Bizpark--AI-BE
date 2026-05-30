import { Body, Controller, Get, Param, Post, Query, Redirect, Render, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import type { AdminRequest } from '../common/admin-request';
import { UsersService } from './users.service';
import type { UserListQuery } from './users.service';

@Controller('admin/users')
@UseGuards(AdminAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Render('users/index')
  async index(@Req() request: AdminRequest, @Query() query: UserListQuery) {
    const userManagement = await this.usersService.list(query);
    return {
      title: 'Users',
      admin: request.adminUser,
      ...userManagement,
    };
  }

  @Post()
  @Redirect('/admin/users')
  async create(
    @Body() body: { name?: string; email?: string; password?: string },
    @Req() request: AdminRequest,
  ) {
    await this.usersService.create(body, request.adminUser?.id);
  }

  @Post('bulk')
  @Redirect('/admin/users')
  async bulkAction(
    @Body() body: { action?: string; userIds?: string | string[] },
    @Req() request: AdminRequest,
  ) {
    const ids = Array.isArray(body.userIds) ? body.userIds : body.userIds ? [body.userIds] : [];
    if (body.action === 'activate') {
      await this.usersService.bulkUpdateStatus(ids, true, request.adminUser?.id);
    }
    if (body.action === 'suspend') {
      await this.usersService.bulkUpdateStatus(ids, false, request.adminUser?.id);
    }
    if (body.action === 'delete') {
      await this.usersService.bulkDelete(ids, request.adminUser?.id);
    }
  }

  @Get(':id')
  @Render('users/detail')
  async detail(@Param('id') id: string, @Req() request: AdminRequest) {
    return {
      title: 'User Detail',
      admin: request.adminUser,
      user: await this.usersService.detail(id),
    };
  }

  @Post(':id/status')
  @Redirect()
  async updateStatus(
    @Param('id') id: string,
    @Body('isActive') isActive: string,
    @Req() request: AdminRequest,
  ) {
    await this.usersService.updateStatus(id, isActive === 'true', request.adminUser?.id);
    return { url: `/admin/users/${id}` };
  }

  @Post(':id/reset-password')
  @Redirect('/admin/users')
  async resetPassword(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.usersService.resetPassword(id, request.adminUser?.id);
  }

  @Post(':id/delete')
  @Redirect('/admin/users')
  async delete(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.usersService.delete(id, request.adminUser?.id);
  }
}
