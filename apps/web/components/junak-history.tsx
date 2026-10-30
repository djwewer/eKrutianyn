'use client';

import { useJunakSkills } from '@/lib/queries/junak-history';
import { accessErrorMessage } from '@/lib/error-message';
import { SkillsSection } from '@/components/junak-history/skills-section';

/**
 * «Історія» юнака. Хто може редагувати, вирішує бекенд (`canEdit`): звʼязковий
 * або виховник гуртка юнака. `readOnly` примусово вимикає редагування (/me).
 */
export function JunakHistory({ junakId, readOnly = false }: { junakId: string; readOnly?: boolean }) {
  const { data, isError, error } = useJunakSkills(junakId);
  return (
    <section className="space-y-3" aria-labelledby="junak-history-title">
      <h2 id="junak-history-title" className="text-lg font-semibold">
        Історія
      </h2>
      {isError && <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження історії.'}</p>}
      {data && <SkillsSection junakId={junakId} skills={data.items} canEdit={data.canEdit && !readOnly} />}
    </section>
  );
}
