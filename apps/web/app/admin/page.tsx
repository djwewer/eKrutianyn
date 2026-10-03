'use client';

import { useLayoutEffect, useState } from 'react';
import { useAdminProbyPrograms, useUpdateProbyPointReference } from '@/lib/queries/admin-proby-catalog';
import {
  useAdminReferenceSources,
  useCreateReferenceSource,
  useDeleteReferenceSource,
  useFetchAllReferenceSourcesNow,
  useFetchReferenceSourceNow,
} from '@/lib/queries/admin-reference-sources';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accessErrorMessage } from '@/lib/error-message';
import { type AdminCredentials } from '@/lib/queries/admin-credentials';
import type { AdminProbyPoint, AdminProbyProgram } from '@/lib/types';

const STORAGE_KEY = 'plastAdminCredentials';

function readStoredCredentials(): AdminCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.key || !parsed?.username || !parsed?.password) return null;
    return parsed as AdminCredentials;
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
  const [credentials, setCredentialsState] = useState<AdminCredentials | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCredentialsState(readStoredCredentials());
  }, []);

  function handleSetCredentials() {
    const next: AdminCredentials = {
      key: keyInput.trim(),
      username: usernameInput.trim(),
      password: passwordInput.trim(),
    };
    if (!next.key || !next.username || !next.password) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing / blocked storage — the credentials just won't persist across reloads.
    }
    setCredentialsState(next);
  }

  function handleClearCredentials() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setCredentialsState(null);
    setKeyInput('');
    setUsernameInput('');
    setPasswordInput('');
  }

  const { data: programs, isLoading, isError, error } = useAdminProbyPrograms(credentials);

  if (!credentials) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Адмін: каталог проби</h1>
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-muted-foreground">
              Потрібні два незалежні фактори: адмін-ключ (ADMIN_API_KEY) та логін+пароль (ADMIN_USERNAME /
              ADMIN_PASSWORD) з середовища бекенда.
            </p>
            <Input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Адмін-ключ"
            />
            <Input
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="Логін"
            />
            <Input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetCredentials()}
              placeholder="Пароль"
            />
            <Button
              onClick={handleSetCredentials}
              disabled={!keyInput.trim() || !usernameInput.trim() || !passwordInput.trim()}
            >
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
        <Button size="sm" variant="outline" onClick={handleClearCredentials}>
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
            <Button size="sm" variant="outline" onClick={handleClearCredentials}>
              Ввести дані знову
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
                              <PointRow key={point.id} point={point} credentials={credentials} />
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

      <ReferenceSourcesSection credentials={credentials} programs={programs ?? []} />
    </div>
  );
}

function ReferenceSourcesSection({ credentials, programs }: { credentials: AdminCredentials; programs: AdminProbyProgram[] }) {
  const { data: sources, isLoading } = useAdminReferenceSources(credentials);
  const create = useCreateReferenceSource(credentials);
  const deleteSource = useDeleteReferenceSource(credentials);
  const fetchNow = useFetchReferenceSourceNow(credentials);
  const fetchAllNow = useFetchAllReferenceSourcesNow(credentials);

  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [probyPointId, setProbyPointId] = useState('');

  const allPoints = programs.flatMap((program) =>
    program.stages.flatMap((stage) =>
      stage.categories.flatMap((category) =>
        category.points.map((point) => ({ id: point.id, label: `${program.name} / ${stage.name} / ${point.description}` })),
      ),
    ),
  );

  function handleCreate() {
    if (!label.trim() || !url.trim()) return;
    create.mutate(
      { label: label.trim(), url: url.trim(), probyPointId: probyPointId || null },
      {
        onSuccess: () => {
          setLabel('');
          setUrl('');
          setProbyPointId('');
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Джерела в інтернеті (пісні, гімни тощо)</CardTitle>
        <Button size="sm" variant="outline" disabled={fetchAllNow.isPending} onClick={() => fetchAllNow.mutate()}>
          Оновити всі зараз
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Сторінка фетчиться й кешується автоматично раз на тиждень. AI-виховник бачить лише те, що тут уже успішно
          завантажено — додайте джерело і натисніть «Оновити зараз», щоб не чекати тиждень.
        </p>

        {fetchAllNow.isSuccess && (
          <p className="text-xs text-muted-foreground">
            Оновлено: {fetchAllNow.data.succeeded} успішно, {fetchAllNow.data.failed} з помилкою.
          </p>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Завантаження...</p>}

        <div className="space-y-2">
          {(sources ?? []).map((source) => (
            <div key={source.id} className="space-y-1.5 rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{source.label}</p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={fetchNow.isPending} onClick={() => fetchNow.mutate(source.id)}>
                    Оновити
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteSource.mutate(source.id)}>
                    Видалити
                  </Button>
                </div>
              </div>
              <a href={source.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-muted-foreground underline">
                {source.url}
              </a>
              <p className="text-xs text-muted-foreground">
                Точка: {source.probyPoint?.description ?? '— не прив\'язано —'}
              </p>
              <p className="text-xs text-muted-foreground">
                {source.lastFetchedAt
                  ? `Востаннє завантажено: ${new Date(source.lastFetchedAt).toLocaleString('uk-UA')}`
                  : 'Ще не завантажено жодного разу'}
              </p>
              {source.lastError && <p className="text-xs text-destructive">Помилка: {source.lastError}</p>}
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <p className="text-sm font-medium">Додати джерело</p>
          <Input placeholder="Назва (напр. «Гімни і молитви, pryvatri.de»)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Input placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
          <select
            value={probyPointId}
            onChange={(e) => setProbyPointId(e.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none dark:bg-input/30"
          >
            <option value="">— не прив&apos;язувати до точки —</option>
            {allPoints.map((point) => (
              <option key={point.id} value={point.id}>
                {point.label}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={!label.trim() || !url.trim() || create.isPending} onClick={handleCreate}>
            Додати
          </Button>
          {create.isError && <span className="block text-xs text-destructive">Не вдалося додати (перевірте URL)</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function PointRow({ point, credentials }: { point: AdminProbyPoint; credentials: AdminCredentials }) {
  const [text, setText] = useState(point.referenceText ?? '');
  const update = useUpdateProbyPointReference(credentials);
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
