import { Injectable, Logger } from '@nestjs/common';
import * as webPush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';

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

  async sendToKurin(kurinId: string, payload: { title: string; body: string; url: string }): Promise<void> {
    // Exclude archived (removed) kurin members — they're locked out of the
    // app (jwt.strategy.ts rejects them) but their devices stay subscribed
    // until deleted, so without this filter they'd keep getting pushed.
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { user: { kurinId, archivedAt: null } },
    });
    const serialized = JSON.stringify(payload);

    await Promise.all(subscriptions.map((sub) => this.sendAndPruneIfGone(sub, serialized)));
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
      // retrying it forever on every future send (pushes are triggered by
      // real events, such as publishing an announcement, not a cron).
      if (statusCode === 404 || statusCode === 410) {
        await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      } else {
        this.logger.error(`Push send failed: statusCode=${statusCode} subscriptionId=${sub.id}`);
      }
    }
  }
}
