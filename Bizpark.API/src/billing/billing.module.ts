import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { UsageModule } from '../usage/usage.module';

@Module({
    imports: [UsageModule],
    controllers: [BillingController],
    providers: [BillingService],
})
export class BillingModule {}
