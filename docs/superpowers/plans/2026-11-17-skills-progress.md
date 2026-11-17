# Skills progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A junak starts skills; a виховник signs the requirements and credits the skill; the catalog shows «Мої вмілості»; the proba on the junak profile is collapsible; the catalog loads on prod automatically.

**Architecture:**
- `JunakSkill` gains a started state (`achievedAt` nullable, plus `startedAt`/`startedById`).
- A new `JunakSkillRequirementSign` row stores each signed top-level requirement (by index into `SkillLevel.requirements`).
- Permissions reuse `canWriteJunakHistory`. The junak may start, and may remove their own unsigned started skills.
- Web: a «Мої вмілості» block on `/skills`, and collapsible «Проба» and «Вмілості» cards on `/users/[id]`.

**Tech Stack:** NestJS + Prisma (Postgres) with jest unit tests (`apps/api/src`) and jest e2e against `plast_test` (`apps/api/test`, `npm run test:e2e`). Next.js 16 + TanStack Query. Playwright e2e (`apps/web/e2e`) and the visual harness (`apps/web/playwright.visual.config.ts`, screenshots in `apps/web/visual-shots/`).

**Spec:** `docs/superpowers/specs/2026-11-17-skills-progress-design.md` — read it first; it is the source of truth for behavior, permissions and copy.

## Global Constraints

- **Copy.** Ukrainian, no russianisms. Use exactly these strings from the spec:
  - «Мої вмілості», «Розпочаті», «Здобуті», «Розпочати», «розпочата», «здобута», «Прибрати»
  - «Зарахувати вмілість», «Розпочати вмілість», «Додати здобуту»
  - «Цю вмілість уже розпочато або здобуто»
  - «Ще немає розпочатих вмілостей. Обери вмілість у каталозі нижче й натисни «Розпочати».»
  - progress format «N з M вимог»
