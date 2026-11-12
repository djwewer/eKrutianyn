'use client';

import Link from 'next/link';
import { useApprovalRequests } from '@/lib/queries/approval-requests-list';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { accessErrorMessage } from '@/lib/error-message';

const ACTION_LABELS: Record<string, string> = {
  CHANGE_FULL_NAME: 'Зміна ПІБ',
  CHANGE_BIRTH_DATE: 'Зміна дати народження',
  CHANGE_EMAIL: 'Зміна email',
  CHANGE_HURTOK: 'Переведення в інший гурток',
  CREATE_JUNAK: 'Створення юнака',
  BULK_IMPORT_JUNAKY: 'Масовий імпорт юнаків з Книги судді',
  ARCHIVE_JUNAK: 'Архівація юнака',
};

export default function ApprovalRequestsPage() {
  const { data: requests, isLoading, isError, error } = useApprovalRequests('PENDING');

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error)}</p>;

  return (
    <div>
      <PageHeader
        title="Запити на затвердження"
        subtitle="Зміни, які виховники й суддя просять внести"
        crumb={{ href: '/settings', label: 'Налаштування' }}
      />
      <div className="grid gap-4">
        {(requests ?? []).length === 0 && (
          <p className="rounded-[6px] border-2 border-dashed border-line p-[1.2rem] text-center text-ink-2">Немає запитів, що очікують.</p>
        )}
        {(requests ?? []).map((r) => (
          <Link key={r.id} href={`/approval-requests/${r.id}`} className="block rounded-[6px] transition-colors hover:bg-sky-soft">
            <Card>
              <CardContent className="flex items-center justify-between gap-3">
                <Badge variant="signal">{ACTION_LABELS[r.actionType] ?? r.actionType}</Badge>
                <span className="font-mono text-[.82rem] text-ink-2">
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
