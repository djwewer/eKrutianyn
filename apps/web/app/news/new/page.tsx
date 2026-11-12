'use client';

import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';
import { useCreateAnnouncement } from '@/lib/queries/announcements';
import { PageHeader } from '@/components/ui/page-header';
import { AnnouncementEditor } from '@/components/announcement-editor';

export default function NewAnnouncementPage() {
  const router = useRouter();
  const { data: session, isLoading } = useSession();
  const kurinId = session?.kurinId ?? '';
  const create = useCreateAnnouncement(kurinId);

  if (isLoading) return <p>Завантаження...</p>;
  const canManage = !!session && (session.role === 'ZVYAZKOVYI' || session.positions.includes('PYSAR'));
  if (!canManage) return <p className="text-sm text-destructive">Немає доступу.</p>;

  return (
    <div>
      <PageHeader title="Нове оголошення" crumb={{ href: '/news', label: 'Новини' }} />
      <AnnouncementEditor
        kurinId={kurinId}
        initialTitle=""
        initialContent={null}
        submitLabel="Опублікувати"
        isSaving={create.isPending}
        errorMessage={create.isError ? 'Не вдалося опублікувати.' : null}
        onSubmit={(data) => {
          create.mutate(data, { onSuccess: () => router.push('/news') });
        }}
      />
    </div>
  );
}
