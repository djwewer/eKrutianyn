'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useSession } from '@/lib/session-client';
import { useDeleteSkill, useSkillsCatalog } from '@/lib/queries/skills';
import { accessErrorMessage, mutationErrorText } from '@/lib/error-message';
import { SKILL_GROUP_LABELS, SKILL_LEVEL_LABELS } from '@/lib/history-labels';
import { AccordionContent, AccordionItem, AccordionRoot, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CustomSkillDialog } from '@/components/custom-skill-dialog';
import { SkillRequirementList } from '@/components/skill-requirement-list';
import type { Skill } from '@/lib/types';

function SkillCard({ skill, canManage, onEdit }: { skill: Skill; canManage: boolean; onEdit: (skill: Skill) => void }) {
  const [selected, setSelected] = useState(skill.levels[0]?.level);
  const remove = useDeleteSkill();
  const level = skill.levels.find((l) => l.level === selected) ?? skill.levels[0];

  return (
    <li className="space-y-3 rounded-lg border border-border bg-background p-3" data-testid="skill-card">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 font-medium [overflow-wrap:anywhere]">{skill.name}</h3>
        {skill.isCustom && <Badge variant="neutral">Власна</Badge>}
      </div>
      <div role="tablist" aria-label={`Рівні вмілості «${skill.name}»`} className="flex flex-wrap gap-1">
        {skill.levels.map((l) => {
          const active = l.level === level?.level;
          return (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(l.level)}
              className={
                active
                  ? 'rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-text'
                  : 'rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted'
              }
            >
              {SKILL_LEVEL_LABELS[l.level]}
            </button>
          );
        })}
      </div>
      {level && (
        <div role="tabpanel" aria-label={SKILL_LEVEL_LABELS[level.level]} className="space-y-2 text-sm">
          {level.note && <p className="font-medium text-accent-text">{level.note}</p>}
          <SkillRequirementList requirements={level.requirements} />
        </div>
      )}
      {canManage && skill.isCustom && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onEdit(skill)}>
            Змінити
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Видалити вмілість «${skill.name}»?`)) remove.mutate(skill.id);
            }}
          >
            Видалити
          </Button>
        </div>
      )}
      {remove.isError && (
        <p className="text-sm text-destructive">{mutationErrorText(remove.error, 'Не вдалося видалити вмілість.')}</p>
      )}
    </li>
  );
}

export default function SkillsPage() {
  const { data: session } = useSession();
  const { data: catalog, isError, error } = useSkillsCatalog();
  const [dialog, setDialog] = useState<{ skill: Skill | null } | null>(null);

  if (!session) return null;
  const canManage = session.role === 'ZVYAZKOVYI';

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Вмілості</h1>
        {canManage && (
          <Button onClick={() => setDialog({ skill: null })}>
            <Plus aria-hidden />
            Додати власну вмілість
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Каталог «Вмілості УПЮ» (Львів, 2003) і власні вмілості куреня. Рівень вмілості — це проба, до якої вона
        призначена.
      </p>
      {isError && (
        <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Не вдалося завантажити каталог.'}</p>
      )}
      {catalog && (
        <AccordionRoot multiple>
          {catalog.map(({ group, skills }) => (
            <AccordionItem key={group} value={group}>
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  {SKILL_GROUP_LABELS[group]}
                  <Badge variant="neutral">{skills.length}</Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {skills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">У цій групі ще немає вмілостей.</p>
                ) : (
                  <ul className="space-y-3">
                    {skills.map((skill) => (
                      <SkillCard key={skill.id} skill={skill} canManage={canManage} onEdit={(s) => setDialog({ skill: s })} />
                    ))}
                  </ul>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </AccordionRoot>
      )}
      {dialog && <CustomSkillDialog skill={dialog.skill} onClose={() => setDialog(null)} />}
    </div>
  );
}
