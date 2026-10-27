'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useCreateApd, usePseudoCandidates } from '@/lib/queries/pysarstvo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { accessErrorMessage } from '@/lib/error-message';

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    const message = (error.body as { message?: string | string[] } | null)?.message;
    if (error.status === 400 || error.status === 503) {
      return (Array.isArray(message) ? message[0] : message) ?? 'Не вдалося створити документ.';
    }
  }
  return accessErrorMessage(error) ?? 'Не вдалося створити документ.';
}

export default function PysarstvoPage() {
  const { data: session } = useSession();
  const kurinId = session?.kurinId;
  const canUse =
    session?.role === 'ZVYAZKOVYI' || !!session?.isKurinniy || !!session?.positions.includes('PYSAR');
  const { data: candidates = [] } = usePseudoCandidates(kurinId, canUse);
  const createApd = useCreateApd(kurinId ?? '');

  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [manual, setManual] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  if (!session || !kurinId) return null;
  if (!canUse) return <p className="text-sm text-destructive">Немає доступу.</p>;

  const pseudos = [
    ...candidates.filter((c) => selected.includes(c.id)).map((c) => c.label),
    ...manual,
  ];

  function addManual() {
    const value = manualInput.trim();
    if (!value) return;
    setManual((prev) => [...prev, value]);
    setManualInput('');
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    setCreatedUrl(null);
    createApd.mutate(
      { title: title.trim(), pseudos },
      { onSuccess: (doc) => setCreatedUrl(doc.url) },
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Писарство</h1>
      <Card>
        <CardHeader>
          <CardTitle>Створити АПД</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Документ створюється у Google Drive куреня, у папці «Писарство» → «АПД». Для кожного псевдо додаються розділи
            «Що було добре» та «Що можна покращити».
          </p>
          <Input
            placeholder="Назва документа, напр. АПД сходини 27.10"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
          <div className="space-y-2">
            <p className="text-sm font-medium">Юнаки куреня</p>
            <div className="flex flex-wrap gap-2">
              {candidates.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant={selected.includes(c.id) ? 'default' : 'outline'}
                  aria-pressed={selected.includes(c.id)}
                  onClick={() => toggle(c.id)}
                >
                  {c.label}
                </Button>
              ))}
              {candidates.length === 0 && <p className="text-sm text-muted-foreground">Немає юнаків.</p>}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Додати вручну (гість, не в системі)</p>
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-60"
                placeholder="Псевдо"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addManual();
                  }
                }}
                maxLength={100}
              />
              <Button type="button" size="sm" variant="outline" onClick={addManual}>
                Додати
              </Button>
            </div>
            {manual.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {manual.map((name, index) => (
                  <Button
                    key={`${name}-${index}`}
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-label={`Прибрати ${name}`}
                    onClick={() => setManual((prev) => prev.filter((_, i) => i !== index))}
                  >
                    {name} ✕
                  </Button>
                ))}
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Обрано псевдо: {pseudos.length}</p>
          <Button disabled={createApd.isPending || !title.trim() || pseudos.length === 0} onClick={submit}>
            {createApd.isPending ? 'Створюю…' : 'Створити АПД'}
          </Button>
          {createApd.isError && <p className="text-sm text-destructive">{errorText(createApd.error)}</p>}
          {createdUrl && (
            <p className="text-sm text-green-600 dark:text-green-400">
              Документ створено:{' '}
              <a href={createdUrl} target="_blank" rel="noopener noreferrer" className="underline">
                відкрити в Google Docs
              </a>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
