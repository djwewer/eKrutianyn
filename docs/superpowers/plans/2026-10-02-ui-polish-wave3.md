# UI Polish Wave 3

**Goal:** Five independent, user-reported UI fixes/features on top of the already-merged Wave 1/Wave 2 design work: real photos in roster rows (not just initials), a crop-before-upload step for the profile photo, a mobile-usable redesign of the Крок 3 review step in the Книга судді import wizard, a burger menu for the header nav on narrow viewports, and renaming the header's "ПЛАСТ" eyebrow to "єПластун".

This plan is independent of `docs/superpowers/plans/2026-10-02-judge-book-two-way-sync.md` (the other plan written alongside this one) — no task here touches the sync feature's files, so the two can run as separate subagent-driven-development passes in any order. Run this one first (smaller, lower-risk, faster feedback), then the sync plan.

## Context

- Binding mockup reference remains `docs/superpowers/specs/assets/2026-10-02-notion-style-ui-overhaul-kurin-mockup.html` for anything touching `/kurin` visuals, per the Global Constraints of the Wave 1/Wave 2 plans — not directly relevant here since none of these 5 tasks touch `/kurin`'s own accordion sections, but the same token/spacing/radius variables (`--radius-*`, `--accent*`, etc. in `apps/web/app/globals.css`) remain binding for anything new this plan adds.
- The user explicitly reported these via screenshots of the live app: (1) roster rows show initials-only circles even for users who have uploaded a profile photo; (2) no crop control when uploading a profile photo, so a non-square photo gets distorted/cropped arbitrarily by `object-cover`; (3) the Крок 3 review step of `/suddivstvo/junak-import` is unusable on a phone-width screen (overlapping columns, truncated candidate names); (4) the header's top nav just wraps onto multiple lines on narrow viewports instead of collapsing — wants a hamburger menu; (5) rename "ПЛАСТ" to "єПластун" (organization/brand name change, not a typo fix — do not second-guess this).

## Global Constraints

- **No backend changes in this plan.** All 5 tasks are `apps/web`-only. If an implementer finds they need an API change to do one of these, stop and escalate — do not improvise a new endpoint.
- **New dependency, scoped to one task:** Task 2 (photo crop) needs a cropping library. Use `react-easy-crop` (actively maintained, ~15kB, canvas-based, no CSS framework assumptions, MIT license) — confirm it isn't already a dependency before adding (`grep react-easy-crop apps/web/package.json`). No other task in this plan may add a dependency.
- **Mobile breakpoint convention already in this codebase:** `sm:` (640px) is the breakpoint Wave 2 already used for the Дilovodstvo dropdown fix in `apps/web/components/nav.tsx` (`absolute left-0 ... sm:left-auto sm:right-0`). Use the same breakpoint for the burger-menu task (full nav below `sm:`, current inline-pills layout at `sm:` and up) and for the import-wizard mobile redesign, unless the actual content clearly needs a different breakpoint (e.g. a wider `md:` for the review table) — if so, say why in the task's self-review, don't silently pick a different one without justification.
- **`Avatar` component (`apps/web/components/ui/avatar.tsx`) already supports `photoUrl?: string | null`** with initials fallback on load failure (Wave 2) — reuse it as-is, do not fork or duplicate its fallback logic.
- **Photo URL construction convention**, already used in `nav.tsx` and `app/settings/page.tsx` — copy exactly, do not invent a different query-param scheme:
  ```ts
  photoUrl={u.photoUpdatedAt ? `/api/backend/users/${u.id}/photo?v=${u.photoUpdatedAt}` : null}
  ```
  `UserSummary` (in `apps/web/lib/types.ts`) already has `photoUpdatedAt: string | null` (added Wave 2) — no type change needed for Task 1.
