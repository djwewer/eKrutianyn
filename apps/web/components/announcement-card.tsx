'use client';

import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { REACTION_EMOJI, REACTION_ORDER } from '@/lib/reaction-emoji';
import { useSetReaction, useRemoveReaction } from '@/lib/queries/announcements';
import type { Announcement, ReactionEmoji } from '@/lib/types';

const TIPTAP_EXTENSIONS = [StarterKit, Link, Image];

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generateHTML requires a loosely-typed Tiptap JSONContent document
  const html = generateHTML(announcement.content as any, TIPTAP_EXTENSIONS);
  const ownReaction = announcement.reactions.find((r) => r.userId === currentUserId)?.emoji;

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
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{announcement.title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {announcement.author.lastName} {announcement.author.firstName} ·{' '}
            {new Date(announcement.createdAt).toLocaleDateString('uk-UA')}
          </p>
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
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: html }} />
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
