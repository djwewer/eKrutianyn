# Judge book import: explicit position columns (kurin + hurtok) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

_Date: 2026-11-22. Requested by Andrii. He asked for the plan to be written and approved by the controller (Claude), then executed with subagents._

**Goal.** In the «Імпорт юнаків з Книги судді» wizard, the user decides which sheet column holds kurin positions and which holds hurtok positions, instead of the app guessing. Each column's values are then mapped to positions of its own scope.

**The problem today.**
- `apps/web/lib/junak-import-auto-map.ts` guesses the `KURIN_POSITION` / `HURTOK_POSITION` columns from header keywords. It often picks the hurtok column as the kurin one, because both contain «скарбник», «писар»…
- Step 2 of the wizard (`apps/web/app/suddivstvo/junak-import/page.tsx`) maps raw values with ONE shared `rawValue → positionType` table for both columns. The options list is the same for both.
- Some judge books have neither column, some have both.

**Architecture.**
- Positions leave the per-column field selects. Step 1 gets a separate «Посади» block with two checkboxes:
  - «Імпортувати посади куреня»
  - «Імпортувати посади в гуртку»
- Each enabled checkbox shows a select of the sheet's columns («A — Посада», …). There is no auto-detection.
- Step 2 shows two sections, one per enabled column. Each section has its own value table, limited to positions valid for that scope.
- The saved mapping keeps working. The column choice is stored as before, as `columnMapping` entries with field `KURIN_POSITION` / `HURTOK_POSITION`. Value-mapping entries gain an optional `scope` field.
- The API row import (`kurinPositionTypes` / `hurtokPositionTypes`) already exists and does not change.

**Tech stack.** NestJS + class-validator (apps/api), Next.js 16 client page + TanStack Query (apps/web), Playwright e2e, jest e2e.

## Global constraints
- Ukrainian copy, no russianisms.
- Never edit `.env`. Env values for tests live only in the shell.
- The machine has little memory. Run one test process at a time and check `lsof -i :3000 -i :3001` before Playwright. Leave nothing running.
- Commit identity: `git -c user.name=Zozulia -c user.email=user@Zozulia.local commit`. The message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use explicit `git add` paths only. Never add logo.png, `ПРОБИ  старі/`, `Проби НОВІ/`, docs/audits/, .superpowers/, visual-shots/ or test-results/.
- Position scopes mirror `apps/api/src/kurin-positions/position-rules.ts`:
  - **Kurin options in the wizard:** SUDDIA, PYSAR, SKARBNYK, INTENDANT, KHORUNZHYI, SMM. KURINNYI is excluded; the row processor rejects it on import.
  - **Hurtok options:** HURTKOVYI, SUDDIA, PYSAR, SKARBNYK.
  - On the web these come from `KURIN_SCOPE_POSITIONS` / `HURTOK_SCOPE_POSITIONS` in `apps/web/lib/role-labels.ts`.
- Branch: `feat/judge-book-position-columns`, created from main `cdc0f41`.

---

### Task 1: API — scoped value mapping

**Files:**
- Modify: `apps/api/src/kurins/dto/save-junak-import-mapping.dto.ts`
- Test: `apps/api/test/kurin-junak-import-mapping.e2e-spec.ts`

**Interfaces.**
- Produces: `PUT /kurins/:kurinId/junak-import/mapping` accepts `positionValueMapping: { rawValue: string; positionType: PositionType | null; scope?: 'KURIN' | 'HURTOK' }[]`.
- `GET .../junak-import/status` returns the entries exactly as saved. It is stored as JSON, so there is no migration.
- An entry without `scope` is a legacy entry. The web applies it to both scopes as a suggestion only.

- [ ] **Step 1. Failing e2e tests.** In `kurin-junak-import-mapping.e2e-spec.ts`:
  - saving `[{ rawValue: 'Скарбник', positionType: 'SKARBNYK', scope: 'HURTOK' }, { rawValue: 'Скарбник', positionType: 'SKARBNYK', scope: 'KURIN' }]` round-trips through GET status unchanged;
  - `scope: 'OTHER'` → 400;
  - a legacy entry without `scope` still saves (the existing test).
- [ ] **Step 2.** Run the spec and confirm it fails: whitelist validation strips `scope`, or it is not round-tripped.
- [ ] **Step 3.** Add `@IsOptional() @IsIn(['KURIN', 'HURTOK']) scope?: 'KURIN' | 'HURTOK';` to `PositionValueMappingEntryDto`.
- [ ] **Step 4.** Run the spec until it is green. Also run `junak-import.e2e-spec.ts` and `approval-requests-bulk-import.e2e-spec.ts`, one at a time with `--runInBand`. Then run `npx tsc --noEmit -p apps/api`.
- [ ] **Step 5.** Commit `feat(api): judge book import value mapping can be scoped to kurin or hurtok`.

---

### Task 2: Web — explicit position columns and per-scope value mapping

**Files:**
- Modify: `apps/web/app/suddivstvo/junak-import/page.tsx`
- Modify: `apps/web/lib/junak-import-auto-map.ts`
- Modify: `apps/web/lib/types.ts` (`JunakImportPositionValueMapping.scope?`, and the status mapping type)
- Tests: `apps/web/e2e/junak-import-auto-map.spec.ts`, `junak-import-row-index.spec.ts`, `junak-import-step3-email.spec.ts`, `suddivstvo.spec.ts`. Update whichever rely on the position columns or on step 2. Add `apps/web/e2e/junak-import-position-columns.spec.ts`.

