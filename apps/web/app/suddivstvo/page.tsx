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
  useDisconnectJunakImportSpreadsheet,
  useJunakImportStatus,
  useSetJunakImportSpreadsheet,
  useSyncJudgeBookNow,
} from '@/lib/queries/junak-import';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';

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
  const canManageJudgeBook = session?.role === 'ZVYAZKOVYI' || !!session?.positions?.includes('SUDDIA');
  const junakImportStatus = useJunakImportStatus(kurinId);
  const needsDriveFirst = session?.role !== 'ZVYAZKOVYI' && junakImportStatus.data?.driveConnected === false;
  const setJunakImportSpreadsheet = useSetJunakImportSpreadsheet(kurinId ?? '');
  const disconnect = useDisconnectJunakImportSpreadsheet(kurinId ?? '');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
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
    return <p className="text-sm text-late">{accessErrorMessage(junakImportStatus.error)}</p>;
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Суддівство" subtitle="Книга судді: прогрес проб і ступенів синхронізується з таблицею" />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-2">
          <CardTitle>Книга судді</CardTitle>
          <Badge variant={junakImportStatus.data?.connectedSpreadsheetId ? 'ok' : 'mute'}>
            {junakImportStatus.data?.connectedSpreadsheetId ? 'Підключено' : 'Не підключено'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {junakImportStatus.data?.connectedSpreadsheetId ? (
            <>
              <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-[1.2rem] gap-y-[.8rem]">
                <div>
                  <dt className="font-mono text-[.7rem] tracking-[.06em] text-ink-2 uppercase">Підключена таблиця</dt>
                  <dd className="m-0 mt-[.1rem] font-bold [overflow-wrap:anywhere]">
                    {junakImportStatus.data.connectedSpreadsheetName}
                  </dd>
                </div>
              </dl>
              {canManageJudgeBook && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleConnectJudgeBook}>
                    Змінити таблицю
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      disconnect.reset();
                      setConfirmDisconnect(true);
                    }}
                  >
                    Відʼєднати таблицю
                  </Button>
                  <Button variant="signal" disabled={syncNow.isPending} onClick={() => syncNow.mutate()}>
                    {syncNow.isPending ? 'Записую...' : 'Записати зміни в таблицю зараз'}
                  </Button>
                </div>
              )}
              {syncNow.isError && (
                <p className="text-sm text-late">{syncErrorMessage(syncNow.error)}</p>
              )}
              {syncNow.data && (
                <div className="space-y-1 rounded-[4px] border border-line bg-bg p-3" data-testid="sync-report">
                  <p className="font-medium">
                    {syncNow.data.updatedCells > 0
                      ? `Записано комірок: ${syncNow.data.updatedCells} (юнаків: ${syncNow.data.syncedJunaky})`
                      : 'Нічого записувати — таблиця вже актуальна або немає що передавати.'}
                  </p>
                  <p className="text-ink-2">
                    Привʼязано до рядків таблиці: {syncNow.data.linkedJunaky}. Без рядка в таблиці:{' '}
                    {syncNow.data.unlinkedJunaky} (для них нічого не записується).
                  </p>
                  {syncNow.data.skipped.length > 0 && (
                    <div>
                      <p className="font-medium text-late">Пропущено: {syncNow.data.skipped.length}</p>
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
              <p className="text-ink-2">Книга судді не підключена.</p>
              {canManageJudgeBook &&
                (needsDriveFirst ? (
                  <p className="text-ink-2">Спершу звʼязковий має підключити Google Drive куреня.</p>
                ) : (
                  <Button disabled={setJunakImportSpreadsheet.isPending} onClick={handleConnectJudgeBook}>
                    Підключити Книгу судді
                  </Button>
                ))}
            </>
          )}
          {bookConnectError && <p className="text-sm text-late">{bookConnectError}</p>}
        </CardContent>
      </Card>
      {confirmDisconnect && (
        <Dialog open onOpenChange={(open) => !open && setConfirmDisconnect(false)}>
          <DialogContent>
            <DialogTitle>Відʼєднати таблицю?</DialogTitle>
            <p className="text-sm">
              Синхронізація з таблицею зупиниться. Якщо підключите таблицю знову, відповідність колонок доведеться налаштувати заново.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDisconnect(false)}>
                Скасувати
              </Button>
              <Button disabled={disconnect.isPending} onClick={() => disconnect.mutate(undefined, { onSettled: () => setConfirmDisconnect(false) })}>
                Відʼєднати таблицю
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {disconnect.isError && <p className="text-sm text-late">Не вдалося відʼєднати таблицю.</p>}
      {junakImportStatus.data?.connectedSpreadsheetId && (
        <Link
          href="/suddivstvo/junak-import"
          className="block rounded-[6px] border border-line bg-paper p-4 no-underline transition-colors hover:border-navy"
        >
          <b className="block font-display text-[1.05rem] font-semibold tracking-[.01em] uppercase">
            Імпортувати юнаків з таблиці Книги судді
          </b>
          <span className="text-[.9rem] text-ink-2">Нові юнаки і оновлення з Книги судді — перегляд перед імпортом.</span>
        </Link>
      )}
    </div>
  );
}
