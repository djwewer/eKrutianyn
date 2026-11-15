'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import {
  useApprovalRequest,
  useApproveRequest,
  useRejectRequest,
} from '@/lib/queries/approval-requests-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { accessErrorMessage } from '@/lib/error-message';
import { BulkImportRequestView } from '@/components/bulk-import-request-view';

const ACTION_LABELS: Record<string, string> = {
  CHANGE_FULL_NAME: 'Зміна ПІБ',
  CHANGE_BIRTH_DATE: 'Зміна дати народження',
  CHANGE_EMAIL: 'Зміна email',
  CHANGE_HURTOK: 'Переведення в інший гурток',
  CREATE_JUNAK: 'Створення юнака',
  BULK_IMPORT_JUNAKY: 'Масовий імпорт юнаків з Книги судді',
  ARCHIVE_JUNAK: 'Архівація юнака',
};

export default function ApprovalRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: request, isLoading } = useApprovalRequest(id);
  const approve = useApproveRequest(id);
  const reject = useRejectRequest(id);

  if (isLoading) return <p>Завантаження...</p>;
  if (!request) return <p>Не знайдено.</p>;

  const isBulkImport = request.actionType === 'BULK_IMPORT_JUNAKY';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ACTION_LABELS[request.actionType] ?? request.actionType}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="mb-1 font-mono text-[.72rem] tracking-[.06em] text-ink-2 uppercase">{isBulkImport ? 'Що буде імпортовано' : 'Нові дані'}</h3>
          {isBulkImport ? (
            <BulkImportRequestView request={request} />
          ) : (
            <pre className="overflow-x-auto rounded-[4px] border border-line bg-bg p-2 font-mono text-xs">{JSON.stringify(request.newData, null, 2)}</pre>
          )}
        </div>
        {request.oldData && (
          <div>
            <h3 className="mb-1 font-mono text-[.72rem] tracking-[.06em] text-ink-2 uppercase">Поточні дані</h3>
            <pre className="overflow-x-auto rounded-[4px] border border-line bg-bg p-2 font-mono text-xs">{JSON.stringify(request.oldData, null, 2)}</pre>
          </div>
        )}
        <p className="text-sm text-ink-2">
          Статус:{' '}
          <Badge variant={request.status === 'APPROVED' ? 'ok' : request.status === 'PENDING' ? 'signal' : 'late'}>{request.status}</Badge>
        </p>
        {request.status === 'PENDING' && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                try {
                  const approved = await approve.mutateAsync();
                  // Stay on the page so the warning is seen; the approval itself already succeeded.
                  if (approved.inviteSent === false) return;
                  router.push('/approval-requests');
                } catch {
                  /* handled by MutationCache.onError for 401; other errors just stop-and-not-navigate */
                }
              }}
            >
              Затвердити
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await reject.mutateAsync();
                  router.push('/approval-requests');
                } catch {
                  /* handled by MutationCache.onError for 401; other errors just stop-and-not-navigate */
                }
              }}
            >
              Відхилити
            </Button>
          </div>
        )}
        {approve.data?.inviteSent === false && (
          <p className="text-sm text-late">
            Юнака створено, але запрошення не надіслано — надішліть його ще раз зі сторінки юнака
          </p>
        )}
        {approve.isError && (
          <p className="text-sm text-destructive">
            {accessErrorMessage(approve.error) ?? 'Не вдалося затвердити.'}
          </p>
        )}
        {reject.isError && (
          <p className="text-sm text-destructive">
            {accessErrorMessage(reject.error) ?? 'Не вдалося відхилити.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
