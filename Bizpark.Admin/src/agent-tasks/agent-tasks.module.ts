import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { AgentTasksController } from './agent-tasks.controller';
import { AgentTasksService } from './agent-tasks.service';

@Module({
  imports: [
    AuthModule,
    CommonModule,
    BullModule.registerQueue({
      name: 'agent-queue',
    }),
  ],
  controllers: [AgentTasksController],
  providers: [AgentTasksService],
})
export class AgentTasksModule {}
