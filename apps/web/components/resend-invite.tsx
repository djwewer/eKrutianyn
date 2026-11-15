'use client';

import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import type { InviteResult } from '@/lib/types';

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409) return 'Користувач уже активував акаунт.';
  if (error instanceof ApiError && error.status === 404) return 'Користувача не знайдено.';
  return 'Не вдалося надіслати запрошення.';
}

/** Badge «Ще не активовано · запрошення надіслано {дата}» + «Надіслати запрошення ще раз». */
export function ResendInvite({
  lastInviteAt,
  resend,
  onResend,
}: {
  lastInviteAt: string | null;
  resend: { isPending: boolean };
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
      </div>
    </div>
  );
}

type ResendOutcome = { isError: boolean; data?: InviteResult; error?: unknown };

/** Outcome of the last resend. Render it outside the «не активовано» condition so it survives the refetch that follows a 409/404. */
export function ResendInviteResult({ email, resend }: { email: string; resend: ResendOutcome }) {
  return (
    <>
      {resend.data?.inviteSent && <p className="m-0 text-xs text-muted-foreground">Запрошення надіслано на {email}</p>}
      {resend.data && !resend.data.inviteSent && (
        <p className="m-0 text-xs text-destructive">Не вдалося надіслати запрошення. Спробуйте ще раз.</p>
      )}
      {resend.isError && <p className="m-0 text-xs text-destructive">{errorMessage(resend.error)}</p>}
    </>
  );
}
