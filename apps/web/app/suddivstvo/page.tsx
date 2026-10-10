'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/lib/session-client';
import { useKurin } from '@/lib/queries/kurin';
import { accessErrorMessage } from '@/lib/error-message';
import { ApiError } from '@/lib/api-client';
import { fetchGoogleDrivePickerToken } from '@/lib/queries/google-drive';
import { openGoogleSheetPicker } from '@/lib/google-picker';
import {
  useJunakImportStatus,
  useSetJunakImportSpreadsheet,
  useSyncJudgeBookNow,
} from '@/lib/queries/junak-import';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/** The sync endpoint's 400/503 bodies carry a specific, actionable message (Google error, missing mapping...) — show it as is. */
function syncErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status !== 403) {
    const message = (error.body as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message) return message;
  }
  return accessErrorMessage(error) ?? 'Не вдалося записати в таблицю.';
}

export default function SuddivstvoPage() {
  const { data: session } = useSession();
  const { data: kurin } = useKurin();
  const kurinId = kurin?.id;
  const canManageJudgeBook = session?.role === 'ZVYAZKOVYI';
  const junakImportStatus = useJunakImportStatus(kurinId);
  const setJunakImportSpreadsheet = useSetJunakImportSpreadsheet(kurinId ?? '');
  const syncNow = useSyncJudgeBookNow(kurinId ?? '');
  const [bookConnectError, setBookConnectError] = useState<string | null>(null);

  async function handleConnectJudgeBook() {
    if (!kurinId) return;
    setBookConnectError(null);
    try {
      const accessToken = await fetchGoogleDrivePickerToken(kurinId);
      await openGoogleSheetPicker(accessToken, (spreadsheetId, spreadsheetName) => {
        setJunakImportSpreadsheet.mutate({ spreadsheetId, spreadsheetName });
      });
    } catch {
      setBookConnectError('Не вдалося підключити таблицю. Спробуйте ще раз.');
    }
  }

  if (!kurinId) return <p>Завантаження...</p>;
  if (junakImportStatus.isError) {
    return <p className="text-sm text-destructive">{accessErrorMessage(junakImportStatus.error)}</p>;
  }

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Суддівство</h1>
      <Card>
        <CardHeader>
          <CardTitle>Книга судді</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {junakImportStatus.data?.connectedSpreadsheetId ? (
            <>
              <p>Підключена таблиця: {junakImportStatus.data.connectedSpreadsheetName}</p>
              {canManageJudgeBook && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={handleConnectJudgeBook}>
                    Змінити таблицю
                  </Button>
                  <Button size="sm" variant="outline" disabled={syncNow.isPending} onClick={() => syncNow.mutate()}>
                    {syncNow.isPending ? 'Записую...' : 'Записати зміни в таблицю зараз'}
                  </Button>
                </div>
              )}
              {syncNow.isError && (
                <p className="text-sm text-destructive">{syncErrorMessage(syncNow.error)}</p>
              )}
              {syncNow.data && (
                <div className="space-y-1 rounded bg-muted p-2" data-testid="sync-report">
                  <p className="font-medium">
                    {syncNow.data.updatedCells > 0
                      ? `Записано комірок: ${syncNow.data.updatedCells} (юнаків: ${syncNow.data.syncedJunaky})`
                      : 'Нічого записувати — таблиця вже актуальна або немає що передавати.'}
                  </p>
                  <p className="text-muted-foreground">
                    Привʼязано до рядків таблиці: {syncNow.data.linkedJunaky}. Без рядка в таблиці:{' '}
                    {syncNow.data.unlinkedJunaky} (для них нічого не записується).
                  </p>
                  {syncNow.data.skipped.length > 0 && (
                    <div>
                      <p className="font-medium text-destructive">Пропущено: {syncNow.data.skipped.length}</p>
                      <ul className="list-disc pl-5">
                        {syncNow.data.skipped.map((item) => (
                          <li key={`${item.row}-${item.junakName}`}>
                            {item.junakName}: {item.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-muted-foreground">Книга судді не підключена.</p>
              {canManageJudgeBook && (
                <Button size="sm" disabled={setJunakImportSpreadsheet.isPending} onClick={handleConnectJudgeBook}>
                  Підключити Книгу судді
                </Button>
              )}
            </>
          )}
          {bookConnectError && <p className="text-sm text-destructive">{bookConnectError}</p>}
        </CardContent>
      </Card>
      {junakImportStatus.data?.connectedSpreadsheetId && (
        <Link href="/suddivstvo/junak-import" className="block">
          <Button className="w-full" size="lg">
            Імпортувати юнаків з таблиці Книги судді
          </Button>
        </Link>
      )}
    </div>
  );
}
