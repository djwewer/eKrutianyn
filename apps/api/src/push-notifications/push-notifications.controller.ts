import { Body, Controller, Delete, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PushNotificationsService } from './push-notifications.service';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { UnsubscribePushDto } from './dto/unsubscribe-push.dto';

@UseGuards(JwtAuthGuard)
@Controller('push-subscriptions')
export class PushNotificationsController {
  constructor(private readonly service: PushNotificationsService) {}

  @Post()
  @HttpCode(204)
  async subscribe(@Body() dto: CreatePushSubscriptionDto, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.service.subscribe(dto, user);
  }

  @Delete()
  @HttpCode(204)
  async unsubscribe(@Body() dto: UnsubscribePushDto, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.service.unsubscribe(dto.endpoint, user);
  }
}
