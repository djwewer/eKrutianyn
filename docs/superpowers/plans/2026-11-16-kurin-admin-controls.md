# Kurin admin controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin deactivate, reactivate and force-delete a kurin. Let the суддя connect and disconnect the Книга судді. Make the Google sign-in button full-width.

**Architecture:**
- **Deactivation.** A nullable `Kurin.deactivatedAt` is checked in two choke points: `AuthService.issueSessionFor` for new sessions and `JwtStrategy.validate` for every request. Every user except the звʼязковий gets 403 `{ code: 'KURIN_DEACTIVATED' }`. The web reacts to that code globally.
- **Force delete.** One admin-only interactive transaction removes every kurin-owned row in FK order.
- **Judge-book permissions.** They move from "звʼязковий only" to `canManageJudgeBook` (звʼязковий or SUDDIA). A new DELETE endpoint disconnects the sheet.

**Tech Stack:** NestJS + Prisma (Postgres), jest unit tests (`apps/api/src/**/*.spec.ts`) and jest e2e against the real `plast_test` DB (`apps/api/test/*.e2e-spec.ts`, `npm run test:e2e`). Next.js 16 App Router + TanStack Query. Playwright e2e (`apps/web/e2e`) plus the visual harness (`apps/web/playwright.visual.config.ts`, screenshots in `apps/web/visual-shots`).

**Spec:** `docs/superpowers/specs/2026-11-16-kurin-admin-controls-design.md` — read it first.

## Global Constraints

- **User-facing copy, verbatim:**
  - Ukrainian, no russianisms.
  - Deactivated login message: «Курінь тимчасово деактивовано. Зверніться до звʼязкового.»
  - Звʼязковий banner: «Курінь деактивовано. Зверніться до адміністратора, щоб відновити доступ.»
  - Disconnect confirm: «Синхронізація з таблицею зупиниться. Якщо підключите таблицю знову, відповідність колонок доведеться налаштувати заново.»
  - Force-delete conflict: «Спершу деактивуйте курінь».
- **Error code** for blocked users: HTTP 403 with body `{ "code": "KURIN_DEACTIVATED", "message": "<the login message>" }`.
- **Never edit `.env` files.** Never `git add` `logo.png`, `ПРОБИ  старі/`, `Проби НОВІ/` or `docs/audits/`. Commit with `git -c user.name=Zozulia -c user.email=user@Zozulia.local commit`, and end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Jest:** the whole API suite OOMs (pre-existing). Run suites per directory or file, e.g. `cd apps/api && npx jest src/auth`.
- **Machine is constrained.** Don't start extra long-running dev servers. Stop any server you start.
- **UI:** use existing primitives in `apps/web/components/ui` (Button, Badge variants `signal/ok/late/mute`, Dialog, Input) and the Польовий tokens. No new design language.

---

### Task 1: Deactivation, backend

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Kurin + AuditAction)
- Create: migration via `cd apps/api && npx prisma migrate dev --name kurin_deactivation`. Then apply it to the test DB the same way the invite migration was applied: check `apps/api/package.json` / `test/jest-e2e.json` setup for how `plast_test` gets migrated, usually `DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy`, reading the value from the existing env without printing or editing it.
- Modify: `apps/api/src/admin/kurins-admin.service.ts`, `kurins-admin.controller.ts`, `kurins-admin.service.spec.ts`
- Modify: `apps/api/src/auth/auth.service.ts` (`issueSessionFor`), `auth.service.spec.ts`
- Modify: `apps/api/src/auth/strategies/jwt.strategy.ts` (+ spec, create one if absent)
- Modify: `apps/api/src/kurins/kurins.service.ts` (`KURIN_PUBLIC_SELECT` adds `deactivatedAt: true`)
- Modify: `apps/api/src/kurins/judge-book-sync.service.ts` (`syncAllKurins` where adds `deactivatedAt: null`) + its spec
- Modify: `apps/api/src/audit/audit.constants.ts`, `apps/web/lib/audit.ts` (labels and groups for the new actions, next to `JUDGE_BOOK_CONNECTED`)
- Create: `apps/api/src/common/kurin-deactivated.ts`

**Interfaces:**
- Produces:
  - `Kurin.deactivatedAt: DateTime?`
  - `AuditAction.KURIN_DEACTIVATED | KURIN_ACTIVATED | JUDGE_BOOK_DISCONNECTED` (add all three in this one migration)
  - `POST /admin/kurins/:id/deactivate` and `POST /admin/kurins/:id/activate`, each returning `{ id, deactivatedAt: string | null }`
  - `GET /admin/kurins` items gain `deactivatedAt`
  - `GET /kurins/me` gains `deactivatedAt`
  - `kurinDeactivatedException()` exported from `common/kurin-deactivated.ts`

