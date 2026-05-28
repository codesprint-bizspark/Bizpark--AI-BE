import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { CheckoutModule } from './checkout/checkout.module';
import { CustomersModule } from './customers/customers.module';
import { InventoryModule } from './inventory/inventory.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { WebsiteConfigModule } from './website-config/website-config.module';
import { MobileAppConfigModule } from './mobile-app-config/mobile-app-config.module';
import { COMMERCE_JOBS_QUEUE } from './queues/queue.constants';
import { ShippingModule } from './shipping/shipping.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TenantModule } from './tenant/tenant.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { TenantDbModule } from './db/tenant-db.module';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = Number(process.env.REDIS_PORT || 6379);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TenantDbModule,
    BullModule.forRoot({
      connection: {
        host: redisHost,
        port: Number.isNaN(redisPort) ? 6379 : redisPort,
      },
    }),
    BullModule.registerQueue({
      name: COMMERCE_JOBS_QUEUE,
    }),
    TenantModule,
    AuthModule,
    CatalogModule,
    InventoryModule,
    CustomersModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    ShippingModule,
    SubscriptionsModule,
    PaymentsModule,
    WebsiteConfigModule,
    MobileAppConfigModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes({
      path: '*',
      method: RequestMethod.ALL,
    });
  }
}
