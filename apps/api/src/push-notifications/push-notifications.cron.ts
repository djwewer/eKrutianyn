import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PushNotificationsService } from './push-notifications.service';

// TEST-ONLY: fires every minute to verify the Web Push pipeline end-to-end
// before any real reminder content exists. Remove this cron (keep the
// service's subscribe/unsubscribe) once real triggers replace it.
@Injectable()
export class PushNotificationsCron {
  constructor(private readonly service: PushNotificationsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleTestTick(): Promise<void> {
    await this.service.sendTestPushToAll();
  }
}