- [ ] **Step 1: Schema + migration.** In `model Kurin` add:

```prisma
  // Set by the admin to temporarily switch a kurin off (e.g. unpaid
  // subscription). Only the zvyazkovyi can still log in while it is set.
  deactivatedAt                DateTime?
```

Add `KURIN_DEACTIVATED`, `KURIN_ACTIVATED` and `JUDGE_BOOK_DISCONNECTED` to `enum AuditAction`. Run the migration for dev and test DBs. Confirm `npx prisma generate` ran.

- [ ] **Step 2: Shared exception helper** `apps/api/src/common/kurin-deactivated.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';

export const KURIN_DEACTIVATED_CODE = 'KURIN_DEACTIVATED';
export const KURIN_DEACTIVATED_MESSAGE = 'Курінь тимчасово деактивовано. Зверніться до звʼязкового.';

export function kurinDeactivatedException(): ForbiddenException {
  return new ForbiddenException({ code: KURIN_DEACTIVATED_CODE, message: KURIN_DEACTIVATED_MESSAGE });
}
```

- [ ] **Step 3: Failing tests for `issueSessionFor`** in `auth.service.spec.ts`, following the existing mocking style:
  - `loginWithPassword` for a JUNAK whose kurin has `deactivatedAt` set rejects with ForbiddenException whose `getResponse()` has `code: 'KURIN_DEACTIVATED'`.
  - The same for a ZVYAZKOVYI resolves with `accessToken`.
  - `loginWithGoogle` for a VYKHOVNYK is blocked too.

  Run `npx jest src/auth/auth.service.spec.ts` and check that they FAIL.

- [ ] **Step 4: Implement.** In `issueSessionFor`, after loading `kurin`, add:

```ts
    if (kurin!.deactivatedAt && user.role !== Role.ZVYAZKOVYI) {
      throw kurinDeactivatedException();
    }
```

  `acceptInvite` already calls `issueSessionFor` after its transaction commits. Verify this by reading the code: the password stays set and the token stays consumed, and only the session is refused. Add a test asserting exactly that.

  Run the tests and check that they PASS.

- [ ] **Step 5: JwtStrategy.**
  - Extend the select with `role: true, kurin: { select: { deactivatedAt: true } }`.
  - After the archived check, add:

