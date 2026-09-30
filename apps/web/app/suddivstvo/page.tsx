'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useKurin } from '@/lib/queries/kurin';
import { accessErrorMessage } from '@/lib/error-message';
import { fetchGoogleDrivePickerToken } from '@/lib/queries/google-drive';
import { openGoogleSheetPicker } from '@/lib/google-picker';
import { useJunakImportStatus, useSetJunakImportSpreadsheet } from '@/lib/queries/junak-import';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function SuddivstvoPage() {
  const { data: session } = useSession();
  const { data: kurin } = useKurin();
  const kurinId = kurin?.id;
  const canManageJudgeBook = session?.role === 'ZVYAZKOVYI';
  const junakImportStatus = useJunakImportStatus(kurinId);
  const setJunakImportSpreadsheet = useSetJunakImportSpreadsheet(kurinId ?? '');
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
                <Button size="sm" variant="outline" onClick={handleConnectJudgeBook}>
                  Змінити таблицю
                </Button>
              )}
              <div>
                <a href="/suddivstvo/junak-import" className="underline">
                  Імпортувати юнаків з цієї таблиці
                </a>
              </div>
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
    </div>
  );
}
