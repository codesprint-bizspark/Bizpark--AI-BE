import { Module } from '@nestjs/common';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { StorefrontController } from './storefront.controller';
import { SubdomainService } from './subdomain.service';
import { CloudflareService } from './cloudflare.service';
import { AgentModule } from '../agent/agent.module';
import { MediaModule } from '../media/media.module';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [AgentModule, MediaModule, UsageModule],
  providers: [BusinessService, SubdomainService, CloudflareService],
  controllers: [BusinessController, StorefrontController],
})
export class BusinessModule { }
