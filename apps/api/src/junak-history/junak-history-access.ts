import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

export interface HistoryJunak {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  kurinId: string;
  hurtokId: string | null;
  archivedAt: Date | null;
}

function toHistoryJunak(user: HistoryJunak): HistoryJunak {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    nickname: user.nickname,
    kurinId: user.kurinId,
    hurtokId: user.hurtokId,
    archivedAt: user.archivedAt,
  };
}

/**
 * Who may change a junak's history: the kurin's zvyazkovyi, or a vykhovnyk
 * assigned to the junak's hurtok. A junak without a hurtok — only the
 * zvyazkovyi. Archived junaks are read-only for everyone.
 */
export async function canWriteJunakHistory(
  prisma: PrismaService,
  junak: Pick<HistoryJunak, 'kurinId' | 'hurtokId' | 'archivedAt'>,
  actor: CurrentUserPayload,
): Promise<boolean> {
  if (junak.archivedAt || junak.kurinId !== actor.kurinId) return false;
  if (actor.role === Role.ZVYAZKOVYI) return true;
  if (actor.role !== Role.VYKHOVNYK || !junak.hurtokId) return false;
  const assigned = await prisma.vykhovnykHurtok.findFirst({
    where: { vykhovnykId: actor.userId, hurtokId: junak.hurtokId },
  });
  return !!assigned;
}

/** Same visibility as the junak's profile page (findScoped); 404 for anyone else or a non-junak. */
export async function loadJunakForRead(
  usersService: UsersService,
  junakId: string,
  actor: CurrentUserPayload,
): Promise<HistoryJunak> {
  const user = await usersService.findScoped(junakId, actor);
  if (user.role !== Role.JUNAK) {
    throw new NotFoundException('Юнака не знайдено');
  }
  return toHistoryJunak(user);
}

/** 404 outside the kurin or not a junak, 400 archived, 403 not allowed to write. */
export async function loadJunakForWrite(
  prisma: PrismaService,
  junakId: string,
  actor: CurrentUserPayload,
): Promise<HistoryJunak> {
  const user = await prisma.user.findUnique({
    where: { id: junakId },
    select: { id: true, role: true, firstName: true, lastName: true, nickname: true, kurinId: true, hurtokId: true, archivedAt: true },
  });
  if (!user || user.role !== Role.JUNAK || user.kurinId !== actor.kurinId) {
    throw new NotFoundException('Юнака не знайдено');
  }
  if (user.archivedAt) {
    throw new BadRequestException('Юнак архівований');
  }
  if (!(await canWriteJunakHistory(prisma, user, actor))) {
    throw new ForbiddenException('Недостатньо прав для зміни історії цього юнака');
  }
  return toHistoryJunak(user);
}
