import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { parseNotFutureDate } from '../common/date.util';
import { canEditBookData } from '../common/book-access.util';
import { DEGREE_STAGE_PREFIXES, DegreeStageKey } from '../common/degree-stages.util';
import {
  DEGREE_LABELS,
  DEGREE_ORDER,
  DegreeDates,
  DegreeKey,
  currentDegree,
  loadDegreeDates,
} from '../common/degrees.util';

export interface JunakDegreesView {
  /** YYYY-MM-DD per degree, null when not earned yet. */
  dates: Record<DegreeKey, string | null>;
  current: DegreeKey | null;
  currentLabel: string | null;
}

function toView(dates: DegreeDates): JunakDegreesView {
  const current = currentDegree(dates);
  return {
    dates: Object.fromEntries(
      DEGREE_ORDER.map((key) => [key, dates[key] ? dates[key]!.toISOString().slice(0, 10) : null]),
    ) as Record<DegreeKey, string | null>,
    current,
    currentLabel: current ? DEGREE_LABELS[current] : null,
  };
}

@Injectable()
export class JunakDegreesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async get(junakId: string, actor: CurrentUserPayload): Promise<JunakDegreesView> {
    // findScoped applies the same visibility rules as the junak's profile page.
    const visible = await this.usersService.findScoped(junakId, actor);
    if (visible.role !== Role.JUNAK) {
      throw new NotFoundException('Junak not found');
    }
    const junak = await this.prisma.user.findUniqueOrThrow({
      where: { id: junakId },
      select: { id: true, skobDate: true, kurin: { select: { probyProgramId: true } } },
    });
    const dates = await loadDegreeDates(this.prisma, junak.kurin.probyProgramId, [junak]);
    return toView(dates.get(junak.id)!);
  }

  async setDate(junakId: string, key: DegreeKey, date: string | null, actor: CurrentUserPayload) {
    const junak = await this.prisma.user.findUnique({
      where: { id: junakId },
      select: { id: true, role: true, kurinId: true, hurtokId: true, archivedAt: true, kurin: { select: { probyProgramId: true } } },
    });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found');
    }
    if (junak.archivedAt) {
      throw new BadRequestException('Юнак архівований');
    }

    if (key === 'SKOB') {
      this.assertCanEditBookData(actor);
      await this.prisma.user.update({
        where: { id: junakId },
        data: { skobDate: date === null ? null : parseNotFutureDate(date) },
      });
      return this.get(junakId, actor);
    }

    if (date === null) {
      throw new BadRequestException('Дату здобуття ступеня не можна прибрати — відкрийте пробу заново');
    }
    await this.assertCanEditStageDate(junak, actor);
    const newDate = parseNotFutureDate(date);

    const prefix = DEGREE_STAGE_PREFIXES.find((p) => p.key === (key as DegreeStageKey))!.prefix;
    const stages = await this.prisma.probyStage.findMany({ where: { programId: junak.kurin.probyProgramId } });
    const stage = stages.find((s) => s.name.startsWith(prefix));
    if (!stage) {
      throw new NotFoundException('Проби цього ступеня немає в програмі куреня');
    }
    const progress = await this.prisma.junakStageProgress.findUnique({
      where: { junakId_stageId: { junakId, stageId: stage.id } },
    });
    if (!progress?.firstClosedAt) {
      throw new BadRequestException('Ступінь ще не здобуто: спершу закрийте пробу');
    }
    await this.prisma.junakStageProgress.update({
      where: { id: progress.id },
      data: {
        firstClosedAt: newDate,
        // Keep the "currently closed" timestamp in step with the corrected
        // date, but don't close a stage that's currently reopened.
        ...(progress.closedAt ? { closedAt: newDate } : {}),
      },
    });
    return this.get(junakId, actor);
  }

  private assertCanEditBookData(actor: CurrentUserPayload) {
    if (!canEditBookData(actor)) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  /** Proby degree dates may also be corrected by the vykhovnyk responsible for the junak's hurtok. */
  private async assertCanEditStageDate(junak: { hurtokId: string | null }, actor: CurrentUserPayload) {
    if (canEditBookData(actor)) return;
    if (actor.role === Role.VYKHOVNYK && junak.hurtokId) {
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId: junak.hurtokId },
      });
      if (assigned) return;
    }
    throw new ForbiddenException('Insufficient role');
  }
}
