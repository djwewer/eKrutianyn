/**
 * The Проби program models each degree ("ступінь") as a ProbyStage whose
 * name starts with one of these fixed Ukrainian prefixes (the rest of the
 * name varies by program version, e.g. "Проба прихильника (Відзнака
 * прихильника)" vs. a different parenthetical in another ProbyProgram).
 *
 * This mapping is the single source of truth for matching a degree to its
 * stage, shared by the Книга судді import (reading a date from the sheet
 * into a closed JunakStageProgress) and the nightly write-back sync
 * (reading a closed JunakStageProgress.firstClosedAt back out to the sheet).
 * Keep both directions using this same list so they can never drift apart.
 */
export type DegreeStageKey = 'PRYHYLNYK' | 'UCHASNYK' | 'ROZVIDUVACH';

export const DEGREE_STAGE_PREFIXES: { key: DegreeStageKey; prefix: string }[] = [
  { key: 'PRYHYLNYK', prefix: 'Проба прихильника' },
  { key: 'UCHASNYK', prefix: 'Проба учасника' },
  { key: 'ROZVIDUVACH', prefix: 'Проба розвідувача' },
];
