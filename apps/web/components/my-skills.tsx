'use client';

import { useState } from 'react';
import { AccordionContent, AccordionItem, AccordionRoot, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useQueryClient } from '@tanstack/react-query';
import { junakHistoryKey, junakSkillsKey, useJunakSkills, useRemoveJunakSkill } from '@/lib/queries/junak-history';
import { ApiError } from '@/lib/api-client';
import { accessErrorMessage, mutationErrorText } from '@/lib/error-message';
import { SKILL_LEVEL_LABELS } from '@/lib/history-labels';
import { formatDate } from '@/components/junak-history/shared';
import type { JunakSkill } from '@/lib/types';

function StartedSkill({ skill, onRemove }: { skill: JunakSkill; onRemove: (skill: JunakSkill) => void }) {
  const total = skill.requirements.length;
  const done = skill.signs.length;
  const signs = new Map(skill.signs.map((s) => [s.index, s]));
  return (
    <AccordionItem value={skill.id} data-testid="my-started-skill">
      <AccordionTrigger>
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="block normal-case [overflow-wrap:anywhere]">
            {skill.skillName} · {SKILL_LEVEL_LABELS[skill.level] ?? skill.level}
          </span>
          <span className="flex items-center gap-2 font-sans text-sm font-normal tracking-normal text-ink-2 normal-case">
            <ProgressBar value={total ? (done / total) * 100 : 0} className="w-24" />
            <span>
              {done} з {total} вимог
            </span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <ul className="space-y-2 text-sm">
          {skill.requirements.map((requirement, index) => {
            const sign = signs.get(index);
            return (
              <li key={index} className="space-y-0.5" data-testid="my-skill-requirement">
                <p>
                  {sign && <Badge variant="ok" className="mr-2">підписано</Badge>}
                  {requirement.text}
                </p>
                {requirement.items && requirement.items.length > 0 && (
                  <ul className="space-y-0.5 pl-4 text-ink-2">
                    {requirement.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{item}</li>
                    ))}
                  </ul>
                )}
                {sign && (
                  <p className="text-xs text-ink-2">
                    {sign.signedByName}, {new Date(sign.signedAt).toLocaleDateString('uk-UA')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {done === 0 && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            aria-label={`Прибрати «${skill.skillName}»`}
            onClick={() => onRemove(skill)}>
            Прибрати
          </Button>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export function removeErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    const message = (error.body as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message) return message;
    return 'Цю вмілість уже підписано — прибрати її може лише виховник.';
  }
  return mutationErrorText(error, 'Не вдалося прибрати вмілість.');
}

export function MySkills({ junakId }: { junakId: string }) {
  const { data, isError, error } = useJunakSkills(junakId);
  const remove = useRemoveJunakSkill(junakId);
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<JunakSkill | null>(null);

  function setConfirm(skill: JunakSkill | null) {
    remove.reset();
    setConfirming(skill);
  }

  function removeConfirmed(skill: JunakSkill) {
    remove.mutate(skill.id, {
      onSuccess: () => setConfirming(null),
      onError: () => {
        queryClient.invalidateQueries({ queryKey: junakSkillsKey(junakId) });
        queryClient.invalidateQueries({ queryKey: junakHistoryKey(junakId) });
      },
    });
  }

  if (isError) {
    return <p className="mb-6 text-sm text-destructive">{accessErrorMessage(error) ?? 'Не вдалося завантажити твої вмілості.'}</p>;
  }
  if (!data) return null;
  const started = data.items.filter((s) => s.status === 'STARTED');
  const achieved = data.items.filter((s) => s.status === 'ACHIEVED');

  return (
    <section className="mb-6 space-y-4" aria-labelledby="my-skills-title" data-testid="my-skills">
      <h2 id="my-skills-title" className="font-display text-[1.3rem] font-semibold tracking-[.04em] uppercase">
        Мої вмілості
      </h2>
      {started.length === 0 && achieved.length === 0 && (
        <p className="text-sm text-ink-2">
          Ще немає розпочатих вмілостей. Обери вмілість у каталозі нижче й натисни «Розпочати».
        </p>
      )}
      {started.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-display text-[.8rem] font-semibold tracking-[.1em] text-ink-2 uppercase">Розпочаті</h3>
          <AccordionRoot multiple>
            {started.map((skill) => (
              <StartedSkill key={skill.id} skill={skill} onRemove={setConfirm} />
            ))}
          </AccordionRoot>
        </div>
      )}
      {achieved.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-display text-[.8rem] font-semibold tracking-[.1em] text-ink-2 uppercase">Здобуті</h3>
          <ul className="space-y-1.5 text-sm">
            {achieved.map((skill) => (
              <li key={skill.id} className="flex flex-wrap items-center gap-2" data-testid="my-achieved-skill">
                <Badge variant="ok">здобута</Badge>
                <span className="[overflow-wrap:anywhere]">
                  {skill.skillName} · {SKILL_LEVEL_LABELS[skill.level] ?? skill.level}
                </span>
                {skill.achievedAt && <span className="text-ink-2">{formatDate(skill.achievedAt)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Dialog open={!!confirming} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogTitle>Прибрати вмілість?</DialogTitle>
          <p className="text-sm">
            «{confirming?.skillName}» буде прибрано зі списку розпочатих. Далі її можна розпочати знову.
          </p>
          {remove.isError && (
            <p className="text-sm text-destructive">{removeErrorText(remove.error)}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Скасувати
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => confirming && removeConfirmed(confirming)}
            >
              Прибрати
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
