'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
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

  const canToggle = supported && permission !== 'denied';

  return (
    <div className="grid gap-[.3rem]">
      <div className="flex items-center gap-[.9rem]">
        <div className="min-w-0 flex-1">
          <span id="push-toggle-label">Сповіщення</span>
          <small className="block text-[.82rem] text-ink-2">
            {!supported &&
              'Цей браузер не підтримує push-сповіщення. На iPhone: спершу додайте єПластун на головний екран (Поділитися → На початковий екран), і спробуйте ще раз звідти.'}
            {supported &&
              permission === 'denied' &&
              'Сповіщення заблоковано в налаштуваннях браузера для цього сайту — дозвольте їх вручну, щоб увімкнути.'}
            {canToggle &&
              (subscription ? 'Сповіщення увімкнено на цьому пристрої.' : 'Отримуй нагадування навіть коли застосунок закрито.')}
          </small>
        </div>
        {canToggle && (
          <button
            type="button"
            role="switch"
            aria-checked={!!subscription}
            aria-labelledby="push-toggle-label"
            disabled={isPending}
            onClick={subscription ? handleDisable : handleEnable}
            className={cn(
              'relative h-[1.7rem] w-12 shrink-0 cursor-pointer rounded-full transition-colors after:absolute after:top-[.2rem] after:size-[1.3rem] after:rounded-full after:bg-paper after:transition-[left] after:content-[""] disabled:cursor-not-allowed disabled:opacity-50',
              subscription ? 'bg-navy after:left-6' : 'bg-line after:left-[.2rem]',
            )}
          />
        )}
      </div>
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
    </div>
  );
}