- **Permissions.** «Can sign» = `canWriteJunakHistory` (`apps/api/src/junak-history/junak-history-access.ts`): the звʼязковий of the kurin, or a виховник assigned to the junak's hurtok. Archived junaks are read-only.
- **Files and git.**
  - Never edit `.env` files and never print secrets.
  - Never `git add` `logo.png`, `ПРОБИ  старі/`, `Проби НОВІ/`, `docs/audits/`, `.superpowers/`, `visual-shots/` or `test-results/`.
  - Commit with `git -c user.name=Zozulia -c user.email=user@Zozulia.local commit`, and end each message with a blank line plus `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Work on branch `feat/skills-progress` and don't push.
- **The machine is overloaded and crashed once.**
  - Run exactly one test process at a time. Run jest with `--runInBand`, per directory or file, never the whole unit suite.
  - Playwright starts its own servers on :3000/:3001. Check `lsof -i :3000 -i :3001` first and leave nothing running.
  - For API e2e, pass runtime env only:
    - real VAPID keys generated at runtime with node:crypto ECDH prime256v1 → base64url (see `apps/web/playwright.config.ts`);
    - throwaway `ADMIN_USERNAME`/`ADMIN_PASSWORD`/`ADMIN_API_KEY` if a spec needs them;
    - `NODE_OPTIONS=--max-old-space-size=4096`.
- **UI.** Use existing primitives in `apps/web/components/ui` (Accordion, Badge signal/ok/late/mute, Button, Card, Dialog, Input, Label, ProgressBar, native-select) and the Польовий tokens. No new design language.
- **Next.js.** `apps/web/AGENTS.md`: this Next.js version has breaking changes. Check `apps/web/node_modules/next/dist/docs/` when unsure.

---

### Task 1: Data model, migration, catalog auto-seed

**Files:**
- `apps/api/prisma/schema.prisma`
- a new migration (`npx prisma migrate dev --name junak_skill_progress`, then apply it to the test DB the same way earlier migrations were applied)
- `apps/api/Dockerfile`
- `apps/api/src/junak-history/*` (views, history service, skills service)
- `apps/api/src/skills/skills.service.ts`
- `apps/api/src/admin/kurins-admin.service.ts` (verify force-delete)
- related specs

**Produces:**
- `JunakSkill`:
  - `achievedAt DateTime? @db.Date`
  - `startedAt DateTime?`
  - `startedById String?` with relation `startedBy User? @relation("JunakSkillStartedBy", ...)`. Add the back-relation on User.
  - back-relation `signs JunakSkillRequirementSign[]`
- `model JunakSkillRequirementSign`:
  - `id`
  - `junakSkillId` with relation `onDelete: Cascade`
  - `requirementIndex Int`
  - `signedById` with relation User `"JunakSkillRequirementSignedBy"`
  - `signedAt DateTime @default(now())`
  - `@@unique([junakSkillId, requirementIndex])` and `@@index([junakSkillId])`
- Any new `AuditAction` values Task 2 needs, e.g. `JUNAK_SKILL_STARTED`, `JUNAK_SKILL_REQUIREMENT_SIGNED`, `JUNAK_SKILL_ACHIEVED`. Check the existing junak-skill audit actions in schema.prisma and `apps/api/src/audit/audit.constants.ts` first, and reuse them where they fit.
  - Add all new enum values in this one migration.
  - Map them in `audit.constants.ts` groups and in `apps/web/lib/audit.ts` labels, next to the existing junak-skill actions.

- [ ] **Step 1: Schema and migration.** Write the schema changes above and generate the migration. Read the generated SQL. It must not drop the partial index `"Skill_global_name_key"` (see the comment in schema.prisma); if it does, remove that line. Apply the migration to dev and test DBs. Run `npx prisma generate`.
- [ ] **Step 2: Fix "achieved" consumers.** Grep `apps/api/src` for every `junakSkill` read. Where the code means achieved — the junak history view `skills`, any counts, and `toJunakSkillView` assumptions that `achievedAt` is non-null — filter `achievedAt: { not: null }` or handle null. Keep the existing JSON shape for history consumers.
  - In `skills.service.ts`, check that deleting a custom skill or level still refuses when JunakSkill rows exist, started ones included. The FK Restrict already covers this; check that the message still fits.
- [ ] **Step 3: Force-delete.** Confirm `forceDeleteKurin` still works: signatures cascade from JunakSkill. Signs whose `signedById` is a user of this kurin, on another kurin's junak, are impossible because users never change kurin, but if a delete order is needed, add `junakSkillRequirementSign.deleteMany` for `signedById in userIds` before users are deleted. Extend the existing rich-seed force-delete e2e in `apps/api/test/admin-kurins.e2e-spec.ts` with one started skill plus a sign, and check that it passes.
- [ ] **Step 4: Auto-seed on start.** Change the `apps/api/Dockerfile` CMD to run the seed after migrations without blocking start:
  `CMD ["sh", "-c", "npx prisma migrate deploy && (node dist/scripts/seed-skills-catalog.js || echo 'skills catalog seed failed') && exec node dist/main"]`
  Verify that the path `dist/scripts/seed-skills-catalog.js` exists after `npm run build` in apps/api.
- [ ] **Step 5: Verify and commit.** Run `npx jest src/junak-history --runInBand`, `npx jest src/skills --runInBand`, `npx jest src/admin --runInBand`, the admin-kurins e2e, and `npx tsc --noEmit` for both apps. Commit `feat(api): junak skill started state and requirement signs; seed skills catalog on start`.

---

### Task 2: API — start, sign, credit, remove

**Files:**
- `apps/api/src/junak-history/junak-skills.controller.ts`
- `junak-skills.service.ts`
- new DTOs in `apps/api/src/junak-history/dto/`
- views
- `apps/api/test/` (new `junak-skill-progress.e2e-spec.ts`, or extend the existing junak skills e2e — find it with `ls apps/api/test | grep -i skill`)

**Consumes:** Task 1 schema.

**Produces:**
- `GET /users/:junakId/skills` returns `{ canEdit: boolean; canStart: boolean; items: JunakSkillView[] }`.
  - `canEdit` = can sign.
  - `canStart` = `canEdit` or `actor.userId === junakId` (a non-archived junak).
  - `JunakSkillView` adds:
    - `status: 'STARTED' | 'ACHIEVED'`
    - `startedAt: string | null`
    - `achievedAt: string | null`
    - `requirements: { text: string; items?: string[] }[]` (from the level)
    - `signs: { index: number; signedAt: string; signedByName: string }[]`
  - The existing fields stay.
- `POST /users/:junakId/skills/start` body `{ levelId: string }` → the created view. Errors:
  - 409 «Цю вмілість уже розпочато або здобуто»;
  - 404 when the level is unknown or belongs to another kurin's custom skill.
- `PUT /users/:junakId/skills/:id/requirements/:index` → the view. `DELETE` on the same path → the view. Errors:
  - 400 when the index is out of range;
  - 409 when the record is achieved.
- `POST /users/:junakId/skills/:id/achieve` body `{ achievedAt: string (YYYY-MM-DD, not in the future), examiner?: string, certificateNumber?: string }` → the view. 409 if the record is already achieved.
- `DELETE /users/:junakId/skills/:id` keeps its current rules for achieved records. For a started record:
  - anyone who can sign may delete it;
  - the junak themselves only when `signs.length === 0`, otherwise 403 «Розпочату вмілість з підписами може прибрати лише виховник».

- [ ] **Step 1: Failing tests first.** Write tests (e2e against the real DB preferred, following the existing junak-skills e2e) covering the spec's permission matrix:
  - start: the junak themselves, the звʼязковий, an assigned виховник; an unassigned виховник gets 403; a junak starting for another junak gets 403/404;
  - start conflict gives 409;
  - sign and unsign by the виховник; a junak signing gets 403; a bad index gives 400; signing an achieved record gives 409;
  - achieve with fewer than all requirements signed is allowed; a future date gives 400;
  - the junak removes their own started record with zero signs (200), and with a sign (403);
  - a виховник removes a started record with signs (200);
  - an archived junak is read-only;
  - audit rows are written.
  Run the tests and check that they FAIL.
- [ ] **Step 2: Implement.** Reuse `loadJunakForRead`, `loadJunakForWrite` and `canWriteJunakHistory`.
  - For the junak-self start and remove paths, write a small access helper in `junak-history-access.ts`: the actor is the junak, the junak isn't archived, and they are in the same kurin.
  - Requirements count = `(level.requirements as SkillRequirement[]).length`.
  - The existing create flow (direct add as achieved) stays and must set `achievedAt`.
- [ ] **Step 3: Verify and commit.** Run the new e2e, `npx jest src/junak-history --runInBand`, and tsc. Commit `feat(api): start, sign, credit and remove junak skills`.

---

### Task 3: Web — «Мої вмілості» on the catalog

**Files:**
- `apps/web/app/skills/page.tsx`
- `apps/web/lib/queries/junak-history.ts` (or `skills.ts`)
- `apps/web/lib/types.ts`
- a new component, e.g. `apps/web/components/my-skills.tsx`
- `apps/web/e2e/` (extend `skills-catalog.spec.ts` or add `my-skills.spec.ts`)

**Consumes:** the Task 2 API, with `junakId` = the session userId.

- [ ] **Step 1: Types and hooks.**
  - Extend `JunakSkill` in `lib/types.ts` with the new fields and make `achievedAt` nullable.
  - Add hooks: `useStartJunakSkill(junakId)`, `useSignSkillRequirement(junakId)`, `useUnsignSkillRequirement(junakId)`, `useAchieveJunakSkill(junakId)`, `useJunakSkills(junakId)` (if there is no list hook yet). Reuse the existing remove hook.
  - Invalidate both `['junak-history', junakId]` and the junak-skills query after mutations.
  - Fix every existing consumer of `JunakSkill.achievedAt` for null.
- [ ] **Step 2: «Мої вмілості» block.** At the top of `/skills`, for `session.role === 'JUNAK'`, follow the spec section 4:
  - Розпочаті: each one is an Accordion item with name, level and a «N з M вимог» ProgressBar. It expands to the requirements, with signed ones marked plus who signed them. «Прибрати» shows when `signs.length === 0`, with a confirm dialog.
  - Здобуті: name, level, date.
  - The empty-state copy.
- [ ] **Step 3: «Розпочати» in the catalog.**
  - For a JUNAK session, each skill level row gets «Розпочати» when no record exists. It shows the badge «розпочата» or «здобута» otherwise.
  - Starting updates «Мої вмілості» immediately.
  - Non-junak sessions keep the catalog exactly as today.
- [ ] **Step 4: E2E.** A junak starts a skill in the catalog. It appears in «Розпочаті» with «0 з N вимог». The catalog row shows «розпочата». The junak removes it, and it disappears. Run the spec, then `e2e/skills-catalog.spec.ts`, then tsc.
- [ ] **Step 5: Commit** `feat(web): Мої вмілості and start from the skills catalog`.

---

### Task 4: Web — junak profile: collapsible «Проба» and new «Вмілості» card

**Files:**
- `apps/web/app/users/[id]/page.tsx` (the proba card, ~line 660-760, and `ProbyCategorySection`)
- a new `apps/web/components/junak-skills-card.tsx`
- `apps/web/components/junak-history.tsx` and `components/junak-history/skills-section.tsx` (remove the skills block from history; move any reusable dialog, e.g. «Додати здобуту», into the new card)
- `apps/web/e2e/` (`junak-history-skills.spec.ts`, `junak-proba-detail.spec.ts`, `proby.spec.ts` etc. may need updating for the collapsed proba)

**Consumes:** Task 2 API and Task 3 hooks and types.

- [ ] **Step 1: Collapsible proba.** Follow the spec section 5.
  - The «Проба» card is collapsed by default, with overall progress in the header (e.g. «N з M точок» plus a ProgressBar). Use the Accordion primitive.
  - Inside: stages, then categories, each collapsed with «N з M». The existing sign controls and stage close/reopen controls keep working.
  - Locked stages stay locked.
- [ ] **Step 2: «Вмілості» card.** Rendered for junak profiles next to the proba card, following the spec section 5.
  - The header shows «Розпочато: N · Здобуто: M».
  - Started skills come first and are highlighted (signal tone). Each expands to its requirements with sign checkboxes (`canEdit`) or readonly marks plus the signer. «Зарахувати вмілість» opens a dialog: date (default today, max today), examiner, certificate number.
  - Achieved skills follow, with the existing edit/delete actions if `canEdit`.
  - Actions:
    - «Розпочати вмілість» (`canEdit`): a dialog with a searchable or grouped select over the catalog levels (global + kurin custom, `useSkillsCatalog`) that have no record yet.
    - «Додати здобуту» (`canEdit`): the existing direct-add flow moved from the history skills-section.
  - Junak viewing self: readonly, but «Розпочати вмілість» and «Прибрати» follow `canStart` and the rules.
- [ ] **Step 3: Remove the skills block from «Історія».** Keep the other history sections unchanged.
- [ ] **Step 4: E2E.**
  1. Seed a junak with a started skill (via the API as the junak).
  2. The звʼязковий opens `/users/{id}`. The «Вмілості» card shows the skill highlighted.
  3. Sign 2 requirements. Progress shows «2 з N вимог».
  4. «Зарахувати вмілість» → the skill moves to the achieved list.
  5. The proba card is collapsed; expanding stage → category shows the points and signing a point still works.
  
  Update the existing specs broken by the collapsed proba or the moved skills block. Run each affected spec one at a time, then tsc.
- [ ] **Step 5: Commit** `feat(web): collapsible proba and skills card on the junak profile`.

---

### Task 5: Visual check and regression

- [ ] **Step 1: Screenshots.** Use the visual harness (follow `apps/web/visual/kurin-admin-controls.spec.ts` as the pattern). Shoot the catalog «Мої вмілості» (with started and achieved items), the junak profile «Вмілості» card expanded with a started skill, and the collapsed and expanded «Проба» — each in light and dark, on phone and desktop. Save them to `apps/web/visual-shots/skills-progress/`. Look at every shot and fix layout problems minimally.
- [ ] **Step 2: Regression, strictly sequential.**
  - API unit, per directory, `--runInBand`.
  - API e2e, file by file, with the runtime env.
  - `npx playwright test` in apps/web.
  - tsc in both apps.

  Known non-regressions: ai-vykhovnyk.spec :152/:211, positions.spec:36 (flaky). Categorise any other failure as caused by this branch (fix it), pre-existing, or flaky.
- [ ] **Step 3: Commit** the harness and any fixes.
