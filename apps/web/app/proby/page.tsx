'use client';

import { Flag, Star } from 'lucide-react';
import { useSession } from '@/lib/session-client';
import { useProbyProgram, useJunakProgress } from '@/lib/queries/proby';
import { probyProgress } from '@/lib/proby-progress';
import { AccordionRoot, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
import { cn } from '@/lib/utils';

const SUBTEXT = 'font-sans text-[.85rem] font-normal tracking-normal text-ink-2 normal-case';

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
  const countsByStageId = new Map(probyProgress(program, progressData).map((s) => [s.stageId, s]));

  return (
    <div>
      <PageHeader
        title={program.name}
        subtitle="Пункти, які підтвердив виховник, позначені"
        crumb={{ href: '/plastuvannia', label: 'Моє пластування' }}
      />
      <AccordionRoot multiple>
        {program.stages
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((stage) => {
            const stageStatus = statusByStageId.get(stage.id);
            const locked = stageStatus === 'LOCKED';
            const closed = stageStatus === 'CLOSED';
            const counts = countsByStageId.get(stage.id);
            const Icon = closed ? Star : Flag;
            return (
              <AccordionItem key={stage.id} value={stage.id} disabled={locked}>
                <AccordionTrigger>
                  <span
                    aria-hidden="true"
                    className="grid size-[2.3rem] shrink-0 place-items-center rounded-[4px] border border-line bg-background text-navy"
                  >
                    <Icon className="size-[1.2rem]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{stage.name}</span>
                    <span className={cn('block', SUBTEXT)}>
                      {locked
                        ? 'Розблокується після закриття попередньої проби'
                        : `${counts?.done ?? 0} з ${counts?.total ?? 0} точок`}
                    </span>
                  </span>
                  {locked && <Badge variant="mute">Замкнено</Badge>}
                  {closed && (
                    <Badge variant="ok">
                      Закрито
                    </Badge>
                  )}
                </AccordionTrigger>
                {!locked && (
                  <AccordionContent>
                    <AccordionRoot multiple defaultValue={stage.categories.slice(0, 1).map((c) => c.id)}>
                      {stage.categories.map((category) => {
                        const catCounts = counts?.categories.find((c) => c.id === category.id);
                        const catDone = catCounts?.done ?? 0;
                        const catTotal = catCounts?.total ?? 0;
                        return (
                          <AccordionItem key={category.id} value={category.id}>
                            <AccordionTrigger className="text-base">
                              <span className="min-w-0 flex-1">
                                <span className="block">{category.name}</span>
                                <span className={cn('block', SUBTEXT)}>
                                  {catDone}/{catTotal}
                                </span>
                              </span>
                              <ProgressBar
                                value={catTotal ? (catDone / catTotal) * 100 : 0}
                                className="w-20 shrink-0"
                                aria-hidden="true"
                              />
                            </AccordionTrigger>
                            <AccordionContent>
                              <ul>
                                {category.points
                                  .slice()
                                  .sort((a, b) => a.order - b.order)
                                  .map((point) => {
                                    const done = doneByPointId.has(point.id);
                                    return (
                                      <li
                                        key={point.id}
                                        className="flex items-start gap-[.7rem] border-b border-dashed border-line py-[.45rem] last:border-b-0"
                                      >
                                        <span
                                          aria-hidden="true"
                                          className={cn(
                                            'mt-[.1rem] grid size-[1.4rem] shrink-0 place-items-center rounded-[3px] border-2 text-[.85rem] text-navy-ink',
                                            done ? 'border-navy bg-navy' : 'border-line',
                                          )}
                                        >
                                          {done && '✓'}
                                        </span>
                                        <span className="min-w-0 flex-1 break-words">{point.description}</span>
                                        {done && <span className="sr-only">Зараховано</span>}
                                      </li>
                                    );
                                  })}
                              </ul>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </AccordionRoot>
                  </AccordionContent>
                )}
              </AccordionItem>
            );
          })}
      </AccordionRoot>
    </div>
  );
}
