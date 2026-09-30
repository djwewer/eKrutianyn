# Junak Import Auto-Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-fill both mapping steps of the junak import wizard (`apps/web/app/suddivstvo/junak-import/page.tsx`) with a best-effort automatic guess — column headers to `JunakImportField` on Крок 1, raw position-value text to `PositionType` on Крок 2 — defaulting anything unmatched to "Не імпортувати", without touching what the zvyazkovyi already picked manually.

**Architecture:** A new pure, React-free module `apps/web/lib/junak-import-auto-map.ts` exports `autoMapColumns` (substring/keyword match, checked in a fixed most-specific-to-most-generic field order) and `autoMapPositionValues` (exact match only, against a small static dictionary). `page.tsx` calls each once, via a `useEffect` guarded on "the relevant mapping state is still empty", to seed the initial value of `columnMapping` / `positionValueMapping`.

**Tech Stack:** Next.js 16 / React 19 (existing), no new dependencies. Tests via the existing Playwright e2e suite (`apps/web/e2e/*.spec.ts`) — this workspace has no Jest/Vitest, so unit tests are not an option here; e2e is the established pattern.

## Global Constraints

- No backend/DTO/Prisma schema changes — this is a client-only UX feature (spec: "Не мета").
- Auto-map computes once when data first arrives; it must never overwrite a value the zvyazkovyi has already changed by hand.
- Precedence for both steps: previously saved mapping (exact match) → keyword/exact match → `''` ("Не імпортувати").
- Крок 1 uses **substring** AND-group keyword matching (headers are free-text phrases). Крок 2 uses **exact** match only, deliberately not substring (spec: prevents "Заступник Гурткового"/"Скарбника" and typos from false-matching their base position).
- `KURINNYI` is never a target of Крок 2 auto-map (already excluded from `POSITION_TYPES` on the frontend as a protected identity).

---

### Task 1: Auto-map columns on Крок 1

**Files:**
- Create: `apps/web/lib/junak-import-auto-map.ts`
- Modify: `apps/web/app/suddivstvo/junak-import/page.tsx:1-120` (imports + new `useEffect` near the `header`/`dataRows` derivation)
- Test: `apps/web/e2e/junak-import-auto-map.spec.ts`

**Interfaces:**
- Produces: `autoMapColumns(headers: string[], savedMapping?: { header: string; field: string }[]): Record<number, JunakImportField | ''>` — consumed directly by `page.tsx`, and by Task 2's file (same module).
- Consumes: `JunakImportField` type from `@/lib/types` (already imported in `page.tsx`).

- [ ] **Step 1: Write the failing e2e test**

Create `apps/web/e2e/junak-import-auto-map.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('auto-maps obvious column headers on Крок 1, leaves an unknown header unmapped', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  await fetch(`${API_URL}/kurins/${kurin.id}/junak-import/spreadsheet`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ spreadsheetId: 'fake-sheet-id', spreadsheetName: 'Fake Sheet' }),
  });

  await page.route('**/api/backend/kurins/*/junak-import/sheet-data', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rows: [
          ['ПІБ', 'Email', 'Щось незрозуміле'],
          ['Іван Петренко', 'ivan@example.com', 'xyz'],
        ],
      }),
    }),
  );

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo/junak-import');

  await expect(page.getByText('Крок 1: Мапінг стовпчиків')).toBeVisible();
  const selects = page.locator('select');
  await expect(selects.nth(0)).toHaveValue('FIRST_LAST_NAME');
  await expect(selects.nth(1)).toHaveValue('EMAIL');
  await expect(selects.nth(2)).toHaveValue('');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/web && npx playwright test e2e/junak-import-auto-map.spec.ts --workers=1`
Expected: FAIL — `selects.nth(0)` has value `''`, not `'FIRST_LAST_NAME'` (no auto-map exists yet).

- [ ] **Step 3: Create the auto-map module**

Create `apps/web/lib/junak-import-auto-map.ts`:

```ts
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
```

- [ ] **Step 4: Wire it into the wizard**

In `apps/web/app/suddivstvo/junak-import/page.tsx`, add the import next to the other `@/lib/...` imports:

```ts
import { autoMapColumns } from '@/lib/junak-import-auto-map';
```

Then, immediately after the existing `const dataRows = rawRows.slice(1);` line, add:

```ts
  useEffect(() => {
    if (header.length > 0 && Object.keys(columnMapping).length === 0) {
      setColumnMapping(autoMapColumns(header, status.data?.mapping?.columnMapping));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header]);
```

