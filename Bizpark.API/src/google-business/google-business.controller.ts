import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { GoogleBusinessService } from './google-business.service';

type CurrentUserPayload = { id: string; email: string; name: string };

@Controller('api/google-business')
@UseGuards(JwtAuthGuard)
export class GoogleBusinessController {
  constructor(private readonly googleBusinessService: GoogleBusinessService) {}

  @Get('status')
  getStatus(@Query('businessId') businessId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.googleBusinessService.getStatus(businessId, user);
  }

  @Post('connect/mock')
  connectMock(@Body() body: { businessId: string }, @CurrentUser() user: CurrentUserPayload) {
    return this.googleBusinessService.connectMock(body.businessId, user);
  }

  @Get('locations')
  listLocations(@Query('businessId') businessId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.googleBusinessService.listLocations(businessId, user);
  }

  @Post('locations/select')
  selectLocation(
    @Body() body: { businessId: string; locationName: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.googleBusinessService.selectLocation(body.businessId, body.locationName, user);
  }

  @Post('reviews/sync')
  syncReviews(@Body() body: { businessId: string }, @CurrentUser() user: CurrentUserPayload) {
    return this.googleBusinessService.syncReviews(body.businessId, user);
  }

  @Get('reviews')
  listReviews(@Query('businessId') businessId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.googleBusinessService.listReviews(businessId, user);
  }

  @Post('reviews/:reviewId/approve')
  approveReply(
    @Param('reviewId') reviewId: string,
    @Body() body: { replyText?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.googleBusinessService.approveReply(reviewId, body.replyText, user);
  }
}
