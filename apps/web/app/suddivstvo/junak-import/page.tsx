'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useKurin } from '@/lib/queries/kurin';
import { accessErrorMessage } from '@/lib/error-message';
import { ApiError } from '@/lib/api-client';
import {
  useJunakImportStatus,
  useJunakImportSheetData,
  useSaveJunakImportMapping,
} from '@/lib/queries/junak-import';
import { useImportJunakRows, useMatchCandidates } from '@/lib/queries/junak-import-rows';
import { useCreateApprovalRequest } from '@/lib/queries/approval-requests';
import {
  JUNAK_IMPORT_FIELD_LABELS,
  type JunakImportField,
  type JunakImportColumnMapping,
  type JunakImportPositionValueMapping,
  type JunakImportRowResult,
} from '@/lib/types';
import { autoMapColumns, autoMapPositionValues } from '@/lib/junak-import-auto-map';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const FIELD_OPTIONS = Object.keys(JUNAK_IMPORT_FIELD_LABELS) as JunakImportField[];
const POSITION_TYPES = ['SUDDIA', 'PYSAR', 'SKARBNYK', 'INTENDANT', 'KHORUNZHYI', 'SMM', 'HURTKOVYI'];

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function parseUkrainianDate(raw: string): string | undefined {
  const match = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

interface WizardRow {
  cells: string[];
  hurtokName: string;
  firstName: string;
  lastName: string;
  matchedUserId?: string;
  matchChoice: 'new' | string;
}

function WizardRowMatchPicker({
  kurinId,
  firstName,
  lastName,
  value,
  onChange,
}: {
  kurinId: string;
  firstName: string;
  lastName: string;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const matches = useMatchCandidates(kurinId, firstName, lastName);
  const candidates = matches.data?.candidates ?? [];
  const soleCandidateId = candidates.length === 1 ? candidates[0].id : undefined;

  useEffect(() => {
    if (soleCandidateId && value === undefined) {
      onChange(soleCandidateId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soleCandidateId, value]);

  if (candidates.length === 0) {
    return null;
  }

  return (
    <select
      className="rounded border p-1 text-xs"
      value={value ?? (soleCandidateId ? soleCandidateId : 'new')}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="new">Новий юнак</option>
      {candidates.map((c) => (
        <option key={c.id} value={c.id}>
          Оновити {c.firstName} {c.lastName}
          {c.birthDate ? ` (нар. ${c.birthDate})` : ''}
        </option>
      ))}
    </select>
  );
}

export default function JunakImportPage() {
  const { data: session } = useSession();
  const { data: kurin } = useKurin();
  const kurinId = kurin?.id;
  const status = useJunakImportStatus(kurinId);
  const sheetData = useJunakImportSheetData(kurinId, true);
  const saveMapping = useSaveJunakImportMapping(kurinId ?? '');
  const importRows = useImportJunakRows(kurinId ?? '');
  const createApprovalRequest = useCreateApprovalRequest();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [columnMapping, setColumnMapping] = useState<Record<number, JunakImportField | ''>>({});
  const [positionValueMapping, setPositionValueMapping] = useState<Record<string, string>>({});
  const [rowOverrides, setRowOverrides] = useState<Record<number, { email?: string; matchChoice?: string }>>({});
  const [results, setResults] = useState<JunakImportRowResult[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const rawRows = sheetData.data?.rows ?? [];
  const header = rawRows[0] ?? [];
  const dataRows = rawRows.slice(1);

  useEffect(() => {
    if (header.length > 0 && !status.isLoading && Object.keys(columnMapping).length === 0) {
      setColumnMapping(autoMapColumns(header, status.data?.mapping?.columnMapping));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header, status.isLoading]);

  const isZvyazkovyi = session?.role === 'ZVYAZKOVYI';

  const uniquePositionValues = useMemo(() => {
    const positionColumnIndexes = Object.entries(columnMapping)
      .filter(([, field]) => field === 'HURTOK_POSITION' || field === 'KURIN_POSITION')
      .map(([idx]) => Number(idx));
    const values = new Set<string>();
    for (const row of dataRows) {
      for (const idx of positionColumnIndexes) {
        const raw = (row[idx] ?? '').trim();
        if (raw) values.add(raw);
      }
    }
    return Array.from(values);
  }, [columnMapping, dataRows]);

  useEffect(() => {
    if (uniquePositionValues.length > 0 && !status.isLoading && Object.keys(positionValueMapping).length === 0) {
      setPositionValueMapping(autoMapPositionValues(uniquePositionValues, status.data?.mapping?.positionValueMapping));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniquePositionValues, status.isLoading]);

  const wizardRows: WizardRow[] = useMemo(() => {
    let lastHurtok = '';
    const hurtokColIndex = Object.entries(columnMapping).find(([, f]) => f === 'HURTOK')?.[0];
    const nameColIndex = Object.entries(columnMapping).find(([, f]) => f === 'FIRST_LAST_NAME')?.[0];
    return dataRows
      .map((cells, i) => {
        const hurtokRaw = hurtokColIndex ? (cells[Number(hurtokColIndex)] ?? '').trim() : '';
        if (hurtokRaw) lastHurtok = hurtokRaw;
        const fullName = nameColIndex ? (cells[Number(nameColIndex)] ?? '').trim() : '';
        const [firstName, ...rest] = fullName.split(' ');
        return {
          cells,
          hurtokName: lastHurtok,
          firstName: firstName ?? '',
          lastName: rest.join(' '),
          matchChoice: rowOverrides[i]?.matchChoice ?? 'new',
        };
      })
      .filter((r) => r.firstName || r.lastName);
  }, [dataRows, columnMapping, rowOverrides]);

  function handleSaveMapping() {
    const mapping: JunakImportColumnMapping[] = Object.entries(columnMapping)
      .filter(([, field]) => field !== '')
      .map(([idx, field]) => ({ column: columnLetter(Number(idx)), header: header[Number(idx)] ?? '', field: field as JunakImportField }));
    const posMapping: JunakImportPositionValueMapping[] = Object.entries(positionValueMapping)
      .filter(([, positionType]) => positionType !== '')
      .map(([rawValue, positionType]) => ({ rawValue, positionType }));
    saveMapping.mutate({ columnMapping: mapping, positionValueMapping: posMapping }, { onSuccess: () => setStep(3) });
  }

  function colIndexFor(field: JunakImportField): number | undefined {
    const entry = Object.entries(columnMapping).find(([, f]) => f === field);
    return entry ? Number(entry[0]) : undefined;
  }

  function cellFor(cells: string[], field: JunakImportField): string {
    const idx = colIndexFor(field);
    return idx !== undefined ? (cells[idx] ?? '').trim() : '';
  }

  function resolvePositionTypes(cells: string[], field: 'HURTOK_POSITION' | 'KURIN_POSITION'): string[] {
    const raw = cellFor(cells, field);
    if (!raw) return [];
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => positionValueMapping[part])
      .filter((mapped): mapped is string => !!mapped);
  }

  function buildResolvedRows() {
    const emailColIndex = colIndexFor('EMAIL');
    return wizardRows.map((row, i) => {
      const emailFromSheet = emailColIndex !== undefined ? (row.cells[emailColIndex] ?? '').trim() : '';
      const email = rowOverrides[i]?.email || emailFromSheet;

      const guardians: { name: string; phone?: string; email?: string }[] = [];
      const guardian1Name = cellFor(row.cells, 'GUARDIAN_1_NAME');
      if (guardian1Name) {
        guardians.push({
          name: guardian1Name,
          phone: cellFor(row.cells, 'GUARDIAN_1_PHONE') || undefined,
          email: cellFor(row.cells, 'GUARDIAN_1_EMAIL') || undefined,
        });
      }
      const guardian2Name = cellFor(row.cells, 'GUARDIAN_2_NAME');
      if (guardian2Name) {
        guardians.push({
          name: guardian2Name,
          phone: cellFor(row.cells, 'GUARDIAN_2_PHONE') || undefined,
          email: cellFor(row.cells, 'GUARDIAN_2_EMAIL') || undefined,
        });
      }

      const degreeDates: { PRYHYLNYK?: string; UCHASNYK?: string; ROZVIDUVACH?: string } = {};
      const pryhylnykRaw = cellFor(row.cells, 'DEGREE_PRYHYLNYK_DATE');
      if (pryhylnykRaw) degreeDates.PRYHYLNYK = parseUkrainianDate(pryhylnykRaw);
      const uchasnykRaw = cellFor(row.cells, 'DEGREE_UCHASNYK_DATE');
      if (uchasnykRaw) degreeDates.UCHASNYK = parseUkrainianDate(uchasnykRaw);
      const rozviduvachRaw = cellFor(row.cells, 'DEGREE_ROZVIDUVACH_DATE');
      if (rozviduvachRaw) degreeDates.ROZVIDUVACH = parseUkrainianDate(rozviduvachRaw);

      const birthDateRaw = cellFor(row.cells, 'BIRTH_DATE');

      return {
        matchedUserId: row.matchChoice !== 'new' ? row.matchChoice : undefined,
        firstName: row.firstName,
        lastName: row.lastName,
        nickname: cellFor(row.cells, 'NICKNAME') || undefined,
        birthDate: birthDateRaw ? parseUkrainianDate(birthDateRaw) : undefined,
        email,
        phone: cellFor(row.cells, 'PHONE') || undefined,
        hurtokName: row.hurtokName || undefined,
        kurinPositionTypes: resolvePositionTypes(row.cells, 'KURIN_POSITION'),
        hurtokPositionTypes: resolvePositionTypes(row.cells, 'HURTOK_POSITION'),
        guardians: guardians.length > 0 ? guardians : undefined,
        degreeDates: Object.keys(degreeDates).length > 0 ? degreeDates : undefined,
      };
    });
  }

  async function handleImport() {
    setSubmitError(null);
    const rows = buildResolvedRows();
    const missingEmail = rows.some((r) => !r.email);
    if (missingEmail) {
      setSubmitError("У деяких рядках відсутній email — заповніть його перед імпортом.");
      return;
    }
    try {
      if (isZvyazkovyi) {
        const response = await importRows.mutateAsync(rows);
        setResults(response.results);
      } else {
        await createApprovalRequest.mutateAsync({ actionType: 'BULK_IMPORT_JUNAKY', newData: { rows } });
        setResults(null);
      }
    } catch (error) {
      setSubmitError(accessErrorMessage(error));
    }
  }

  if (!kurinId) return <p>Завантаження...</p>;
  if (!status.data?.connectedSpreadsheetId) {
    return (
      <p className="text-sm text-destructive">
        Спершу підключіть Книгу судді на сторінці{' '}
        <a href="/suddivstvo" className="underline">
          «Суддівство»
        </a>
        .
      </p>
    );
  }
  if (sheetData.isLoading) return <p>Завантаження таблиці...</p>;
  if (sheetData.isError) {
    const detail =
      sheetData.error instanceof ApiError && typeof sheetData.error.body === 'object' && sheetData.error.body
        ? (sheetData.error.body as { message?: string }).message
        : undefined;
    return (
      <div className="max-w-3xl space-y-1">
        <p className="text-sm text-destructive">
          {accessErrorMessage(sheetData.error) ?? 'Не вдалося завантажити таблицю з Google Sheets.'}
        </p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Імпорт юнаків з Книги судді</h1>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Крок 1: Мапінг стовпчиків</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {header.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-48 truncate text-sm">{h || `Стовпчик ${columnLetter(i)}`}</span>
                <select
                  className="rounded border p-1 text-sm"
                  value={columnMapping[i] ?? ''}
                  onChange={(e) => setColumnMapping((prev) => ({ ...prev, [i]: e.target.value as JunakImportField }))}
                >
                  <option value="">Не імпортувати</option>
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {JUNAK_IMPORT_FIELD_LABELS[f]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <Button
              size="sm"
              onClick={() => (uniquePositionValues.length > 0 ? setStep(2) : handleSaveMapping())}
            >
              Далі
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Крок 2: Мапінг значень посад</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {uniquePositionValues.map((value) => (
              <div key={value} className="flex items-center gap-2">
                <span className="w-48 truncate text-sm">{value}</span>
                <select
                  className="rounded border p-1 text-sm"
                  value={positionValueMapping[value] ?? ''}
                  onChange={(e) => setPositionValueMapping((prev) => ({ ...prev, [value]: e.target.value }))}
                >
                  <option value="">Не імпортувати</option>
                  {POSITION_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <Button size="sm" onClick={handleSaveMapping} disabled={saveMapping.isPending}>
              Далі
            </Button>
            {saveMapping.isError && (
              <p className="text-sm text-destructive">{accessErrorMessage(saveMapping.error)}</p>
            )}
          </CardContent>
        </Card>
      )}

      {step === 3 && !results && (
        <Card>
          <CardHeader>
            <CardTitle>Крок 3: Перегляд</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">Рядків до імпорту: {wizardRows.length}</p>
            {wizardRows.map((row, i) => {
              const emailColIndex = colIndexFor('EMAIL');
              const emailFromSheet = emailColIndex !== undefined ? (row.cells[emailColIndex] ?? '').trim() : '';
              return (
              <div key={i} className="flex items-center gap-2 border-b pb-1 text-sm">
                <span className="w-40 truncate">
                  {row.firstName} {row.lastName}
                </span>
                <span className="w-24 truncate text-muted-foreground">{row.hurtokName || '—'}</span>
                <Input
                  className="w-56"
                  placeholder="Email"
                  defaultValue={rowOverrides[i]?.email ?? (emailFromSheet || undefined)}
                  onChange={(e) => setRowOverrides((prev) => ({ ...prev, [i]: { ...prev[i], email: e.target.value } }))}
                />
                <WizardRowMatchPicker
                  kurinId={kurinId}
                  firstName={row.firstName}
                  lastName={row.lastName}
                  value={rowOverrides[i]?.matchChoice}
                  onChange={(v) => setRowOverrides((prev) => ({ ...prev, [i]: { ...prev[i], matchChoice: v } }))}
                />
              </div>
              );
            })}
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            <Button onClick={handleImport} disabled={importRows.isPending || createApprovalRequest.isPending}>
              {isZvyazkovyi ? 'Імпортувати' : 'Надіслати на затвердження звʼязковому'}
            </Button>
          </CardContent>
        </Card>
      )}

      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Результат</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {results.map((r) => (
              <p key={r.row} className={r.error ? 'text-destructive' : ''}>
                Рядок {r.row + 1}: {r.error ? `помилка — ${r.error}` : r.created ? 'створено' : 'оновлено'}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {!isZvyazkovyi && results === null && createApprovalRequest.isSuccess && (
        <p className="text-sm text-muted-foreground">
          Запит надіслано звʼязковому на затвердження.
        </p>
      )}
    </div>
  );
}
