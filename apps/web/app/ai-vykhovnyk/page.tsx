'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSession } from '@/lib/session-client';
import { useProbyProgram, useJunakProgress } from '@/lib/queries/proby';
import {
  useAiConversations,
  useAiConversation,
  useCreateAiConversation,
  useSendAiMessage,
  useDeleteAiConversation,
} from '@/lib/queries/ai-assistant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectGroupLabel,
} from '@/components/ui/select';
import { accessErrorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import type { AiMessage } from '@/lib/types';

const MARKDOWN_CLASSES = cn(
  '[&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-base [&_h1]:font-bold [&_h1]:first:mt-0',
  '[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-bold [&_h2]:first:mt-0',
  '[&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:first:mt-0',
  '[&_p]:my-1.5 [&_p]:first:mt-0 [&_p]:last:mb-0',
  '[&_strong]:font-semibold',
  '[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-0.5',
  '[&_hr]:my-2.5 [&_hr]:border-border',
  '[&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs dark:[&_code]:bg-white/10',
  '[&_a]:underline',
);

function newDraftKey() {
  return `draft-${Math.random().toString(36).slice(2)}`;
}

export default function AiVykhovnykPage() {
  const { data: session } = useSession();
  const isJunak = session?.role === 'JUNAK';

  const {
    data: program,
    isLoading: programLoading,
    isError: programIsError,
    error: programError,
  } = useProbyProgram();
  const { data: progress } = useJunakProgress(isJunak ? session?.userId : undefined);

  const { data: conversations, isLoading: conversationsLoading } = useAiConversations();
  const deleteConversation = useDeleteAiConversation();

  // `panelKey` controls which ConversationPanel instance is mounted: it only
  // changes on a deliberate navigation (picking a different chat, or starting a
  // new one), so a conversation created lazily mid-send doesn't remount and lose
  // its in-flight state. `activeConversationId` is only for sidebar highlighting
  // and starts null — landing on this page always opens a fresh, unsaved chat
  // rather than resuming whatever was last active.
  const [panelKey, setPanelKey] = useState(newDraftKey);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  // Each proby point has exactly one conversation: this drives both the "Точка
  // проби" selector and which chat is shown. Picking a point looks up its
  // existing conversation (if any) and switches to it instead of mixing
  // multiple points' messages into one thread.
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  function handleSelectConversation(id: string) {
    setActiveConversationId(id);
    setPanelKey(id);
    setSelectedPointId((conversations ?? []).find((c) => c.id === id)?.probyPointId ?? null);
  }

  function handleNewConversation() {
    setActiveConversationId(null);
    setPanelKey(newDraftKey());
    setSelectedPointId(null);
  }

  function handlePointChange(pointId: string | null) {
    if (!pointId) return;
    setSelectedPointId(pointId);
    const existing = (conversations ?? []).find((c) => c.probyPointId === pointId);
    if (existing) {
      setActiveConversationId(existing.id);
      setPanelKey(existing.id);
    } else {
      setActiveConversationId(null);
      setPanelKey(newDraftKey());
    }
  }

  function handleDeleteConversation(id: string) {
    if (!window.confirm('Видалити цю розмову? Її не можна буде відновити.')) return;
    deleteConversation.mutate(id);
    if (id === activeConversationId) {
      handleNewConversation();
    }
  }

  // For JUNAK, narrow the tree down to points that still make sense to pick:
  // not in a locked stage, and not already marked DONE. This only shapes the
  // UI's default list — the backend independently enforces the same rules.
  // For ZVYAZKOVYI, show the whole program unfiltered.
  const stages = useMemo(() => {
    if (!program) return [];
    const sortedStages = program.stages.slice().sort((a, b) => a.order - b.order);
    if (!isJunak) return sortedStages;

    const stageStatusById = new Map((progress?.stages ?? []).map((s) => [s.stageId, s.status]));
    const doneByPointId = new Set(
      (progress?.points ?? []).filter((p) => p.status === 'DONE').map((p) => p.pointId),
    );

    return sortedStages
      .filter((stage) => stageStatusById.get(stage.id) !== 'LOCKED')
      .map((stage) => ({
        ...stage,
        categories: stage.categories
          .map((category) => ({
            ...category,
            points: category.points.filter((point) => !doneByPointId.has(point.id)),
          }))
          .filter((category) => category.points.length > 0),
      }))
      .filter((stage) => stage.categories.length > 0);
  }, [program, isJunak, progress]);

  const pointLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const stage of stages) {
      for (const category of stage.categories) {
        for (const point of category.points) {
          map[point.id] = point.description;
        }
      }
    }
    return map;
  }, [stages]);

  if (programLoading) return <p>Завантаження...</p>;
  if (programIsError) {
    return <p className="text-sm text-destructive">{accessErrorMessage(programError) ?? 'Помилка завантаження.'}</p>;
  }
  if (!program) return <p>Не вдалося завантажити програму проб.</p>;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <Card className="sm:w-64 sm:shrink-0">
        <CardHeader>
          <CardTitle className="text-base">Розмови</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button size="sm" variant="outline" className="w-full" onClick={handleNewConversation}>
            + Нова розмова
          </Button>
          <div className="space-y-1">
            {conversationsLoading && <p className="text-sm text-muted-foreground">Завантаження...</p>}
            {!conversationsLoading && (conversations ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Ще немає розмов.</p>
            )}
            {(conversations ?? []).map((c) => (
              <div
                key={c.id}
                className={cn(
                  'flex items-center gap-1 rounded-md',
                  c.id === activeConversationId ? 'bg-accent-soft' : 'hover:bg-accent-soft/50',
                )}
              >
                <button
                  type="button"
                  onClick={() => handleSelectConversation(c.id)}
                  className={cn(
                    'min-w-0 flex-1 truncate px-2.5 py-1.5 text-left text-sm',
                    c.id === activeConversationId ? 'font-medium text-accent-text' : '',
                  )}
                >
                  {(c.probyPointId && pointLabelById[c.probyPointId]) ?? c.title ?? 'Нова розмова'}
                </button>
                <button
                  type="button"
                  aria-label="Видалити розмову"
                  title="Видалити розмову"
                  onClick={() => handleDeleteConversation(c.id)}
                  className="shrink-0 rounded px-2 py-1 text-lg leading-none text-muted-foreground hover:text-destructive"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">AI-виховник</h1>
          <p className="text-xs text-muted-foreground">
            AI-виховник старається бути щоразу кращим, проте може помилятися. Перевіряй його відповідь.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Точка проби</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedPointId} onValueChange={handlePointChange} items={pointLabelById}>
              <SelectTrigger>
                <SelectValue placeholder="Оберіть точку проби" />
              </SelectTrigger>
              <SelectContent>
                {stages.length === 0 && (
                  <div className="px-2.5 py-1.5 text-sm text-muted-foreground">Немає доступних точок</div>
                )}
                {stages.map((stage) => (
                  <div key={stage.id}>
                    <div className="px-2.5 pt-2 pb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                      {stage.name}
                    </div>
                    {stage.categories.map((category) => (
                      <SelectGroup key={category.id}>
                        <SelectGroupLabel>{category.name}</SelectGroupLabel>
                        {category.points
                          .slice()
                          .sort((a, b) => a.order - b.order)
                          .map((point) => (
                            <SelectItem key={point.id} value={point.id}>
                              {point.description}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <ConversationPanel
          key={panelKey}
          initialConversationId={activeConversationId}
          onConversationCreated={setActiveConversationId}
          selectedPointId={selectedPointId}
        />
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div role="status" aria-label="Генерує відповідь" className="flex items-center gap-1 rounded-lg bg-muted px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function ConversationPanel({
  initialConversationId,
  onConversationCreated,
  selectedPointId,
}: {
  initialConversationId: string | null;
  onConversationCreated: (id: string) => void;
  selectedPointId: string | null;
}) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const {
    data: conversation,
    isLoading: conversationLoading,
    isError: conversationIsError,
    error: conversationError,
  } = useAiConversation(conversationId);
  const createConversation = useCreateAiConversation();
  const sendMessage = useSendAiMessage();

  const [draft, setDraft] = useState('');
  const [pendingUserMessage, setPendingUserMessage] = useState<AiMessage | null>(null);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);

  const serverMessages = conversation?.messages ?? [];
  // The optimistic message is shown immediately on send and cleared once the
  // real response is written into the cache above — never both at once, since
  // by then serverMessages already includes it.
  const messages = pendingUserMessage ? [...serverMessages, pendingUserMessage] : serverMessages;
  const canSend = !!selectedPointId && draft.trim().length > 0 && !isAwaitingReply;

  async function handleSend() {
    if (!selectedPointId) return;
    const content = draft.trim();
    if (!content) return;

    setDraft('');
    setSendError(null);
    setPendingUserMessage({
      role: 'USER',
      content,
      probyPointId: selectedPointId,
      createdAt: new Date().toISOString(),
    });
    setIsAwaitingReply(true);

    try {
      let targetId = conversationId;
      if (!targetId) {
        const created = await createConversation.mutateAsync(selectedPointId);
        targetId = created.id;
        setConversationId(targetId);
        onConversationCreated(targetId);
      }
      await sendMessage.mutateAsync({ conversationId: targetId, probyPointId: selectedPointId, content });
    } catch (error) {
      setSendError(error);
    } finally {
      setPendingUserMessage(null);
      setIsAwaitingReply(false);
    }
  }

  // Enter sends on desktop; on a touch device (coarse pointer, e.g. a phone's
  // on-screen keyboard) plain Enter just inserts a newline instead, since
  // there's no reliable way to tell a phone apart from a desktop otherwise.
  // Ctrl/Cmd+Enter always sends, Shift+Enter always inserts a newline.
  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (!e.metaKey && !e.ctrlKey && isTouchDevice) return;
    e.preventDefault();
    if (canSend) handleSend();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Розмова</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {conversationLoading && <p className="text-sm text-muted-foreground">Завантаження розмови...</p>}
          {conversationIsError && (
            <p className="text-sm text-destructive">
              {accessErrorMessage(conversationError) ?? 'Не вдалося завантажити розмову.'}
            </p>
          )}
          {!conversationLoading && !conversationIsError && messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Оберіть точку проби та опишіть, що хочете підготувати — AI-виховник допоможе скласти план.
            </p>
          )}
          <div className="space-y-2">
            {messages.map((message, index) => (
              <div key={index} className={cn('flex', message.role === 'USER' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'ai-gradient-ring max-w-[85%] rounded-lg px-3 py-2 text-sm',
                    message.role === 'USER'
                      ? 'whitespace-pre-wrap text-foreground'
                      : cn('text-foreground', MARKDOWN_CLASSES),
                  )}
                  style={
                    {
                      '--ai-ring-fill': message.role === 'USER' ? 'var(--accent-soft-solid)' : 'var(--muted)',
                    } as React.CSSProperties
                  }
                >
                  {message.role === 'USER' ? (
                    message.content
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  )}
                </div>
              </div>
            ))}
            {isAwaitingReply && <TypingIndicator />}
          </div>

          <div className="space-y-2 pt-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Опишіть, що хочете підготувати..."
              rows={3}
              className="ai-gradient-ring ai-gradient-glow w-full min-w-0 rounded-md bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between gap-2">
              <Button size="sm" disabled={!canSend} onClick={handleSend}>
                Надіслати
              </Button>
              {!selectedPointId && (
                <span className="text-xs text-muted-foreground">Спершу оберіть точку проби</span>
              )}
            </div>
            {sendError !== null && (
              <p className="text-sm text-destructive">
                {accessErrorMessage(sendError) ?? 'Не вдалося надіслати повідомлення. Спробуйте ще раз.'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
