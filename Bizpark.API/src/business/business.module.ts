import { Module } from '@nestjs/common';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { AgentModule } from '../agent/agent.module';
import { MediaModule } from '../media/media.module';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [AgentModule, MediaModule, UsageModule],
  providers: [BusinessService],
  controllers: [BusinessController]
})
export class BusinessModule { }