- **Existing e2e coverage that must keep passing, not just "not regress silently"** — run these explicitly as part of each task's own verification, not only in the final regression:
  - Task 1 touches `kurin-roster-section.tsx` and `row-list.tsx` → re-run `kurin-roster-zvyazkovyi.spec.ts`, `users-role-filter.spec.ts`, `kurin-accordion-full-tier.spec.ts`.
  - Task 2 touches `app/settings/page.tsx` → re-run `settings.spec.ts`.
  - Task 3 touches `app/suddivstvo/junak-import/page.tsx` → re-run `junak-import-auto-map.spec.ts`, `junak-import-step3-email.spec.ts`.
  - Task 4 touches `components/nav.tsx` → re-run `theme-toggle.spec.ts`, `kurinniy-junak.spec.ts`, `kurin-accordion-full-tier.spec.ts` (all exercise nav links), plus every spec that clicks "Діловодство" (`inventory.spec.ts`, `inventory-drive-disconnect.spec.ts`, `suddivstvo.spec.ts`) since the dropdown's trigger moves inside the burger menu on mobile — but these specs run at desktop viewport by default (Playwright's default project), so they should be unaffected by a `sm:`-gated change; confirm this assumption holds by actually running them, don't just assert it.
  - Task 5 is a one-line text change with no behavioral surface — no targeted re-run needed beyond the final full suite.
- **Do not touch** `apps/web/playwright.config.ts` — the `launchOptions.executablePath` line some implementers see uncommitted in the working tree is a sandbox-only tweak for this environment's browser path; it must never be committed, and it is pre-existing, not something this plan's diff.

---

## Task 1: Roster rows show the real profile photo, not just initials

**Files:** `apps/web/components/ui/row-list.tsx`, `apps/web/components/kurin-roster-section.tsx`

