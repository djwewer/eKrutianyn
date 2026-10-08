import type { ReactionEmoji } from '@/lib/types';

export const REACTION_EMOJI: Record<ReactionEmoji, string> = {
  THUMBS_UP: '👍',
  HEART: '❤️',
  CLAP: '👏',
  WOW: '😮',
  LAUGH: '😂',
  SAD: '😢',
};

export const REACTION_ORDER: ReactionEmoji[] = ['THUMBS_UP', 'HEART', 'CLAP', 'WOW', 'LAUGH', 'SAD'];
