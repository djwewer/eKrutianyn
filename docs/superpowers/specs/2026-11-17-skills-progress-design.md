# Skills in progress: start, sign requirements, credit

_Date: 2026-11-17. Status: design approved by Andrii._

## Goal
Вмілості should work like proby points. A junak starts a skill. The виховник signs its requirements one by one and then credits the skill. Everyone sees the progress.

Also:
- The global catalog loads on prod automatically.
- The proba on the junak profile becomes collapsible.

## 0. Catalog on prod
- The global catalog «Вмілості УПЮ» (КПС 2003, 71 skills) already lives in `apps/api/src/scripts/skills-catalog.data.ts`. It is loaded by `seed-skills-catalog`, which was never run on prod.
- `apps/api/Dockerfile` CMD runs the seed after `prisma migrate deploy` and before `node dist/main`.
- A seed failure must not stop the API. Log it and continue.
- The seed is an idempotent upsert that never deletes anything.

## 1. Data
- `JunakSkill` becomes either **started** or **achieved**:
  - `achievedAt DateTime? @db.Date`, nullable. `null` means started, a date means achieved.
  - New `startedAt DateTime?` and `startedById String?` (relation to User). Both are null for rows that were added directly as achieved.
  - The existing rows are all achieved and stay unchanged.
- New model `JunakSkillRequirementSign`:
  - Fields: `id`, `junakSkillId` (FK, `onDelete: Cascade`), `requirementIndex Int` (0-based index into the level's `requirements` JSON array), `signedById` (FK User), `signedAt DateTime @default(now())`.
  - `@@unique([junakSkillId, requirementIndex])`.
- Only top-level numbered requirements are signed. Sub-items а), б)… are not signed on their own.
- The existing unique `[junakId, levelId]` stays. A junak has at most one record per skill level, whether it is started or achieved.
- The force-delete kurin path (`KurinsAdminService.forceDeleteKurin`) must also delete `JunakSkillRequirementSign` rows. The cascade from JunakSkill covers them, but this must be verified.
- Every existing consumer that means "achieved" must treat `achievedAt: null` correctly. Examples: the junak history view, any counts.

## 2. Permissions
"Can sign" uses the same rule as signing proby points: the звʼязковий of the kurin, or a виховник assigned to the junak's hurtok. This is `canWriteJunakHistory`.

| Action | Who |
|---|---|
| Start a skill level | The junak themselves (own record), or anyone who can sign |
| Sign or unsign a requirement on a started skill | Anyone who can sign |
| Credit («Зарахувати вмілість»): set `achievedAt` (required, not in the future), optional `examiner` and `certificateNumber` | Anyone who can sign. Allowed regardless of how many requirements are signed. |
| Remove a started skill | The junak, only their own and only with zero signatures. Anyone who can sign, any time. |
| Add an already-achieved skill directly (existing flow) | Anyone who can sign (unchanged) |
| Edit or delete an achieved skill (existing flow) | Unchanged |

- Starting a level that already has a record (started or achieved) → 409 «Цю вмілість уже розпочато або здобуто».
- Signing a requirement index that is out of range → 400.
- Signing on an achieved record → 409.
- Archived junaks are read-only, as today.

## 3. API
These sit under the existing `users/:junakId/skills` controller. Exact routes are decided in the plan; the shapes are below.
- `GET users/:junakId/skills`: items include a `status` of `'STARTED' | 'ACHIEVED'`, `startedAt`, `signedRequirements: number[]` (indices), `requirementsCount`, and `requirements` (the level's requirement texts). The response also includes `canEdit` (can sign) and `canStart`.
- `POST users/:junakId/skills/start { levelId }`: start a level.
- `PUT users/:junakId/skills/:id/requirements/:index`: sign. `DELETE` on the same path: unsign.
- `POST users/:junakId/skills/:id/achieve { achievedAt, examiner?, certificateNumber? }`: credit the skill.
- `DELETE users/:junakId/skills/:id`: extends the existing delete with the started-skill rule for the junak.
- Every write records an audit entry. Follow how the existing junak-skill create/update/delete audit. New actions are allowed if the audit enum needs them.

## 4. Web: Каталог вмілостей (junak)
- **«Мої вмілості»** block at the top of `/skills`, for a JUNAK session:
  - «Розпочаті», each one with name, level, and progress «2 з 5 вимог». It expands to the requirement list, with signed ones marked and who signed them.
  - «Здобуті», with name, level and date.
  - Empty state: «Ще немає розпочатих вмілостей. Обери вмілість у каталозі нижче й натисни «Розпочати».»
- **«Розпочати»** in the catalog, per skill level that the junak hasn't started or achieved. Started ones show the badge «розпочата», achieved ones show «здобута».
- A junak can remove their own started skill with zero signatures («Прибрати»), with a confirm dialog.

## 5. Web: junak profile (виховник / звʼязковий view)
- **«Проба» card.**
  - It is collapsed by default. The header shows the overall progress.
  - Expanding it shows stages, then categories (А, Б, В…), each collapsed with «N з M» signed points. Expanding a category shows its points with the existing sign controls.
  - Stage close/reopen controls stay where they make sense.
  - Use the existing `Accordion` primitive.
- **New «Вмілості» card** next to the proba card, built the same way:
  - It is collapsed by default. The header shows «Розпочато: N · Здобуто: M».
  - **Started skills come first and are highlighted** with the signal tone. Each expands to its requirements, each with a sign checkbox (or a readonly mark plus who signed). Below them is the «Зарахувати вмілість» button, which opens a dialog with date (default today), examiner and certificate number.
  - Achieved skills follow.
  - There are two actions: «Розпочати вмілість», a picker over the catalog (global + kurin custom, filtered to levels without a record), and «Додати здобуту», the existing direct-add flow.
- **Junak history.** The existing skills block in «Історія» (`components/junak-history/skills-section.tsx`) moves into this card and is removed from history, so it isn't duplicated.
- **Junak viewing their own profile.** The same cards are read-only, except that they can start or remove their own skills as allowed above.

## 6. Testing
- **API unit and e2e:** the permission matrix above; start conflict 409; sign/unsign; index bounds; credit; junak removing their own started skill with and without signatures; achieved records unaffected; the force-delete kurin path still works.
- **Playwright:**
  1. The junak starts a skill in the catalog and sees it in «Розпочаті».
  2. The виховник or звʼязковий opens the junak and sees it highlighted, signs two requirements and credits it.
  3. The junak sees it in «Здобуті».
  4. The proba card on the junak profile is collapsed and expands stage → category → points.
- **Visual:** screenshots of the catalog «Мої вмілості», the profile «Вмілості» and «Проба» cards, light and dark, phone and desktop.

## Out of scope
- Signing sub-items а), б).
- Notifications.
- Reports on skills across the kurin.
