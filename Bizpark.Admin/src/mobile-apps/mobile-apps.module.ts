import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { MobileAppsController } from './mobile-apps.controller';
import { MobileAppsService } from './mobile-apps.service';

@Module({
  imports: [AuthModule, CommonModule],
  controllers: [MobileAppsController],
  providers: [MobileAppsService],
})
export class MobileAppsModule {}
