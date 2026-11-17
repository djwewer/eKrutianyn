'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useSession } from '@/lib/session-client';
import { useJunakSkills, useStartJunakSkill } from '@/lib/queries/junak-history';
import { MySkills } from '@/components/my-skills';
import { useDeleteSkill, useSkillsCatalog } from '@/lib/queries/skills';
import { accessErrorMessage, mutationErrorText } from '@/lib/error-message';
import { SKILL_GROUP_LABELS, SKILL_LEVEL_LABELS } from '@/lib/history-labels';
import { AccordionContent, AccordionItem, AccordionRoot, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { CustomSkillDialog } from '@/components/custom-skill-dialog';
import { SkillRequirementList } from '@/components/skill-requirement-list';
import type { Skill } from '@/lib/types';

type LevelStatus = Map<string, 'STARTED' | 'ACHIEVED'>;

function StartControl({ junakId, levelId, status }: { junakId: string; levelId: string; status: LevelStatus }) {
  const start = useStartJunakSkill(junakId);
  const current = status.get(levelId);
  if (current) return <Badge variant={current === 'STARTED' ? 'signal' : 'ok'}>{current === 'STARTED' ? 'розпочата' : 'здобута'}</Badge>;
  return (
    <div className="space-y-1">
      <Button size="sm" disabled={start.isPending} onClick={() => start.mutate(levelId)}>
        Розпочати
      </Button>
      {start.isError && <p className="text-sm text-destructive">{mutationErrorText(start.error, 'Не вдалося розпочати вмілість.')}</p>}
    </div>
  );
}

function SkillCard({
  skill,
  canManage,
  onEdit,
  junakId,
  levelStatus,
}: {
  skill: Skill;
  canManage: boolean;
  onEdit: (skill: Skill) => void;
  junakId?: string;
  levelStatus: LevelStatus;
}) {
  const [selected, setSelected] = useState(skill.levels[0]?.level);
  const remove = useDeleteSkill();
  const level = skill.levels.find((l) => l.level === selected) ?? skill.levels[0];

  return (
    <li className="space-y-3 rounded-[6px] border border-line bg-background p-3" data-testid="skill-card">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-[.98rem] leading-tight font-bold [overflow-wrap:anywhere]">{skill.name}</h3>
        {skill.isCustom && <Badge variant="signal">Власна</Badge>}
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
                  ? 'rounded-[3px] border border-navy bg-sky-soft px-2 py-[.15rem] font-display text-[.7rem] font-semibold tracking-[.1em] text-sky-ink uppercase'
                  : 'rounded-[3px] border border-line bg-background px-2 py-[.15rem] font-display text-[.7rem] font-semibold tracking-[.1em] text-ink-2 uppercase transition-colors hover:border-navy'
              }
            >
              {SKILL_LEVEL_LABELS[l.level]}
            </button>
          );
        })}
      </div>
      {level && (
        <div role="tabpanel" aria-label={SKILL_LEVEL_LABELS[level.level]} className="space-y-2 text-sm">
          {level.note && <p className="font-medium text-sky-ink">{level.note}</p>}
          <SkillRequirementList requirements={level.requirements} />
          {junakId && <StartControl junakId={junakId} levelId={level.id} status={levelStatus} />}
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
  const isJunak = session?.role === 'JUNAK';
  const { data: mine } = useJunakSkills(isJunak ? session.userId : undefined);
  const levelStatus: LevelStatus = new Map((mine?.items ?? []).map((s) => [s.levelId, s.status]));

  if (!session) return null;
  const canManage = session.role === 'ZVYAZKOVYI';

  return (
    <div>
      <PageHeader
        title="Вмілості"
        subtitle="Каталог «Вмілості УПЮ» (Львів, 2003) і власні вмілості куреня. Рівень вмілості — це проба, до якої вона призначена."
        crumb={{ href: '/plastuvannia', label: 'Моє пластування' }}
        actions={
          canManage && (
            <Button onClick={() => setDialog({ skill: null })}>
              <Plus aria-hidden />
              Додати власну вмілість
            </Button>
          )
        }
      />
      {isJunak && <MySkills junakId={session.userId} />}
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
                  <Badge variant="mute">{skills.length}</Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {skills.length === 0 ? (
                  <p className="text-sm text-ink-2">У цій групі ще немає вмілостей.</p>
                ) : (
                  <ul className="space-y-3">
                    {skills.map((skill) => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        canManage={canManage}
                        onEdit={(s) => setDialog({ skill: s })}
                        junakId={isJunak && mine?.canStart ? session.userId : undefined}
                        levelStatus={levelStatus}
                      />
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
