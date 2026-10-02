'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useKurin, useChangeProbyProgram, useChangeKurinNumber } from '@/lib/queries/kurin';
import { useSession } from '@/lib/session-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accessErrorMessage } from '@/lib/error-message';
import { ApiError } from '@/lib/api-client';
import { useGoogleDriveStatus, useConnectGoogleDrive, useSetGoogleDriveFolder, fetchGoogleDrivePickerToken } from '@/lib/queries/google-drive';
import { openGoogleDriveFolderPicker } from '@/lib/google-picker';

export function KurinInfoSection() {
  const { data: kurin, isLoading } = useKurin();
  const { data: session } = useSession();
  const changeProgram = useChangeProbyProgram(kurin?.id ?? '');
  const changeKurinNumber = useChangeKurinNumber(kurin?.id ?? '');
  const [newKurinNumber, setNewKurinNumber] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<'OLD' | 'NEW'>('OLD');
  const canChangeProgram = session?.role === 'ZVYAZKOVYI';
  const driveStatus = useGoogleDriveStatus(kurin?.id);
  const connectDrive = useConnectGoogleDrive(kurin?.id ?? '');
  const setDriveFolder = useSetGoogleDriveFolder(kurin?.id ?? '');
  const searchParams = useSearchParams();
  const driveConnected = searchParams.get('driveConnected') === '1';
  const driveError = searchParams.get('driveError') === '1';
  const [pickerError, setPickerError] = useState<string | null>(null);

  async function handlePickFolder() {
    if (!kurin) return;
    setPickerError(null);
    try {
      const accessToken = await fetchGoogleDrivePickerToken(kurin.id);
      await openGoogleDriveFolderPicker(accessToken, (folderId, folderName) => {
        setDriveFolder.mutate({ folderId, folderName });
      });
    } catch {
      setPickerError('Не вдалося відкрити вибір папки. Спробуйте підключити Google Drive повторно.');
    }
  }

  useEffect(() => {
    if (kurin) {
      setSelectedVersion(kurin.probyProgram.version);
    }
  }, [kurin]);

  if (isLoading) return <p>Завантаження...</p>;
  if (!kurin) return <p>Не знайдено.</p>;

  return (
    <div className="space-y-6 text-sm">
      <div className="space-y-4">
        <h4 className="font-heading text-sm font-semibold">Дані куреня</h4>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Номер</span>
            <span className="font-medium">{kurin.kurinNumber}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Станиця</span>
            <span className="font-medium">{kurin.stanytsia}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Стать</span>
            <span className="font-medium">{kurin.gender === 'MALE' ? 'Чоловіча' : 'Жіноча'}</span>
          </div>
        </div>
        {canChangeProgram && (
          <div className="space-y-2">
            <Label htmlFor="newKurinNumber">Змінити номер куреня</Label>
            <Input
              id="newKurinNumber"
              value={newKurinNumber}
              onChange={(e) => setNewKurinNumber(e.target.value)}
              placeholder={kurin.kurinNumber}
            />
            <Button
              size="sm"
              disabled={!newKurinNumber || changeKurinNumber.isPending}
              onClick={() =>
                changeKurinNumber.mutate(newKurinNumber, { onSuccess: () => setNewKurinNumber('') })
              }
            >
              Змінити номер
            </Button>
            {changeKurinNumber.isError && (
              <p className="text-sm text-destructive">
                {changeKurinNumber.error instanceof ApiError && changeKurinNumber.error.status === 409
                  ? 'Цей номер уже зайнятий.'
                  : accessErrorMessage(changeKurinNumber.error)}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="space-y-4">
        <h4 className="font-heading text-sm font-semibold">Програма проб</h4>
        <p className="text-sm text-muted-foreground">
          Поточна програма: {kurin.probyProgram.version === 'OLD' ? 'Стара' : 'Нова'}
        </p>
        {canChangeProgram && (
          <div className="space-y-2">
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
            <Button
              disabled={selectedVersion === kurin.probyProgram.version || changeProgram.isPending}
              onClick={() => {
                const label = selectedVersion === 'OLD' ? 'СТАРУ' : 'НОВУ';
                if (window.confirm(`Змінити програму проби куреня на ${label}? Це вплине на прогрес усіх юнаків.`)) {
                  changeProgram.mutate(selectedVersion);
                }
              }}
            >
              Змінити програму
            </Button>
            {changeProgram.isError && (
              <p className="text-sm text-destructive">{accessErrorMessage(changeProgram.error)}</p>
            )}
          </div>
        )}
      </div>
      {canChangeProgram && (
        <div className="space-y-4">
          <h4 className="font-heading text-sm font-semibold">Google Drive</h4>
          {driveConnected && <p className="text-sm text-green-600 dark:text-green-400">Google Drive підключено.</p>}
          {driveError && (
            <p className="text-sm text-destructive">Не вдалося підключити Google Drive. Спробуйте ще раз.</p>
          )}
          {driveStatus.data?.connected ? (
            <>
              <p>Підключено як: {driveStatus.data.email}</p>
              <p>
                Папка для реманенту:{' '}
                {driveStatus.data.folderName ?? <span className="text-muted-foreground">не обрана</span>}
              </p>
              <Button size="sm" variant="outline" onClick={handlePickFolder}>
                {driveStatus.data.folderName ? 'Змінити папку' : 'Обрати папку для реманенту'}
              </Button>
              {pickerError && <p className="text-sm text-destructive">{pickerError}</p>}
            </>
          ) : (
            <>
              <p className="text-muted-foreground">Google Drive не підключено.</p>
              <Button size="sm" disabled={connectDrive.isPending} onClick={() => connectDrive.mutate()}>
                Підключити Google Drive
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
