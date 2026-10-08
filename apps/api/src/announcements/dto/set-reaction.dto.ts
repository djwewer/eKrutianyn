import { IsEnum } from 'class-validator';
import { ReactionEmoji } from '@prisma/client';

export class SetReactionDto {
  @IsEnum(ReactionEmoji) emoji: ReactionEmoji;
}
