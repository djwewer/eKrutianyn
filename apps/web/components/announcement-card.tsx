'use client';

import { generateHTML } from '@tiptap/html';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { REACTION_EMOJI, REACTION_ORDER } from '@/lib/reaction-emoji';
import { useSetReaction, useRemoveReaction } from '@/lib/queries/announcements';
import { ANNOUNCEMENT_EDITOR_EXTENSIONS } from '@/components/announcement-editor';
import { getInitials } from '@/lib/utils';
import type { Announcement, ReactionEmoji } from '@/lib/types';

export function AnnouncementCard({
  announcement,
  kurinId,
  currentUserId,
  canManage,
  onEdit,
  onDelete,
}: {
  announcement: Announcement;
  kurinId: string;
  currentUserId: string;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const setReaction = useSetReaction(kurinId);
  const removeReaction = useRemoveReaction(kurinId);
  let html: string | null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generateHTML requires a loosely-typed Tiptap JSONContent document
    html = generateHTML(announcement.content as any, ANNOUNCEMENT_EDITOR_EXTENSIONS);
  } catch {
    // A malformed/unsupported content document must not crash the whole feed
    // page for every viewer — fall back to a per-card message instead.
    html = null;
  }
  const ownReaction = announcement.reactions.find((r) => r.userId === currentUserId)?.emoji;
  const { author } = announcement;

  function handleReactionClick(emoji: ReactionEmoji) {
    if (ownReaction === emoji) {
      removeReaction.mutate(announcement.id);
    } else {
      setReaction.mutate({ announcementId: announcement.id, emoji });
    }
  }

  function countFor(emoji: ReactionEmoji): number {
    return announcement.reactions.filter((r) => r.emoji === emoji).length;
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Avatar
              initials={getInitials(author.firstName, author.lastName)}
              photoUrl={author.photoUpdatedAt ? `/api/backend/users/${author.id}/photo?v=${author.photoUpdatedAt}` : null}
              className="size-9"
            />
            <div>
              <p className="text-sm leading-tight font-semibold">
                {author.firstName} {author.lastName}
                {author.nickname && <span className="font-normal text-muted-foreground"> ({author.nickname})</span>}
              </p>
              <p className="text-xs text-muted-foreground">{new Date(announcement.createdAt).toLocaleDateString('uk-UA')}</p>
            </div>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" onClick={onEdit}>
                Редагувати
              </Button>
              <Button size="sm" variant="outline" onClick={onDelete}>
                Видалити
              </Button>
            </div>
          )}
        </div>
        <CardTitle>{announcement.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {html !== null ? (
          <div className="announcement-content" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="text-sm text-muted-foreground">Не вдалося відобразити вміст.</p>
        )}
        <div className="flex flex-wrap gap-1">
          {REACTION_ORDER.map((emoji) => {
            const count = countFor(emoji);
            return (
              <Button
                key={emoji}
                size="sm"
                variant={ownReaction === emoji ? 'default' : 'outline'}
                onClick={() => handleReactionClick(emoji)}
              >
                {REACTION_EMOJI[emoji]} {count > 0 && count}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
