'use client';

import Link from 'next/link';
import { useApprovalRequests } from '@/lib/queries/approval-requests-list';
import { Card, CardContent } from '@/components/ui/card';
import { accessErrorMessage } from '@/lib/error-message';

const ACTION_LABELS: Record<string, string> = {
  CHANGE_FULL_NAME: 'Зміна ПІБ',
  CHANGE_BIRTH_DATE: 'Зміна дати народження',
  CHANGE_EMAIL: 'Зміна email',
  CHANGE_HURTOK: 'Переведення в інший гурток',
  CREATE_JUNAK: 'Створення юнака',
};

export default function ApprovalRequestsPage() {
  const { data: requests, isLoading, isError, error } = useApprovalRequests('PENDING');

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error)}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Запити на затвердження</h1>
      <div className="space-y-2">
        {(requests ?? []).length === 0 && <p className="text-muted-foreground">Немає запитів, що очікують.</p>}
        {(requests ?? []).map((r) => (
          <Link key={r.id} href={`/approval-requests/${r.id}`}>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <span>{ACTION_LABELS[r.actionType] ?? r.actionType}</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString('uk-UA')}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
