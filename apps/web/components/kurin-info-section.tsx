'use client';

import { useState } from 'react';
import { useKurin, useChangeProbyProgram } from '@/lib/queries/kurin';
import { useSession } from '@/lib/session-client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api-client';
import { accessErrorMessage } from '@/lib/error-message';
import { useGoogleDriveStatus, useConnectGoogleDrive, useDisconnectGoogleDrive } from '@/lib/queries/google-drive';

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[.7rem] tracking-[.06em] text-ink-2 uppercase">{label}</dt>
      <dd className="m-0 mt-[.1rem] font-bold [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export function KurinInfoSection() {
  const { data: kurin, isLoading } = useKurin();
  const { data: session } = useSession();
  const changeProgram = useChangeProbyProgram(kurin?.id ?? '');
  const [selectedVersion, setSelectedVersion] = useState<'OLD' | 'NEW'>(kurin?.probyProgram.version ?? 'OLD');
  const [isEditing, setIsEditing] = useState(false);
  const canEdit = session?.role === 'ZVYAZKOVYI';
  const canSeeDriveStatus = canEdit || !!session?.positions.includes('INTENDANT');
  const driveStatus = useGoogleDriveStatus(canSeeDriveStatus ? kurin?.id : undefined);
  const connectDrive = useConnectGoogleDrive(kurin?.id ?? '');
  const disconnectDrive = useDisconnectGoogleDrive(kurin?.id ?? '');

  if (isLoading) return <p>Завантаження...</p>;
  if (!kurin) return <p>Не знайдено.</p>;

  function handleDisconnectDrive() {
    if (
      window.confirm(
        'Відключити Google Drive? Папки для реманенту й писарства доведеться обрати заново після повторного підключення. Вже завантажені фото речей і документи не постраждають.',
      )
    ) {
      disconnectDrive.mutate();
    }
  }

  function startEditing() {
    setSelectedVersion(kurin!.probyProgram.version);
    setIsEditing(true);
  }

  return (
    <div className="space-y-[.9rem]">
      <div className="space-y-4">
        <h4 className="sr-only">Дані куреня</h4>
        <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-[1.2rem] gap-y-[.8rem]">
          <InfoRow label="Назва">{kurin.name}</InfoRow>
          <InfoRow label="Номер">{kurin.kurinNumber ?? 'Підготовчий (ще не присвоєно)'}</InfoRow>
          <InfoRow label="Станиця">{kurin.stanytsia}</InfoRow>
          <InfoRow label="Стать">{kurin.gender === 'MALE' ? 'Чоловіча' : 'Жіноча'}</InfoRow>
          <InfoRow label="Програма проби">{kurin.probyProgram.version === 'OLD' ? 'Стара' : 'Нова'}</InfoRow>
          {canSeeDriveStatus && (
            <InfoRow label="Google Drive">
              <Badge variant={driveStatus.data?.connected ? 'ok' : 'mute'}>
                {driveStatus.data?.connected ? 'Підключено' : 'Не підключено'}
              </Badge>
            </InfoRow>
          )}
        </dl>
      </div>

      {canEdit && !isEditing && (
        <Button size="sm" variant="outline" onClick={startEditing}>
          Редагувати
        </Button>
      )}

      {canEdit && isEditing && (
        <div className="space-y-4 rounded-[6px] border border-line bg-background p-4">
          <div className="space-y-2">
            <h4 className="font-display text-[1.05rem] font-semibold tracking-[.02em]">Google Drive</h4>
            {driveStatus.data?.connected ? (
              <>
                <p className="text-sm text-ink-2">Підключено як: {driveStatus.data.email}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={connectDrive.isPending} onClick={() => connectDrive.mutate()}>
                    Перепідключити
                  </Button>
                  <Button size="sm" variant="destructive" disabled={disconnectDrive.isPending} onClick={handleDisconnectDrive}>
                    Відключити
                  </Button>
                </div>
                {disconnectDrive.isError && (
                  <p className="text-sm text-destructive">Не вдалося відключити Google Drive. Спробуйте ще раз.</p>
                )}
              </>
            ) : (
              <Button size="sm" disabled={connectDrive.isPending} onClick={() => connectDrive.mutate()}>
                Підключити Google Drive
              </Button>
            )}
          </div>
          <fieldset className="m-0 min-w-0 space-y-2 border-0 p-0">
            <legend className="mb-2 flex items-center gap-2 text-sm leading-none font-medium">Програма проби</legend>
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="programOld"
                name="probyProgramVersion"
                value="OLD"
                checked={selectedVersion === 'OLD'}
                onChange={() => setSelectedVersion('OLD')}
              />
              <Label htmlFor="programOld">Стара програма</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="programNew"
                name="probyProgramVersion"
                value="NEW"
                checked={selectedVersion === 'NEW'}
                onChange={() => setSelectedVersion('NEW')}
              />
              <Label htmlFor="programNew">Нова програма</Label>
            </div>
          </fieldset>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={selectedVersion === kurin.probyProgram.version || changeProgram.isPending}
              onClick={() => {
                const label = selectedVersion === 'OLD' ? 'СТАРУ' : 'НОВУ';
                if (window.confirm(`Змінити програму проби куреня на ${label}? Це вплине на прогрес усіх юнаків.`)) {
                  changeProgram.mutate(selectedVersion, { onSuccess: () => setIsEditing(false) });
                }
              }}
            >
              Зберегти
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
              Скасувати
            </Button>
          </div>
          {changeProgram.isError && (
            <p className="text-sm text-destructive">
              {changeProgram.error instanceof ApiError && changeProgram.error.status === 404
                ? 'Такої версії програми проби немає в каталозі. Зверніться до адміністратора.'
                : accessErrorMessage(changeProgram.error)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
