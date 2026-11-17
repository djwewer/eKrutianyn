'use client';

import { useState } from 'react';
import { AccordionContent, AccordionItem, AccordionRoot, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useJunakSkills, useRemoveJunakSkill } from '@/lib/queries/junak-history';
import { mutationErrorText } from '@/lib/error-message';
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
                    {sign.signedByName}, {formatDate(sign.signedAt.slice(0, 10))}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {done === 0 && (
          <Button size="sm" variant="outline" className="mt-3" onClick={() => onRemove(skill)}>
            Прибрати
          </Button>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export function MySkills({ junakId }: { junakId: string }) {
  const { data } = useJunakSkills(junakId);
  const remove = useRemoveJunakSkill(junakId);
  const [confirming, setConfirming] = useState<JunakSkill | null>(null);

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
              <StartedSkill key={skill.id} skill={skill} onRemove={setConfirming} />
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
      <Dialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogTitle>Прибрати вмілість?</DialogTitle>
          <p className="text-sm">
            «{confirming?.skillName}» буде прибрано зі списку розпочатих. Далі її можна розпочати знову.
          </p>
          {remove.isError && (
            <p className="text-sm text-destructive">{mutationErrorText(remove.error, 'Не вдалося прибрати вмілість.')}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Скасувати
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => confirming && remove.mutate(confirming.id, { onSuccess: () => setConfirming(null) })}
            >
              Прибрати
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
