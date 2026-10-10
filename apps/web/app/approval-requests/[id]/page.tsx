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
    <Card className={isBulkImport ? 'max-w-2xl' : 'max-w-md'}>
      <CardHeader>
        <CardTitle>{ACTION_LABELS[request.actionType] ?? request.actionType}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="mb-1 font-semibold">{isBulkImport ? 'Що буде імпортовано' : 'Нові дані'}</h3>
          {isBulkImport ? (
            <BulkImportRequestView request={request} />
          ) : (
            <pre className="rounded bg-muted p-2 text-xs">{JSON.stringify(request.newData, null, 2)}</pre>
          )}
        </div>
        {request.oldData && (
          <div>
            <h3 className="mb-1 font-semibold">Поточні дані</h3>
            <pre className="rounded bg-muted p-2 text-xs">{JSON.stringify(request.oldData, null, 2)}</pre>
          </div>
        )}
        <p className="text-sm text-muted-foreground">Статус: {request.status}</p>
        {request.status === 'PENDING' && (
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                try {
                  await approve.mutateAsync();
                  router.push('/approval-requests');
                } catch {
                  /* handled by MutationCache.onError for 401; other errors just stop-and-not-navigate */
                }
              }}
            >
              Затвердити
            </Button>
            <Button
              variant="outline"
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
