import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PositionType, Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JunakImportRowProcessorService } from './junak-import-row-processor.service';
import { ImportJunakRowsDto } from './dto/import-junak-rows.dto';
import { ResolvedJunakRow } from './junak-import-row.types';

@UseGuards(JwtAuthGuard)
@Controller('kurins')
export class JunakImportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rowProcessor: JunakImportRowProcessorService,
  ) {}

  @Get(':kurinId/junak-import/match-candidates')
  async matchCandidates(
    @Param('kurinId') kurinId: string,
    @Query('firstName') firstName: string,
    @Query('lastName') lastName: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertOwnKurin(kurinId, user);
    this.assertCanAccessWizard(user);
    const candidates = await this.prisma.user.findMany({
      where: {
        kurinId,
        role: Role.JUNAK,
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
      },
      select: { id: true, firstName: true, lastName: true, birthDate: true },
    });
    return { candidates };
  }

  @Post(':kurinId/junak-import/rows')
  async importRows(
    @Param('kurinId') kurinId: string,
    @Body() dto: ImportJunakRowsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertOwnKurin(kurinId, user);
    this.assertZvyazkovyi(user);
    const results = [];
    for (let i = 0; i < dto.rows.length; i++) {
      results.push(await this.rowProcessor.processRow(kurinId, dto.rows[i] as ResolvedJunakRow, i, user));
    }
    return { results };
  }

  private assertOwnKurin(kurinId: string, user: CurrentUserPayload) {
    if (kurinId !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
  }

  private assertZvyazkovyi(user: CurrentUserPayload) {
    if (user.role !== Role.ZVYAZKOVYI) {
      throw new ForbiddenException('Only zvyazkovyi can perform this action');
    }
  }

  private assertCanAccessWizard(user: CurrentUserPayload) {
    const canAccess =
      user.role === Role.ZVYAZKOVYI || user.isKurinniy || user.positions.includes(PositionType.SUDDIA);
    if (!canAccess) {
      throw new ForbiddenException('Only zvyazkovyi, kurinniy, or suddya can access the import wizard');
    }
  }
}
