'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSession } from '@/lib/session-client';
import { useProbyProgram, useJunakProgress } from '@/lib/queries/proby';
import type { ProbyStage } from '@/lib/types';
import {
  useAiConversations,
  useAiConversation,
  useCreateAiConversation,
  useSendAiMessage,
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
  const createConversation = useCreateAiConversation();
  const [explicitSelectionId, setExplicitSelectionId] = useState<string | null>(null);
  // Default to the most recently active conversation until the person explicitly
  // picks one themselves — derived during render, no effect needed.
  const selectedConversationId = explicitSelectionId ?? conversations?.[0]?.id ?? null;

  function handleNewConversation() {
    createConversation.mutate(undefined, {
      onSuccess: (created) => setExplicitSelectionId(created.id),
    });
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
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={createConversation.isPending}
            onClick={handleNewConversation}
          >
            + Нова розмова
          </Button>
          <div className="space-y-1">
            {conversationsLoading && <p className="text-sm text-muted-foreground">Завантаження...</p>}
            {!conversationsLoading && (conversations ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Ще немає розмов.</p>
            )}
            {(conversations ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setExplicitSelectionId(c.id)}
                className={cn(
                  'w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm',
                  c.id === selectedConversationId
                    ? 'bg-accent-soft font-medium text-accent-text'
                    : 'hover:bg-accent-soft/50',
                )}
              >
                {c.title ?? 'Нова розмова'}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="min-w-0 flex-1 space-y-4">
        <h1 className="text-2xl font-bold">AI-виховник</h1>

        {!selectedConversationId ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Натисни «+ Нова розмова», щоб почати.
            </CardContent>
          </Card>
        ) : (
          // Keyed by conversation id so switching conversations remounts this panel
          // fresh — the natural, effect-free way to reset its local point/draft state.
          <ConversationPanel key={selectedConversationId} conversationId={selectedConversationId} stages={stages} pointLabelById={pointLabelById} />
        )}
      </div>
    </div>
  );
}

function ConversationPanel({
  conversationId,
  stages,
  pointLabelById,
}: {
  conversationId: string;
  stages: ProbyStage[];
  pointLabelById: Record<string, string>;
}) {
  const {
    data: conversation,
    isLoading: conversationLoading,
    isError: conversationIsError,
    error: conversationError,
  } = useAiConversation(conversationId);
  const sendMessage = useSendAiMessage(conversationId);

  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const messages = conversation?.messages ?? [];
  const canSend = !!selectedPointId && draft.trim().length > 0 && !sendMessage.isPending;

  function handleSend() {
    if (!selectedPointId) return;
    const content = draft.trim();
    if (!content) return;
    sendMessage.mutate(
      { probyPointId: selectedPointId, content },
      { onSuccess: () => setDraft('') },
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Точка проби</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedPointId} onValueChange={(value) => setSelectedPointId(value)} items={pointLabelById}>
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
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                    message.role === 'USER'
                      ? 'whitespace-pre-wrap bg-accent-soft text-accent-text'
                      : cn('bg-muted text-foreground', MARKDOWN_CLASSES),
                  )}
                >
                  {message.role === 'USER' ? (
                    message.content
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  )}
                </div>
              </div>
            ))}
            {sendMessage.isPending && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Генерує відповідь...
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Опишіть, що хочете підготувати..."
              rows={3}
              className="w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
            <div className="flex items-center justify-between gap-2">
              <Button size="sm" disabled={!canSend} onClick={handleSend}>
                Надіслати
              </Button>
              {!selectedPointId && (
                <span className="text-xs text-muted-foreground">Спершу оберіть точку проби</span>
              )}
            </div>
            {sendMessage.isError && (
              <p className="text-sm text-destructive">
                {accessErrorMessage(sendMessage.error) ?? 'Не вдалося надіслати повідомлення. Спробуйте ще раз.'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
