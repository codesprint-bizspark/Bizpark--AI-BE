import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { GoogleBusinessController } from './google-business.controller';
import { GoogleBusinessService } from './google-business.service';

@Module({
  imports: [AgentModule],
  controllers: [GoogleBusinessController],
  providers: [GoogleBusinessService],
})
export class GoogleBusinessModule {}
