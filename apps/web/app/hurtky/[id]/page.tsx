'use client';

import { use } from 'react';
import { useHurtokBoard, useConfirmPoint, useUnconfirmPoint } from '@/lib/queries/hurtky';
import { useProbyProgram } from '@/lib/queries/proby';
import { useSession } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function HurtokBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: board, isLoading } = useHurtokBoard(id);
  const { data: program } = useProbyProgram();
  const { data: session } = useSession();
  const confirmMutation = useConfirmPoint(id);
  const unconfirmMutation = useUnconfirmPoint(id);
  const canConfirm = session?.role === 'VYKHOVNYK';

  if (isLoading) return <p>Завантаження...</p>;
  if (!board) return <p>Гурток не знайдено.</p>;

  const allPoints = (program?.stages ?? []).flatMap((stage) =>
    stage.categories.flatMap((category) => category.points),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{board.hurtok.name}</h1>
      {board.junaky.map((junak) => {
        const doneByPointId = new Map(
          junak.progress.filter((p) => p.status === 'DONE').map((p) => [p.pointId, p]),
        );
        return (
          <Card key={junak.id}>
            <CardHeader>
              <CardTitle>
                {junak.lastName} {junak.firstName}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {allPoints.map((point) => {
                const done = doneByPointId.has(point.id);
                return (
                  <div key={point.id} className="flex items-center justify-between gap-2">
                    <span>{point.description}</span>
                    {canConfirm ? (
                      done ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            unconfirmMutation.mutate({ junakId: junak.id, pointId: point.id })
                          }
                        >
                          Зняти
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            confirmMutation.mutate({ junakId: junak.id, pointId: point.id })
                          }
                        >
                          Підтвердити
                        </Button>
                      )
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {done ? 'Підтверджено' : 'Не підтверджено'}
                      </span>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
