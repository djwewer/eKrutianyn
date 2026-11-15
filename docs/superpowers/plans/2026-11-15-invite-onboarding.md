# Invite-Link Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every newly created user receives a one-time welcome link by email, sets their own password on a welcome page and is logged in. Nobody sets initial passwords anymore.

**Architecture:**
- **Tokens.** Reuse `PasswordResetToken` with a new `purpose` field (`RESET` 1 h, `INVITE` 7 days).
- **Invite service.** A new `InviteService.sendInvite(userId, actor)` in the auth module is called after each of the four user-creation paths commits.
- **New endpoints:** `GET /auth/invite/:token`, `POST /auth/accept-invite`, `POST /users/:id/resend-invite`, `POST /admin/users/:id/resend-invite`.
- **Web:** a `/welcome` page and BFF route; forms lose the password field; the user page shows activation status with a resend action.

**Tech Stack:**
- API: NestJS 11, Prisma (PostgreSQL), jest, nodemailer (Gmail).
- Web: Next.js 16 (App Router, client pages), TanStack Query, Playwright e2e against the real API.

**Spec:** `docs/superpowers/specs/2026-11-15-invite-onboarding-design.md`. Read it; it is the source of truth for copy and behaviour.

## Global Constraints

- **Invite-only accounts.** Nobody sets an initial password. `password` is removed from `CreateUserDto`, `CreateKurinDto.zvyazkovyi` and `CreateAdminUserDto`. New users are stored with `passwordHash = null` and `mustChangePassword = false`.
- **Activated.** A user is "activated" ⇔ `passwordHash !== null`.
- **Token lifetimes.** An `INVITE` token lives 7 days. A `RESET` token stays 1 hour. `POST /auth/accept-invite` accepts only `INVITE` tokens. `POST /auth/reset-password` accepts only `RESET` tokens.
- **Send after commit.** Invites are sent **after** the creating DB transaction commits. A mail failure never rolls back the user: `sendInvite` returns `{ sent: false }` and logs it. Creation responses include `inviteSent: boolean`.
- **Bulk import.** Only rows that **create** a user get an invite.
- **Resend rules.**
  - The звʼязковий may resend for users of their own kurin. The admin may resend for anyone, including звʼязкові.
  - A resend is refused with 409 when the target is activated.
  - Every new invite invalidates the user's earlier unused `INVITE` tokens.