```ts
    if (user.kurin.deactivatedAt && user.role !== Role.ZVYAZKOVYI) {
      throw kurinDeactivatedException();
    }
```

  Use the DB `role`, not `payload.role`, so a stale token can't bypass the check.
  - Unit-test both branches with a mocked prisma.
  - Then verify in a real API e2e (Task 2's e2e file or a new `test/kurin-deactivation.e2e-spec.ts`): a JUNAK's existing token gets 403 with `code` on `GET /users/me` (or any authed endpoint) after deactivation. Confirm that the 403 body reaches the client unchanged, i.e. that `@nestjs/passport` rethrows the error from `validate`.

- [ ] **Step 6: Admin endpoints.**
  - `KurinsAdminService.setDeactivated(id: string, deactivated: boolean)`:
    - unknown kurin → `NotFoundException('Kurin not found')`;
    - deactivating an already deactivated kurin keeps the original date;
    - write audit via `AuditService.record({ kurinId: id, actorId: null, action })`. Check the `record` signature; actorId is nullable in the schema.
  - Controller routes:

```ts
  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@Param('id') id: string) { return this.service.setDeactivated(id, true); }

  @Post(':id/activate')
  @HttpCode(200)
  activate(@Param('id') id: string) { return this.service.setDeactivated(id, false); }
```

  - `listKurins` adds `deactivatedAt` to its select/map.
  - Unit tests: set, idempotent, clear, 404, audit called.

- [ ] **Step 7: Sync skip + `/kurins/me`.** Add `deactivatedAt: null` to the `syncAllKurins` `where` and a spec case. Add `deactivatedAt: true` to `KURIN_PUBLIC_SELECT`.

- [ ] **Step 8: Audit labels.**
  - `audit.constants.ts`: put the 3 new actions in the same group as `JUDGE_BOOK_CONNECTED` (or the kurin-settings group if that fits better; follow the file).
  - `apps/web/lib/audit.ts`: labels «Курінь деактивовано», «Курінь активовано», «Книгу судді відʼєднано».

- [ ] **Step 9: Verify and commit.**
  - Run `npx jest src/auth src/admin src/kurins src/audit` and the e2e file from Step 5 (`npm run test:e2e -- kurin-deactivation`).
  - Run `npx tsc --noEmit -p apps/api` and `npx tsc --noEmit -p apps/web`.
  - Commit `feat(api): kurin deactivation — admin toggle, login/session block, sync skip`.

---

### Task 2: Force delete, backend

**Files:**
- Modify: `apps/api/src/admin/kurins-admin.service.ts`, `kurins-admin.controller.ts`
- Create: `apps/api/src/admin/dto/force-delete-kurin.dto.ts`
- Test: `apps/api/test/admin-kurins.e2e-spec.ts` (extend; real DB)

**Interfaces:**
- Consumes: `Kurin.deactivatedAt` (Task 1)
- Produces:
  - `GET /admin/kurins/:id/delete-preview` → `{ users: number; hurtky: number; announcements: number; calendarEvents: number; inventoryItems: number; treasuryTransactions: number }`
  - `DELETE /admin/kurins/:id/force`, body `{ confirmName: string }` → 204

- [ ] **Step 1: DTO.**

```ts
import { IsString, MinLength } from 'class-validator';
export class ForceDeleteKurinDto {
  @IsString()
  @MinLength(1)
  confirmName!: string;
}
```

- [ ] **Step 2: Failing e2e tests** in `test/admin-kurins.e2e-spec.ts`, using the file's existing admin-auth helpers.
  - The force delete of an active kurin returns 409.
  - A wrong `confirmName` returns 400.
  - Success test, on a kurin seeded through the API and/or prisma directly:
    - Seed it **richly**:
      - the zvyazkovyi, a vykhovnyk and 2 junaky;
      - a hurtok with VykhovnykHurtok;
      - a KurinPosition;
      - an announcement with reaction and image;
      - a calendar event, an inventory item with photo and a treasury transaction;
      - a kurin-owned Skill with a level and a JunakSkill;
      - JunakProgress and JunakStageProgress;
      - an activity entry, VFV, camp, remark, past position and guardian contact;
      - an AiConversation with an AiMessage plus an AiUsageEvent;
      - a PushSubscription, a PasswordResetToken, an EmailChangeRequest, a ProfileChangeLog, an ApprovalRequest and AuditLog rows;
      - a JunakImportMapping.
    - Also seed a **second kurin** with a user and an announcement.
    - Deactivate the first kurin, force delete it, and get 204.
    - Then: the kurin row is gone, `prisma.user.count({ where: { kurinId } })` is 0, and the second kurin's user and announcement still exist.
  - `delete-preview` counts match the seed.

  Run `npm run test:e2e -- admin-kurins` and check that it FAILS.

- [ ] **Step 3: Implement `forceDeleteKurin(id, confirmName)`.**
  - Load the kurin. Missing → 404. `!deactivatedAt` → `ConflictException('Спершу деактивуйте курінь')`. `confirmName.trim() !== kurin.name.trim()` → `BadRequestException('Назва не збігається')`.
  - Then `const userIds = (await tx.user.findMany({ where: { kurinId: id }, select: { id: true } })).map(u => u.id)`.
  - Inside `this.prisma.$transaction(async (tx) => { ... }, { timeout: 60_000 })`, delete in this order. Re-check against `schema.prisma`: every model with a relation to `User` or `Kurin` must be covered, and the schema is the source of truth. If a model below doesn't exist or is named differently, follow the schema.
    1. AI: `aiMessage` (where conversation.userId in userIds), `aiConversation` (userId in), `aiUsageEvent` (userId in; no FK).
    2. Announcements: `announcementReaction` where userId in OR announcement.kurinId = id; `announcementImage` (kurinId); `announcement` (kurinId).
    3. Notifications and account: `pushSubscription`, `passwordResetToken`, `emailChangeRequest`, `profileChangeLog` (userId in).
    4. Approvals: `approvalRequest` (initiatedById in userIds OR approvedById in userIds; also check for a kurinId column).
    5. Junak history: `junakActivityEntry`, `junakVfv`, `junakCamp`, `junakRemark`, `junakPastPosition`, `guardianContact`, `junakSkill`, `junakProgress`, `junakStageProgress`. Filter by junakId in userIds; for tables with `createdById`, `confirmedById` or `closedById`, also by those in userIds.
    6. Kurin skills: `skillLevel`/`skill` where kurinId = id (SkillLevel cascades, but delete JunakSkill first).
    7. Assignments and positions: `vykhovnykHurtok` (vykhovnykId in userIds), `kurinPosition` (kurinId).
    8. Stock and money: `inventoryItemPhoto` cascades from item; `inventoryItem`, `treasuryTransaction`, `kurinCalendarEvent` (kurinId).
    9. Audit and import: `auditLog` (kurinId; also where actorId in userIds), `junakImportMapping` (kurinId).
    10. Self-references: clear `hurtok.archivedById` and `user.archivedById` within the kurin (set null). Then delete `hurtok` (kurinId) and `user` (kurinId).
    11. Finally `kurin.delete`.
  - After commit: `this.logger.warn(\`Force-deleted kurin ${id} "${kurin.name}": ${JSON.stringify(counts)}\`)`. Get the counts from the preview, computed before the delete.
  - `deleteKurinPreview(id)`: six `count` queries; 404 if the kurin is missing.

- [ ] **Step 4: Controller.**

```ts
  @Get(':id/delete-preview')
  deletePreview(@Param('id') id: string) { return this.service.deleteKurinPreview(id); }

  @Delete(':id/force')
  @HttpCode(204)
  async forceDelete(@Param('id') id: string, @Body() dto: ForceDeleteKurinDto): Promise<void> {
    await this.service.forceDeleteKurin(id, dto.confirmName);
  }
```

  Declare `:id/force` and `:id/delete-preview` so they don't collide with `@Delete(':id')`. Nest matches distinct paths fine; verify with the e2e.

- [ ] **Step 5: Verify and commit.** Run the e2e (PASS), `npx jest src/admin` and `tsc`. Commit `feat(api): admin force-delete of a deactivated kurin with all its data`.

---

### Task 3: Judge book connect/disconnect for суддя, backend

**Files:**
- Modify: `apps/api/src/kurins/kurin-junak-import.controller.ts` (+ spec if present; otherwise add tests to an existing e2e, e.g. `test/*junak-import*.e2e-spec.ts`; check `ls apps/api/test`)
- Modify: `apps/api/src/kurins/kurin-google-drive.controller.ts` (picker-token)

**Interfaces:**
- Consumes: `AuditAction.JUDGE_BOOK_DISCONNECTED` (Task 1)
- Produces: `DELETE /kurins/:kurinId/junak-import/spreadsheet` → `{ success: true }`. Connect and picker-token are now allowed for SUDDIA.

- [ ] **Step 1: Failing tests.**
  - SUDDIA connects (200) and disconnects (200).
  - A plain VYKHOVNYK gets 403 on both. Kurinniy without SUDDIA gets 403 on both.
  - Disconnect nulls `judgeBookSpreadsheetId`/`Name`, deletes `JunakImportMapping` and nulls `judgeBookRowNumber` for the kurin's users only.
  - Another kurin's id gives 403.
  - SUDDIA can GET picker-token. In e2e, Drive isn't connected, so expect the same non-403 error a ZVYAZKOVYI gets. A VYKHOVNYK gets 403.

- [ ] **Step 2: Implement.** In the junak-import controller replace `assertZvyazkovyi` with:

```ts
  private assertCanManageJudgeBook(user: CurrentUserPayload) {
    if (user.role !== Role.ZVYAZKOVYI && !user.positions.includes(PositionType.SUDDIA)) {
      throw new ForbiddenException('Only zvyazkovyi or suddya can manage the judge book');
    }
  }
```

  Use it in `setSpreadsheet`. Grep for other uses of `assertZvyazkovyi` in that file and keep their semantics: only the connect/disconnect paths change. Add:

```ts
  @Delete(':kurinId/junak-import/spreadsheet')
  async disconnectSpreadsheet(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    this.assertCanManageJudgeBook(user);
    await this.prisma.$transaction([
      this.prisma.kurin.update({
        where: { id: kurinId },
        data: { judgeBookSpreadsheetId: null, judgeBookSpreadsheetName: null },
      }),
      this.prisma.junakImportMapping.deleteMany({ where: { kurinId } }),
      this.prisma.user.updateMany({
        where: { kurinId, judgeBookRowNumber: { not: null } },
        data: { judgeBookRowNumber: null },
      }),
    ]);
    await this.audit.record({ kurinId, actorId: user.userId, action: AuditAction.JUDGE_BOOK_DISCONNECTED });
    return { success: true };
  }
```

  In `kurin-google-drive.controller.ts`, picker-token currently uses `@Roles(Role.ZVYAZKOVYI)` with RolesGuard. Drop the `@Roles` on that one route and do the same `role === ZVYAZKOVYI || positions.includes(SUDDIA)` check inline. All other Drive routes stay звʼязковий-only.

- [ ] **Step 3: Verify and commit.** Run the tests (PASS), `npx jest src/kurins` and `tsc`. Commit `feat(api): suddya can connect and disconnect the judge book`.

---

### Task 4: Deactivation and force delete, web

**Files:**
- Modify: `apps/web/lib/types.ts` (`Kurin.deactivatedAt: string | null`, admin kurin type likewise)
- Modify: `apps/web/lib/api-client.ts` (global KURIN_DEACTIVATED handling)
- Modify: `apps/web/app/login/page.tsx`, `apps/web/components/google-signin-button.tsx` (its error path), `apps/web/app/welcome/page.tsx`
- Modify: `apps/web/components/app-shell.tsx` (banner)
- Modify: `apps/web/app/admin/page.tsx` (+ admin queries file it uses)
- Test: `apps/web/e2e/admin-kurins.spec.ts`, new `apps/web/e2e/kurin-deactivation.spec.ts`

**Interfaces:**
- Consumes: Task 1 and 2 endpoints.

- [ ] **Step 1: Error-code helper** in `lib/api-client.ts`:

```ts
export const KURIN_DEACTIVATED_MESSAGE = 'Курінь тимчасово деактивовано. Зверніться до звʼязкового.';

export function isKurinDeactivated(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { code?: unknown }).code === 'KURIN_DEACTIVATED';
}
```

  In `apiFetch` and `apiUpload`, when `res.status === 403 && isKurinDeactivated(body)` and `typeof window !== 'undefined'`:
  - `await fetch('/api/auth/logout', { method: 'POST' })` (check the logout route's method);
  - `window.location.assign('/login?reason=kurin-deactivated')`;
  - then throw the ApiError as usual.

  Confirm the `/api/backend` proxy forwards status and JSON body unchanged.

- [ ] **Step 2: Login, Google, welcome.**
  - On the login page, when `res.status === 403`, parse the body. If `isKurinDeactivated`, show `KURIN_DEACTIVATED_MESSAGE`; otherwise keep «Невірний email або пароль». When `useSearchParams().get('reason') === 'kurin-deactivated'`, show the same message on load (wrap in Suspense if the page needs it for `useSearchParams`).
  - In the Google button and `/welcome` accept-invite flow: same 403 handling. The BFF routes forward the API status and body; verify this.

- [ ] **Step 3: Banner.** In `app-shell.tsx`, `kurin` is already loaded via `useKurin`. When `kurin?.deactivatedAt && session?.role === 'ZVYAZKOVYI'`, render the banner above page content. Use the `signal` tone (see `Badge`/globals tokens), `role="status"` and the copy «Курінь деактивовано. Зверніться до адміністратора, щоб відновити доступ.» It is not dismissable.

- [ ] **Step 4: Admin page.** In each kurin row:
  - Badge `mute` with «Деактивовано з {dd.MM.yyyy}» when deactivated. Use `lib/dates.ts` helpers if there is a matching one.
  - «Деактивувати» opens a confirm dialog: «Користувачі куреня, крім звʼязкового, не зможуть увійти, доки ви не активуєте курінь.» Then POST deactivate.
  - «Активувати» posts directly.
  - «Видалити назавжди» shows only when deactivated, in destructive style. It opens a dialog that:
    - fetches `delete-preview` and lists «Людей: N, гуртків: N, оголошень: N, подій: N, реманенту: N, записів скарбництва: N»;
    - says «Цю дію не можна скасувати. Файли на Google Drive залишаться.»;
    - has an Input with label «Введіть назву куреня, щоб підтвердити»;
    - enables the delete button only when `input.trim() === kurin.name.trim()`.
  - Invalidate the admin kurins query on success. Keep the existing empty-kurin «Видалити» as is.

- [ ] **Step 5: E2E.** New `kurin-deactivation.spec.ts`, using existing helpers (`seedKurinWithZvyazkovyi`, `createOnboardedUserAs`, admin helpers from `admin-kurins.spec.ts`):
  1. Seed a kurin with a junak, and log the junak in in context A.
  2. The admin deactivates the kurin through the admin page UI.
  3. In context A, a navigation that triggers an API call lands on `/login` with the deactivated message.
  4. A fresh junak login shows the deactivated message.
  5. The zvyazkovyi logs in and sees the banner.
  6. The admin activates the kurin, and the junak logs in fine.

  In `admin-kurins.spec.ts`, add the force-delete flow: the button is hidden on an active kurin; deactivate, open the dialog, see the button disabled with a wrong name, type the right name, delete, and the row disappears.

  Run `cd apps/web && npx playwright test e2e/kurin-deactivation.spec.ts e2e/admin-kurins.spec.ts e2e/login.spec.ts e2e/invite-onboarding.spec.ts` and check that they PASS.

- [ ] **Step 6: Commit** `feat(web): kurin deactivation UX and admin force delete`.

---

### Task 5: Суддівство connect/disconnect and Google button, web

**Files:**
- Modify: `apps/web/app/suddivstvo/page.tsx`, `apps/web/lib/queries/junak-import.ts`
- Modify: `apps/web/components/google-signin-button.tsx`
- Test: `apps/web/e2e/suddivstvo.spec.ts`

- [ ] **Step 1: Query hook** in `lib/queries/junak-import.ts`:

```ts
export function useDisconnectJunakImportSpreadsheet(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ success: true }>(`/kurins/${kurinId}/junak-import/spreadsheet`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [/* same key useJunakImportStatus uses */] }),
  });
}
```

- [ ] **Step 2: Page.**
  - `canManageJudgeBook = session?.role === 'ZVYAZKOVYI' || !!session?.positions?.includes('SUDDIA')`.
  - When connected, show «Відʼєднати таблицю» (secondary/destructive-outline) next to the connected sheet name. It opens a confirm dialog with the Global Constraints copy, then calls the mutation.
  - When Google Drive is not connected and the user is not ZVYAZKOVYI, show the hint «Спершу звʼязковий має підключити Google Drive куреня.» instead of a connect button that would fail.
  - Check what the page currently does for that state and keep the zvyazkovyi flow unchanged.

- [ ] **Step 3: Google button.**
  - Measure `buttonRef.current.parentElement.clientWidth` at render time.
  - Pass `{ theme, size: 'large', width: Math.min(400, Math.floor(w)), text: 'signin_with', shape: 'rectangular', logo_alignment: 'center' }`. Widen the `renderButton` options type accordingly.
  - `theme`: `'filled_black'` when `document.documentElement.dataset.theme === 'dark'`, or when no data-theme is set and `matchMedia('(prefers-color-scheme: dark)').matches`; otherwise `'outline'`. Check how `layout.tsx`'s theme script marks the resolved theme and use that.
  - Wrapper: `className="flex w-full justify-center"`.
  - Keep everything else (credential callback, error handling) intact.

- [ ] **Step 4: E2E** in `suddivstvo.spec.ts`:
  - A user with the SUDDIA position sees the connect control; a plain vykhovnyk doesn't. The picker itself can't run in e2e.
  - Seed a connected sheet directly via the API test helpers or prisma, if the spec file already has a pattern for that. Then the суддя sees «Відʼєднати таблицю», confirms, and the status shows «Не підключено».

  Run the spec and `e2e/login.spec.ts` and check that they PASS.

- [ ] **Step 5: Commit** `feat(web): suddya connects/disconnects the judge book; full-width Google button`.

---

### Task 6: Visual check and full regression

- [ ] **Step 1: Screenshots** with the visual harness (see `apps/web/visual/` README/harness and `playwright.visual.config.ts`):
  - the login page in light and dark, mobile and desktop: the Google button is full width and centered;
  - the admin page with one active and one deactivated kurin, plus the force-delete dialog;
  - the звʼязковий banner on `/` for a deactivated kurin;
  - `/suddivstvo` as суддя, connected, with the disconnect button.

  Save them to `apps/web/visual-shots/kurin-admin-controls/`. Look at every screenshot and fix layout issues: overflow, misalignment, contrast in dark.
- [ ] **Step 2: Full regression.**
  - `cd apps/api && npx jest src/<each dir>`, per directory.
  - `npm run test:e2e` (API e2e).
  - `cd apps/web && npx playwright test`.
  - Known failures that are not regressions: ai-vykhovnyk.spec :152/:211 and flaky positions.spec:36. Anything else must pass.
- [ ] **Step 3:** `npx tsc --noEmit` in both apps and `npm run lint` if configured. Commit any fixes.
