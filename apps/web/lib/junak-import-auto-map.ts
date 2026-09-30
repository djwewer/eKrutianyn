import type { JunakImportField } from './types';

type ColumnFieldRule = {
  field: JunakImportField;
  andGroups: string[][];
};

const COLUMN_FIELD_KEYWORDS: ColumnFieldRule[] = [
  { field: 'GUARDIAN_1_EMAIL', andGroups: [['1', 'email'], ['1', 'пошта'], ['батьк', 'email'], ['батьк', 'пошта']] },
  { field: 'GUARDIAN_1_PHONE', andGroups: [['1', 'телефон'], ['батьк', 'телефон']] },
  { field: 'GUARDIAN_1_NAME', andGroups: [['батьк'], ['контакт', '1'], ['опікун', '1']] },
  { field: 'GUARDIAN_2_EMAIL', andGroups: [['2', 'email'], ['2', 'пошта'], ['мат', 'email'], ['мат', 'пошта']] },
  { field: 'GUARDIAN_2_PHONE', andGroups: [['2', 'телефон'], ['мат', 'телефон']] },
  { field: 'GUARDIAN_2_NAME', andGroups: [['мат'], ['контакт', '2'], ['опікун', '2']] },
  { field: 'DEGREE_PRYHYLNYK_DATE', andGroups: [['прихильник']] },
  { field: 'DEGREE_UCHASNYK_DATE', andGroups: [['учасник']] },
  { field: 'DEGREE_ROZVIDUVACH_DATE', andGroups: [['розвідувач']] },
  { field: 'HURTOK_POSITION', andGroups: [['посада', 'гурт'], ['діловодство', 'гурт']] },
  { field: 'KURIN_POSITION', andGroups: [['посада', 'курен'], ['посада', 'курін'], ['діловодство', 'курен']] },
  { field: 'EMAIL', andGroups: [['email'], ['пошта'], ['e-mail'], ['мейл']] },
  { field: 'PHONE', andGroups: [['телефон'], ['тел.']] },
  { field: 'BIRTH_DATE', andGroups: [['дата народж'], ['днар']] },
  { field: 'NICKNAME', andGroups: [['псевдо'], ['позивний']] },
  { field: 'HURTOK', andGroups: [['гурток']] },
  { field: 'FIRST_LAST_NAME', andGroups: [['піб'], ["ім'я"], ['імя'], ['прізвище']] },
];

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function autoMapColumns(
  headers: string[],
  savedMapping?: { header: string; field: string }[],
): Record<number, JunakImportField | ''> {
  const savedByHeader = new Map<string, JunakImportField>();
  for (const entry of savedMapping ?? []) {
    savedByHeader.set(entry.header, entry.field as JunakImportField);
  }

  const result: Record<number, JunakImportField | ''> = {};
  const takenFields = new Set<JunakImportField>();

  headers.forEach((rawHeader, index) => {
    const saved = savedByHeader.get(rawHeader);
    if (saved) {
      result[index] = saved;
      takenFields.add(saved);
      return;
    }

    const normalized = normalize(rawHeader);
    const rule = COLUMN_FIELD_KEYWORDS.find(
      (candidate) =>
        !takenFields.has(candidate.field) &&
        candidate.andGroups.some((group) => group.every((keyword) => normalized.includes(keyword))),
    );

    if (rule) {
      result[index] = rule.field;
      takenFields.add(rule.field);
    } else {
      result[index] = '';
    }
  });

  return result;
}

const POSITION_VALUE_KEYWORDS: Record<string, string> = {
  'суддя': 'SUDDIA',
  'писар': 'PYSAR',
  'скарбник': 'SKARBNYK',
  'інтендант': 'INTENDANT',
  'хорунжий': 'KHORUNZHYI',
  'смм': 'SMM',
  'гуртковий': 'HURTKOVYI',
};

export function autoMapPositionValues(
  rawValues: string[],
  savedMapping?: { rawValue: string; positionType: string | null }[],
): Record<string, string> {
  const savedByValue = new Map<string, string>();
  for (const entry of savedMapping ?? []) {
    if (entry.positionType) savedByValue.set(entry.rawValue, entry.positionType);
  }

  const result: Record<string, string> = {};
  for (const rawValue of rawValues) {
    const saved = savedByValue.get(rawValue);
    if (saved) {
      result[rawValue] = saved;
      continue;
    }
    result[rawValue] = POSITION_VALUE_KEYWORDS[normalize(rawValue)] ?? '';
  }
  return result;
}