(`status` and `header` are already in scope at that point in the component; `setColumnMapping` is the existing state setter.)

- [ ] **Step 5: Run the test to confirm it passes**

Run: `cd apps/web && npx playwright test e2e/junak-import-auto-map.spec.ts --workers=1`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/junak-import-auto-map.ts apps/web/app/suddivstvo/junak-import/page.tsx apps/web/e2e/junak-import-auto-map.spec.ts
git commit -m "feat: auto-map obvious column headers in the junak import wizard"
```

---

### Task 2: Auto-map position values on Крок 2

**Files:**
- Modify: `apps/web/lib/junak-import-auto-map.ts` (add `autoMapPositionValues`)
- Modify: `apps/web/app/suddivstvo/junak-import/page.tsx` (wire it in near `uniquePositionValues`)
- Test: `apps/web/e2e/junak-import-auto-map.spec.ts` (add a second test)

**Interfaces:**
- Consumes: `autoMapColumns` from Task 1 (same file) — untouched by this task.
- Produces: `autoMapPositionValues(rawValues: string[], savedMapping?: { rawValue: string; positionType: string | null }[]): Record<string, string>` — consumed by `page.tsx`.

- [ ] **Step 1: Write the failing e2e test**

Append to `apps/web/e2e/junak-import-auto-map.spec.ts`:

```ts
test('auto-maps exact position values on Крок 2, leaves deputy roles and typos unmapped', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  await fetch(`${API_URL}/kurins/${kurin.id}/junak-import/spreadsheet`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ spreadsheetId: 'fake-sheet-id-2', spreadsheetName: 'Fake Sheet 2' }),
  });

  await page.route('**/api/backend/kurins/*/junak-import/sheet-data', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rows: [
          ['ПІБ', 'Діловодство в гуртку'],
          ['Іван Петренко', 'Суддя'],
          ['Петро Іванов', 'Заступник Гурткового'],
          ['Марія Сидоренко', 'Скарбиник'],
        ],
      }),
    }),
  );

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo/junak-import');

  await expect(page.getByText('Крок 1: Мапінг стовпчиків')).toBeVisible();
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByText('Крок 2: Мапінг значень посад')).toBeVisible();
  await expect(
    page.locator('span', { hasText: 'Суддя' }).locator('xpath=following-sibling::select'),
  ).toHaveValue('SUDDIA');
  await expect(
    page.locator('span', { hasText: 'Заступник Гурткового' }).locator('xpath=following-sibling::select'),
  ).toHaveValue('');
  await expect(
    page.locator('span', { hasText: 'Скарбиник' }).locator('xpath=following-sibling::select'),
  ).toHaveValue('');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/web && npx playwright test e2e/junak-import-auto-map.spec.ts --workers=1`
Expected: FAIL — the "Суддя" select has value `''`, not `'SUDDIA'` (no auto-map for position values yet). (Task 1's test should still pass.)

- [ ] **Step 3: Add `autoMapPositionValues` to the module**

Append to `apps/web/lib/junak-import-auto-map.ts`:

```ts
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
```

(`normalize` already exists in this file from Task 1 — reuse it, don't redefine it.)

- [ ] **Step 4: Wire it into the wizard**

In `apps/web/app/suddivstvo/junak-import/page.tsx`, update the import from Task 1 to:

```ts
import { autoMapColumns, autoMapPositionValues } from '@/lib/junak-import-auto-map';
```

Immediately after the existing `uniquePositionValues` `useMemo` block, add:

```ts
  useEffect(() => {
    if (uniquePositionValues.length > 0 && Object.keys(positionValueMapping).length === 0) {
      setPositionValueMapping(autoMapPositionValues(uniquePositionValues, status.data?.mapping?.positionValueMapping));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniquePositionValues]);
```

- [ ] **Step 5: Run both tests to confirm they pass**

Run: `cd apps/web && npx playwright test e2e/junak-import-auto-map.spec.ts --workers=1`
Expected: PASS (both tests)

- [ ] **Step 6: Run the full existing e2e suite for regressions**

Run: `cd apps/web && npx playwright test --workers=1`
Expected: all pass — no other spec renders this wizard with pre-set mapping state that this change could disturb (`suddivstvo.spec.ts`'s tests either don't reach Крок 1 or hit the read-error path before any mapping state exists).

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/junak-import-auto-map.ts apps/web/app/suddivstvo/junak-import/page.tsx apps/web/e2e/junak-import-auto-map.spec.ts
git commit -m "feat: auto-map exact position values in the junak import wizard"
```