**Problem:** `Row` (`row-list.tsx`) hardcodes `<Avatar initials={initials} aria-hidden="true" />` — it never accepts or forwards a `photoUrl`, so every row (Кадра виховників, Список юнацтва) shows initials even for a user with an uploaded photo. `kurin-roster-section.tsx` is the only consumer of `Row`/`RowList` in the codebase (confirmed by grep — if you find another consumer while implementing, treat that as a second place needing the same fix, don't skip it).

**What to change:**

1. In `row-list.tsx`, add an optional `photoUrl?: string | null` prop to `Row`'s props type, and pass it through: `<Avatar initials={initials} photoUrl={photoUrl} aria-hidden="true" />`.
2. In `kurin-roster-section.tsx`, every place a `<Row>` is rendered (the main `users` list map, and the merged `zvyazkovyiUsers` list for the VYKHOVNYK roster), pass:
   ```tsx
   photoUrl={u.photoUpdatedAt ? `/api/backend/users/${u.id}/photo?v=${u.photoUpdatedAt}` : null}
   ```
   `u` here is a `UserSummary` — confirm it has `id` and `photoUpdatedAt` in scope (it does, per Global Constraints above). If the zvyazkovyi-merge branch uses a different variable name for the mapped item, use that instead of `u` — read the current file before editing, don't guess the variable name.

**Verification:** `npx tsc --noEmit` clean; re-run the 3 e2e specs named in Global Constraints for this task; additionally, write one new focused e2e test (or extend `kurin-roster-zvyazkovyi.spec.ts`) that seeds a user with a real uploaded photo (use the existing `PATCH /users/me/photo` flow or seed `photoUpdatedAt` directly via the admin seed helper if that's faster — check `apps/web/e2e/helpers/seed.ts` for precedent) and asserts an `<img>` (not bare initials text) is visible in that user's roster row. Don't rely on "the fallback renders initials so I can't tell the difference from a screenshot" reasoning — actually assert an `<img src=".../photo?v=...">` is present.

---

## Task 2: Crop-to-square control when uploading a profile photo

**Files:** `apps/web/app/settings/page.tsx`, new: `apps/web/components/photo-crop-dialog.tsx` (or similar — implementer's naming call, but keep it a dedicated component, don't inline 100+ lines of canvas logic into the settings page)

**Problem:** `Settings → Фото профілю` currently calls `updatePhoto.mutate(file)` directly on file selection (`onChange={(e) => { const file = e.target.files?.[0]; if (file) updatePhoto.mutate(file); ... }}`). A non-square photo gets uploaded as-is and displayed via the `Avatar` component's `object-cover`, which crops arbitrarily (centered) — the user wants to control WHICH square region gets used, with pinch/scroll-to-zoom.

**What to change:**

1. Add `react-easy-crop` as a dependency (`npm install react-easy-crop --workspace apps/web` or the monorepo's equivalent — check how other deps were added in this repo's `package.json`/`apps/web/package.json` split before running a bare `npm install` at the wrong level).
2. Build a `PhotoCropDialog` component: takes the selected `File` (read as an object URL), renders `react-easy-crop`'s `<Cropper>` with `aspect={1}` (square) inside a `Dialog` (reuse `apps/web/components/ui/dialog.tsx`, same primitive `hurtok-settings-dialog.tsx` already uses — don't build a second modal primitive), a zoom slider (`<input type="range">`, no new dependency needed for that), and "Зберегти"/"Скасувати" buttons.
3. On save: use `react-easy-crop`'s `onCropComplete` callback (gives you pixel crop coordinates) to draw the cropped region onto an off-screen `<canvas>` at a fixed reasonable output size (e.g. 512×512 — big enough for the header avatar and any future larger display, small enough to not bloat the 5MB upload limit) and `canvas.toBlob(...)` to produce a `File`/`Blob` to hand to the existing `updatePhoto.mutate(...)` mutation unchanged — the backend's magic-byte sniffing (`apps/api/src/common/image-sniff.util.ts`) already validates PNG/JPEG/WEBP/GIF regardless of how the bytes were produced client-side, so canvas output (PNG by default) needs no backend change.
4. Wire into `app/settings/page.tsx`: the hidden `<input type="file">`'s `onChange` now opens `PhotoCropDialog` with the selected file instead of calling `updatePhoto.mutate` directly; the dialog's own save button is what actually triggers the upload.
5. Handle the dialog's own `updatePhoto.isPending`/`isError` states (reuse the existing `apiErrorMessage` helper already in this file) so upload failures surface inside the crop dialog, not silently.

**Verification:** `npx tsc --noEmit` clean; re-run `settings.spec.ts`; write a new e2e test exercising the actual crop flow: select a file, confirm the crop dialog opens (`react-easy-crop` renders a `<div>` with a recognizable test id or role — check its rendered DOM once running the dev server rather than guessing a selector), click save, assert the avatar updates. If `react-easy-crop`'s internals make reliable Playwright interaction impractical (touch/drag-based zoom), it is acceptable for the e2e test to click "Зберегти" without actually dragging — the goal is proving the dialog-open → upload → avatar-updates plumbing works, not pixel-perfect crop math, which has no server-side behavior to assert on anyway.

---

## Task 3: Mobile-usable Крок 3 review step in the Книга судді import wizard

**File:** `apps/web/app/suddivstvo/junak-import/page.tsx`

**Problem:** The user's screenshot shows Крок 3 (`dataRows` review/match table) rendered at phone width: a row of small overlapping elements (avatar-ish circle, truncated single-letter fragments, a long "Оновити <Ім'я> (нар. <date>)" button) all crammed onto one line with content clipped on both edges. Read the current JSX for this step in full before touching it — it's a dense functional component (candidate matching, per-row action selection) and the fix must stay a pure layout change, not touch the matching logic.

**What to change:** Make the per-row layout responsive: below `sm:`, stack the row's elements vertically (or into two lines: identity info on one line, the match/action control on the next) instead of forcing everything into one horizontal flex row that overflows. Likely a `flex-col sm:flex-row` swap on the row container plus `w-full sm:w-auto` on the action control, but read the actual current className structure first — don't assume the exact classes without looking, since this file wasn't touched in recent waves and may have evolved. Preserve every existing data-testid/text the current e2e specs rely on (check `junak-import-auto-map.spec.ts` and `junak-import-step3-email.spec.ts` for exact locators before changing any wrapping element structure that might break them).

**Verification:** `npx tsc --noEmit` clean; re-run `junak-import-auto-map.spec.ts` and `junak-import-step3-email.spec.ts` at the default (desktop) viewport — they must still pass unchanged; additionally take a screenshot at a phone viewport (Playwright's `page.setViewportSize({width: 375, height: 812})`) of Крок 3 with at least 2-3 seeded rows and visually confirm (by actually looking at the screenshot image, not just "the test passed") that nothing overlaps or clips — this is explicitly a visual bug, so a passing assertion-only test is not sufficient proof of the fix; include the screenshot step in your self-review notes.

---

## Task 4: Burger menu for the header nav below `sm:`

**File:** `apps/web/components/nav.tsx`

**Problem:** The nav's link row (`LINKS_BY_ROLE` links + optional Облік реманенту/Суддівство + the Діловодство dropdown for ZVYAZKOVYI) currently uses `flex flex-wrap items-center gap-1`, which just wraps onto additional lines on a narrow viewport rather than collapsing — the user wants a conventional hamburger icon that reveals the links in a dropdown/drawer on tap, like the rest of the header already collapses (the org-mark + breadcrumb area already uses `min-w-0`/`truncate` from Wave 2).

**What to change:**
- Below `sm:`: hide the inline links row entirely, show a hamburger icon button (a simple 3-line SVG, same inline-SVG convention the accordion icons and chevron already use in this codebase — no icon library) that toggles an open/closed boolean state, revealing the full link list (including the Діловодство sub-items, flattened — don't nest a `<details>` inside a mobile drawer, just list `DILOVODY_PAGES` items alongside the regular links when the ZVYAZKOVYI role has them) in a dropdown/drawer below the header.
- At `sm:` and up: current behavior unchanged exactly (inline pills row, Діловодство as its own `<details>` dropdown) — this is an additive, viewport-gated change, not a rewrite of the desktop nav.
- Preserve every existing `active`-link highlighting, role-based link filtering (`LINKS_BY_ROLE`, `INTENDANT`/`SUDDIA`/`isKurinniy` extra links), and the avatar/theme-toggle/logout cluster exactly as they render today — this task only changes how the LINKS collapse on mobile, nothing else in the header.
- Close the mobile menu on navigation (clicking a link inside it) — check for an existing pattern of "close on navigate" elsewhere in the app before inventing one; if none exists, a simple `onClick` that also calls `setMobileMenuOpen(false)` alongside the `<Link>`'s default navigation is sufficient, no router-event-listener needed.

**Verification:** `npx tsc --noEmit` clean; re-run every spec named for Task 4 in Global Constraints at the default desktop viewport to confirm zero regression; additionally write one new e2e test at a phone viewport (375px) that logs in, confirms the inline links are NOT visible, taps the hamburger, confirms the links ARE now visible including at least one role-gated link, clicks one, and confirms navigation happened and the menu closed.

---

## Task 5: Rename "ПЛАСТ" to "єПластун" in the header

**File:** `apps/web/components/nav.tsx`

**What to change:** The header currently renders `<span className="text-xs font-semibold tracking-wide text-accent uppercase">Пласт</span>` as the eyebrow above the kurin breadcrumb (confirmed by reading the file — the literal rendered text is "Пласт", displayed uppercase via CSS, not "ПЛАСТ" in source). Change the literal string to `єПластун`. Do **not** apply `uppercase` styling to it if that would render it as "ЄПЛАСТУН" — a mixed-case brand name like "єПластун" should NOT be forced uppercase (that would destroy the intentional lowercase-є/uppercase-П styling the name implies). Remove the `uppercase` class for this element specifically, or confirm with a rendered screenshot that the text appears exactly as "єПластун", not "ЄПЛАСТУН". This is a one-line content/styling change — do not touch anything else in this file as part of this task (Task 4 above also touches this file; if both tasks are mid-flight, make sure the two diffs don't conflict — this task should be small enough to land first or last with no real overlap risk, but double check at review time).

**Verification:** `npx tsc --noEmit` clean; visually confirm via a screenshot (not just reading the JSX) that the header shows "єПластун" with the exact casing intended, not forced to uppercase by a lingering CSS class.

---

## Final Integration Task: full regression + review

After all 5 tasks are individually implemented and task-reviewed:

1. Run the complete verification cell for `apps/web`: `npx tsc --noEmit`, `npm run lint` (eslint), the full Playwright suite (`npx playwright test`).
2. Dispatch the final whole-branch review (most capable available model) against the diff since this plan's base commit, using `../requesting-code-review/code-reviewer.md`'s template, with this plan's Global Constraints as the review's constraints block.
3. Fix any Critical/Important findings, re-review, then follow `superpowers:finishing-a-development-branch` for the merge decision — this plan's own completion does not by itself mean "deploy to prod"; that remains the user's call same as every prior wave, unless the user has already said otherwise by the time this plan finishes.
