import type { JunakImportField } from './types';

type ColumnFieldRule = {
  field: JunakImportField;
  andGroups: string[][];
};

const COLUMN_FIELD_KEYWORDS: ColumnFieldRule[] = [
  // Parents first: "Телефон мами" must not fall through to the generic PHONE rule below.
  { field: 'FATHER_EMAIL', andGroups: [['батьк', 'email'], ['батьк', 'пошта'], ['тато', 'email'], ['тато', 'пошта'], ['тата', 'email'], ['тата', 'пошта']] },
  { field: 'FATHER_PHONE', andGroups: [['батьк', 'телефон'], ['тато', 'телефон'], ['тата', 'телефон']] },
  { field: 'FATHER_NAME', andGroups: [['батьк'], ['тато'], ['тата']] },
  { field: 'MOTHER_EMAIL', andGroups: [['мам', 'email'], ['мам', 'пошта'], ['матер', 'email'], ['матер', 'пошта'], ['матір', 'email'], ['матір', 'пошта']] },
  { field: 'MOTHER_PHONE', andGroups: [['мам', 'телефон'], ['матер', 'телефон'], ['матір', 'телефон']] },
  { field: 'MOTHER_NAME', andGroups: [['мам'], ['матер'], ['матір']] },
  { field: 'GUARDIAN_1_EMAIL', andGroups: [['1', 'email'], ['1', 'пошта']] },
  { field: 'GUARDIAN_1_PHONE', andGroups: [['1', 'телефон']] },
  { field: 'GUARDIAN_1_NAME', andGroups: [['контакт', '1'], ['опікун', '1']] },
  { field: 'GUARDIAN_2_EMAIL', andGroups: [['2', 'email'], ['2', 'пошта']] },
  { field: 'GUARDIAN_2_PHONE', andGroups: [['2', 'телефон']] },
  { field: 'GUARDIAN_2_NAME', andGroups: [['контакт', '2'], ['опікун', '2']] },
  { field: 'DEGREE_PRYHYLNYK_DATE', andGroups: [['прихильник']] },
  { field: 'DEGREE_UCHASNYK_DATE', andGroups: [['учасник']] },
  { field: 'DEGREE_ROZVIDUVACH_DATE', andGroups: [['розвідувач']] },
  { field: 'DEGREE_SKOB_DATE', andGroups: [['скоб']] },
  { field: 'CURRENT_DEGREE', andGroups: [['ступінь'], ['ступень']] },
  { field: 'RESIDENCE', andGroups: [['проживан'], ['адрес']] },
  { field: 'STUDY_PLACE', andGroups: [['навчан'], ['школ'], ['заклад']] },
  { field: 'HURTOK_POSITION', andGroups: [['посада', 'гурт'], ['діловодство', 'гурт']] },
  { field: 'KURIN_POSITION', andGroups: [['посада', 'курен'], ['посада', 'курін'], ['діловодство', 'курен']] },
  { field: 'EMAIL', andGroups: [['email'], ['пошта'], ['e-mail'], ['мейл']] },
  { field: 'PHONE', andGroups: [['телефон'], ['тел.']] },
  { field: 'BIRTH_DATE', andGroups: [['дата народж'], ['днар']] },
  { field: 'NICKNAME', andGroups: [['псевдо'], ['позивний']] },
  { field: 'HURTOK', andGroups: [['гурток']] },
  { field: 'FIRST_LAST_NAME', andGroups: [['піб'], ["ім'я"], ['імя'], ['прізвище']] },
];

function normalize(text: string | null | undefined): string {
  return (text ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function autoMapColumns(
  headers: (string | null | undefined)[],
  savedMapping?: { header: string; field: string }[],
): Record<number, JunakImportField | ''> {
  const savedByHeader = new Map<string, JunakImportField>();
  for (const entry of savedMapping ?? []) {
    savedByHeader.set(entry.header, entry.field as JunakImportField);
  }

  const result: Record<number, JunakImportField | ''> = {};
  const takenFields = new Set<JunakImportField>();

  headers.forEach((rawHeader, index) => {
    const saved = rawHeader == null ? undefined : savedByHeader.get(rawHeader);
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
  rawValues: (string | null | undefined)[],
  savedMapping?: { rawValue: string; positionType: string | null }[],
): Record<string, string> {
  const savedByValue = new Map<string, string>();
  for (const entry of savedMapping ?? []) {
    if (entry.positionType) savedByValue.set(entry.rawValue, entry.positionType);
  }

  const result: Record<string, string> = {};
  for (const rawValue of rawValues) {
    if (rawValue == null) continue;
    const saved = savedByValue.get(rawValue);
    if (saved) {
      result[rawValue] = saved;
      continue;
    }
    result[rawValue] = POSITION_VALUE_KEYWORDS[normalize(rawValue)] ?? '';
  }
  return result;
}
