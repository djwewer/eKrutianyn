'use client';

import { generateHTML } from '@tiptap/html';
import { Button } from '@/components/ui/button';
import { REACTION_EMOJI, REACTION_ORDER } from '@/lib/reaction-emoji';
import { useSetReaction, useRemoveReaction } from '@/lib/queries/announcements';
import { ANNOUNCEMENT_EDITOR_EXTENSIONS } from '@/components/announcement-editor';
import { PhotoCarousel } from '@/components/photo-carousel';
import { splitAnnouncementImages } from '@/lib/announcement-images';
import { cn } from '@/lib/utils';
import type { Announcement, ReactionEmoji } from '@/lib/types';

const MONTHS = ['СІЧ', 'ЛЮТ', 'БЕР', 'КВІ', 'ТРА', 'ЧЕР', 'ЛИП', 'СЕР', 'ВЕР', 'ЖОВ', 'ЛИС', 'ГРУ'];

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
  let images: { id: string; src: string; alt?: string }[] = [];
  try {
    const split = splitAnnouncementImages(announcement.content as Record<string, unknown>);
    images = split.images;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generateHTML requires a loosely-typed Tiptap JSONContent document
    html = generateHTML(split.doc as any, ANNOUNCEMENT_EDITOR_EXTENSIONS);
  } catch {
    // A malformed/unsupported content document must not crash the whole feed
    // page for every viewer — fall back to a per-card message instead.
    html = null;
    images = [];
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

  const created = new Date(announcement.createdAt);
  const time = created.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', hour12: false });
  const nick = author.nickname ? ` «${author.nickname}»` : '';

  return (
    <div className="grid grid-cols-[3.2rem_minmax(0,1fr)] gap-[.7rem] min-[760px]:grid-cols-[4.6rem_minmax(0,1fr)] min-[760px]:gap-4">
      <div className="relative z-[1] pt-[.2rem] text-center font-display leading-none">
        <b className="block bg-background text-[1.4rem] font-bold min-[760px]:text-[1.8rem]">{created.getDate()}</b>
        <span className="block bg-background py-[.2rem] text-[.72rem] tracking-[.08em] text-ink-2 uppercase">
          {MONTHS[created.getMonth()]}
        </span>
      </div>
      <article className="grid min-w-0 gap-3 rounded-[6px] border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center gap-[.6rem] font-mono text-[.75rem] tracking-[.03em] text-ink-2">
          <span>{time}</span>
        </div>
        <h2 className="m-0 font-display text-[1.4rem] leading-[1.2] font-semibold text-balance">{announcement.title}</h2>
        {html !== null ? (
          <div className="announcement-content" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="text-sm text-muted-foreground">Не вдалося відобразити вміст.</p>
        )}
        {images.length > 0 && <PhotoCarousel photos={images} label={announcement.title} ratio="16/10" />}
        <p className="m-0 text-[.88rem] text-ink-2 italic">
          {author.firstName} {author.lastName}
          {nick}
        </p>
        <div className="flex flex-wrap gap-[.35rem] border-t border-dashed border-line pt-[.7rem]">
          {REACTION_ORDER.map((emoji) => {
            const count = countFor(emoji);
            const on = ownReaction === emoji;
            return (
              <button
                key={emoji}
                type="button"
                aria-pressed={on}
                onClick={() => handleReactionClick(emoji)}
                className={cn(
                  'cursor-pointer rounded-[4px] border px-[.55rem] py-[.2rem] font-mono text-[.88rem]',
                  on ? 'border-navy bg-navy text-navy-ink' : 'border-line bg-transparent',
                )}
              >
                {REACTION_EMOJI[emoji]} {count > 0 && count}
              </button>
            );
          })}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              Редагувати
            </Button>
            <Button size="sm" variant="destructive" onClick={onDelete}>
              Видалити
            </Button>
          </div>
        )}
      </article>
    </div>
  );
}
