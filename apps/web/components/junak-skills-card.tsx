'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AccordionContent, AccordionItem, AccordionRoot, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgressBar } from '@/components/ui/progress-bar';
import { nativeSelectClass } from '@/components/ui/native-select';
import { useSkillsCatalog } from '@/lib/queries/skills';
import {
  useAchieveJunakSkill,
  useAddJunakSkill,
  useJunakSkills,
  useRemoveJunakSkill,
  useSignSkillRequirement,
  useStartJunakSkill,
  useUnsignSkillRequirement,
  useUpdateJunakSkill,
} from '@/lib/queries/junak-history';
import { accessErrorMessage, mutationErrorText } from '@/lib/error-message';
import { SKILL_GROUP_LABELS, SKILL_GROUP_ORDER, SKILL_LEVEL_LABELS } from '@/lib/history-labels';
import type { JunakSkill } from '@/lib/types';
import { DialogActions, RowActions, formatDate, today } from '@/components/junak-history/shared';
import { removeErrorText } from '@/components/my-skills';

const levelName = (skill: JunakSkill) => `${skill.skillName} · ${SKILL_LEVEL_LABELS[skill.level] ?? skill.level}`;

/**
 * Картка «Вмілості» на профілі юнака. Розпочаті вмілості підсвічені й
 * розкриваються у вимоги; хто може підписувати (`canEdit`) — вирішує бекенд.
 */