- **Audit.** New `AuditAction.USER_INVITED`, written on every send including resends. It sits in the PEOPLE group in both `apps/api/src/audit/audit.constants.ts` and `apps/web/lib/audit.ts`.
- **Exact Ukrainian copy** from the spec:
  - Mail subject «Вітаємо в єПластуні — курінь {№ назва}».
  - Mail body «Привіт, {Ім'я}! Тебе додано до куреня {№ назва} як {роль}. Щоб увійти в єПластун, перейди за посиланням і встанови пароль. Посилання діє 7 днів.», a button «Встановити пароль», and the footer «Якщо ви не чекали цього листа, просто проігноруйте його.»
  - Invalid link: «Посилання недійсне або вже використане».
  - Welcome page: «Вітаємо, {Ім'я}!», «Курінь {№ назва}», fields «Новий пароль» / «Повторіть пароль», button «Встановити пароль і увійти».
  - After creating a user: «Запрошення надіслано на {email}».
  - User page: badge «Ще не активовано · запрошення надіслано {дата}» and button «Надіслати запрошення ще раз».
- **Kurin label.** `{№ назва}` means `№{kurinNumber} {name}`, or just `{name}` when `kurinNumber` is null.
- **Role labels:**
  - ZVYAZKOVYI «звʼязковий»
  - VYKHOVNYK «виховник»
  - JUNAK «юнак/юначка»

  Reuse an existing role-label helper if `apps/api/src` already has one.
- **Mail delivery.** The sender stays `"єПластун" <GMAIL_USER>`. In `MAIL_MODE=test` mails are captured with type `'welcome-invite'` and `link` set, readable via `GET /admin/test-mail?to=`.
- **Resource limits.** The machine is weak.
  - API unit tests run targeted: `cd apps/api && nice npx jest <path> --maxWorkers=1`.
  - E2E runs one spec at a time: `cd apps/web && nice npx playwright test e2e/<spec> --workers=1`. Ports 3000/3001 must be free first. Leave no dev servers running.
  - Never run `next build`. Type-check with `npx tsc --noEmit` in the package.
- **Repo hygiene.**
  - Never edit `.env` files.
  - Never `git add` `logo.png`, `ПРОБИ  старі/`, `Проби НОВІ/` or `docs/audits/`.
  - Work on branch `feat/invite-onboarding`. Do not push.
  - Commit with `git -c user.name=Zozulia -c user.email=user@Zozulia.local commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Stage only the files you touched.
- **Next 16.** Read `apps/web/AGENTS.md`; check `node_modules/next/dist/docs` (repo root) for unfamiliar APIs.
- **Visual style.** The `/welcome` page uses the existing `components/auth-layout.tsx` (Польовий login style) and `components/ui/*` primitives.

---

### Task 1: Data model, audit action, welcome mail

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add `enum TokenPurpose { RESET INVITE }`, `purpose TokenPurpose @default(RESET)` on `PasswordResetToken`, `USER_INVITED` in `enum AuditAction`)
- Create: migration via `cd apps/api && npx prisma migrate dev --name invite_token_purpose` (uses `apps/api/.env` → plast_dev). Then `DATABASE_URL=postgresql://plast:plast@localhost:5432/plast_test npx prisma migrate deploy`.
- Modify: `apps/api/src/audit/audit.constants.ts` (USER_INVITED → PEOPLE group), `apps/web/lib/audit.ts` (label «Надіслав(-ла) запрошення {subjectName}» or matching the file's phrasing style; group PEOPLE)
- Modify: `apps/api/src/mail/mail.service.ts` (CapturedMail type adds `'welcome-invite'`; new `sendWelcomeInvite`)
- Test: `apps/api/src/mail/mail.service.spec.ts`, `apps/api/src/audit/audit.constants.spec.ts`

**Interfaces:**
- Produces:

  ```ts
  // mail.service.ts
  async sendWelcomeInvite(to: string, p: { firstName: string; kurinLabel: string; roleLabel: string; inviteUrl: string }): Promise<void>
  // captured as { to, type: 'welcome-invite', link: inviteUrl, meta: { firstName, kurinLabel, roleLabel } }
  ```

  Prisma `TokenPurpose` enum and `PasswordResetToken.purpose`. `AuditAction.USER_INVITED`.

- [ ] **Step 1: Failing tests.**
  - In `mail.service.spec.ts`, add a test. In capture mode, `sendWelcomeInvite('a@b.c', { firstName: 'Олег', kurinLabel: '№307 Чорногора', roleLabel: 'звʼязковий', inviteUrl: 'http://x/welcome?token=t' })` makes `getLastMailFor('a@b.c')` return `type: 'welcome-invite'` and `link` equal to the URL.
  - The rendered html contains «Привіт, Олег!», «№307 Чорногора», «звʼязковий» and «Встановити пароль».
  - The subject is «Вітаємо в єПластуні — курінь №307 Чорногора". Assert via a spy on `deliver`, or via a `subject` stored in captured meta. Pick whichever matches the existing spec style.
  - Escape user values with the file's `escapeHtml`, and test that `<b>` in `firstName` is escaped.
  - In `audit.constants.spec.ts`, assert that USER_INVITED is in PEOPLE.
- [ ] **Step 2: Run them.** They fail: `cd apps/api && nice npx jest src/mail src/audit/audit.constants.spec.ts --maxWorkers=1`.
- [ ] **Step 3: Implement** the schema change plus migration (dev and test DBs), the audit constants, the web audit label, and `sendWelcomeInvite`.
  - HTML: a short paragraph per spec copy.
  - The button is an `<a>` with inline styles: navy `#1B3358` background, white text, padding, radius 4px.
  - The footer line comes last.
- [ ] **Step 4: Run the tests** (now passing) and `cd apps/api && npx tsc --noEmit`.
- [ ] **Step 5: Commit** with `feat(api): invite token purpose, USER_INVITED audit action, welcome mail`.

### Task 2: InviteService and auth endpoints

**Files:**
- Create: `apps/api/src/auth/invite.service.ts`, `apps/api/src/auth/invite.service.spec.ts`, `apps/api/src/auth/dto/accept-invite.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts` (`requestPasswordReset` sets `purpose: RESET` explicitly; `resetPassword` rejects non-RESET tokens; new `acceptInvite`, `getInviteInfo`)
- Modify: `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.module.ts` (provide + export InviteService; import AuditModule if needed)
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Produces:

  ```ts
  // invite.service.ts
  @Injectable() export class InviteService {
    sendInvite(userId: string, actorId: string | null): Promise<{ sent: boolean }>;
  }
  // auth.service.ts
  getInviteInfo(token: string): Promise<{ firstName: string; kurinLabel: string }>; // NotFoundException('Посилання недійсне або вже використане') when invalid/used/expired/not INVITE
  acceptInvite(token: string, newPassword: string): Promise<{ accessToken: string }>; // same NotFoundException message for invalid tokens
  // controller
  GET  /auth/invite/:token        -> getInviteInfo
  POST /auth/accept-invite { token, newPassword } -> acceptInvite   (AcceptInviteDto: @IsString() token; @IsString() @MinLength(8) newPassword)
  ```

  Export a helper `kurinLabel(kurin: { name: string; kurinNumber: string | null })` from `apps/api/src/common/kurin-label.util.ts`, used by both the mail and `getInviteInfo`. Check the Prisma type of `kurinNumber` and adapt.

- [ ] **Step 1: Failing tests** in `invite.service.spec.ts`. Mock Prisma, MailService and AuditService the way `auth.service.spec.ts` does.
  - It creates an INVITE token that expires 7 days ahead (±1 min).
  - It marks earlier unused INVITE tokens of that user as used (`updateMany` with `{ userId, purpose: INVITE, usedAt: null }`).
  - It calls `sendWelcomeInvite` with a URL `${FRONTEND_URL}/welcome?token=<raw>`, where the stored hash equals `hashToken(raw)`.
  - It records the `USER_INVITED` audit with `subjectUserId` and the actor.
  - It returns `{ sent: true }`.
  - When mail throws, it returns `{ sent: false }`, still records the audit, and doesn't throw.
- [ ] **Step 2: Failing tests** in `auth.service.spec.ts`.
  - `acceptInvite` with a valid INVITE token sets `passwordHash` (argon2) and `mustChangePassword: false`, marks the token used, and returns `accessToken`.
  - Expired, used, RESET-purpose and unknown tokens all throw NotFoundException with the exact message.
  - `resetPassword` with an INVITE token throws BadRequestException as today.
  - `getInviteInfo` returns `{ firstName, kurinLabel }` and does not mark the token used.
- [ ] **Step 3: Run them.** They fail: `cd apps/api && nice npx jest src/auth --maxWorkers=1`.
- [ ] **Step 4: Implement.**
  - `acceptInvite` uses one `$transaction`: update the user, mark the token used, and mark the user's other unused tokens used (like `resetPassword`).
  - It then signs the JWT through the existing private sign path, the same as `loginWithPassword`: compute `isKurinniy`, positions and kurinNumber.
  - Refactor `loginWithPassword`'s tail into a private `issueSessionFor(user)` reused by both.
  - Archived users: `acceptInvite` throws UnauthorizedException('Account archived') like login.
- [ ] **Step 5: Run the tests** (now passing) and run `tsc`.
- [ ] **Step 6: Commit** with `feat(api): invite service, accept-invite and invite-info endpoints`.

### Task 3: Creation paths send invites; resend endpoints; activation status

**Files:**
- Modify: `apps/api/src/users/dto/create-user.dto.ts`, `apps/api/src/admin/dto/create-kurin.dto.ts`, `apps/api/src/admin/dto/create-admin-user.dto.ts` (remove `password`)
- Modify: `apps/api/src/users/users.service.ts` (create: no password; call `inviteService.sendInvite(created.id, actor.userId)` after audit; return `{ ...created, inviteSent }`; new `resendInvite(userId, actor)`; user detail select adds `activated` and `lastInviteAt`)
- Modify: `apps/api/src/users/users.controller.ts` (`POST /users/:id/resend-invite`, roles: ZVYAZKOVYI)
- Modify: `apps/api/src/admin/kurins-admin.service.ts` (createKurin and createFirstZvyazkovyi: no password; send invite after the transaction; return `inviteSent`) + admin controller(s): `POST /admin/users/:id/resend-invite`
- Modify: `apps/api/src/approval-requests/approval-requests.service.ts` (CREATE_JUNAK approve: after the transaction commits, `sendInvite(createdJunakId, actor.userId)`; include `inviteSent` in the response)
- Modify: `apps/api/src/junak-import/junak-import-row-processor.service.ts` (after the upsert transaction, when `result.created`, call `sendInvite`; add `inviteSent?: boolean` to `JunakImportRowResult` in `junak-import-row.types.ts`)
- Modify: the module files so InviteService is injectable where needed (import AuthModule, or move InviteService to a small `InviteModule` exported to users/admin/approval-requests/junak-import; avoid circular imports, and prefer a dedicated `InviteModule` if AuthModule importing creates a cycle)
- Test: the existing specs of those services (`users.service.spec.ts`, `kurins-admin.service.spec.ts`, `approval-requests.service.spec.ts`, `junak-import-row-processor.service.spec.ts`), plus the resend tests

**Interfaces:**
- Consumes: `InviteService.sendInvite(userId, actorId)` (Task 2).
- Produces: the API response fields the web uses.
  - `POST /users` → `{ ...user, inviteSent: boolean }`.
  - `POST /admin/kurins` → `{ ...kurin, inviteSent: boolean }`.
  - `POST /admin/<first-zvyazkovyi route>` → `{ ...user, inviteSent: boolean }`.
  - Approval approve response → `{ ...request, inviteSent?: boolean }`.
  - Row result → `inviteSent?: boolean`.
  - `POST /users/:id/resend-invite` and `POST /admin/users/:id/resend-invite` → `{ inviteSent: boolean }`.
  - User detail (`GET /users/:id`) adds `activated: boolean` and `lastInviteAt: string | null` (the newest INVITE token's `createdAt`).
  - The admin kurins list adds, for each kurin's звʼязковий, `activated` and `lastInviteAt`, plus their `id` if it isn't already exposed. Check the existing admin list shape first.

- [ ] **Step 1: Failing tests.**
  - `users.service.create` calls `sendInvite(created.id, actor.userId)` and returns `inviteSent`. The created data has no `passwordHash` and `mustChangePassword: false`.
  - `kurins-admin.createKurin` and `createFirstZvyazkovyi` send an invite after the transaction (the call happens even if the mock tx resolves first) and return `inviteSent`.
  - CREATE_JUNAK approve sends an invite once. A rejection sends none.
  - Row processor: a created row sends an invite and an updated row doesn't.
  - `resendInvite`: an activated target → ConflictException. Another kurin → NotFoundException. A non-ZVYAZKOVYI actor is blocked by the controller roles.
  - Admin resend works for a звʼязковий.
- [ ] **Step 2: Run them.** They fail: `cd apps/api && nice npx jest src/users src/admin src/approval-requests src/junak-import --maxWorkers=1`.
- [ ] **Step 3: Implement.** Keep the invite calls outside `$transaction` callbacks.
- [ ] **Step 4: Run the tests** (now passing). Then run the whole API unit suite once: `cd apps/api && nice npx jest --maxWorkers=1`, and `tsc`. Fix fallout, for example specs that passed `password` in DTOs.
- [ ] **Step 5: Commit** with `feat(api): send invites on every user-creation path; resend endpoints; activation status`.

### Task 4: E2E seed helpers accept invites

**Files:**
- Modify: `apps/web/e2e/helpers/seed.ts` (`seedKurinWithZvyazkovyi`: no password in the create body; after creating, accept the invite with password `password123`; delete the old password-clear step), `apps/web/e2e/helpers/proby-seed.ts` (`createUserAs` / `createOnboardedUserAs` / `loginForToken` as needed)
- Create: `apps/web/e2e/helpers/invite.ts`
- Modify: any spec that sends `password` to creation endpoints or asserts on removed password UI. Grep `password` in `apps/web/e2e`.

**Interfaces:**
- Produces:

  ```ts
  // e2e/helpers/invite.ts
  export async function acceptInviteFor(email: string, password?: string /* default 'password123' */): Promise<{ accessToken: string }>
  // reads GET http://localhost:3001/admin/test-mail?to=<email> (admin headers as other helpers), expects type 'welcome-invite',
  // takes token from new URL(mail.link).searchParams.get('token'), POSTs /auth/accept-invite { token, newPassword }.
  ```

  - `createUserAs(token, dto)` keeps its signature (ignores `dto.password` if callers pass one) and returns the created user.
  - `createOnboardedUserAs(token, dto)` = `createUserAs` + `acceptInviteFor(dto.email)`, returning the same shape as today (`{ user, … }`). Check the current return shape and keep it.
  - Every user that a spec later logs in as must be onboarded through `acceptInviteFor`.

- [ ] **Step 1:** Implement the helper and update the seeds.
- [ ] **Step 2: Run a representative set**, one at a time: login, navigation-shell, kurin-roster-zvyazkovyi, users-new-direct, approval-request-create, approval-request-decide, junak-import-auto-map, treasury, theme-toggle, forgot-password. They must pass.
- [ ] **Step 3: Commit** with `test(web): seed helpers onboard users via invite links`.

### Task 5: Web: welcome page, BFF, forms, activation UI, e2e flow

**Files:**
- Create: `apps/web/app/welcome/page.tsx`, `apps/web/app/api/auth/accept-invite/route.ts`, `apps/web/e2e/invite-onboarding.spec.ts`
- Modify: `apps/web/middleware.ts` (add `/welcome` to `PUBLIC_PATHS`)
- Modify: `apps/web/app/users/new/page.tsx` (remove the password field and state; on success show «Запрошення надіслано на {email}», or a warning plus resend when `inviteSent === false`)
- Modify: `apps/web/app/admin/page.tsx` (remove the звʼязковий password inputs from the create-kurin / first-звʼязковий forms; show the invite result; for each kurin's звʼязковий that is not activated show the badge plus «Надіслати запрошення ще раз» via `POST /admin/users/:id/resend-invite`)
- Modify: `apps/web/app/users/[id]/page.tsx` (for `activated === false`, a ZVYAZKOVYI viewer sees the badge «Ще не активовано · запрошення надіслано {дата}» and the button «Надіслати запрошення ще раз»; on success show «Запрошення надіслано на {email}»)
- Modify: `apps/web/lib/queries/*` and `apps/web/lib/types.ts` for the new fields and mutations

**Interfaces:**
- Consumes: Tasks 2-3 endpoints and fields. The BFF `POST /api/auth/accept-invite` mirrors `app/api/auth/login/route.ts`: it forwards to `${API_URL}/auth/accept-invite`, sets the `accessToken` cookie with the same options, and returns `{ success: true }`.
- The welcome page calls `GET /api/backend/auth/invite/:token`. If the BFF `backend/[...path]` proxy works unauthenticated for public API routes, use it. Otherwise add `app/api/auth/invite/[token]/route.ts`.

- [ ] **Step 1: Write `e2e/invite-onboarding.spec.ts` first.** It must fail.
  1. Create a kurin through the admin API without a password, using the same admin helper style as seed.ts.
  2. Read the `welcome-invite` mail for the звʼязковий email.
  3. `page.goto(link path)`.
  4. Expect «Вітаємо, Зв'язковий!» and the kurin label.
  5. Fill «Новий пароль» and «Повторіть пароль», then click «Встановити пароль і увійти».
  6. Expect the URL to leave /welcome and `navigation` «Основна навігація» to be visible.
  7. Reopen the same link and expect «Посилання недійсне або вже використане».
  8. As the звʼязковий (now logged in), create a user via /users/new without any password field present. Expect «Запрошення надіслано на {email}».
  9. On that user's page, expect «Ще не активовано». Click «Надіслати запрошення ще раз».
  10. The old link (captured before the resend) is invalid and the new one works.
- [ ] **Step 2: Run it.** It fails: `cd apps/web && nice npx playwright test e2e/invite-onboarding.spec.ts --workers=1`.
- [ ] **Step 3: Implement the welcome page** with `AuthLayout`.
  - Loading state, then the valid and invalid states per the spec copy.
  - Client-side check: passwords must match and be at least 8 characters.
  - On success `router.replace('/')`.
  - Implement the BFF route and the middleware entry, then the forms and the user page.
- [ ] **Step 4: Run it** (now passing), plus `users-new-direct.spec.ts`, `users-new-hurtok-prefill.spec.ts`, `admin-kurins.spec.ts`, `users-detail.spec.ts`, `login.spec.ts`, one at a time. Run `tsc` and `eslint` on the changed files.
- [ ] **Step 5: Commit** with `feat(web): welcome page, invite results and resend in forms and user page`.

### Task 6: Full verification and ops note

**Files:**
- Modify: `docs/ops/vps-stage1.md`, or create `docs/ops/vps-invite-onboarding.md`. The deploy needs `prisma migrate deploy` on the VPS before the web goes live, because the web forms no longer send passwords and the admin create-kurin API must already accept that. State the order: API first (pull, build, migrate), then web.

- [ ] **Step 1: Full API unit suite**, once: `cd apps/api && nice npx jest --maxWorkers=1`. All green.
- [ ] **Step 2: Full e2e suite**, once, in the background: `cd apps/web && nice npx playwright test --workers=1`. Write the log to the session scratchpad. All green except the 2 known `ai-vykhovnyk.spec.ts:152/:211` (a product decision already in the backlog). Fix any other failure the feature caused.
- [ ] **Step 3: Write the ops note.**
- [ ] **Step 4: Commit** with `docs(ops): deploy order for invite onboarding`.
