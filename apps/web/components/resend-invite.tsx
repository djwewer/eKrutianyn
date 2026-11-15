'use client';

import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import type { InviteResult } from '@/lib/types';

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409) return 'Користувач уже активував акаунт';
  if (error instanceof ApiError && error.status === 404) return 'Користувача не знайдено';
  return 'Не вдалося надіслати запрошення.';
}

/** Badge «Ще не активовано · запрошення надіслано {дата}» + «Надіслати запрошення ще раз». */
export function ResendInvite({
  email,
  lastInviteAt,
  resend,
  onResend,
}: {
  email: string;
  lastInviteAt: string | null;
  resend: { isPending: boolean; isSuccess: boolean; isError: boolean; data?: InviteResult; error?: unknown };
  onResend: () => void;
}) {
  const date = lastInviteAt
    ? new Date(lastInviteAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  return (
    <div className="space-y-1.5">
      <p className="m-0 inline-block rounded-[4px] border border-line px-2 py-1 font-mono text-[.74rem] tracking-[.04em] text-ink-2">
        Ще не активовано{date ? ` · запрошення надіслано ${date}` : ''}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={resend.isPending} onClick={onResend}>
          Надіслати запрошення ще раз
        </Button>
        {resend.data?.inviteSent && (
          <span className="text-xs text-muted-foreground">Запрошення надіслано на {email}</span>
        )}
        {resend.data && !resend.data.inviteSent && (
          <span className="text-xs text-destructive">Не вдалося надіслати запрошення. Спробуйте ще раз.</span>
        )}
        {resend.isError && <span className="text-xs text-destructive">{errorMessage(resend.error)}</span>}
      </div>
    </div>
  );
}