export function JunakSkillsCard({ junakId, readOnly = false }: { junakId: string; readOnly?: boolean }) {
  const { data, isError, error } = useJunakSkills(junakId);
  const remove = useRemoveJunakSkill(junakId);
  const [dialog, setDialog] = useState<
    | { kind: 'start' }
    | { kind: 'add' }
    | { kind: 'edit'; skill: JunakSkill }
    | { kind: 'credit'; skill: JunakSkill }
    | { kind: 'remove'; skill: JunakSkill }
    | null
  >(null);

  if (isError) {
    return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Не вдалося завантажити вмілості.'}</p>;
  }
  if (!data) return null;

  const canEdit = data.canEdit && !readOnly;
  const canStart = data.canStart;
  const started = data.items.filter((s) => s.status === 'STARTED');
  const achieved = data.items.filter((s) => s.status === 'ACHIEVED');
  const byGroup = SKILL_GROUP_ORDER.map((group) => ({ group, items: achieved.filter((s) => s.group === group) })).filter(
    (g) => g.items.length > 0,
  );
  const takenLevelIds = new Set(data.items.map((s) => s.levelId));

  return (
    <AccordionRoot>
      <AccordionItem value="skills" data-testid="junak-skills">
        <AccordionTrigger>
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block">Вмілості</span>
            <span
              className="block font-sans text-sm font-normal tracking-normal text-ink-2 normal-case"
              data-testid="junak-skills-summary"
            >
              Розпочато: {started.length} · Здобуто: {achieved.length}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/skills" className="text-xs text-accent-text hover:underline">
                Каталог
              </Link>
              {canStart && (
                <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'start' })}>
                  Розпочати вмілість
                </Button>
              )}
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'add' })}>
                  Додати здобуту
                </Button>
              )}
            </div>

            {started.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-display text-[.8rem] font-semibold tracking-[.1em] text-ink-2 uppercase">Розпочаті</h3>
                <AccordionRoot multiple>
                  {started.map((skill) => (
                    <StartedSkill
                      key={skill.id}
                      junakId={junakId}
                      skill={skill}
                      canEdit={canEdit}
                      canRemove={canEdit || (canStart && skill.signs.length === 0)}
                      onCredit={() => setDialog({ kind: 'credit', skill })}
                      onRemove={() => {
                        remove.reset();
                        setDialog({ kind: 'remove', skill });
                      }}
                    />
                  ))}
                </AccordionRoot>
              </div>
            )}

            {achieved.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-display text-[.8rem] font-semibold tracking-[.1em] text-ink-2 uppercase">Здобуті</h3>
                {byGroup.map(({ group, items }) => (
                  <div key={group} className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{SKILL_GROUP_LABELS[group]}</p>
                    <ul className="space-y-1">
                      {items.map((s) => (
                        <li key={s.id} className="flex items-start justify-between gap-2" data-testid="junak-skill">
                          <span className="flex min-w-0 flex-wrap items-center gap-2">
                            <Badge variant="mute" className="min-w-0 max-w-full shrink whitespace-normal [overflow-wrap:anywhere]">
                              {s.skillName} {s.level}
                            </Badge>
                            <span className="text-muted-foreground">{s.achievedAt && formatDate(s.achievedAt)}</span>
                            {s.examiner && (
                              <span className="min-w-0 [overflow-wrap:anywhere] text-xs text-muted-foreground">
                                екзаменатор: {s.examiner}
                              </span>
                            )}
                            {s.certificateNumber && (
                              <span className="min-w-0 [overflow-wrap:anywhere] text-xs text-muted-foreground">
                                посвідка № {s.certificateNumber}
                              </span>
                            )}
                          </span>
                          {canEdit && (
                            <RowActions
                              label={`${s.skillName} (${SKILL_LEVEL_LABELS[s.level] ?? s.level})`}
                              onEdit={() => setDialog({ kind: 'edit', skill: s })}
                              onDelete={() => {
                                remove.reset();
                                remove.mutate(s.id);
                              }}
                              disabled={remove.isPending}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {started.length === 0 && achieved.length === 0 && <p className="text-muted-foreground">Вмілостей ще немає.</p>}
            {remove.isError && dialog?.kind !== 'remove' && (
              <p className="text-destructive">{mutationErrorText(remove.error, 'Не вдалося видалити запис.')}</p>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {dialog?.kind === 'start' && <StartDialog junakId={junakId} takenLevelIds={takenLevelIds} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'add' && (
        <JunakSkillDialog junakId={junakId} entry={null} takenLevelIds={takenLevelIds} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'edit' && (
        <JunakSkillDialog junakId={junakId} entry={dialog.skill} takenLevelIds={takenLevelIds} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'credit' && <CreditDialog junakId={junakId} skill={dialog.skill} onClose={() => setDialog(null)} />}
      <Dialog open={dialog?.kind === 'remove'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogTitle>Прибрати вмілість?</DialogTitle>
          <p className="text-sm">
            «{dialog?.kind === 'remove' ? dialog.skill.skillName : ''}» буде прибрано зі списку розпочатих. Далі її можна
            розпочати знову.
          </p>
          {remove.isError && <p className="text-sm text-destructive">{removeErrorText(remove.error)}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>
              Скасувати
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => dialog?.kind === 'remove' && remove.mutate(dialog.skill.id, { onSuccess: () => setDialog(null) })}
            >
              Прибрати
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AccordionRoot>
  );
}

function StartedSkill({
  junakId,
  skill,
  canEdit,
  canRemove,
  onCredit,
  onRemove,
}: {
  junakId: string;
  skill: JunakSkill;
  canEdit: boolean;
  canRemove: boolean;
  onCredit: () => void;
  onRemove: () => void;
}) {
  const sign = useSignSkillRequirement(junakId);
  const unsign = useUnsignSkillRequirement(junakId);
  const total = skill.requirements.length;
  const done = skill.signs.length;
  const signs = new Map(skill.signs.map((s) => [s.index, s]));
  const busy = sign.isPending || unsign.isPending;
  const failed = sign.isError ? sign.error : unsign.isError ? unsign.error : null;

  function toggle(index: number, signed: boolean) {
    sign.reset();
    unsign.reset();
    (signed ? unsign : sign).mutate({ id: skill.id, index });
  }

  return (
    <AccordionItem
      value={skill.id}
      data-testid="junak-started-skill"
      className="border-signal! bg-signal-soft/50!"
    >
      <AccordionTrigger>
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="block normal-case [overflow-wrap:anywhere]">{levelName(skill)}</span>
          <span className="flex items-center gap-2 font-sans text-sm font-normal tracking-normal text-ink-2 normal-case">
            <ProgressBar value={total ? (done / total) * 100 : 0} className="w-24" />
            <span data-testid="junak-skill-progress">
              {done} з {total} вимог
            </span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <ul className="space-y-2 text-sm">
          {skill.requirements.map((requirement, index) => {
            const s = signs.get(index);
            return (
              <li key={index} className="space-y-0.5" data-testid="junak-skill-requirement">
                <div className="flex items-start gap-2">
                  {canEdit ? (
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-[var(--navy)]"
                      checked={!!s}
                      disabled={busy}
                      aria-label={`Підпис вимоги ${index + 1}: ${skill.skillName}`}
                      onChange={() => toggle(index, !!s)}
                    />
                  ) : (
                    s && <Badge variant="ok">підписано</Badge>
                  )}
                  <p className="min-w-0 [overflow-wrap:anywhere]">{requirement.text}</p>
                </div>
                {requirement.items && requirement.items.length > 0 && (
                  <ul className="space-y-0.5 pl-6 text-ink-2">
                    {requirement.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{item}</li>
                    ))}
                  </ul>
                )}
                {s && (
                  <p className="pl-6 text-xs text-ink-2">
                    {s.signedByName}, {new Date(s.signedAt).toLocaleDateString('uk-UA')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {failed != null && <p className="mt-2 text-sm text-destructive">{mutationErrorText(failed, 'Не вдалося змінити підпис.')}</p>}
        {(canEdit || canRemove) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {canEdit && (
              <Button size="sm" aria-label={`Зарахувати вмілість «${skill.skillName}»`} onClick={onCredit}>
                Зарахувати вмілість
              </Button>
            )}
            {canRemove && (
              <Button size="sm" variant="outline" aria-label={`Прибрати «${skill.skillName}»`} onClick={onRemove}>
                Прибрати
              </Button>
            )}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

/** Search a catalog skill and pick one of its levels that has no record yet. */
function SkillPicker({ takenLevelIds, onChange }: { takenLevelIds: Set<string>; onChange: (levelId: string) => void }) {
  const { data: catalog } = useSkillsCatalog();
  const [query, setQuery] = useState('');
  const [skillId, setSkillId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState('');

  const free = (catalog ?? [])
    .flatMap((g) => g.skills)
    .map((s) => ({ ...s, levels: s.levels.filter((l) => !takenLevelIds.has(l.id)) }))
    .filter((s) => s.levels.length > 0);
  const selected = free.find((s) => s.id === skillId) ?? null;
  const needle = query.trim().toLocaleLowerCase('uk');
  const matches = needle ? free.filter((s) => s.name.toLocaleLowerCase('uk').includes(needle)).slice(0, 20) : [];

  function pickLevel(id: string) {
    setLevelId(id);
    onChange(id);
  }

  return (
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
              pickLevel('');
            }}
          >
            Інша
          </Button>
        </div>
      ) : (
        <>
          <Input id="skill-search" placeholder="Почніть вводити назву" value={query} onChange={(e) => setQuery(e.target.value)} />
          {matches.length > 0 && (
            <ul className="max-h-48 space-y-0.5 overflow-auto rounded-md border border-border p-1" aria-label="Знайдені вмілості">
              {matches.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full [overflow-wrap:anywhere] rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent-soft"
                    onClick={() => {
                      setSkillId(s.id);
                      pickLevel(s.levels.length === 1 ? s.levels[0].id : '');
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
          <select id="skill-level" value={levelId} onChange={(e) => pickLevel(e.target.value)} className={nativeSelectClass}>
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
  );
}

function StartDialog({ junakId, takenLevelIds, onClose }: { junakId: string; takenLevelIds: Set<string>; onClose: () => void }) {
  const start = useStartJunakSkill(junakId);
  const [levelId, setLevelId] = useState('');
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>Розпочати вмілість</DialogTitle>
        <SkillPicker takenLevelIds={takenLevelIds} onChange={setLevelId} />
        {start.isError && <p className="text-sm text-destructive">{mutationErrorText(start.error, 'Не вдалося розпочати вмілість.')}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Скасувати
          </Button>
          <Button disabled={!levelId || start.isPending} onClick={() => start.mutate(levelId, { onSuccess: onClose })}>
            Розпочати
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreditDialog({ junakId, skill, onClose }: { junakId: string; skill: JunakSkill; onClose: () => void }) {
  const achieve = useAchieveJunakSkill(junakId);
  const [achievedAt, setAchievedAt] = useState(today());
  const [examiner, setExaminer] = useState('');
  const [certificateNumber, setCertificateNumber] = useState('');
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>Зарахувати вмілість</DialogTitle>
        <p className="text-sm font-medium [overflow-wrap:anywhere]">{levelName(skill)}</p>
        <div className="space-y-2">
          <Label htmlFor="credit-date">Дата здобуття</Label>
          <Input id="credit-date" type="date" max={today()} value={achievedAt} onChange={(e) => setAchievedAt(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="credit-examiner">Екзаменатор (необовʼязково)</Label>
          <Input id="credit-examiner" value={examiner} maxLength={120} onChange={(e) => setExaminer(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="credit-certificate">Номер посвідки (необовʼязково)</Label>
          <Input
            id="credit-certificate"
            value={certificateNumber}
            maxLength={50}
            onChange={(e) => setCertificateNumber(e.target.value)}
          />
        </div>
        {achieve.isError && <p className="text-sm text-destructive">{mutationErrorText(achieve.error, 'Не вдалося зарахувати вмілість.')}</p>}
        <DialogActions
          onCancel={onClose}
          disabled={!achievedAt || achieve.isPending}
          onSubmit={() =>
            achieve.mutate(
              {
                id: skill.id,
                achievedAt,
                examiner: examiner.trim() || undefined,
                certificateNumber: certificateNumber.trim() || undefined,
              },
              { onSuccess: onClose },
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}

/** Direct add of an already achieved skill, or edit of an achieved one. */
function JunakSkillDialog({
  junakId,
  entry,
  takenLevelIds,
  onClose,
}: {
  junakId: string;
  entry: JunakSkill | null;
  takenLevelIds: Set<string>;
  onClose: () => void;
}) {
  const add = useAddJunakSkill(junakId);
  const update = useUpdateJunakSkill(junakId);
  const mutation = entry ? update : add;
  const [levelId, setLevelId] = useState('');
  const [achievedAt, setAchievedAt] = useState(entry?.achievedAt ?? today());
  const [examiner, setExaminer] = useState(entry?.examiner ?? '');
  const [certificateNumber, setCertificateNumber] = useState(entry?.certificateNumber ?? '');

  function submit() {
    if (entry) {
      update.mutate(
        { id: entry.id, achievedAt, examiner: examiner.trim() || null, certificateNumber: certificateNumber.trim() || null },
        { onSuccess: onClose },
      );
    } else {
      add.mutate(
        { levelId, achievedAt, examiner: examiner.trim() || undefined, certificateNumber: certificateNumber.trim() || undefined },
        { onSuccess: onClose },
      );
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>{entry ? 'Змінити вмілість' : 'Додати вмілість'}</DialogTitle>
        {entry ? (
          <p className="text-sm font-medium">
            {entry.skillName} — {SKILL_LEVEL_LABELS[entry.level] ?? entry.level}
          </p>
        ) : (
          <SkillPicker takenLevelIds={takenLevelIds} onChange={setLevelId} />
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
          <Input id="skill-certificate" value={certificateNumber} maxLength={50} onChange={(e) => setCertificateNumber(e.target.value)} />
        </div>
        {mutation.isError && <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти вмілість.')}</p>}
        <DialogActions onCancel={onClose} onSubmit={submit} disabled={!achievedAt || (!entry && !levelId) || mutation.isPending} />
      </DialogContent>
    </Dialog>
  );
}
