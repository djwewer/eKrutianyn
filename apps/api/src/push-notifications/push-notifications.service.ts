import { Injectable, Logger } from '@nestjs/common';
import * as webPush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';

const TEST_NOTIFICATION_TITLE = 'єПластун (тест)';
const TEST_NOTIFICATION_BODY = 'Тестове push-сповіщення — якщо ти це бачиш, все працює.';

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {
    // VAPID details are process-wide (the web-push lib has no per-call way to
    // pass them), so they're set once here rather than per sendNotification call.
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
      process.env.VAPID_PUBLIC_KEY ?? '',
      process.env.VAPID_PRIVATE_KEY ?? '',
    );
  }

  async subscribe(dto: CreatePushSubscriptionDto, actor: CurrentUserPayload): Promise<void> {
    // Upsert on endpoint (not userId): the same browser subscription can only
    // ever belong to one user, and re-subscribing (e.g. after a permission
    // reset) should update who owns it rather than create a duplicate row.
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId: actor.userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      update: {
        userId: actor.userId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
  }

  async unsubscribe(endpoint: string, actor: CurrentUserPayload): Promise<void> {
    // Scoped to the actor so one user can't unsubscribe another's device by
    // guessing/observing an endpoint URL.
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId: actor.userId } });
  }

  // Test-only: fires on a 1-minute cron (see push-notifications.cron.ts) to
  // verify the whole subscribe -> deliver -> show pipeline end-to-end before
  // any real reminder content is wired up.
  async sendTestPushToAll(): Promise<void> {
    const subscriptions = await this.prisma.pushSubscription.findMany();
    const payload = JSON.stringify({ title: TEST_NOTIFICATION_TITLE, body: TEST_NOTIFICATION_BODY });

    await Promise.all(subscriptions.map((sub) => this.sendAndPruneIfGone(sub, payload)));
  }

  private async sendAndPruneIfGone(
    sub: { id: string; endpoint: string; p256dh: string; auth: string },
    payload: string,
  ): Promise<void> {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      // 404/410 mean the browser has unsubscribed or the endpoint expired —
      // the subscription is permanently dead, so delete it instead of
      // retrying it forever on every future cron tick.
      if (statusCode === 404 || statusCode === 410) {
        await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      } else {
        this.logger.error(`Push send failed: statusCode=${statusCode} subscriptionId=${sub.id}`);
      }
    }
  }
}
