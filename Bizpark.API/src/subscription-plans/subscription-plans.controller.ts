import { Controller, Get } from '@nestjs/common';
import { SubscriptionPlansService } from './subscription-plans.service';

@Controller('api/subscription-plans')
export class SubscriptionPlansController {
    constructor(private readonly subscriptionPlansService: SubscriptionPlansService) {}

    @Get()
    async list() {
        return {
            success: true,
            data: await this.subscriptionPlansService.list(),
        };
    }
}
