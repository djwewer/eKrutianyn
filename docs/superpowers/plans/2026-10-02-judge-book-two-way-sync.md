# Книга судді: двосторонній sync (write-back + import priority rule)

**Goal:** Today, Книга судді import is one-way (sheet → app, via the manual wizard at `/suddivstvo/junak-import`). Add the other direction for exactly two kinds of data the app computes/owns and the sheet should reflect: (1) a junak's proby-degree attainment dates (Прихильник/Учасник/Розвідувач), and (2) a junak's phone/email — pushed automatically every night at 03:00 Europe/Kyiv for every kurin that has a connected book, and also make the existing manual import respect a per-field priority rule so re-running it doesn't clobber data the app already has confirmed.

Independent of `docs/superpowers/plans/2026-10-02-ui-polish-wave3.md` (the other plan written alongside this one) — different files, no shared risk. This plan touches `apps/api` only except for one already-shared file area (none, in fact — this plan is 100% backend).

## Context — read before writing any code

This plan was scoped by directly reading the existing import pipeline, not by guessing. The key facts an implementer must know, each confirmed by reading the actual source:

- **Degree dates already have a concrete representation.** `JunakImportField` already includes `DEGREE_PRYHYLNYK_DATE` / `DEGREE_UCHASNYK_DATE` / `DEGREE_ROZVIDUVACH_DATE` (`apps/web/lib/types.ts`). On the **pull** side, `JunakImportRowProcessorService.backfillProbaProgress` (`apps/api/src/junak-import/junak-import-row-processor.service.ts`) already matches each date to a `ProbyStage` via `DEGREE_STAGE_PREFIXES` (`{key: 'PRYHYLNYK', prefix: 'Проба прихильника'}` etc. — stage matched by `ProbyStage.name.startsWith(prefix)` within the kurin's `probyProgramId`), and the **completion date itself**, once a stage is closed, lives in `JunakStageProgress.firstClosedAt` (immutable — set once, never cleared even on reopen; `closedAt` is the one that toggles). This is the value to read for the **push** direction.
- **The pull-side priority rule for degree dates already exists and is probably already correct**: `backfillProbaProgress` does `const currentStatus = progress.stages.find(...)?.status; if (currentStatus === 'CLOSED') continue;` — it already skips re-confirming/re-closing a stage that's already closed, which is functionally "the app's already-confirmed date wins over the sheet's." Task 5 below is to add a regression test proving this, not to write new logic — unless the test reveals the guard doesn't actually hold (e.g. some code path bypasses it), in which case fix it and say so in the task report.
- **The pull-side priority rule for phone/email does NOT exist yet and must be added.** `upsertUserHurtokContacts` (same file) does, unconditionally on every `UPDATE_JUNAK` row: `if (row.email) updateData.email = row.email; if (row.phone) updateData.phone = row.phone;` — this overwrites the app's phone/email with the sheet's value every time, with no check. This is exactly backwards from what's needed now: if the app already has a non-empty value, the sheet must not overwrite it.
- **No persisted link from a sheet row to the junak it was imported from.** Matching today is done fresh, client-side, per wizard session (`GET /kurins/:id/junak-import/match-candidates` by first/last name) — there's no stored "this junak came from row N" anywhere. The nightly push needs a reliable row number to write to without re-running fuzzy name-matching (which risks writing to the wrong row if names repeat or changed). **This plan adds `User.judgeBookRowNumber Int?`**, set at import time (both CREATE and UPDATE) from the row index already available in `JunakImportRowProcessorService.processRow(kurinId, row, rowIndex, actor)` — the actual 1-based sheet row is `rowIndex + 2` (the frontend's `dataRows = rawRows.slice(1)` means index 0 of `dataRows` is sheet row 2, after the header row — confirmed in `apps/web/app/suddivstvo/junak-import/page.tsx`).
- **`GoogleDriveService` (`apps/api/src/google-drive/google-drive.service.ts`) already reads and appends but has no "update an existing cell" method.** It already branches every sheet operation on whether the connected file is a native Google Sheet or an uploaded `.xlsx` (via `getFileMimeType`) — `readSheetValues`/`appendSheetRow` both do this. A new `updateCellValues` method must do the same branching: native sheet → `sheets.spreadsheets.values.batchUpdate`; xlsx → download, mutate cells with ExcelJS, re-upload (mirror `appendXlsxRow`'s download-mutate-reupload shape exactly). **Match the existing range convention**: every existing call uses an unqualified range (`'A:ZZ'`, no `SheetName!` prefix) — do the same for cell ranges (e.g. `'C5'`, not `'Sheet1!C5'`), so behavior stays consistent with whatever the user's actual sheet/tab is named.
- **`JunakImportMapping`** (`kurinId` unique, `columnMapping: Json`, `positionValueMapping: Json`) is the only place that knows which column letter corresponds to which `JunakImportField` for a given kurin — `columnMapping` is a JSON array of `{column, header, field}` (same shape as `JunakImportColumnMapping` in `apps/web/lib/types.ts`). If a kurin's mapping doesn't include e.g. `EMAIL`, there is no column to write to for that kurin — skip that field for that kurin, don't invent a column.
- **Eligibility for the nightly push**, per kurin: has `driveRefreshToken` set (Drive connected — `getAuthorizedClient` already throws `ServiceUnavailableException` otherwise, which the nightly job must catch per-kurin, not let abort the whole run), has `judgeBookSpreadsheetId` set (a book is linked), and has a `JunakImportMapping` row (so column letters are known). Per junak within an eligible kurin: `role = JUNAK`, `judgeBookRowNumber` is not null (was actually imported from a row at some point — a junak created directly in the app, never imported, has nothing to push to).
- **No existing cron/scheduling dependency** (`grep -i schedule apps/api/package.json` finds nothing) — this plan adds `@nestjs/schedule` (official NestJS package, small, matches the stack already in use).

## Global Constraints

- **Write only what the app actually has a non-empty value for.** Never write an empty string into a sheet cell — if `User.phone` is null/empty, or no stage is closed for a degree, skip that cell entirely (leave whatever the sheet already has, which may be manually entered data the app knows nothing about). This also means a kurin's first-ever nightly push, for a junak who already has sheet-side data the app doesn't track (e.g. they were imported before any phone/email existed), must not blank anything out.
- **Phone/email priority-rule fix and the write-back feature are two logically separate behaviors living in the same files — keep them as separate tasks (3 and 5 below) with separate commits**, even though both touch `junak-import-row-processor.service.ts`, so a problem in one is easy to isolate and revert independently.
- **The nightly job must be resilient per-kurin**: wrap each kurin's sync in its own try/catch, log the error (kurin id + message), and continue to the next kurin. A single kurin's expired Drive token, deleted spreadsheet, or malformed mapping must never stop the rest of the run.
- **Timezone**: `@Cron('0 3 * * *', { timeZone: 'Europe/Kyiv' })` — use the `timeZone` option, not a manually-computed UTC offset (Kyiv observes DST; a fixed UTC cron expression would drift twice a year).
- **No new user-facing UI for this plan.** The user explicitly asked only for (a) the nightly automatic push and (b) the manual-import priority-rule fix — not a manual "sync now" button, not a sync-status indicator. Do not add one on your own initiative; if a reviewer thinks it's obviously missing, that's a question for the user, not something to silently add.
- **Migration**: adding `User.judgeBookRowNumber Int?` is purely additive (nullable, no default needed beyond Prisma's implicit null) — matches the pattern of every other additive migration in this repo's history (e.g. `Hurtok.foundedAt`, `User.photoData`). Run `npx prisma migrate dev` to generate it; do not hand-write the SQL.
- **Testing a real Google Sheets write without real Google credentials**: every existing `GoogleDriveService` test (`apps/api/src/google-drive/google-drive.service.spec.ts`) mocks `googleapis` entirely via `jest.mock('googleapis', ...)` with hand-built mock instances (`mockOAuth2Instance`, `mockFilesCreate`, etc.) — extend that same mock object with whatever new `sheets.spreadsheets.values.batchUpdate` mock function Task 2 needs, do not attempt a real network call in any test, including e2e (the existing `kurin-google-drive.e2e-spec.ts` and `kurin-junak-import-mapping.e2e-spec.ts` both override `GoogleDriveService` wholesale with a hand-written fake for exactly this reason — follow the same pattern for the new sync service's e2e coverage).

---

## Task 1: Prisma — `User.judgeBookRowNumber`

**Files:** `apps/api/prisma/schema.prisma`, new migration under `apps/api/prisma/migrations/`

Add `judgeBookRowNumber Int?` to the `User` model (place it near the other judge-book/import-related fields if there's a natural grouping, otherwise anywhere sensible in the model). Run `npx prisma migrate dev --name add_judge_book_row_number` (or equivalent — match this repo's actual migration-naming convention, check a recent migration folder name for the exact pattern) to generate the migration, then `npx prisma generate`. No data backfill needed (new field, all existing rows get `null`, which correctly means "never imported from a row, nothing to push to").

**Verification:** migration applies cleanly against the dev DB; `npx tsc --noEmit` clean (the new field will show up in generated Prisma types).

---

## Task 2: `GoogleDriveService.updateCellValues`

**File:** `apps/api/src/google-drive/google-drive.service.ts`, test file `apps/api/src/google-drive/google-drive.service.spec.ts`

Add a new public method:
```ts
async updateCellValues(
  kurinId: string,
  spreadsheetId: string,
  updates: { row: number; column: string; value: string }[],
): Promise<void>
```
- `row` is 1-based (matches the sheet's own row numbering, e.g. `2` = the first data row after a header), `column` is a letter (`"C"`), matching the same convention `JunakImportColumnMapping.column` already uses on the frontend.
- Branch on `getFileMimeType` exactly like `readSheetValues`/`appendSheetRow` already do:
  - **Native Sheet**: build one `sheets.spreadsheets.values.batchUpdate` call with `data: updates.map(u => ({ range: \`${u.column}${u.row}\`, values: [[u.value]] }))` and `valueInputOption: 'RAW'` (matches `appendSheetRow`'s existing `valueInputOption`). One batched call for all updates, not one API call per cell.
  - **XLSX**: download the file once (reuse the existing private `downloadFileBuffer`), load with `ExcelJS.Workbook`, for each update set `worksheet.getCell(\`${column}${row}\`).value = value`, then re-upload once via `drive.files.update` exactly like `appendXlsxRow` does (one download, N cell writes, one re-upload — not N round trips).
- If `updates` is empty, return immediately without calling anything (the nightly job will sometimes have nothing to write for a kurin whose junaky have no non-empty synced fields at all — this must be a silent no-op, not an error).

**Tests to add** in `google-drive.service.spec.ts` (extend the existing `jest.mock('googleapis', ...)` block with whatever new mock function `batchUpdate` needs — e.g. `mockSheetsValuesBatchUpdate`):
- Native-sheet path: calls `batchUpdate` once with the correctly shaped `data` array for 2+ updates.
- XLSX path: downloads once, sets the right cells (assert via reading the re-uploaded buffer back with ExcelJS, same technique `appendSheetRow`'s own xlsx test already uses — read that test first and copy its verification style), re-uploads once.
- Empty `updates` array: no API/Drive calls happen at all.

**Verification:** `npx jest src/google-drive/google-drive.service.spec.ts` all green, including pre-existing tests (don't break them while extending the mock scaffolding at the top of the file).

---

## Task 3: Persist `judgeBookRowNumber` at import time

**File:** `apps/api/src/junak-import/junak-import-row-processor.service.ts`

In `upsertUserHurtokContacts`, both the `row.matchedUserId` (update) branch and the create branch need `judgeBookRowNumber` set from the row's position. `processRow`'s `rowIndex` parameter is already threaded down to `upsertUserHurtokContacts` — **it currently is not** (check the actual call site: `upsertUserHurtokContacts(kurinId, row, result, options)` — no `rowIndex`) — add it as a parameter, and inside, set `updateData.judgeBookRowNumber = rowIndex + 2` on the update path, and `judgeBookRowNumber: rowIndex + 2` in the `tx.user.create(...)` data on the create path. The `+ 2` accounts for the header row (sheet row 1) plus 1-based sheet numbering, per the Context section above — if you find the actual frontend indexing differs from what's described there (re-check `apps/web/app/suddivstvo/junak-import/page.tsx`'s `dataRows`/`rows.map` call site before trusting this number blindly), use the real offset and say so in your report.

**Verification:** extend `junak-import-row-processor.service.spec.ts` (existing unit test file) with a case asserting `judgeBookRowNumber` is set correctly for both a CREATE and an UPDATE row at a given `rowIndex` (e.g. `rowIndex = 3` → expect `judgeBookRowNumber: 5`). Also re-run the full `apps/api/test/junak-import.e2e-spec.ts` and `apps/api/test/kurin-junak-import-mapping.e2e-spec.ts` to confirm nothing about the existing import flow broke.

---

## Task 4: Nightly push — `JudgeBookSyncService` + cron

**Files:** new `apps/api/src/junak-import/judge-book-sync.service.ts` (or place it wherever this repo's module layout suggests — check if `junak-import` or `kurins` is the more natural home by seeing which module already owns `JunakImportMapping` reads/writes), update to `apps/api/src/app.module.ts` (or the relevant feature module) to register `ScheduleModule.forRoot()` and the new provider, `package.json` (add `@nestjs/schedule`).

1. `npm install @nestjs/schedule --workspace apps/api` (or this repo's equivalent monorepo-aware install command — check how `exceljs`/`googleapis` were added for precedent rather than guessing the flag).
2. New service, two methods:
   - `async syncKurinToSheet(kurinId: string): Promise<void>` — the per-kurin logic: load the kurin (needs `judgeBookSpreadsheetId`, `probyProgramId`), load its `JunakImportMapping` (return early/no-op if none exists — nothing is mapped, nothing to write), build a `Map<JunakImportField, string>` of field→column from `columnMapping`, load every `role: JUNAK` user in this kurin with `judgeBookRowNumber` not null, and for each: compute the degree dates (query `JunakStageProgress` + `ProbyStage` for this junak/kurin's program, matched via the same `DEGREE_STAGE_PREFIXES` convention as `backfillProbaProgress` — consider extracting that stage-matching logic to a small shared helper if duplicating it cleanly is awkward, your call, but don't let the two copies drift silently if you do duplicate it) and read `phone`/`email` directly off the `User` row. For each of the 5 fields (3 degrees + phone + email) that both (a) has a non-empty value to write and (b) has a mapped column for this kurin, add one `{row: judgeBookRowNumber, column, value}` entry. Call `this.googleDrive.updateCellValues(kurinId, spreadsheetId, allUpdates)` once per kurin (all junaky batched together, not one call per junak).
   - `async syncAllKurins(): Promise<void>` — queries every kurin matching the eligibility criteria in Context above, calls `syncKurinToSheet` for each inside a try/catch per-kurin (log and continue on failure, per Global Constraints).
3. A separate thin class (or a method on the same service, implementer's call) decorated `@Cron('0 3 * * *', { timeZone: 'Europe/Kyiv' })` calling `syncAllKurins()`.
4. Register `ScheduleModule.forRoot()` once at the app level (check it isn't already imported somewhere before adding a duplicate) and the new service/module in whichever module ends up owning it.

**Tests:**
- Unit test (new `judge-book-sync.service.spec.ts`, same hand-mocked-Prisma style as e.g. `jwt.strategy.spec.ts`/`positions.util.spec.ts`): `syncKurinToSheet` builds the correct `updateCellValues` call for a kurin with 2 junaky, one with a closed Прихильник stage and a phone number, one with nothing synced at all (expect it contributes zero entries, not entries with empty strings); a kurin with no `JunakImportMapping` calls `updateCellValues` not at all (or with an empty array — pick one, be consistent, and make sure Task 2's "empty array is a no-op" behavior makes either choice safe); a field with a value but no mapped column is skipped.
- e2e test (new `apps/api/test/judge-book-sync.e2e-spec.ts`, following `kurin-google-drive.e2e-spec.ts`'s `.overrideProvider(GoogleDriveService).useValue(fakeGoogleDrive)` pattern): seed a kurin with a saved mapping, a connected-looking Drive state, a junak with `judgeBookRowNumber` set and a closed proba stage, call `syncKurinToSheet` (or trigger it via whatever the cron method is named, directly, bypassing the actual cron schedule — don't try to wait for a real 3am trigger in a test) and assert the fake `updateCellValues` was called with the expected cell/value. Also test `syncAllKurins` skips a kurin with no Drive connection without throwing, and still processes the next one (seed two kurins, one disconnected, assert the connected one's sync still happened).

**Verification:** new unit + e2e specs pass; full `apps/api` unit + e2e suites still green; `npx tsc --noEmit` clean.

---

## Task 5: Manual-import priority rule for phone/email

**File:** `apps/api/src/junak-import/junak-import-row-processor.service.ts`

In `upsertUserHurtokContacts`'s update branch, change:
```ts
if (row.email) updateData.email = row.email;
if (row.phone) updateData.phone = row.phone;
```
to only pull from the sheet when the app doesn't already have a value:
```ts
if (row.email && !target.email) updateData.email = row.email;
if (row.phone && !target.phone) updateData.phone = row.phone;
```
(`target` is the user row already fetched a few lines above in the same function — confirm the variable is in scope at this exact point before assuming the name.)

Also add the regression test the Context section calls for proving the **degree-date** pull-side guard (`backfillProbaProgress`'s `if (currentStatus === 'CLOSED') continue`) actually holds end-to-end: seed a junak with a closed Прихильник stage with a specific `firstClosedAt`, run a row through the processor with a DIFFERENT `DEGREE_PRYHYLNYK_DATE` value, and assert `firstClosedAt` is unchanged (not overwritten) after processing. If this test fails, that's a real bug to fix as part of this task, not a surprise to merely report.

**Verification:** extend `junak-import-row-processor.service.spec.ts` with: (1) an UPDATE row with a non-empty `row.phone`/`row.email` where the target user already has a phone/email — assert the existing value survives unchanged; (2) the same but the target user's phone/email is currently empty — assert the sheet's value DOES get applied (the rule is "app wins if it already has something," not "sheet can never update phone/email at all"); (3) the degree-date non-regression test described above. Re-run the full `junak-import.e2e-spec.ts` suite too.

---

## Final Integration Task: full regression + review

1. `npx tsc --noEmit` and full `apps/api` unit + e2e suites (`npx jest`, `npx jest --config ./test/jest-e2e.json --runInBand`) green.
2. Dispatch the final whole-branch review (most capable available model) against this plan's diff, using `../requesting-code-review/code-reviewer.md`'s template and this plan's Global Constraints as the constraints block. Pay particular attention to: the per-kurin error isolation in `syncAllKurins` actually working (simulate one kurin throwing and confirm the rest still run, don't just read the try/catch and assume), and the phone/email priority-rule change not having silently regressed the CREATE path (a brand-new junak has no existing phone/email to "win," so the new guard must not accidentally block setting phone/email on first creation — re-read the create branch, which is untouched by this task's diff, to confirm it's unaffected).
3. Fix Critical/Important findings, re-review, then follow `superpowers:finishing-a-development-branch` for the merge decision.
