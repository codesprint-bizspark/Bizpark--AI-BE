import { Module } from '@nestjs/common';
import { MobileAppConfigController } from './mobile-app-config.controller';
import { MobileAppConfigService } from './mobile-app-config.service';

@Module({
  controllers: [MobileAppConfigController],
  providers: [MobileAppConfigService],
  exports: [MobileAppConfigService],
})
export class MobileAppConfigModule {}
