'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useCreateApd, usePseudoCandidates, usePysarstvoFolder, useSetPysarstvoFolder } from '@/lib/queries/pysarstvo';
import { fetchGoogleDrivePickerToken } from '@/lib/queries/google-drive';
import { openGoogleDriveFolderPicker } from '@/lib/google-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ApiError } from '@/lib/api-client';
import { accessErrorMessage } from '@/lib/error-message';

const FIELD_LABEL = 'font-mono text-[.72rem] tracking-[.06em] text-ink-2 uppercase';

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    const message = (error.body as { message?: string | string[] } | null)?.message;
    if (error.status === 400 || error.status === 503) {
      return (Array.isArray(message) ? message[0] : message) ?? 'Не вдалося створити документ.';
    }
  }
  return accessErrorMessage(error) ?? 'Не вдалося створити документ.';
}

function PysarstvoFolderCard({ kurinId, isZvyazkovyi }: { kurinId: string; isZvyazkovyi: boolean }) {
  const { data: folder, isLoading, isError } = usePysarstvoFolder(kurinId, true);
  const setFolder = useSetPysarstvoFolder(kurinId);
  const [pickerError, setPickerError] = useState<string | null>(null);

  async function handlePickFolder() {
    setPickerError(null);
    try {
      const accessToken = await fetchGoogleDrivePickerToken(kurinId);
      await openGoogleDriveFolderPicker(accessToken, (folderId, folderName) => {
        setFolder.mutate({ folderId, folderName });
      });
    } catch {
      setPickerError('Не вдалося відкрити вибір папки. Спробуйте підключити Google Drive повторно.');
    }
  }

  return (
    <Card data-testid="pysarstvo-folder">
      <CardHeader>
        <CardTitle>Папка писарства</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-sm text-ink-2">Завантаження...</p>}
        {isError && <p className="text-sm text-late">Не вдалося перевірити папку писарства.</p>}
        {folder && !folder.driveConnected && (
          <p className="text-sm text-ink-2">
            Google Drive не підключено.
            {isZvyazkovyi ? ' Підключіть його в налаштуваннях куреня, на сторінці «Курінь».' : ' Зверніться до звʼязкового куреня.'}
          </p>
        )}
        {folder?.driveConnected && (
          <>
            <p className="text-sm [overflow-wrap:anywhere]">
              Папка:{' '}
              {folder.folderName ? <b>{folder.folderName}</b> : <span className="text-ink-2">не обрана</span>}
            </p>
            <p className="text-sm text-ink-2">
              У ній створюється папка «АПД», куди потрапляють документи писарства.
              {!isZvyazkovyi && !folder.folderName && ' Папку обирає звʼязковий куреня.'}
            </p>
            {isZvyazkovyi && (
              <Button size="sm" variant="outline" disabled={setFolder.isPending} onClick={handlePickFolder}>
                {folder.folderName ? 'Змінити папку' : 'Обрати папку писарства'}
              </Button>
            )}
            {setFolder.isError && <p className="text-sm text-late">Не вдалося зберегти папку. Спробуйте ще раз.</p>}
            {pickerError && <p className="text-sm text-late">{pickerError}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function PysarstvoPage() {
  const { data: session } = useSession();
  const kurinId = session?.kurinId;
  const canUse =
    session?.role === 'ZVYAZKOVYI' || !!session?.isKurinniy || !!session?.positions.includes('PYSAR');
  const { data: candidates = [] } = usePseudoCandidates(kurinId, canUse);
  const createApd = useCreateApd(kurinId ?? '');
  const { data: folder } = usePysarstvoFolder(kurinId, canUse);
  const folderReady = !!folder?.driveConnected && !!folder.folderId;

  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [manual, setManual] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  if (!session || !kurinId) return null;
  if (!canUse) return <p className="text-sm text-late">Немає доступу.</p>;

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
      <PageHeader title="Писарство" subtitle="АПД сходин і документи куреня в Google Drive" />
      <PysarstvoFolderCard kurinId={kurinId} isZvyazkovyi={session.role === 'ZVYAZKOVYI'} />
      <Card>
        <CardHeader>
          <CardTitle>Створити АПД</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-ink-2">
            Документ створюється в папці писарства, у підпапці «АПД». Для кожного псевдо додаються розділи «Що було
            добре» та «Що можна покращити».
          </p>
          <Input
            placeholder="Назва документа, напр. АПД сходини 27.10"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
          <div className="space-y-2">
            <p className={FIELD_LABEL}>Юнаки куреня</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-2">
              {candidates.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-[.7rem] rounded-[6px] border border-line bg-bg px-[.8rem] py-[.7rem] has-[:checked]:border-navy"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-navy"
                    checked={selected.includes(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                  <span className="text-[.98rem] leading-tight font-bold">{c.label}</span>
                </label>
              ))}
              {candidates.length === 0 && <p className="col-span-full text-sm text-ink-2">Немає юнаків.</p>}
            </div>
          </div>
          <div className="space-y-2">
            <p className={FIELD_LABEL}>Додати вручну (гість, не в системі)</p>
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-60 flex-1"
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
              <Button type="button" variant="outline" onClick={addManual}>
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
          <p className="text-sm text-ink-2">Обрано псевдо: {pseudos.length}</p>
          {folder && !folderReady && (
            <p className="text-sm text-late">
              {session.role === 'ZVYAZKOVYI'
                ? folder.driveConnected
                  ? 'Щоб створювати документи, спершу оберіть папку писарства вище.'
                  : 'Щоб створювати документи, спершу підключіть Google Drive і оберіть папку писарства.'
                : 'Документи можна буде створювати, коли звʼязковий обере папку писарства.'}
            </p>
          )}
          <Button
            disabled={createApd.isPending || !folderReady || !title.trim() || pseudos.length === 0}
            onClick={submit}
          >
            {createApd.isPending ? 'Створюю…' : 'Створити АПД'}
          </Button>
          {createApd.isError && <p className="text-sm text-late">{errorText(createApd.error)}</p>}
          {createdUrl && (
            <p className="text-sm text-ok" role="status">
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
