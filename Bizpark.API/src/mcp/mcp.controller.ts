import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { McpService } from './mcp.service';

type CurrentUserPayload = { id: string; email: string; name: string };

@Controller('api/mcp')
@UseGuards(JwtAuthGuard)
export class McpController {
    constructor(private readonly mcpService: McpService) {}

    @Get('keys')
    listKeys(
        @Query('businessId') businessId: string,
        @CurrentUser() user: CurrentUserPayload,
    ) {
        return this.mcpService.listKeys(businessId, user);
    }

    @Post('keys')
    generateKey(
        @Body() body: { businessId: string; label?: string },
        @CurrentUser() user: CurrentUserPayload,
    ) {
        return this.mcpService.generateKey(body.businessId, body.label, user);
    }

    @Delete('keys/:id')
    revokeKey(
        @Param('id') id: string,
        @Query('businessId') businessId: string,
        @CurrentUser() user: CurrentUserPayload,
    ) {
        return this.mcpService.revokeKey(id, businessId, user);
    }
}
