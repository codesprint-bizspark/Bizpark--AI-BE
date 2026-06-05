import { Module } from '@nestjs/common';
import { InternalUsageController, UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
    controllers: [UsageController, InternalUsageController],
    providers: [UsageService],
    exports: [UsageService],
})
export class UsageModule {}
