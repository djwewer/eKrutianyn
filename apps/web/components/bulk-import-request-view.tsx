'use client';

import { Badge } from '@/components/ui/badge';
import { POSITION_LABELS } from '@/lib/role-labels';
import type { ApprovalRequest, BulkImportRow, GuardianRelation, MatchedJunakSummary, PositionType } from '@/lib/types';

const RELATION_LABELS: Record<GuardianRelation, string> = {
  MOTHER: 'Мама',
  FATHER: 'Тато',
  GUARDIAN: 'Опікун',
};

const DEGREE_LABELS: Record<string, string> = {
  PRYHYLNYK: 'Прихильник',
  UCHASNYK: 'Учасник',
  ROZVIDUVACH: 'Розвідувач',
};

function positionList(types: PositionType[]): string {
  return types.map((t) => POSITION_LABELS[t] ?? t).join(', ');
}

/** Dates arrive as ISO strings; the sheet and the rest of the UI use DD.MM.YYYY. */
function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

interface FieldChange {
  label: string;
  before?: string;
  after: string;
  /** True when the value is submitted but the importer will NOT apply it (an existing value wins). */
  ignored?: boolean;
}

/** Fields the importer would set on a brand-new junak. */
function newJunakFields(row: BulkImportRow): FieldChange[] {
  const fields: FieldChange[] = [
    { label: 'Імʼя', after: `${row.firstName} ${row.lastName}`.trim() },
    { label: 'Email', after: row.email },
  ];
  if (row.nickname) fields.push({ label: 'Псевдо', after: row.nickname });
  if (row.birthDate) fields.push({ label: 'Дата народження', after: formatDate(row.birthDate) });
  if (row.phone) fields.push({ label: 'Телефон', after: row.phone });
  if (row.hurtokName) fields.push({ label: 'Гурток', after: row.hurtokName });
  if (row.residence) fields.push({ label: 'Місце проживання', after: row.residence });
  if (row.studyPlace) fields.push({ label: 'Місце навчання', after: row.studyPlace });
  if (row.skobDate) fields.push({ label: 'Дата ступеня «Скоб»', after: formatDate(row.skobDate) });
  return fields;
}

/**
 * Mirrors the update rules in JunakImportRowProcessorService: name, nickname,
 * birth date and hurtok overwrite; email and phone only fill an empty value.
 */
function updateFields(row: BulkImportRow, current: MatchedJunakSummary): FieldChange[] {
  const fields: FieldChange[] = [];
  const currentName = `${current.firstName} ${current.lastName}`.trim();
  const newName = `${row.firstName || current.firstName} ${row.lastName || current.lastName}`.trim();
  if (newName !== currentName) fields.push({ label: 'Імʼя', before: currentName, after: newName });
  if (row.nickname && row.nickname !== current.nickname) {
    fields.push({ label: 'Псевдо', before: current.nickname ?? '—', after: row.nickname });
  }
  if (row.birthDate && formatDate(row.birthDate) !== formatDate(current.birthDate)) {
    fields.push({ label: 'Дата народження', before: formatDate(current.birthDate), after: formatDate(row.birthDate) });
  }
  if (row.email && row.email !== current.email) {
    fields.push({
      label: 'Email',
      before: current.email || '—',
      after: row.email,
      ignored: !!current.email,
    });
  }
  if (row.phone && row.phone !== current.phone) {
    fields.push({
      label: 'Телефон',
      before: current.phone || '—',
      after: row.phone,
      ignored: !!current.phone,
    });
  }
  if (row.hurtokName && row.hurtokName !== current.hurtokName) {
    fields.push({ label: 'Гурток', before: current.hurtokName ?? '—', after: row.hurtokName });
  }
  // Residence, study place and the Скоб date only fill an empty value (the app's own data wins).
  if (row.residence && row.residence !== current.residence) {
    fields.push({ label: 'Місце проживання', before: current.residence || '—', after: row.residence, ignored: !!current.residence });
  }
  if (row.studyPlace && row.studyPlace !== current.studyPlace) {
    fields.push({ label: 'Місце навчання', before: current.studyPlace || '—', after: row.studyPlace, ignored: !!current.studyPlace });
  }
  if (row.skobDate && formatDate(row.skobDate) !== formatDate(current.skobDate)) {
    fields.push({
      label: 'Дата ступеня «Скоб»',
      before: formatDate(current.skobDate),
      after: formatDate(row.skobDate),
      ignored: !!current.skobDate,
    });
  }
  return fields;
}

