'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';
import { useAnnouncements, useUpdateAnnouncement } from '@/lib/queries/announcements';
import { AnnouncementEditor } from '@/components/announcement-editor';

export default function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session, isLoading: sessionLoading } = useSession();
  const kurinId = session?.kurinId ?? '';
  const { data: announcements, isLoading: listLoading } = useAnnouncements(kurinId);
  const update = useUpdateAnnouncement(kurinId, id);

  if (sessionLoading || listLoading) return <p>Завантаження...</p>;
  const canManage = !!session && (session.role === 'ZVYAZKOVYI' || session.positions.includes('PYSAR'));
  if (!canManage) return <p className="text-sm text-destructive">Немає доступу.</p>;

  const announcement = announcements?.find((a) => a.id === id);
  if (!announcement) return <p>Оголошення не знайдено.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Редагувати оголошення</h1>
      <AnnouncementEditor
        kurinId={kurinId}
        initialTitle={announcement.title}
        initialContent={announcement.content}
        submitLabel="Зберегти"
        isSaving={update.isPending}
        errorMessage={update.isError ? 'Не вдалося зберегти.' : null}
        onSubmit={(data) => {
          update.mutate(data, { onSuccess: () => router.push('/news') });
        }}
      />
    </div>
  );
}
