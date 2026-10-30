'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSkillsCatalog } from '@/lib/queries/skills';
import { useAddJunakSkill, useRemoveJunakSkill, useUpdateJunakSkill } from '@/lib/queries/junak-history';
import { mutationErrorText } from '@/lib/error-message';
import { SKILL_GROUP_LABELS, SKILL_GROUP_ORDER, SKILL_LEVEL_LABELS } from '@/lib/history-labels';
import type { JunakSkill } from '@/lib/types';
import { DialogActions, EmptyText, HistoryCard, RowActions, formatDate, today } from './shared';

export function SkillsSection({ junakId, skills, canEdit }: { junakId: string; skills: JunakSkill[]; canEdit: boolean }) {
  const [dialog, setDialog] = useState<{ entry: JunakSkill | null } | null>(null);
  const remove = useRemoveJunakSkill(junakId);
  const byGroup = SKILL_GROUP_ORDER.map((group) => ({ group, items: skills.filter((s) => s.group === group) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <HistoryCard
      title="Вмілості"
      testId="history-skills"
      addLabel="Додати вмілість"
      onAdd={canEdit ? () => setDialog({ entry: null }) : undefined}
      extra={
        <Link href="/skills" className="text-xs text-accent-text hover:underline">
          Каталог
        </Link>
      }
    >
      {byGroup.length === 0 ? (
        <EmptyText>Вмілостей ще немає.</EmptyText>
      ) : (
        byGroup.map(({ group, items }) => (
          <div key={group} className="space-y-1">
            <p className="text-xs font-semibold uppercase text-muted-foreground">{SKILL_GROUP_LABELS[group]}</p>
            <ul className="space-y-1">
              {items.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2" data-testid="junak-skill">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge className="min-w-0 max-w-full shrink whitespace-normal rounded-xl [overflow-wrap:anywhere]">
                      {s.skillName} {s.level}
                    </Badge>
                    <span className="text-muted-foreground">{formatDate(s.achievedAt)}</span>
                    {s.examiner && <span className="min-w-0 [overflow-wrap:anywhere] text-xs text-muted-foreground">екзаменатор: {s.examiner}</span>}
                    {s.certificateNumber && (
                      <span className="min-w-0 [overflow-wrap:anywhere] text-xs text-muted-foreground">
                        посвідка № {s.certificateNumber}
                      </span>
                    )}
                  </span>
                  {canEdit && (
                    <RowActions
                      label={`${s.skillName} (${SKILL_LEVEL_LABELS[s.level] ?? s.level})`}
                      onEdit={() => setDialog({ entry: s })}
                      onDelete={() => remove.mutate(s.id)}
                      disabled={remove.isPending}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {remove.isError && <p className="text-destructive">{mutationErrorText(remove.error, 'Не вдалося видалити запис.')}</p>}
      {dialog && <JunakSkillDialog junakId={junakId} entry={dialog.entry} onClose={() => setDialog(null)} />}
    </HistoryCard>
  );
}

function JunakSkillDialog({ junakId, entry, onClose }: { junakId: string; entry: JunakSkill | null; onClose: () => void }) {
  const { data: catalog } = useSkillsCatalog();
  const add = useAddJunakSkill(junakId);
  const update = useUpdateJunakSkill(junakId);
  const mutation = entry ? update : add;
  const [query, setQuery] = useState('');
  const [skillId, setSkillId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState('');
  const [achievedAt, setAchievedAt] = useState(entry?.achievedAt ?? today());
  const [examiner, setExaminer] = useState(entry?.examiner ?? '');
  const [certificateNumber, setCertificateNumber] = useState(entry?.certificateNumber ?? '');

  const allSkills = (catalog ?? []).flatMap((g) => g.skills);
  const selected = allSkills.find((s) => s.id === skillId) ?? null;
  const needle = query.trim().toLocaleLowerCase('uk');
  const matches = needle ? allSkills.filter((s) => s.name.toLocaleLowerCase('uk').includes(needle)).slice(0, 20) : [];

  function submit() {
    if (entry) {
      update.mutate(
        { id: entry.id, achievedAt, examiner: examiner.trim() || null, certificateNumber: certificateNumber.trim() || null },
        { onSuccess: onClose },
      );
    } else {
      add.mutate(
        {
          levelId,
          achievedAt,
          examiner: examiner.trim() || undefined,
          certificateNumber: certificateNumber.trim() || undefined,
        },
        { onSuccess: onClose },
      );
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>{entry ? 'Змінити вмілість' : 'Додати вмілість'}</DialogTitle>
        {entry ? (
          <p className="text-sm font-medium">
            {entry.skillName} — {SKILL_LEVEL_LABELS[entry.level] ?? entry.level}
          </p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="skill-search">Вмілість</Label>
            {selected ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span className="min-w-0 [overflow-wrap:anywhere]">{selected.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSkillId(null);
                    setLevelId('');
                  }}
                >
                  Інша
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="skill-search"
                  placeholder="Почніть вводити назву"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {matches.length > 0 && (
                  <ul className="max-h-48 space-y-0.5 overflow-auto rounded-md border border-border p-1" aria-label="Знайдені вмілості">
                    {matches.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="w-full [overflow-wrap:anywhere] rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent-soft"
                          onClick={() => {
                            setSkillId(s.id);
                            setLevelId(s.levels.length === 1 ? s.levels[0].id : '');
                          }}
                        >
                          {s.name} <span className="text-xs text-muted-foreground">· {SKILL_GROUP_LABELS[s.group] ?? ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {needle && matches.length === 0 && <p className="text-xs text-muted-foreground">Нічого не знайдено.</p>}
              </>
            )}
            {selected && (
              <div className="space-y-2">
                <Label htmlFor="skill-level">Рівень</Label>
                <select
                  id="skill-level"
                  value={levelId}
                  onChange={(e) => setLevelId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Оберіть рівень</option>
                  {selected.levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {SKILL_LEVEL_LABELS[l.level] ?? l.level}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="skill-date">Дата здобуття</Label>
          <Input id="skill-date" type="date" max={today()} value={achievedAt} onChange={(e) => setAchievedAt(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="skill-examiner">Екзаменатор (необовʼязково)</Label>
          <Input id="skill-examiner" value={examiner} maxLength={120} onChange={(e) => setExaminer(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="skill-certificate">Номер посвідки (необовʼязково)</Label>
          <Input
            id="skill-certificate"
            value={certificateNumber}
            maxLength={50}
            onChange={(e) => setCertificateNumber(e.target.value)}
          />
        </div>
        {mutation.isError && (
          <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти вмілість.')}</p>
        )}
        <DialogActions
          onCancel={onClose}
          onSubmit={submit}
          disabled={!achievedAt || (!entry && !levelId) || mutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
