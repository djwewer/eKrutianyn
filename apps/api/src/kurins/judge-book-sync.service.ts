import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { columnLetterToIndex } from '../common/sheet-column.util';
import { loadDegreeDates } from '../common/degrees.util';
import { PUSHED_FIELDS, buildJunakBookValues } from '../common/judge-book-fields.util';

interface ColumnMappingEntry {
  column: string;
  header: string;
  field: string;
}

export interface JudgeBookSyncReport {
  /** Active junaky linked to a sheet row (imported from, or appended to, the book). */
  linkedJunaky: number;
  /** Linked junaky that had at least one value written. */
  syncedJunaky: number;
  /** Total sheet cells written. */
  updatedCells: number;
  /** Active junaky with no known sheet row — nothing can be pushed for them. */
  unlinkedJunaky: number;
  /** Linked junaky left untouched, with the reason (shown to the zvyazkovyi). */
  skipped: { junakName: string; row: number; reason: string }[];
}

interface CellUpdate {
  row: number;
  column: string;
  value: string;
}

const NAME_FIELD = 'FIRST_LAST_NAME';

/** Builds a sheet row (array indexed by column) from a junak's values, honouring the kurin's column mapping. */
function buildSheetRow(columnMapping: { column: string; field: string }[], values: Map<string, string>): string[] {
  const row: string[] = [];
  for (const { column, field } of columnMapping) {
    const idx = columnLetterToIndex(column);
    while (row.length <= idx) row.push('');
    row[idx] = values.get(field) ?? '';
  }
  return row;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Nightly write-back sync: pushes data the app already has (degree dates and
 * current degree, phone, email, residence, study place, parents/guardians)
 * into the kurin's connected Книга судді Google Sheet, for
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
        select: { judgeBookSpreadsheetId: true, probyProgramId: true },
      });
      if (!kurin?.judgeBookSpreadsheetId) return;
      const kurinProbyProgramId = kurin.probyProgramId;
      const mapping = await this.prisma.junakImportMapping.findUnique({ where: { kurinId } });
      if (!mapping) return;

      const junak = await this.prisma.user.findUnique({
        where: { id: junakId },
        include: { hurtok: { select: { name: true } } },
      });
      if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== kurinId) return;

      const guardians = await this.prisma.guardianContact.findMany({
        where: { junakId },
        orderBy: { createdAt: 'asc' },
      });
      const degrees = (await loadDegreeDates(this.prisma, kurinProbyProgramId, [junak])).get(junak.id)!;
      const row = buildSheetRow(
        mapping.columnMapping as unknown as { column: string; field: string }[],
        buildJunakBookValues({ ...junak, hurtokName: junak.hurtok?.name }, guardians, degrees),
      );
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

  async syncKurinToSheet(kurinId: string): Promise<JudgeBookSyncReport> {
    const report: JudgeBookSyncReport = {
      linkedJunaky: 0,
      syncedJunaky: 0,
      updatedCells: 0,
      unlinkedJunaky: 0,
      skipped: [],
    };
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin?.judgeBookSpreadsheetId) return report;

    const mapping = await this.prisma.junakImportMapping.findUnique({ where: { kurinId } });
    if (!mapping) return report;

    const fieldToColumn = new Map<string, string>();
    for (const entry of mapping.columnMapping as unknown as ColumnMappingEntry[]) {
      fieldToColumn.set(entry.field, entry.column);
    }

    const junaky = await this.prisma.user.findMany({
      where: { kurinId, role: Role.JUNAK, judgeBookRowNumber: { not: null } },
      include: { hurtok: { select: { name: true } } },
    });

    report.linkedJunaky = junaky.length;
    report.unlinkedJunaky = await this.prisma.user.count({
      where: { kurinId, role: Role.JUNAK, archivedAt: null, judgeBookRowNumber: null },
    });

    const junakIds = junaky.map((u) => u.id);
    const degreesByJunak = await loadDegreeDates(this.prisma, kurin.probyProgramId, junaky);
    const guardians =
      junakIds.length > 0
        ? await this.prisma.guardianContact.findMany({
            where: { junakId: { in: junakIds } },
            orderBy: { createdAt: 'asc' },
          })
        : [];
    const guardiansByJunak = new Map<string, typeof guardians>();
    for (const guardian of guardians) {
      guardiansByJunak.set(guardian.junakId, [...(guardiansByJunak.get(guardian.junakId) ?? []), guardian]);
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
          report.skipped.push({
            junakName: `${junak.firstName} ${junak.lastName}`,
            row,
            reason: actualName
              ? `у рядку ${row} зараз «${sheetRows[row - 1]?.[nameColIndex]?.trim()}» — рядок могли пересунути або змінити`
              : `рядок ${row} порожній або видалений`,
          });
          this.logger.warn(
            `Skipping Книга судді push for junak ${junak.id} (kurin ${kurinId}): row ${row} now shows "${actualName}", expected "${expectedName}" — the sheet row likely moved or was edited since import`,
          );
          continue;
        }
      }

      const values = buildJunakBookValues(
        { ...junak, hurtokName: junak.hurtok?.name },
        guardiansByJunak.get(junak.id) ?? [],
        degreesByJunak.get(junak.id)!,
      );
      const updatesBefore = updates.length;
      for (const [field, value] of values) {
        if (!PUSHED_FIELDS.has(field)) continue;
        const column = fieldToColumn.get(field);
        // A field this kurin's sheet has no column for is simply not pushed.
        if (!column) continue;
        // Skip cells that already hold exactly this value, so a run with
        // nothing new really writes nothing (and the report can say so).
        const current = sheetRows?.[row - 1]?.[columnLetterToIndex(column)];
        if (current !== undefined && String(current).trim() === value) continue;
        updates.push({ row, column, value });
      }
      if (updates.length > updatesBefore) report.syncedJunaky += 1;
    }

    await this.googleDrive.updateCellValues(kurinId, kurin.judgeBookSpreadsheetId, updates);
    report.updatedCells = updates.length;
    return report;
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
