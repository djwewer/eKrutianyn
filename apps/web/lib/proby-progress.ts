import type { JunakProgressResponse, ProbyProgram } from '@/lib/types';

export type StageProgress = {
  stageId: string;
  done: number;
  total: number;
  categories: { id: string; done: number; total: number }[];
};

/** Per-stage and per-category done/total point counts, stages in program order. */
export function probyProgress(
  program: Pick<ProbyProgram, 'stages'>,
  progress: Pick<JunakProgressResponse, 'points'> | undefined,
): StageProgress[] {
  const doneIds = new Set((progress?.points ?? []).filter((p) => p.status === 'DONE').map((p) => p.pointId));
  return program.stages
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((stage) => {
      const categories = stage.categories.map((category) => ({
        id: category.id,
        done: category.points.filter((p) => doneIds.has(p.id)).length,
        total: category.points.length,
      }));
      return {
        stageId: stage.id,
        done: categories.reduce((sum, c) => sum + c.done, 0),
        total: categories.reduce((sum, c) => sum + c.total, 0),
        categories,
      };
    });
}

/** Percent (0-100) of the current OPEN stage's points that are done; 100 when every stage is closed, else 0. */
export function overallPercent(
  program: Pick<ProbyProgram, 'stages'>,
  progress: Pick<JunakProgressResponse, 'points' | 'stages'> | undefined,
): number {
  if (!progress) return 0;
  const openIds = new Set(progress.stages.filter((s) => s.status === 'OPEN').map((s) => s.stageId));
  if (progress.stages.length > 0 && progress.stages.every((s) => s.status === 'CLOSED')) return 100;
  const current = probyProgress(program, progress).find((s) => openIds.has(s.stageId));
  if (!current || current.total === 0) return 0;
  return Math.round((current.done / current.total) * 100);
}
