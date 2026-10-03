'use client';

import { useState } from 'react';
import { useKurin, useChangeProbyProgram } from '@/lib/queries/kurin';
import { useSession } from '@/lib/session-client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { accessErrorMessage } from '@/lib/error-message';
import { useGoogleDriveStatus, useConnectGoogleDrive, useDisconnectGoogleDrive } from '@/lib/queries/google-drive';

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
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
        'Відключити Google Drive? Папку для реманенту доведеться обрати заново після повторного підключення. Вже завантажені фото речей не постраждають.',
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
    <div className="space-y-6 text-sm">
      <div className="space-y-4">
        <h4 className="font-heading text-sm font-semibold">Дані куреня</h4>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <InfoRow label="Назва">{kurin.name}</InfoRow>
          <InfoRow label="Номер">{kurin.kurinNumber}</InfoRow>
          <InfoRow label="Станиця">{kurin.stanytsia}</InfoRow>
          <InfoRow label="Стать">{kurin.gender === 'MALE' ? 'Чоловіча' : 'Жіноча'}</InfoRow>
          <InfoRow label="Пробна програма">{kurin.probyProgram.version === 'OLD' ? 'Стара' : 'Нова'}</InfoRow>
          {canSeeDriveStatus && (
            <InfoRow label="Google Drive">
              <Badge variant={driveStatus.data?.connected ? 'accent' : 'neutral'}>
                {driveStatus.data?.connected ? 'Підключено' : 'Не підключено'}
              </Badge>
            </InfoRow>
          )}
        </div>
      </div>

      {canEdit && !isEditing && (
        <Button size="sm" variant="outline" onClick={startEditing}>
          Редагувати
        </Button>
      )}

      {canEdit && isEditing && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <h4 className="font-heading text-sm font-semibold">Google Drive</h4>
            {driveStatus.data?.connected ? (
              <>
                <p className="text-sm text-muted-foreground">Підключено як: {driveStatus.data.email}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={connectDrive.isPending} onClick={() => connectDrive.mutate()}>
                    Перепідключити
                  </Button>
                  <Button size="sm" variant="outline" disabled={disconnectDrive.isPending} onClick={handleDisconnectDrive}>
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
          <div className="space-y-2">
            <Label>Пробна програма</Label>
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
          </div>
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
            <p className="text-sm text-destructive">{accessErrorMessage(changeProgram.error)}</p>
          )}
        </div>
      )}
    </div>
  );
}
