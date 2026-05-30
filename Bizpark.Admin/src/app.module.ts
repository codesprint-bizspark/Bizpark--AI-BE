import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { BusinessesModule } from './businesses/businesses.module';
import { UsersModule } from './users/users.module';
import { WebsitesModule } from './websites/websites.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { AgentTasksModule } from './agent-tasks/agent-tasks.module';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = Number(process.env.REDIS_PORT || 6379);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: redisHost,
        port: Number.isNaN(redisPort) ? 6379 : redisPort,
      },
    }),
    AuthModule,
    DashboardModule,
    BusinessesModule,
    UsersModule,
    WebsitesModule,
    SubscriptionsModule,
    AgentTasksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
