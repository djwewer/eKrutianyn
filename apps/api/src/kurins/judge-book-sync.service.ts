import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { DEGREE_STAGE_PREFIXES, DegreeStageKey } from '../common/degree-stages.util';
import { columnLetterToIndex } from '../common/sheet-column.util';

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
const NAME_FIELD = 'FIRST_LAST_NAME';

interface NewJunakRowSource {
  firstName: string;
  lastName: string;
  nickname: string | null;
  birthDate: Date | null;
  email: string;
  phone: string | null;
  hurtokName?: string;
}

/** Builds a sheet row (array indexed by column) for a junak, honouring the kurin's column mapping. */
function buildSheetRow(columnMapping: { column: string; field: string }[], junak: NewJunakRowSource): string[] {
  const values: string[] = [];
  for (const { column, field } of columnMapping) {
    const idx = columnLetterToIndex(column);
    let value = '';
    if (field === NAME_FIELD) value = `${junak.firstName} ${junak.lastName}`;
    else if (field === 'NICKNAME') value = junak.nickname ?? '';
    else if (field === 'BIRTH_DATE') value = junak.birthDate ? formatDate(junak.birthDate) : '';
    else if (field === EMAIL_FIELD) value = junak.email;
    else if (field === PHONE_FIELD) value = junak.phone ?? '';
    else if (field === 'HURTOK') value = junak.hurtokName ?? '';
    while (values.length <= idx) values.push('');
    values[idx] = value;
  }
  return values;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Matches the sheet's own date convention (DD.MM.YYYY) — the same format `parseUkrainianDate` on the import side expects, so a pushed date stays human-readable and round-trips correctly on the next import. */
function formatDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getUTCFullYear()}`;
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

  /**
   * Adds a junak who was just created in the app as a new row of the kurin's
   * connected Книга судді, and remembers which row it landed on so the nightly
   * write-back (degree dates, phone, email) keeps that row up to date later.
   *
   * Best-effort by design: creating the junak must never fail because Google
   * is down or the book isn't connected, so every problem is logged and
   * swallowed. A kurin with no connected book or no column mapping is a
   * silent no-op.
   */
  async appendNewJunak(kurinId: string, junakId: string): Promise<void> {
    try {
      const kurin = await this.prisma.kurin.findUnique({
        where: { id: kurinId },
        select: { judgeBookSpreadsheetId: true },
      });
      if (!kurin?.judgeBookSpreadsheetId) return;
      const mapping = await this.prisma.junakImportMapping.findUnique({ where: { kurinId } });
      if (!mapping) return;

      const junak = await this.prisma.user.findUnique({
        where: { id: junakId },
        include: { hurtok: { select: { name: true } } },
      });
      if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== kurinId) return;

      const row = buildSheetRow(mapping.columnMapping as unknown as { column: string; field: string }[], {
        ...junak,
        hurtokName: junak.hurtok?.name,
      });
      const rowNumber = await this.googleDrive.appendSheetRow(kurinId, kurin.judgeBookSpreadsheetId, row);
      if (rowNumber !== undefined) {
        await this.prisma.user.update({ where: { id: junakId }, data: { judgeBookRowNumber: rowNumber } });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to append new junak ${junakId} to Книга судді for kurin ${kurinId}: ${(error as Error).message}`,
      );
    }
  }

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

    // Humans maintain this sheet directly — they insert, sort, and delete
    // rows. judgeBookRowNumber is captured once at import time and never
    // re-validated, so before trusting it we re-read the sheet's own name
    // column (when mapped) and skip any junak whose row no longer shows
    // their name, rather than silently writing their data into whoever
    // else's row that now is.
    const nameColumn = fieldToColumn.get(NAME_FIELD);
    let sheetRows: string[][] | null = null;
    if (nameColumn && junaky.length > 0) {
      sheetRows = await this.googleDrive.readSheetValues(kurinId, kurin.judgeBookSpreadsheetId);
    }
    const nameColIndex = nameColumn ? columnLetterToIndex(nameColumn) : -1;

    const updates: CellUpdate[] = [];
    for (const junak of junaky) {
      const row = junak.judgeBookRowNumber;
      if (row == null) continue;

      if (sheetRows) {
        const actualName = normalizeName(sheetRows[row - 1]?.[nameColIndex] ?? '');
        const expectedName = normalizeName(`${junak.firstName} ${junak.lastName}`);
        if (actualName !== expectedName) {
          this.logger.warn(
            `Skipping Книга судді push for junak ${junak.id} (kurin ${kurinId}): row ${row} now shows "${actualName}", expected "${expectedName}" — the sheet row likely moved or was edited since import`,
          );
          continue;
        }
      }

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
