'use client';

import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';
import { useAnnouncements, useDeleteAnnouncement } from '@/lib/queries/announcements';
import { AnnouncementCard } from '@/components/announcement-card';
import { Button } from '@/components/ui/button';

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Оголошення</h1>
        {canManage && (
          <Button size="sm" onClick={() => router.push('/news/new')}>
            + Нове оголошення
          </Button>
        )}
      </div>
      {!announcements || announcements.length === 0 ? (
        <p className="text-sm text-muted-foreground">Оголошень поки немає.</p>
      ) : (
        <div className="space-y-4">
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
