'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useHurtky } from '@/lib/queries/hurtky';
import { useUsers } from '@/lib/queries/users';
import {
  useVykhovnykAssignments,
  useAssignVykhovnyk,
  useUnassignVykhovnyk,
} from '@/lib/queries/vykhovnyk-assignments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';

export default function VykhovnykAssignmentsPage() {
  const { data: session } = useSession();
  const { data: assignments, isLoading, isError, error } = useVykhovnykAssignments();
  const { data: hurtky } = useHurtky();
  const { data: vykhovnyky } = useUsers({ role: 'VYKHOVNYK' });
  const assign = useAssignVykhovnyk();
  const unassign = useUnassignVykhovnyk();
  const [selectedVykhovnyk, setSelectedVykhovnyk] = useState('');
  const [selectedHurtok, setSelectedHurtok] = useState('');

  const canManage = session?.role === 'ZVYAZKOVYI';

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error)}</p>;

  const hurtokById = new Map((hurtky ?? []).map((h) => [h.id, h]));
  const vykhovnykById = new Map((vykhovnyky ?? []).map((v) => [v.id, v]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Призначення виховників</h1>

      {canManage && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Призначити виховника</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <select
              value={selectedVykhovnyk}
              onChange={(e) => setSelectedVykhovnyk(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Оберіть виховника</option>
              {(vykhovnyky ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.lastName} {v.firstName}
                </option>
              ))}
            </select>
            <select
              value={selectedHurtok}
              onChange={(e) => setSelectedHurtok(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Оберіть гурток</option>
              {(hurtky ?? []).map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
            <Button
              disabled={!selectedVykhovnyk || !selectedHurtok}
              onClick={() =>
                assign.mutate({ vykhovnykId: selectedVykhovnyk, hurtokId: selectedHurtok })
              }
            >
              Призначити
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {(assignments ?? []).map((a) => (
          <Card key={a.id}>
            <CardContent className="flex items-center justify-between p-4">
              <span>
                {vykhovnykById.get(a.vykhovnykId)
                  ? `${vykhovnykById.get(a.vykhovnykId)!.lastName} ${vykhovnykById.get(a.vykhovnykId)!.firstName}`
                  : a.vykhovnykId}{' '}
                → {hurtokById.get(a.hurtokId)?.name ?? a.hurtokId}
              </span>
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => unassign.mutate(a.id)}>
                  Зняти
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
