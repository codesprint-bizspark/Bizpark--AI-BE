import { Module } from '@nestjs/common';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { AgentModule } from '../agent/agent.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [AgentModule, MediaModule],
  providers: [BusinessService],
  controllers: [BusinessController]
})
export class BusinessModule { }
