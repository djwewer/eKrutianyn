'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useKurin, useChangeProbyProgram, useChangeKurinNumber } from '@/lib/queries/kurin';
import { useSession } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accessErrorMessage } from '@/lib/error-message';
import { ApiError } from '@/lib/api-client';
import { useGoogleDriveStatus, useConnectGoogleDrive, useSetGoogleDriveFolder, fetchGoogleDrivePickerToken } from '@/lib/queries/google-drive';
import { openGoogleDriveFolderPicker } from '@/lib/google-picker';

export default function KurinPage() {
  return (
    <Suspense fallback={<p>Завантаження...</p>}>
      <KurinPageContent />
    </Suspense>
  );
}

function KurinPageContent() {
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
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{kurin.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Дані куреня</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>Номер: {kurin.kurinNumber}</p>
          <p>Станиця: {kurin.stanytsia}</p>
          <p>Стать: {kurin.gender === 'MALE' ? 'Чоловіча' : 'Жіноча'}</p>
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
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Програма проб</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>
      {canChangeProgram && (
        <Card>
          <CardHeader>
            <CardTitle>Google Drive</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {driveConnected && <p className="text-sm text-green-600">Google Drive підключено.</p>}
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
