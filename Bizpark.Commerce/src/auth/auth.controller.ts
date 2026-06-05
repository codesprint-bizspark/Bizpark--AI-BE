import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { TenantId } from '../tenant/tenant.decorator';
import { AuthService } from './auth.service';
import { CommerceAdminRegisterDto, CommerceLoginDto, CommerceRegisterDto, UpdateProfileDto } from './dtos';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';

type JwtUser = { id: string; tenantId: string; email: string; role: string };

@ApiTags('Auth')
@ApiSecurity('TenantId')
@Controller('api/commerce/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Bootstrap first admin', description: 'Creates the first ADMIN user for a tenant. Returns 409 if an admin already exists.' })
  @ApiResponse({ status: 201, description: 'Admin created with JWT token' })
  @ApiResponse({ status: 409, description: 'Admin already exists for this tenant' })
  @Post('bootstrap')
  bootstrap(@TenantId() tenantId: string, @Body() dto: CommerceAdminRegisterDto) {
    return this.authService.bootstrapAdmin(tenantId, dto.email, dto.password, dto.name);
  }

  @ApiOperation({ summary: 'Reset admin password', description: 'Internal only — resets the tenant admin password (no old password required).' })
  @ApiResponse({ status: 201, description: 'Returns the admin email' })
  @Post('admin/reset-password')
  @HttpCode(HttpStatus.OK)
  resetAdminPassword(
    @TenantId() tenantId: string,
    @Headers('x-internal-key') internalKey: string,
    @Body() dto: CommerceAdminRegisterDto,
  ) {
    if (!internalKey || internalKey !== process.env.INTERNAL_API_KEY) {
      throw new ForbiddenException('Invalid internal key');
    }
    return this.authService.resetAdminPassword(tenantId, dto.email, dto.password, dto.name);
  }

  @ApiOperation({ summary: 'Register customer', description: 'Public — registers a new CUSTOMER account.' })
  @ApiResponse({ status: 201, description: 'Returns access_token + user object' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @Post('register')
  register(@TenantId() tenantId: string, @Body() dto: CommerceRegisterDto) {
    return this.authService.register(tenantId, dto.email, dto.password, dto.name, 'CUSTOMER');
  }

  @ApiOperation({ summary: 'Create admin user', description: 'ADMIN only — existing admin creates another admin account.' })
  @ApiBearerAuth('JWT')
  @ApiResponse({ status: 201, description: 'Returns access_token + user object' })
  @ApiResponse({ status: 403, description: 'Not an admin' })
  @Post('admin/register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  registerAdmin(@TenantId() tenantId: string, @Body() dto: CommerceAdminRegisterDto) {
    return this.authService.register(tenantId, dto.email, dto.password, dto.name, 'ADMIN');
  }

  @ApiOperation({ summary: 'Login', description: 'Works for both CUSTOMER and ADMIN accounts.' })
  @ApiResponse({ status: 200, description: 'Returns access_token + user object' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@TenantId() tenantId: string, @Body() dto: CommerceLoginDto) {
    return this.authService.login(tenantId, dto.email, dto.password);
  }

  @ApiOperation({ summary: 'Get current user', description: 'Returns the authenticated user profile.' })
  @ApiBearerAuth('JWT')
  @ApiResponse({ status: 200, description: 'Returns { success, data: user }' })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: unknown) {
    return { success: true, data: user };
  }

  @ApiOperation({ summary: 'Update profile', description: 'Update name and/or change password.' })
  @ApiBearerAuth('JWT')
  @ApiResponse({ status: 200, description: 'Returns updated user' })
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@TenantId() tenantId: string, @CurrentUser() user: JwtUser, @Body() dto: UpdateProfileDto) {
    return { success: true, data: await this.authService.updateProfile(tenantId, user.id, dto) };
  }

  @ApiOperation({ summary: 'Logout', description: 'Stateless logout — discard your JWT client-side.' })
  @ApiBearerAuth('JWT')
  @ApiResponse({ status: 200, description: '{ success: true }' })
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout() {
    return { success: true, message: 'Logged out. Please discard your token.' };
  }
}
