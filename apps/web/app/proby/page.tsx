'use client';

import { useSession } from '@/lib/session-client';
import { useProbyProgram, useJunakProgress } from '@/lib/queries/proby';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{program.name}</h1>
      {program.stages
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((stage) => {
          const status = statusByStageId.get(stage.id);
          if (status === 'LOCKED') {
            return (
              <Card key={stage.id} className="opacity-50">
                <CardHeader>
                  <CardTitle>🔒 {stage.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Розблокується після закриття попередньої проби
                  </p>
                </CardContent>
              </Card>
            );
          }
          return (
            <Card key={stage.id}>
              <CardHeader>
                <CardTitle>{stage.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                            <li key={point.id} className="flex items-center gap-2">
                              <span aria-hidden>{done ? '✅' : '⬜'}</span>
                              <span>{point.description}</span>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
