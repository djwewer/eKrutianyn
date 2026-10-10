import { PrismaClient } from '@prisma/client';
import { DEGREE_STAGE_PREFIXES, DegreeStageKey } from './degree-stages.util';

/**
 * The junak's degrees ("ступені") in the order they are earned. The first
 * three are derived from closed ProbyStages; SKOB has no proby behind it and
 * is a date entered by hand (User.skobDate).
 */
export type DegreeKey = DegreeStageKey | 'SKOB';

export const DEGREE_ORDER: DegreeKey[] = ['PRYHYLNYK', 'UCHASNYK', 'ROZVIDUVACH', 'SKOB'];

export const DEGREE_LABELS: Record<DegreeKey, string> = {
  PRYHYLNYK: 'Прихильник',
  UCHASNYK: 'Учасник',
  ROZVIDUVACH: 'Розвідувач',
  SKOB: 'Скоб',
};

export type DegreeDates = Record<DegreeKey, Date | null>;

export function emptyDegreeDates(): DegreeDates {
  return { PRYHYLNYK: null, UCHASNYK: null, ROZVIDUVACH: null, SKOB: null };
}

/** The highest degree with a date, or null for a junak who has none yet. */
export function currentDegree(dates: Partial<Record<DegreeKey, Date | null>>): DegreeKey | null {
  for (let i = DEGREE_ORDER.length - 1; i >= 0; i--) {
    if (dates[DEGREE_ORDER[i]]) return DEGREE_ORDER[i];
  }
  return null;
}

/** Matches the sheet's own date convention (DD.MM.YYYY). */
export function formatSheetDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

type DegreePrisma = Pick<PrismaClient, 'probyStage' | 'junakStageProgress'>;

/**
 * Loads each junak's degree dates in bulk. A proby degree counts as earned
 * from `JunakStageProgress.firstClosedAt` — set the first time the stage was
 * closed and never cleared, so reopening a stage doesn't take the degree
 * away. The date shown/pushed to the book is that same first-close date.
 */
export async function loadDegreeDates(
  prisma: DegreePrisma,
  probyProgramId: string,
  junaky: { id: string; skobDate: Date | null }[],
): Promise<Map<string, DegreeDates>> {
  const result = new Map<string, DegreeDates>();
  for (const junak of junaky) {
    result.set(junak.id, { ...emptyDegreeDates(), SKOB: junak.skobDate });
  }
  if (junaky.length === 0) return result;

  const stages = await prisma.probyStage.findMany({ where: { programId: probyProgramId } });
  const keyByStageId = new Map<string, DegreeStageKey>();
  for (const { key, prefix } of DEGREE_STAGE_PREFIXES) {
    const stage = stages.find((s) => s.name.startsWith(prefix));
    if (stage) keyByStageId.set(stage.id, key);
  }
  if (keyByStageId.size === 0) return result;

  const progress = await prisma.junakStageProgress.findMany({
    where: { junakId: { in: junaky.map((j) => j.id) }, stageId: { in: [...keyByStageId.keys()] } },
  });
  for (const entry of progress) {
    const key = keyByStageId.get(entry.stageId);
    if (key && entry.firstClosedAt) {
      result.get(entry.junakId)![key] = entry.firstClosedAt;
    }
  }
  return result;
}
