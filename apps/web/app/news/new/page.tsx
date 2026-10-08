'use client';

import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';
import { useCreateAnnouncement } from '@/lib/queries/announcements';
import { AnnouncementEditor } from '@/components/announcement-editor';
import { ApiError } from '@/lib/api-client';

export default function NewAnnouncementPage() {
  const router = useRouter();
  const { data: session, isLoading } = useSession();
  const kurinId = session?.kurinId ?? '';
  const create = useCreateAnnouncement(kurinId);

  if (isLoading) return <p>Завантаження...</p>;
  const canManage = !!session && (session.role === 'ZVYAZKOVYI' || session.positions.includes('PYSAR'));
  if (!canManage) return <p className="text-sm text-destructive">Немає доступу.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Нове оголошення</h1>
      <AnnouncementEditor
        kurinId={kurinId}
        initialTitle=""
        initialContent={null}
        submitLabel="Опублікувати"
        isSaving={create.isPending}
        errorMessage={create.isError ? (create.error instanceof ApiError ? 'Не вдалося опублікувати.' : null) : null}
        onSubmit={(data) => {
          create.mutate(data, { onSuccess: () => router.push('/news') });
        }}
      />
    </div>
  );
}
