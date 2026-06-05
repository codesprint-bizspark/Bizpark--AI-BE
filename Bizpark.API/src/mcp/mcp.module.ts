import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { UsageModule } from '../usage/usage.module';

@Module({
    imports: [UsageModule],
    controllers: [McpController],
    providers: [McpService],
})
export class McpModule {}
