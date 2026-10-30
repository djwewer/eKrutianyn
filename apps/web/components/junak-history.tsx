'use client';

import { useJunakHistory } from '@/lib/queries/junak-history';
import { accessErrorMessage } from '@/lib/error-message';
import { SkillsSection } from '@/components/junak-history/skills-section';
import { VfvSection } from '@/components/junak-history/vfv-section';
import { CampsSection } from '@/components/junak-history/camps-section';
import { RemarksSection } from '@/components/junak-history/remarks-section';
import { DilovodstvoSection } from '@/components/junak-history/dilovodstvo-section';
import { DatesSection } from '@/components/junak-history/dates-section';

/**
 * «Історія» юнака. Хто може редагувати, вирішує бекенд (`canEdit`): звʼязковий
 * або виховник гуртка юнака. `readOnly` примусово вимикає редагування (/me).
 */
export function JunakHistory({ junakId, readOnly = false }: { junakId: string; readOnly?: boolean }) {
  const { data, isError, error } = useJunakHistory(junakId);
  const canEdit = !!data?.canEdit && !readOnly;
  return (
    <section className="space-y-3" aria-labelledby="junak-history-title">
      <h2 id="junak-history-title" className="text-lg font-semibold">
        Історія
      </h2>
      {isError && <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження історії.'}</p>}
      {data && (
        <>
          <DatesSection junakId={junakId} upyJoinedAt={data.upyJoinedAt} plastOathAt={data.plastOathAt} canEdit={canEdit} />
          <SkillsSection junakId={junakId} skills={data.skills} canEdit={canEdit} />
          <VfvSection junakId={junakId} entries={data.vfv} canEdit={canEdit} />
          <CampsSection junakId={junakId} entries={data.camps} canEdit={canEdit} />
          <RemarksSection junakId={junakId} entries={data.remarks} canEdit={canEdit} />
          <DilovodstvoSection junakId={junakId} positions={data.positions} pastPositions={data.pastPositions} canEdit={canEdit} />
        </>
      )}
    </section>
  );
}