**Interfaces.**
- Consumes the Task 1 contract: `positionValueMapping[]` entries may carry `scope`.
- Row payload (unchanged):
  - `kurinPositionTypes` comes only from the chosen kurin column, mapped through the KURIN table;
  - `hurtokPositionTypes` comes only from the chosen hurtok column, mapped through the HURTOK table.

**Behaviour.**
1. **No guessing.**
   - Remove the `HURTOK_POSITION` and `KURIN_POSITION` rules from `COLUMN_FIELD_KEYWORDS`, so `autoMapColumns` never returns them.
   - Remove both fields from the per-column select options in step 1.
   - If a saved `columnMapping` entry restores one of them by header, `autoMapColumns` must ignore it for the per-column select. The position block below handles it instead.
2. **«Посади» block in step 1**, below the column list:
   - Two independent checkboxes:
     - «Імпортувати посади куреня»
     - «Імпортувати посади в гуртку»
   - When a checkbox is on, show a select labelled «Стовпчик з посадами куреня» / «Стовпчик з посадами в гуртку». Its options are every sheet column as `${letter} — ${header || 'без назви'}`, with a placeholder «Оберіть стовпчик».
   - **Defaults.** Both checkboxes start off, unless the saved mapping has a `KURIN_POSITION` / `HURTOK_POSITION` entry whose `header` exists in the current sheet header. Then that checkbox is on and that column preselected. This restores the user's own previous choice; it is not a guess.
   - **Validation.** «Далі» is blocked, with a visible message, when:
     - an enabled checkbox has no column («Оберіть стовпчик з посадами …»);
     - both checkboxes point at the same column («Посади куреня й гуртка мають бути в різних стовпчиках»).
   - A column chosen as a position column is not also importable as another field. If it was mapped to another field, that per-column select resets to «Не імпортувати» and is disabled, with the hint «використовується для посад».
3. **Step 2**, «Крок 2: Мапінг значень посад». Show one section per enabled column:
   - Section titles are «Посади куреня — стовпчик X» and «Посади в гуртку — стовпчик Y».
   - Each lists the unique trimmed values of its column, splitting cells on `,` as today.
   - Each value gets a select with «Не імпортувати» plus only that scope's positions (see Global constraints). The labels come from `POSITION_LABELS`.
   - **Suggestions,** in this order:
     1. a saved entry with the same `scope`;
     2. a legacy saved entry without `scope`, used only if its type is valid for this scope;
     3. the keyword map in `autoMapPositionValues`, restricted to the scope's allowed types.

     Change the `autoMapPositionValues` signature to take the allowed types.
   - The two sections keep separate state: «Скарбник» in the kurin column and «Скарбник» in the hurtok column are independent.
   - If no position checkbox is on, or the enabled columns have no values, step 2 is skipped, as today when there are no values.
4. **Saving** (`handleSaveMapping`):
   - `columnMapping` contains the normal field entries plus one entry per enabled position column: `{ column: letter, header, field: 'KURIN_POSITION' | 'HURTOK_POSITION' }`.
   - `positionValueMapping` contains the entries of both sections, each with its `scope`, and only those with a chosen type.
5. **Building rows:** `resolvePositionTypes` reads the chosen column for each scope and maps through that scope's table only.

- [ ] **Step 1.** Write the failing Playwright spec `e2e/junak-import-position-columns.spec.ts`. Seed it like the existing junak-import specs: read them to see how a fake sheet is served (sheet-data endpoint or mock). Use a sheet that has both a «Посада в курені» and a «Посада в гуртку» column, with «Скарбник» in both, plus a third column «Примітки».
  1. Neither checkbox is checked on first load.
  2. Check both and pick the columns. The same column for both shows the error.
  3. In step 2, two sections exist. The hurtok select offers «Гуртковий» but not «Інтендант»; the kurin select offers «Інтендант» but not «Гуртковий».
  4. Map hurtok «Скарбник» → Скарбник and kurin «Скарбник» → «Не імпортувати».
  5. Import, or check the payload or approval request the existing specs use. The junak gets only a HURTOK-scope SKARBNYK.
  6. Reload the wizard: both checkboxes come back checked with the saved columns.
- [ ] **Step 2.** Run the spec and confirm it fails.
- [ ] **Step 3.** Implement the behaviour above.
- [ ] **Step 4.** Update the existing specs and the visual or auto-map expectations that relied on auto-detected position columns. `junak-import-auto-map.spec.ts` must now assert that position columns are NOT auto-mapped.
- [ ] **Step 5.** Run, one at a time:
  - the new spec;
  - `junak-import-auto-map`, `junak-import-row-index`, `junak-import-step3-email`, `suddivstvo`, `approval-request-bulk-import-view`;
  - then `npx tsc --noEmit -p apps/web`.
- [ ] **Step 6.** Commit `feat(web): judge book import — choose kurin/hurtok position columns, map values per scope`.

---

### Final
- [ ] Final whole-branch review. Then fast-forward to main and push only on Andrii's command. Web-only change plus a DTO change, so the VPS needs a redeploy for the DTO (`scope` would be stripped by the old API's whitelist).
