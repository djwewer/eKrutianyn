'use client';

import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';
import { useAnnouncements, useDeleteAnnouncement } from '@/lib/queries/announcements';
import { AnnouncementCard } from '@/components/announcement-card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

export default function NewsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const kurinId = session?.kurinId;
  const { data: announcements, isLoading } = useAnnouncements(kurinId);
  const deleteAnnouncement = useDeleteAnnouncement(kurinId ?? '');

  const canManage = !!session && (session.role === 'ZVYAZKOVYI' || session.positions.includes('PYSAR'));

  if (isLoading) return <p>Завантаження...</p>;
  if (!kurinId) return null;

  return (
    <div>
      <PageHeader
        title="Новини"
        subtitle="Журнал куреня: оголошення, збірки, фото з таборів"
        actions={
          canManage && (
            <Button onClick={() => router.push('/news/new')}>
              + Нове оголошення
            </Button>
          )
        }
      />
      {!announcements || announcements.length === 0 ? (
        <p className="text-sm text-muted-foreground">Оголошень поки немає.</p>
      ) : (
        <div className="relative grid gap-[1.4rem] before:absolute before:top-2 before:bottom-0 before:left-[1.6rem] before:w-0.5 before:bg-line min-[760px]:before:left-[3.1rem]">
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              kurinId={kurinId}
              currentUserId={session!.userId}
              canManage={canManage}
              onEdit={() => router.push(`/news/${announcement.id}/edit`)}
              onDelete={() => {
                if (window.confirm('Видалити це оголошення?')) {
                  deleteAnnouncement.mutate(announcement.id);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
