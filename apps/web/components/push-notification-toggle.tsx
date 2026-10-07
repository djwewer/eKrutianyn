'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { isPushSupported, getExistingPushSubscription, subscribeToPush } from '@/lib/push-notifications';
import { useSaveSubscription, useRemoveSubscription } from '@/lib/queries/push-notifications';

export function PushNotificationToggle() {
  // Computed once at mount via a lazy initializer (not in an effect): it
  // never changes for the lifetime of this component, so there's nothing to
  // synchronize with an external system here.
  const [supported] = useState(() => isPushSupported());
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const save = useSaveSubscription();
  const remove = useRemoveSubscription();

  useEffect(() => {
    if (!supported) return;
    getExistingPushSubscription().then((sub) => {
      setSubscription(sub);
      setSubscriptionLoaded(true);
    });
  }, [supported]);

  const checking = supported && !subscriptionLoaded;

  async function handleEnable() {
    setActionError(null);
    try {
      const sub = await subscribeToPush();
      await save.mutateAsync(sub.toJSON() as PushSubscriptionJSON);
      setSubscription(sub);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не вдалося увімкнути сповіщення.');
    }
  }

  async function handleDisable() {
    if (!subscription) return;
    setActionError(null);
    try {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await remove.mutateAsync(endpoint);
      setSubscription(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не вдалося вимкнути сповіщення.');
    }
  }

  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
  const isPending = save.isPending || remove.isPending || checking;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Сповіщення</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!supported && (
          <p className="text-sm text-muted-foreground">
            Цей браузер не підтримує push-сповіщення. На iPhone: спершу додайте єПластун на головний екран
            (Поділитися → На початковий екран), і спробуйте ще раз звідти.
          </p>
        )}
        {supported && permission === 'denied' && (
          <p className="text-sm text-muted-foreground">
            Сповіщення заблоковано в налаштуваннях браузера для цього сайту — дозвольте їх вручну, щоб увімкнути.
          </p>
        )}
        {supported && permission !== 'denied' && (
          <>
            <p className="text-sm text-muted-foreground">
              {subscription ? 'Сповіщення увімкнено на цьому пристрої.' : 'Отримуй нагадування навіть коли застосунок закрито.'}
            </p>
            <Button
              size="sm"
              variant={subscription ? 'outline' : 'default'}
              disabled={isPending}
              onClick={subscription ? handleDisable : handleEnable}
            >
              {subscription ? 'Вимкнути сповіщення' : 'Увімкнути сповіщення'}
            </Button>
          </>
        )}
        {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      </CardContent>
    </Card>
  );
}