function FieldLine({ field }: { field: FieldChange }) {
  if (field.ignored) {
    return (
      <li className="text-muted-foreground">
        <span className="font-medium">{field.label}:</span> залишиться {field.before} (у таблиці інше значення —{' '}
        {field.after} — його не буде застосовано)
      </li>
    );
  }
  return (
    <li>
      <span className="font-medium">{field.label}:</span>{' '}
      {field.before !== undefined && (
        <>
          <span className="line-through">{field.before}</span> →{' '}
        </>
      )}
      <span>{field.after}</span>
    </li>
  );
}

function RowCard({ row, matched, isUpdate }: { row: BulkImportRow; matched?: MatchedJunakSummary; isUpdate: boolean }) {
  const unresolvedTarget = isUpdate && !matched;
  const isProtectedTarget = !!matched && matched.kurinPositionTypes.length > 0;
  const fields = !isUpdate ? newJunakFields(row) : matched ? updateFields(row, matched) : [];
  const kurinPositions = row.kurinPositionTypes ?? [];
  const hurtokPositions = row.hurtokPositionTypes ?? [];
  const degreeEntries = Object.entries(row.degreeDates ?? {}).filter(([, date]) => !!date);
  const guardians = row.guardians ?? [];
  const requestsKurinniy = kurinPositions.includes('KURINNYI');

  const title = isUpdate
    ? matched
      ? `Оновлення: ${matched.firstName} ${matched.lastName}`
      : `Оновлення: ${row.firstName} ${row.lastName}`
    : `Новий юнак: ${row.firstName} ${row.lastName}`;

  return (
    <li className="rounded border p-3 text-sm space-y-2" data-testid="bulk-import-row">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{title}</span>
        <Badge variant={isUpdate ? 'neutral' : 'accent'}>{isUpdate ? 'Існуючий юнак' : 'Новий'}</Badge>
        {unresolvedTarget && <Badge variant="warning">Юнака не знайдено в цьому курені — рядок буде відхилено</Badge>}
        {isProtectedTarget && (
          <Badge variant="warning">Має посаду в курені — через запит оновити не можна, рядок буде відхилено</Badge>
        )}
      </div>

      {fields.length > 0 && (
        <ul className="space-y-0.5">
          {fields.map((field) => (
            <FieldLine key={field.label} field={field} />
          ))}
        </ul>
      )}
      {isUpdate && matched && fields.length === 0 && (
        <p className="text-muted-foreground">Основні дані не змінюються.</p>
      )}

      {kurinPositions.length > 0 && (
        <p className={requestsKurinniy ? 'font-semibold text-destructive' : undefined}>
          <span className="font-medium">Призначити посаду в курені:</span> {positionList(kurinPositions)}
          {requestsKurinniy && ' — посаду «Курінний» через імпорт призначити не можна, рядок буде відхилено'}
        </p>
      )}
      {hurtokPositions.length > 0 && (
        <p>
          <span className="font-medium">Призначити посаду в гуртку:</span> {positionList(hurtokPositions)}
        </p>
      )}
      {degreeEntries.length > 0 && (
        <p>
          <span className="font-medium">Ступені:</span>{' '}
          {degreeEntries.map(([key, date]) => `${DEGREE_LABELS[key] ?? key} — ${formatDate(date)}`).join('; ')}
        </p>
      )}
      {guardians.length > 0 && (
        <p>
          <span className="font-medium">Батьки та опікуни:</span>{' '}
          {guardians
            .map((g) => `${RELATION_LABELS[g.relation ?? 'GUARDIAN']}: ${[g.name, g.phone, g.email].filter(Boolean).join(', ')}`)
            .join('; ')}
        </p>
      )}
    </li>
  );
}

export function BulkImportRequestView({ request }: { request: ApprovalRequest }) {
  const data = request.newData as { rows?: unknown; processingError?: unknown };
  if (!Array.isArray(data.rows)) {
    return <p className="text-sm text-destructive">Запит пошкоджений: немає списку рядків для імпорту.</p>;
  }
  const rows = data.rows as BulkImportRow[];
  const matchedJunaky = request.matchedJunaky ?? {};
  const updateCount = rows.filter((r) => r.matchedUserId).length;
  const newCount = rows.length - updateCount;

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Рядків: {rows.length} (нових — {newCount}, оновлень — {updateCount})
      </p>
      {typeof data.processingError === 'string' && (
        <p className="text-sm text-destructive">{data.processingError}</p>
      )}
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <RowCard
            key={row.rowIndex ?? index}
            row={row}
            matched={row.matchedUserId ? matchedJunaky[row.matchedUserId] : undefined}
            isUpdate={!!row.matchedUserId}
          />
        ))}
      </ul>
    </div>
  );
}
