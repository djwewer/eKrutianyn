'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateSkill, useUpdateSkill } from '@/lib/queries/skills';
import { mutationErrorText } from '@/lib/error-message';
import { SKILL_GROUP_LABELS, SKILL_GROUP_ORDER, SKILL_LEVEL_LABELS } from '@/lib/history-labels';
import type { Skill, SkillGroup } from '@/lib/types';

const LEVELS = [1, 2, 3];

interface LevelDraft {
  enabled: boolean;
  requirements: string;
  note: string;
}

function initialLevels(skill: Skill | null): Record<number, LevelDraft> {
  return Object.fromEntries(
    LEVELS.map((level) => {
      const existing = skill?.levels.find((l) => l.level === level);
      return [
        level,
        {
          enabled: !!existing || (!skill && level === 1),
          requirements: existing ? existing.requirements.map((r) => r.text).join('\n') : '',
          note: existing?.note ?? '',
        },
      ];
    }),
  );
}

/** Create (skill = null) or edit a kurin custom skill. Only the zvyazkovyi opens it. */
export function CustomSkillDialog({ skill, onClose }: { skill: Skill | null; onClose: () => void }) {
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const mutation = skill ? update : create;
  const [name, setName] = useState(skill?.name ?? '');
  const [group, setGroup] = useState<SkillGroup>(skill?.group ?? 'SPECIAL');
  const [levels, setLevels] = useState(() => initialLevels(skill));

  const payloadLevels = LEVELS.filter((level) => levels[level].enabled).map((level) => ({
    level,
    requirements: levels[level].requirements
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    note: levels[level].note.trim() || undefined,
  }));
  const isValid =
    name.trim() !== '' && payloadLevels.length > 0 && payloadLevels.every((level) => level.requirements.length > 0);

  function setLevel(level: number, patch: Partial<LevelDraft>) {
    setLevels((prev) => ({ ...prev, [level]: { ...prev[level], ...patch } }));
  }

  function submit() {
    const dto = { name: name.trim(), group, levels: payloadLevels };
    if (skill) {
      update.mutate({ id: skill.id, ...dto }, { onSuccess: onClose });
    } else {
      create.mutate(dto, { onSuccess: onClose });
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
        <DialogTitle>{skill ? 'Змінити власну вмілість' : 'Додати власну вмілість'}</DialogTitle>
        <div className="space-y-2">
          <Label htmlFor="custom-skill-name">Назва</Label>
          <Input id="custom-skill-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="custom-skill-group">Група</Label>
          <select
            id="custom-skill-group"
            value={group}
            onChange={(e) => setGroup(e.target.value as SkillGroup)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {SKILL_GROUP_ORDER.map((g) => (
              <option key={g} value={g}>
                {SKILL_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </div>
        {LEVELS.map((level) => (
          <fieldset key={level} className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={levels[level].enabled}
                onChange={(e) => setLevel(level, { enabled: e.target.checked })}
              />
              {SKILL_LEVEL_LABELS[level]}
            </label>
            {levels[level].enabled && (
              <>
                <textarea
                  aria-label={`Вимоги — ${SKILL_LEVEL_LABELS[level]}`}
                  placeholder="Кожна вимога з нового рядка"
                  rows={4}
                  value={levels[level].requirements}
                  onChange={(e) => setLevel(level, { requirements: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <Input
                  aria-label={`Примітка — ${SKILL_LEVEL_LABELS[level]}`}
                  placeholder="Примітка (необовʼязково)"
                  value={levels[level].note}
                  maxLength={200}
                  onChange={(e) => setLevel(level, { note: e.target.value })}
                />
              </>
            )}
          </fieldset>
        ))}
        {mutation.isError && (
          <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти вмілість.')}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Скасувати
          </Button>
          <Button disabled={!isValid || mutation.isPending} onClick={submit}>
            Зберегти
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
