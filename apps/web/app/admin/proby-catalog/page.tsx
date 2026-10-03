'use client';

import { useLayoutEffect, useState } from 'react';
import { useAdminProbyPrograms, useUpdateProbyPointReference } from '@/lib/queries/admin-proby-catalog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accessErrorMessage } from '@/lib/error-message';
import type { AdminProbyPoint } from '@/lib/types';

const STORAGE_KEY = 'plastAdminKey';

function readStoredKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export default function AdminProbyCatalogPage() {
  // Starts null on both the server render and the first client render (the
  // server has no localStorage), then this one-time correction from a
  // non-React-owned source runs before paint — not a cascading render loop,
  // which is what the lint rule is meant to catch. Same pattern as
  // components/ui/theme-toggle.tsx's dark-mode sync.
  const [adminKey, setAdminKeyState] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdminKeyState(readStoredKey());
  }, []);

  function handleSetKey() {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      // Private browsing / blocked storage — the key just won't persist across reloads.
    }
    setAdminKeyState(trimmed);
  }

  function handleClearKey() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setAdminKeyState(null);
    setKeyInput('');
  }

  const { data: programs, isLoading, isError, error } = useAdminProbyPrograms(adminKey);

  if (!adminKey) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Адмін: каталог проби</h1>
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-muted-foreground">Введіть адмін-ключ (ADMIN_API_KEY з середовища бекенда).</p>
            <Input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetKey()}
              placeholder="Адмін-ключ"
            />
            <Button onClick={handleSetKey} disabled={!keyInput.trim()}>
              Увійти
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Адмін: каталог проби</h1>
        <Button size="sm" variant="outline" onClick={handleClearKey}>
          Вийти
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Для кожної точки можна додати довідковий матеріал (точні дати, імена, факти) — AI-виховник
        використовуватиме лише ці факти замість того, щоб вигадувати їх.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Завантаження...</p>}
      {isError && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Невірний ключ.'}</p>
            <Button size="sm" variant="outline" onClick={handleClearKey}>
              Ввести інший ключ
            </Button>
          </CardContent>
        </Card>
      )}

      {(programs ?? []).map((program) => (
        <Card key={program.id}>
          <CardHeader>
            <CardTitle>
              {program.name} ({program.version})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {program.stages
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((stage) => (
                <details key={stage.id} className="rounded-lg border border-border">
                  <summary className="cursor-pointer px-4 py-3 font-semibold">{stage.name}</summary>
                  <div className="space-y-4 border-t border-border p-4">
                    {stage.categories.map((category) => (
                      <div key={category.id} className="space-y-2">
                        <h3 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
                          {category.name}
                        </h3>
                        <div className="space-y-2">
                          {category.points
                            .slice()
                            .sort((a, b) => a.order - b.order)
                            .map((point) => (
                              <PointRow key={point.id} point={point} adminKey={adminKey} />
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PointRow({ point, adminKey }: { point: AdminProbyPoint; adminKey: string }) {
  const [text, setText] = useState(point.referenceText ?? '');
  const update = useUpdateProbyPointReference(adminKey);
  const dirty = text !== (point.referenceText ?? '');

  function handleSave() {
    update.mutate({ pointId: point.id, referenceText: text.trim() || null });
  }

  return (
    <div className="space-y-1.5 rounded-md border border-border p-3">
      <p className="text-sm font-medium">
        {point.order}. {point.description}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Довідковий матеріал (точні дати, імена, факти)..."
        className="w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!dirty || update.isPending} onClick={handleSave}>
          Зберегти
        </Button>
        {!dirty && update.isSuccess && <span className="text-xs text-muted-foreground">Збережено</span>}
        {update.isError && <span className="text-xs text-destructive">Не вдалося зберегти</span>}
      </div>
    </div>
  );
}
