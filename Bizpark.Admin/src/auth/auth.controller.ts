import { Body, Controller, Get, Post, Query, Render, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';

@Controller('admin')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('login')
  @Render('login')
  loginPage(@Query('error') error?: string) {
    return {
      title: 'Admin Login',
      error,
      bootstrapEmail: process.env.ADMIN_EMAIL || 'admin@bizpark.local',
    };
  }

  @Post('login')
  async login(
    @Body('email') email: string,
    @Body('password') password: string,
    @Res() response: Response,
  ) {
    try {
      const session = await this.authService.login(email || '', password || '');
      response.cookie('admin_token', session.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.SECURE_COOKIE === 'true',
        maxAge: 8 * 60 * 60 * 1000,
      });
      return response.redirect('/admin');
    } catch {
      return response.redirect('/admin/login?error=Invalid%20admin%20credentials');
    }
  }

  @Post('logout')
  logout(@Res() response: Response) {
    response.clearCookie('admin_token');
    return response.redirect('/admin/login');
  }
}
