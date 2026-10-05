'use client';

import { useSession } from '@/lib/session-client';
import { useProbyProgram, useJunakProgress } from '@/lib/queries/proby';
import { AccordionRoot, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

export default function ProbyPage() {
  const { data: session } = useSession();
  const { data: program, isLoading: programLoading } = useProbyProgram();
  const { data: progressData, isLoading: progressLoading } = useJunakProgress(session?.userId);

  if (programLoading || progressLoading) {
    return <p>Завантаження...</p>;
  }

  if (!program) {
    return <p>Не вдалося завантажити програму проб.</p>;
  }

  const doneByPointId = new Set(
    (progressData?.points ?? []).filter((p) => p.status === 'DONE').map((p) => p.pointId),
  );
  const statusByStageId = new Map((progressData?.stages ?? []).map((s) => [s.stageId, s.status]));
  // Open stages start expanded — this page is where a junak checks their
  // current progress, so the points shouldn't be hidden behind an extra click.
  const defaultOpenStageIds = program.stages
    .filter((stage) => statusByStageId.get(stage.id) !== 'LOCKED')
    .map((stage) => stage.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{program.name}</h1>
      <AccordionRoot multiple defaultValue={defaultOpenStageIds}>
        {program.stages
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((stage) => {
            const locked = statusByStageId.get(stage.id) === 'LOCKED';
            return (
              <AccordionItem key={stage.id} value={stage.id} disabled={locked}>
                <AccordionTrigger>
                  <span className="min-w-0 flex-1 truncate">{stage.name}</span>
                  {locked && (
                    <span aria-hidden="true" className="shrink-0">
                      🔒
                    </span>
                  )}
                </AccordionTrigger>
                {!locked && (
                  <AccordionContent>
                    <div className="space-y-4">
                      {stage.categories.map((category) => (
                        <div key={category.id}>
                          <h3 className="mb-2 font-semibold">{category.name}</h3>
                          <ul className="space-y-1">
                            {category.points
                              .slice()
                              .sort((a, b) => a.order - b.order)
                              .map((point) => {
                                const done = doneByPointId.has(point.id);
                                return (
                                  <li key={point.id} className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 break-words">{point.description}</span>
                                    {done && (
                                      <span aria-hidden="true" className="shrink-0">
                                        ✅
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                )}
              </AccordionItem>
            );
          })}
      </AccordionRoot>
    </div>
  );
}
