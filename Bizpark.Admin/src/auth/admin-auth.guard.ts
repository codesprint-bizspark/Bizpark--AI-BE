import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { AdminRequest } from '../common/admin-request';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AdminRequest>();
    const response = http.getResponse<Response>();
    const token = request.cookies?.admin_token;

    if (!token) {
      response.redirect('/admin/login');
      return false;
    }

    try {
      request.adminUser = await this.authService.verifyToken(token);
      return true;
    } catch {
      response.clearCookie('admin_token');
      response.redirect('/admin/login');
      return false;
    }
  }
}
