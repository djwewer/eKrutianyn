import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { DEGREE_STAGE_PREFIXES, DegreeStageKey } from '../common/degree-stages.util';

interface ColumnMappingEntry {
  column: string;
  header: string;
  field: string;
}

interface CellUpdate {
  row: number;
  column: string;
  value: string;
}

const DEGREE_DATE_FIELDS: { key: DegreeStageKey; field: string }[] = [
  { key: 'PRYHYLNYK', field: 'DEGREE_PRYHYLNYK_DATE' },
  { key: 'UCHASNYK', field: 'DEGREE_UCHASNYK_DATE' },
  { key: 'ROZVIDUVACH', field: 'DEGREE_ROZVIDUVACH_DATE' },
];

const PHONE_FIELD = 'PHONE';
const EMAIL_FIELD = 'EMAIL';

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Nightly write-back sync: pushes data the app already has (degree dates,
 * phone, email) into the kurin's connected Книга судді Google Sheet, for
 * every JUNAK that was actually imported from that sheet (has a known
 * judgeBookRowNumber). This is the mirror image of the import flow — it
 * never invents a column and never blanks out a cell the app has no value
 * for.
 */
@Injectable()
export class JudgeBookSyncService {
  private readonly logger = new Logger(JudgeBookSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleDrive: GoogleDriveService,
  ) {}

  async syncKurinToSheet(kurinId: string): Promise<void> {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin?.judgeBookSpreadsheetId) return;

    const mapping = await this.prisma.junakImportMapping.findUnique({ where: { kurinId } });
    if (!mapping) return;

    const fieldToColumn = new Map<string, string>();
    for (const entry of mapping.columnMapping as unknown as ColumnMappingEntry[]) {
      fieldToColumn.set(entry.field, entry.column);
    }

    const junaky = await this.prisma.user.findMany({
      where: { kurinId, role: Role.JUNAK, judgeBookRowNumber: { not: null } },
    });

    const stages = await this.prisma.probyStage.findMany({
      where: { programId: kurin.probyProgramId },
    });
    const stageByDegreeKey = new Map<DegreeStageKey, { id: string }>();
    for (const { key, prefix } of DEGREE_STAGE_PREFIXES) {
      const stage = stages.find((s) => s.name.startsWith(prefix));
      if (stage) stageByDegreeKey.set(key, stage);
    }

    const junakIds = junaky.map((u) => u.id);
    const stageIds = [...stageByDegreeKey.values()].map((s) => s.id);
    const progressEntries =
      stageIds.length > 0
        ? await this.prisma.junakStageProgress.findMany({
            where: { junakId: { in: junakIds }, stageId: { in: stageIds } },
          })
        : [];
    const firstClosedAtByJunakAndStage = new Map<string, Date>();
    for (const entry of progressEntries) {
      if (entry.firstClosedAt) {
        firstClosedAtByJunakAndStage.set(`${entry.junakId}:${entry.stageId}`, entry.firstClosedAt);
      }
    }

    const updates: CellUpdate[] = [];
    for (const junak of junaky) {
      const row = junak.judgeBookRowNumber;
      if (row == null) continue;

      for (const { key, field } of DEGREE_DATE_FIELDS) {
        const column = fieldToColumn.get(field);
        if (!column) continue;
        const stage = stageByDegreeKey.get(key);
        if (!stage) continue;
        const closedAt = firstClosedAtByJunakAndStage.get(`${junak.id}:${stage.id}`);
        if (!closedAt) continue;
        updates.push({ row, column, value: formatDate(closedAt) });
      }

      const phoneColumn = fieldToColumn.get(PHONE_FIELD);
      if (phoneColumn && junak.phone) {
        updates.push({ row, column: phoneColumn, value: junak.phone });
      }

      const emailColumn = fieldToColumn.get(EMAIL_FIELD);
      if (emailColumn && junak.email) {
        updates.push({ row, column: emailColumn, value: junak.email });
      }
    }

    await this.googleDrive.updateCellValues(kurinId, kurin.judgeBookSpreadsheetId, updates);
  }

  async syncAllKurins(): Promise<void> {
    const kuriny = await this.prisma.kurin.findMany({
      where: {
        driveRefreshToken: { not: null },
        judgeBookSpreadsheetId: { not: null },
        junakImportMapping: { isNot: null },
      },
      select: { id: true },
    });

    for (const kurin of kuriny) {
      try {
        await this.syncKurinToSheet(kurin.id);
      } catch (error) {
        this.logger.error(
          `Failed to push Книга судді sync for kurin ${kurin.id}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
  }
}
