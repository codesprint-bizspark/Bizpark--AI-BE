import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { InternalOrJwtGuard } from '../auth/internal-or-jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantId } from '../tenant/tenant.decorator';
import { MobileAppConfigService } from './mobile-app-config.service';
import { UpdateMobileAppConfigDto } from './dtos';

@ApiTags('Mobile App Config')
@ApiSecurity('TenantId')
@Controller('api/commerce/mobile-app-config')
export class MobileAppConfigController {
  constructor(private readonly configService: MobileAppConfigService) {}

  @ApiOperation({
    summary: 'Get mobile app config',
    description: 'Public — returns branding, colors, and full AI-generated config for the mobile app template.',
  })
  @ApiResponse({ status: 200, description: 'Mobile app config object' })
  @Get()
  async get(@TenantId() tenantId: string) {
    return { success: true, data: await this.configService.get(tenantId) };
  }

  @ApiOperation({
    summary: 'Update mobile app config (Admin / Internal)',
    description: 'Called by the AI agent after generation is approved. Updates branding fields and config blob.',
  })
  @ApiBearerAuth('JWT')
  @ApiResponse({ status: 200, description: 'Updated config' })
  @Patch()
  @UseGuards(InternalOrJwtGuard, RolesGuard)
  @Roles('ADMIN')
  async update(
    @TenantId() tenantId: string,
    @Body() dto: UpdateMobileAppConfigDto,
  ) {
    return { success: true, data: await this.configService.update(tenantId, dto) };
  }
}
