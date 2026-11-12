# «Польовий» Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the real web app (`apps/web`) to the approved «Польовий» design prototype without losing any existing feature, and verify every page visually against the prototype with screenshots.

**Architecture:** The design is ported as (1) a token layer in `apps/web/app/globals.css` that remaps the existing shadcn semantic variables to the Польовий palette plus new Польовий tokens, (2) restyled primitives in `apps/web/components/ui/*`, (3) a new app shell (light-blue header band with desktop tabs, phone bottom bar), and (4) page-by-page restyles. A Playwright "visual" config seeds a demo kurin and takes paired screenshots: the real page and the matching prototype page. This is a visual port only: no API or Prisma changes. Features the prototype shows but the API lacks go to `docs/backlog.md`.

**Tech Stack:** Next.js 16.3 (App Router, client pages), React 19.2, Tailwind CSS v4 (`@theme inline`, no tailwind.config), shadcn «base-nova» on `@base-ui/react`, TanStack Query 5, Tiptap 3, Playwright 1.62 (e2e against real NestJS API + Postgres).

## Global Constraints

- **Source of truth for looks.** Use the prototype at `docs/design/polovyi-prototype/`:
  - `polovyi-app.html` holds the CSS.
  - `app.js` holds the page markup (render functions `P.<route>`).
  - `shared.js` and `shared.css` hold the carousel, lightbox and reactions.
  - Open `docs/design/polovyi-prototype/polovyi-app.built.html` in the visual harness to see it rendered.
  - Match the prototype's layout, typography, spacing, colours and component shapes.
  - Do NOT copy the prototype's demo-only things:
    - the role picker on login
    - the text-size control
    - fake data
    - the "Ще" label: the real app's labels win, see e2e contracts below
- **Visual port only.**
  - No changes under `apps/api/`.
  - No Prisma migrations.
  - No new API endpoints.
  - Every feature that exists today must still exist and work after the restyle: buttons, dialogs, forms, filters, delete/edit actions, admin pages.
- **Palette.** The palette is defined as Польовий tokens. Light and dark values are copied verbatim from the prototype.

  | token | light | dark |
  |---|---|---|
  | `--bg` | `#EBEFF5` | `#0C121C` |
  | `--paper` | `#F8FAFD` | `#141C29` |
  | `--ink` | `#16202E` | `#E2E8F2` |
  | `--ink-2` | `#536076` | `#9BA8BC` |
  | `--line` | `#C8D2E0` | `#26324A` |
  | `--navy` | `#1B3358` | `#8DBBF2` |
  | `--navy-ink` | `#F1F5FB` | `#0A1424` |
  | `--sky` | `#4A8FE0` | `#6FA9EE` |
  | `--sky-soft` | `#DCE9FA` | `#172A45` |
  | `--sky-ink` | `#174A8B` | `#B9D6FA` |
  | `--signal` | `#D9520B` | `#FF8A42` |
  | `--signal-soft` | `#FBE3D3` | `#3B2213` |
  | `--signal-ink` | `#7A2B00` | `#FFC9A3` |
  | `--ok` | `#2F7A3E` | `#86D49A` |
  | `--ok-soft` | `#DCEFE0` | `#15301E` |
  | `--late` | `#B3261E` | `#FF8A80` |
  | `--late-soft` | `#F8DAD7` | `#3A1715` |
  | `--field` | `#FFFFFF` | `#1A2334` |
  | `--band` | `#CFE2F6` | `#1B3253` |
  | `--band-ink` | `#13284A` | `#E6EEF9` |
  | `--band-line` | `#1B3358` | `#9CC4F4` |

- **Fonts.** Load all three through `next/font/google` in `apps/web/app/layout.tsx` with subsets `['latin', 'cyrillic']`. Do not use a CDN `<link>`.
  - Oswald, weights 500/600/700: display font. Used for headings, buttons and tabs, uppercase with letter-spacing.
  - PT Sans, weights 400/700 plus italic 400: body font.
  - PT Mono, weight 400: labels, dates, codes.
- **Shapes.**
  - Cards have radius 6px, a 1px `--line` border and a `--paper` background.
  - Buttons and inputs have radius 4px and a 2px border.
  - Buttons are at least 2.6rem tall. Inputs are at least 2.75rem tall.
  - The main content column is at most 52rem wide and centred. Wide pages (users/[id], suddivstvo/junak-import, admin) may use up to 72rem.
- **Header band.** It has a light-blue `--band` background and `--band-ink` text. It has NO topographic contour lines. Only the login/auth screens keep the contour SVG, at opacity `.14`.
- **Dark mode mechanism stays as is.** The app uses the `.dark` class on `<html>`, a `theme` cookie, and server-side reading in `layout.tsx`. Do not switch to the prototype's `data-theme`. Task 12 adds a "system" option.
- **AI-виховник keeps its animated gradient.** This is the purple→blue→cyan gradient `#7c3aed, #2f5fd9, #06b6d4`, used through the existing `.ai-gradient-ring` and `.ai-gradient-glow` classes plus gradient text. Nothing else uses that gradient. In particular the login card loses it.
- **Photo navigation.**
  - Translucent round arrows sit on the photo, left and right: `rgba(12,24,44,.38)`, and `.62` on hover.
  - Arrows are hidden when `(hover: none)` or `max-width: 760px`; phones swipe.
  - Dots always sit UNDER the photo. There is no counter and no captions.
  - The same rules apply in the full-screen lightbox.
- **Провід куреня** uses initials avatars. Never use chevron or «пагони» icons.
- **No text-size control anywhere.**
- **Ukrainian copy.** No russianisms or Russian spellings: write «беклог», not «бэклог». Keep existing UI copy unless a task says otherwise.
- **E2E contracts that must keep passing.** Change a spec only where a task explicitly says so, and keep the change minimal:
  - Login helper:
    - `getByLabel('Email')` and `getByLabel('Пароль')`
    - button `Увійти`
  - Shell:
    - `getByRole('navigation', { name: 'Основна навігація' })` exists at both 1280×800 and 375×812.
    - Link names `Новини`, `Календар`, `Моє пластування` / `Моя проба`, `Мій гурток`, `Курінь`, `Налаштування`.
    - A junak sees exactly 5 links in that nav.
    - ZVYAZKOVYI sees a button `Діловодство` with `aria-expanded` and `aria-haspopup`, which opens `getByRole('dialog', { name: 'Діловодство' })` with links `Облік реманенту`, `Суддівство`, `Писарство`, `Скарбниця`.
    - Link `Моя сторінка` → `/me`.
    - No button `Меню` on phone.
  - Theme:
    - switch `Перемкнути темну тему`
    - `html` class `dark`
    - cookie `theme`
  - Every heading, placeholder, label, visible text and `data-testid` listed in `docs/superpowers/plans/2026-11-12-polovyi-frontend-redesign-e2e-contracts.md`.
- **Machine is resource-constrained.**
  - Never run the whole e2e suite except in Task 14.
  - Run targeted specs only, always with `--workers=1` and prefixed with `nice`.
  - Never run `next build`. Type-check with `npx tsc --noEmit` and lint with `npx eslint <files>`.
  - Never run two Playwright runs at once.
- **Repo hygiene.**
  - Never edit any `.env` file.
  - Never `git add` these: `logo.png`, `ПРОБИ  старі/`, `Проби НОВІ/`, `docs/audits/`.
  - Commit per task on branch `feat/polovyi-redesign`. Do not push.
- **Next 16.** Before using any Next API you are unsure of, read the guide in `node_modules/next/dist/docs/` at the repo root. Leave `middleware.ts` as is.

## How to verify a page (used by every task)

1. **Type-check and lint.**

   ```
   cd apps/web && npx tsc --noEmit && npx eslint <changed files>
   ```

   Expected: no errors.
2. **Functional check.** Run the e2e specs named in the task.

   ```
   cd apps/web && nice npx playwright test e2e/<spec>.spec.ts --workers=1
   ```

   Expected: all pass. The config starts the API on :3001 and Next on :3000 itself. Make sure nothing else is listening on those ports first: `lsof -i :3000 -i :3001`.
3. **Visual check.** Run the visual harness for the task's pages.

   ```
   cd apps/web && nice npx playwright test -c playwright.visual.config.ts --grep "<page-key>"
   ```

   Then open the PNG pairs in `apps/web/test-results/visual/<page-key>/` with the Read tool:
   - `app-<role>-<viewport>-<theme>.png`
   - `proto-<role>-<viewport>-<theme>.png`

   Compare them side by side. List every visible difference in the report and fix it, unless the difference comes from real data or a real feature the prototype lacks. Put the final PNG paths in the task report.
4. **Click-through.** The harness's `interactions` entries for the page click the listed controls (open accordion, open dialog, switch tab, open lightbox, …) and screenshot the result. Confirm each one rendered the expected state.

---

### Task 1: Visual QA harness, prototype reference, test DB ready

**Files:**
- Add to git: `docs/design/polovyi-prototype/` (all files already on disk: `app.js`, `shared.js`, `shared.css`, `polovyi-app.html`, `polovyi.html`, `proby-mini.json`, `build.py`, `polovyi-app.built.html`)
- Create: `apps/web/playwright.visual.config.ts`
- Create: `apps/web/visual/seed-demo.ts`
- Create: `apps/web/visual/pages.ts`
- Create: `apps/web/visual/screens.spec.ts`
- Create: `apps/web/visual/fixtures/photo-1.svg`, `photo-2.svg`, `photo-3.svg`
- Create: `docs/superpowers/plans/2026-11-12-polovyi-frontend-redesign-e2e-contracts.md`
- Modify: `apps/web/package.json` (add script `"visual": "playwright test -c playwright.visual.config.ts"`)

**Interfaces:**
- Produces:
  - Command `npx playwright test -c playwright.visual.config.ts --grep "<page-key>"`.
  - Screenshots at `apps/web/test-results/visual/<page-key>/{app|proto}-<ROLE>-<desktop|phone>-<light|dark>.png`.
  - Interaction shots at `.../<page-key>/app-<ROLE>-<viewport>-light-<interaction-name>.png`.
  - `pages.ts` exports `VISUAL_PAGES: VisualPage[]` with:

    ```ts
    type VisualPage = {
      key: string;
      appPath: string | ((ids: DemoIds) => string);
      protoHash: string;
      roles: Role[];
      wide?: boolean;
      interactions?: { name: string; run: (page: Page) => Promise<void> }[];
    };
    ```

    `Role` is `'JUNAK' | 'VYKHOVNYK' | 'ZVYAZKOVYI'`.
  - `seed-demo.ts` exports `seedDemo(): Promise<DemoIds>`, which returns the logins and ids that pages need:

    ```ts
    type DemoIds = {
      users: Record<Role, { email: string; password: string; id: string }>;
      kurinId: string;
      kurinNumber: number;
      hurtokSlug: string;
      junakId: string;
    };
    ```

- [ ] **Step 1: Migrate the e2e database.**

  ```
  cd apps/api && DATABASE_URL=postgresql://plast:plast@localhost:5432/plast_test npx prisma migrate deploy
  ```

  Expected: "All migrations have been successfully applied", or a list of applied migrations, including `20261030120000_fk_indexes` and `20261030130000_ai_usage_events`.
- [ ] **Step 2: Write the e2e contracts file.**
  1. Grep `apps/web/e2e/**/*.spec.ts` and `apps/web/e2e/helpers/*.ts` for every `getByRole(... { name })`, `getByLabel`, `getByPlaceholder`, `getByText`, `getByTestId`, `locator(` and `toHaveClass`.
  2. Write them to `docs/superpowers/plans/2026-11-12-polovyi-frontend-redesign-e2e-contracts.md`, grouped by app route, as a table with columns: route | selector | spec file:line.
  3. Under a heading "Structural", list the selectors that depend on DOM nesting (`locator('..')`, `locator('summary')`, `[data-slot=...]`, `.ProseMirror`, `select`, `#role`), so restylers know not to wrap or replace those elements.
- [ ] **Step 3: Write `visual/seed-demo.ts`.**

  Reuse the e2e seed helpers: `e2e/helpers/seed.ts` (`seedKurinWithZvyazkovyi`, `seedDegreeProbyProgram`) and `e2e/helpers/proby-seed.ts` (`createHurtok`, `createOnboardedUserAs`, `assignVykhovnyk`, `loginForToken`, `confirmPointAs`). Read them first. Seed one fresh kurin per run, with demo content that mirrors the prototype's data in `docs/design/polovyi-prototype/shared.js`:
  - **Kurin and people.**
    - The kurin is named «Чорногора», with the kurin number the helper allows. Use stanytsia «Львів» if the DTO has it.
    - Users:
      - a ZVYAZKOVYI
      - a VYKHOVNYK assigned as vykhovnyk of hurtok «Беркути»
      - a JUNAK in «Беркути» who holds the INTENDANT position, so that /inventory is visible to them
      - 3 more junaks spread over 2 hurtky («Беркути», «Рисі»)
    - Every user is onboarded (`mustChangePassword` false) and has a known password.
  - **Announcements.** Create 3 via the API as ZVYAZKOVYI (`POST /kurins/:id/announcements` with Tiptap JSON content).
    1. Text with a bullet list and a blockquote of three paragraphs, each starting with a bold label: «Коли:», «Де:», «Форма:».
    2. Text plus 3 inline images. Upload each with `POST /kurins/:id/announcements/images`, multipart field `image`, using a small PNG generated in the script (a solid-colour 640×400 PNG buffer is fine). Then reference each with an `image` node `{ type: 'image', attrs: { src: '/api/backend/kurins/<kurinId>/announcements/images/<imageId>' } }`. Match the src format the editor uses: check `components/announcement-editor.tsx`.
    3. Short text.

    Add a couple of reactions.
  - **Calendar.** Create 8 events via `POST /kurins/:id/calendar-events`:
    - 3 in the next 2 months, one of them multi-day
    - 1 in 5 months
    - 2 in the previous calendar year
    - 2 earlier this year, before today
  - **Inventory.** Create 3 items via the API (no Drive needed for items). For photos, insert `InventoryItemPhoto` rows directly with `psql`:
    - `postgresql://plast:plast@localhost:5432/plast_test`
    - `driveFileId` values `demo-1`, `demo-2`, `demo-3`
    - `url` `https://drive.google.com/thumbnail?id=demo-N&sz=w1000`
    - one item with 3 photos, one with 1, one with none

    Check the column names in `apps/api/prisma/schema.prisma` (`InventoryItemPhoto`).
  - **Treasury.** A starting balance and 3 transactions.
  - **Proby.** Seed a proby program (`seedDegreeProbyProgram` or `seedProbyProgram` with ~6 points) and confirm 2 points for the junak.
- [ ] **Step 4: Write `visual/fixtures/photo-{1,2,3}.svg`.** These are three simple 1000×750 landscape scenes in different colours. Copy the style of `scene()` in `docs/design/polovyi-prototype/shared.js`.
- [ ] **Step 5: Write `visual/pages.ts`.**
  1. Add one entry per page key and prototype hash:
     - login→`login`
     - forgot-password→`forgot`
     - news→`news`
     - news-new→`news-new`
     - calendar→`calendar`
     - plastuvannia→`plast`
     - proby→`proby`
     - ai-vykhovnyk→`ai`
     - my-activity→`activity`
     - skills→`skills`
     - my-hurtok→`my-hurtok`
     - kurin→`kurin`
     - users-detail→`user-u1`
     - users-new→`user-new`
     - inventory→`inventory`
     - suddivstvo→`suddivstvo`
     - junak-import→`import`
     - pysarstvo→`pysarstvo`
     - treasury→`treasury`
     - settings→`prefs`
     - approval-requests→`approvals`
     - audit-log→`audit`
     - me→`me`
  2. Use the real app paths from `apps/web/app/*`.
  3. Pick roles per page from what the real app allows. For example, `my-activity` and `proby` are for JUNAK, `my-hurtok` for VYKHOVNYK, and `approvals`, `audit` and `junak-import` for ZVYAZKOVYI.
  4. Add these interactions:
     - kurin: open «Гуртки» and one hurtok
     - inventory: click the next-photo arrow; click a photo to open the lightbox
     - news: click a photo to open the lightbox
     - calendar: click the previous-year control, once Task 7 adds it; until then, leave the interaction list empty with a comment naming Task 7
     - shell (on `news`, phone viewport, ZVYAZKOVYI): open the «Діловодство» sheet
- [ ] **Step 6: Write `playwright.visual.config.ts`.**
  - Copy `webServer`, the env and `baseURL` from `playwright.config.ts`.
  - Set `testDir: './visual'`, `workers: 1`, `fullyParallel: false`, `timeout: 180_000` and `outputDir: 'test-results/visual-run'`.
- [ ] **Step 7: Write `visual/screens.spec.ts`.**
  1. Call `seedDemo()` once in `test.beforeAll`.
  2. For each page, role and viewport (`desktop` 1280×800, `phone` 390×844), and each theme (`light` for both viewports, `dark` for desktop only):
     - **App side.**
       1. Create a new context with that viewport.
       2. Add the cookie `theme=<theme>` for `localhost`.
       3. Add a route `https://drive.google.com/thumbnail**` that fulfils with the matching fixture SVG (`id=demo-N` → `photo-N.svg`, `contentType: 'image/svg+xml'`).
       4. Log in with `loginAs` from `e2e/helpers/auth.ts` (skip this for login/forgot).
       5. Go to the path, wait for `networkidle` plus `document.fonts.ready`, and take a `fullPage` screenshot.
       6. Run the interactions for light theme only, with one screenshot each.
     - **Prototype side.**
       1. Create a new context with the same viewport and `colorScheme: theme`.
       2. Add an `addInitScript` that does `sessionStorage.setItem('plast-role', ROLE)`, except for login/forgot.
       3. Go to `file://<repo>/docs/design/polovyi-prototype/polovyi-app.built.html#<protoHash>`, wait for fonts, and take a full-page screenshot.
  3. Name the test titles `<page-key> <role> <viewport> <theme>` so that `--grep "<page-key>"` works.
- [ ] **Step 8: Run the harness on two pages.**

  ```
  cd apps/web && nice npx playwright test -c playwright.visual.config.ts --grep "news|inventory"
  ```

  Expected: PNGs in `test-results/visual/news/` and `test-results/visual/inventory/`. Open two of them with Read. The app shows the seeded demo data and the inventory photos render the fixture SVGs. The proto shots show the prototype.
- [ ] **Step 9: Type-check, lint, commit.**

  ```
  cd apps/web && npx tsc --noEmit && npx eslint visual playwright.visual.config.ts
  git add docs/design/polovyi-prototype apps/web/visual apps/web/playwright.visual.config.ts apps/web/package.json docs/superpowers/plans/2026-11-12-polovyi-frontend-redesign-e2e-contracts.md
  git commit -m "test(web): visual QA harness with demo seed and prototype pairs"
  ```

  If `tsc` picks up `visual/` and fails on Playwright types, include it the same way `e2e/` is included: check `tsconfig.json`.

### Task 2: Design tokens, fonts and base primitives

**Files:**
- Modify: `apps/web/app/globals.css` (token blocks `:root` and `.dark`, `@theme inline`, base layer, `.announcement-content blockquote`)
- Modify: `apps/web/app/layout.tsx` (fonts)
- Modify: `apps/web/components/ui/button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `accordion.tsx`, `dialog.tsx`, `row-list.tsx`, `avatar.tsx`
- Create: `apps/web/components/ui/page-header.tsx`
- Create: `apps/web/components/ui/section-heading.tsx`

**Interfaces:**
- Produces:
  - Tailwind colour utilities, usable by all later tasks:
    - `bg-paper`
    - `bg-field`
    - `text-ink-2`
    - `border-line`
    - `bg-navy text-navy-ink`
    - `bg-sky`, `bg-sky-soft`, `text-sky-ink`
    - `bg-signal`, `bg-signal-soft`, `text-signal-ink`
    - `bg-ok`, `bg-ok-soft`, `text-ok`
    - `bg-late`, `bg-late-soft`, `text-late`
    - `bg-band`, `text-band-ink`
  - Font utilities: `font-display`, `font-sans` (PT Sans), `font-mono` (PT Mono).
  - `PageHeader({ title, subtitle?, crumb?: { href, label }, actions? })`. It renders an `<h1>` with the given title (Oswald 700, 1.9rem, uppercase; 1.6rem under 760px), the subtitle in `text-ink-2`, a mono crumb link «← LABEL» above the title, and actions aligned right. It matches `.pagehead` and `.crumb` in the prototype.
  - `SectionHeading({ children, as? })`. It matches `.h`: Oswald 600, .82rem, uppercase, letter-spacing .12em, `text-ink-2`, followed by a dashed rule filling the rest of the row.
  - Badge variants (match `.stamp`):
    - `signal` (default)
    - `ok`
    - `late`
    - `mute`
    - the existing `accent`, `warning` and `neutral`, kept as aliases mapped to `mute`, `signal` and `mute`

    Keep the export name `Badge`.
  - Button variants keep their names (`default`, `outline`, `secondary`, `ghost`, `destructive`, `link`) plus a new `signal`. Sizes keep their names.

- [ ] **Step 1: Fonts in `layout.tsx`.**

  ```tsx
  import { Oswald, PT_Sans, PT_Mono } from 'next/font/google';
  const oswald = Oswald({ subsets: ['latin', 'cyrillic'], weight: ['500', '600', '700'], variable: '--font-oswald', display: 'swap' });
  const ptSans = PT_Sans({ subsets: ['latin', 'cyrillic'], weight: ['400', '700'], style: ['normal', 'italic'], variable: '--font-pt-sans', display: 'swap' });
  const ptMono = PT_Mono({ subsets: ['latin', 'cyrillic'], weight: '400', variable: '--font-pt-mono', display: 'swap' });
  ```

  1. Replace the Manrope import and its `className` usage with `${oswald.variable} ${ptSans.variable} ${ptMono.variable}` on `<html>`, keeping the existing `dark` class logic.
  2. If `next/font/google` in this Next version names an export differently, check `node_modules/next/dist/docs` and `node_modules/next/font/google/index.d.ts`.
- [ ] **Step 2: Tokens in `globals.css`.**
  1. Replace the `:root` and `.dark` blocks with the Польовий palette from Global Constraints. Write it both as raw tokens (`--bg`, `--paper`, …) and as the shadcn semantic mapping below. Every other existing variable in those blocks (`sidebar-*`, `chart-*`) maps to the nearest Польовий token.

     ```
     --background: var(--bg);           --foreground: var(--ink);
     --card: var(--paper);              --card-foreground: var(--ink);
     --popover: var(--paper);           --popover-foreground: var(--ink);
     --primary: var(--navy);            --primary-foreground: var(--navy-ink);
     --secondary: var(--sky-soft);      --secondary-foreground: var(--sky-ink);
     --muted: var(--bg);                --muted-foreground: var(--ink-2);
     --accent: var(--sky-soft);         --accent-foreground: var(--sky-ink);
     --accent-text: var(--sky-ink);     --accent-soft: var(--sky-soft);   --accent-soft-solid: var(--sky-soft);
     --warning-soft: var(--signal-soft); --warning-foreground: var(--signal-ink);
     --destructive: var(--late);
     --border: var(--line);             --input: var(--line);             --ring: var(--sky);
     --radius: 6px;
     ```

  2. In `@theme inline`, add `--color-<name>: var(--<name>)` for:
     - `paper`, `field`, `line`, `ink-2`
     - `navy`, `navy-ink`
     - `sky`, `sky-soft`, `sky-ink`
     - `signal`, `signal-soft`, `signal-ink`
     - `ok`, `ok-soft`
     - `late`, `late-soft`
     - `band`, `band-ink`, `band-line`
  3. Set the fonts: `--font-sans: var(--font-pt-sans), system-ui, sans-serif; --font-display: var(--font-oswald), 'Arial Narrow', sans-serif; --font-mono: var(--font-pt-mono), ui-monospace, monospace;`.
  4. In the base layer:
     - `body` gets font-size `1.0625rem` and line-height `1.55`.
     - `a` gets colour `var(--navy)`.
     - `:focus-visible` gets a 3px `--sky` outline with 2px offset.
  5. Restyle `.announcement-content blockquote` to the prototype's `.quote`: no italic, left border `4px solid var(--navy)`, background `var(--sky-soft)`, radius `0 6px 6px 0`, padding `.65rem 1rem`, `strong` coloured `var(--sky-ink)`.
  6. Keep `.ai-gradient-ring`, `.ai-gradient-glow` and the keyframes unchanged.
- [ ] **Step 3: Restyle the primitives with Tailwind classes.** Keep every `data-slot`, prop and export.
  - **Button.**
    - `min-h-[2.6rem] rounded-[4px] border-2 font-display font-semibold uppercase tracking-[.07em] text-[.86rem]`
    - `default` = navy fill with navy-ink text
    - `outline`/`secondary` = paper bg, line border, ink text, hover border navy
    - `ghost` = transparent
    - `destructive` = text late, border late-soft
    - `signal` = signal fill with white text
    - size `sm` = `min-h-[2.1rem] text-[.76rem] px-[.7rem]`
    - `icon` sizes stay square
  - **Card.** `rounded-[6px] border border-line bg-paper` with no ring or shadow, padding `1.1rem 1.2rem`. CardTitle is Oswald 600 1.2rem.
  - **Input/Select trigger.** `min-h-[2.75rem] rounded-[4px] border-2 border-line bg-field`, with focus border navy and no ring glow.
  - **Label.** PT Mono .72rem, uppercase, tracking .06em, `text-ink-2`. Check e2e `getByLabel` still resolves; the label text is unchanged.
  - **Accordion.** Match `details.acc`: paper card, summary row with gap .8rem and padding .85rem 1rem, title Oswald 600 1.12rem uppercase, a «+» indicator that rotates 45° when open, and dashed border with `--bg` background when nested.
  - **Dialog.** Paper, radius 8px, offset shadow `8px 8px 0 rgba(0,0,0,.18)`.
  - **RowList/Row.** Paper list with dashed row separators, matching `.list` and `.li`.
  - **Avatar fallback.** Matches `.av`: `--bg` fill, 2px line border, Oswald initials.
- [ ] **Step 4: Write `page-header.tsx` and `section-heading.tsx`** to the interfaces above. Use them in nothing yet; later tasks adopt them.
- [ ] **Step 5: Verify.**
  - Run `tsc` and `eslint` on the changed files.
  - Run e2e `login.spec.ts`, `theme-toggle.spec.ts` and `navigation-shell.spec.ts`; all must pass.
  - Run the visual harness `--grep "news|settings"`. Pages look restyled (fonts, colours, buttons, cards) even though layout comes later. Check that dark mode is readable.
- [ ] **Step 6: Commit** with `feat(web): Польовий tokens, fonts and base primitives`.

### Task 3: App shell (header band, desktop tabs, phone bottom bar)

**Files:**
- Modify: `apps/web/components/app-shell.tsx`, `apps/web/components/sidebar-nav.tsx` (becomes the band header, or replace it with a new `components/band-header.tsx` and delete `sidebar-nav.tsx` if unused), `apps/web/components/bottom-nav.tsx`, `apps/web/components/mobile-header.tsx`
- Keep: `apps/web/lib/nav-model.ts` logic unchanged
- Test: `apps/web/e2e/navigation-shell.spec.ts`. Only the bounding-box spacing assertion may be adapted, and only if the new layout makes it meaningless; document why in the report.

**Interfaces:**
- Consumes: `buildNav(session, pendingCount)` from `lib/nav-model.ts`, `useKurin()`, `useSession()`, `useOwnProfile()`, Task 2 tokens.
- Produces: a page content column `max-w-[52rem] mx-auto px-4 pt-[1.4rem] pb-12` (phone `pb-32` to clear the bottom bar). Pages that need more width render inside a wrapper with `data-wide` that lifts the max width to `72rem`, via a `WideContent` component exported from `app-shell.tsx`.

- [ ] **Step 1: Desktop band header (≥761px).** Match `.band`, `.idrow`, `.patch`, `.me` and `.tabs` in `polovyi-app.html` and `shell()` in `app.js`.
  - The header is sticky with background `--band` and colour `--band-ink`. It has no contour SVG.
  - **ID row.**
    - A round dashed «patch» with the kurin number in Oswald 700 and «КУРІНЬ» in mono under it, or «ПК» when `kurinNumber` is null.
    - The kurin name, Oswald 700 1.3rem uppercase.
    - A mono subtitle `КУРІНЬ Ч. {n} · СТАНИЦЯ {stanytsia}` uppercase, or `ПІДГОТОВЧИЙ КУРІНЬ` when there is no number.
    - On the right, the `.me` chip: initials or photo avatar plus name. It is a link with accessible name `Моя сторінка` to `/me`.
  - **Tabs row.**
    - It is `<nav aria-label="Основна навігація">` and contains the links in this order: left items (Новини, Календар), the center item (Моя проба / Моє пластування / Мій гурток), Курінь, a separator, діловодство, and Налаштування with its badge.
    - The active tab gets `--bg` background, `--ink` text and `box-shadow: inset 0 3px 0 var(--sky)`.
    - Діловодство on desktop:
      - With one page, render it as a direct tab.
      - With several, keep today's behaviour: a button `Діловодство` with `aria-expanded` and `aria-haspopup` that opens a dialog named `Діловодство` with the links. Render it as a dropdown panel anchored under the tab.
    - Use the existing link labels («Облік реманенту» etc.).
- [ ] **Step 2: Phone (≤760px).**
  - Show a compact band header: patch, kurin name and the `.me` chip; no tabs.
  - Match `.bnav` for the bottom bar: paper background, 2px top border, 5-column grid, Oswald .66rem uppercase labels, and a raised center item with navy fill and radius `50% 50% 8px 8px`.
  - Keep today's items and labels: left0, left1, center, Курінь, then either the діловодство button+sheet or the Налаштування link. The sheet is `role="dialog"` named `Діловодство` and matches `.sheet`.
  - Keep `aria-label="Основна навігація"`.
  - Keep the safe-area paddings.
  - Keep the badge dot.
- [ ] **Step 3: Content column.** Wrap `children` in the column from Interfaces and remove the old `p-4 pb-32 sm:p-8`. Keep the `mustChangePassword` redirect and the stable-tree behaviour (shell chrome only when the session is loaded).
- [ ] **Step 4: Verify.**
  - Run e2e `navigation-shell.spec.ts`, `home-redirect.spec.ts` and `session-expiry.spec.ts`.
  - Run the visual harness `--grep "news|kurin|settings"` for all roles. Compare the header and nav to the proto shots at desktop and phone, and open the діловодство sheet interaction.
- [ ] **Step 5: Commit** with `feat(web): Польовий app shell with band header and tabs`.

### Task 4: Login and auth pages

**Files:**
- Modify: `apps/web/app/login/page.tsx`, `apps/web/app/forgot-password/page.tsx`, `apps/web/app/reset-password/page.tsx`, `apps/web/app/confirm-email-change/page.tsx`
- Create: `apps/web/components/auth-layout.tsx`. This is a full-screen `--band` background with the topographic contour SVG at opacity `.14`. Port `topo()` from `app.js`, but render it as a static React SVG computed once at module level. It has a centred card slot and a mono footer.
- Test: `e2e/login.spec.ts`, `e2e/forgot-password.spec.ts`

- [ ] **Step 1: Write `AuthLayout`.**
  - Match `.auth`, `.auth-card`, `.auth-head`, `.patch` and `.auth-foot` in `polovyi-app.html`.
  - Card: paper background, radius 8px, offset shadow `8px 8px 0 rgba(0,0,0,.18)`, width `min(100%, 25rem)`.
  - Head: a round dashed patch «єП», the title «єПластун» in Oswald 700 1.9rem uppercase, and a mono subtitle.
- [ ] **Step 2: Login page.**
  1. Remove `.ai-gradient-ring` and `.ai-gradient-glow` from the login card.
  2. Keep the labels `Email` and `Пароль`, the button `Увійти`, the link «Забули пароль?», and `GoogleSignInButton`.
  3. Add the «або» separator from `.or` between the form and Google.
  4. Do not add the prototype's demo role picker.
- [ ] **Step 3: Forgot, reset and confirm-email pages** use `AuthLayout` with their current forms and copy unchanged.
- [ ] **Step 4: Verify.**
  - Run e2e `login.spec.ts` and `forgot-password.spec.ts`.
  - Run the visual harness `--grep "login|forgot-password"` and compare to `proto-*-login` at phone and desktop, light and dark.
- [ ] **Step 5: Commit** with `feat(web): Польовий login and auth screens`.

### Task 5: Photo carousel + lightbox component, inventory page

**Files:**
- Create: `apps/web/components/photo-carousel.tsx`
- Modify: `apps/web/app/inventory/page.tsx` (replace the inline `PhotoCarousel`, lines ~87-135; restyle cards, form and Drive status)
- Modify: `apps/web/app/globals.css` (carousel and lightbox CSS, if not done with Tailwind)
- Test: `e2e/inventory.spec.ts`, `e2e/inventory-drive-disconnect.spec.ts`

**Interfaces:**
- Produces:

  ```tsx
  export function PhotoCarousel(props: {
    photos: { id: string; src: string; alt?: string }[];
    label: string;            // used for aria-label and alt fallback
    ratio?: string;           // CSS aspect-ratio, default '4/3'
    renderSlideExtra?: (photo: { id: string; src: string }, index: number) => React.ReactNode; // e.g. delete button under the photo
    onIndexChange?: (index: number) => void;
  }): JSX.Element
  ```

- [ ] **Step 1: Port `carousel()`, `czGo`, `czSync` and `openLightbox` from `docs/design/polovyi-prototype/shared.js`, and the matching CSS from `shared.css` plus the overrides in `polovyi-app.html` (block "photo navigation"), to React.**
  - **Track.**
    - Horizontal `overflow-x: auto`, `scroll-snap-type: x mandatory`, `overscroll-behavior-x: contain`, hidden scrollbar.
    - Slides are `<button>` elements with `aria-label="Відкрити фото N з M"`.
    - The track has `tabIndex=0`, `aria-roledescription="карусель"` and `aria-label={label}`.
  - **Arrows.**
    - They are `‹`/`›` buttons inside the stage: absolute, vertically centred, 2.5rem round, `rgba(12,24,44,.38)` with white text, `.62` on hover, `backdrop-filter: blur(2px)`.
    - Labels are «Попереднє фото» and «Наступне фото».
    - Hidden by CSS `@media (hover: none), (max-width: 760px)`.
    - Wrap around at the ends.
  - **Dots.**
    - The dots row sits UNDER the stage. Each dot is .5rem; the active dot is 1.4rem wide and `--sky`.
    - Dots are buttons labelled «Фото N».
    - The active index syncs on scroll.
  - **No counter, no captions.**
  - **Single photo.** No arrows and no dots.
  - **Lightbox.**
    - Opened by clicking a slide.
    - `role="dialog"`, `aria-modal`, `aria-label={label}`, fixed overlay `rgba(10,12,14,.92)`.
    - Same carousel inside, opening at the clicked index and limited to `min(100%, 60rem)`.
    - Close button «Закрити» top right.
    - Esc closes it. Left and right arrow keys step.
    - Body scroll is locked while it is open.
    - Focus returns to the opening slide on close.
  - **Reduced motion.** `prefers-reduced-motion` disables smooth scroll.
- [ ] **Step 2: Inventory page.** Match `P.inventory` in `app.js` and `.tags`, `.tag`, `.code`, `.spec`, `.out` and `.cats` in CSS.
  - Item cards are "tags": paper background, radius 8px, clipped top-right corner (`clip-path: polygon(0 0, calc(100% - 1.6rem) 0, 100% 1.6rem, 100% 100%, 0 100%)`), and the punched-hole circle.
  - Title: Oswald 600 1.3rem uppercase.
  - Use `PhotoCarousel` with `ratio="4/3"`.
  - Keep the per-photo «Видалити це фото» control, rendered through `renderSlideExtra` under the carousel for the current index, plus add-photo, edit, delete, quantity («Кількість: N» text unchanged), the Drive status card («Google Drive не підключено.» unchanged) and the add form placeholders.
  - Do NOT add category, place, condition, code or «Видати». These need API work; Task 14 records them in the backlog.
  - Use `PageHeader` with the current h1 text `Облік реманенту`.
- [ ] **Step 3: Verify.**
  - Run e2e `inventory.spec.ts` and `inventory-drive-disconnect.spec.ts`.
  - Run the visual harness `--grep inventory`.
  - Check: arrows on the photo at desktop; no arrows at phone; dots under the photo; the next-arrow interaction moved to photo 2; the lightbox interaction shows the full-screen view with dots under the photo.
- [ ] **Step 4: Commit** with `feat(web): photo carousel with lightbox; Польовий inventory`.

### Task 6: News feed, announcement card, editor pages

**Files:**
- Modify: `apps/web/app/news/page.tsx`, `apps/web/components/announcement-card.tsx`, `apps/web/app/news/new/page.tsx`, `apps/web/app/news/[id]/edit/page.tsx`, `apps/web/components/announcement-editor.tsx` (chrome only: toolbar and field styles; Tiptap config unchanged)
- Create: `apps/web/lib/announcement-images.ts`
- Test: `e2e/announcements.spec.ts`

**Interfaces:**
- Consumes: `PhotoCarousel` (Task 5).
- Produces: `splitAnnouncementImages(doc: JSONContent): { doc: JSONContent; images: { src: string; alt?: string }[] }` in `lib/announcement-images.ts`. It removes top-level and nested `image` nodes from the Tiptap JSON (recursively through `content`), returns them in document order, and drops paragraphs left empty by the removal.

- [ ] **Step 1: Write `splitAnnouncementImages`** as a pure function.
- [ ] **Step 2: Feed layout.** Match `P.news` in `app.js` and `.tl`, `.entry`, `.date`, `.kick`, `.post`, `.sig` and `.rxs` in CSS.
  - The feed is a vertical timeline. A 4.6rem date column holds the day in Oswald 700 1.8rem and the 3-letter month in mono uppercase (СІЧ ЛЮТ БЕР КВІ ТРА ЧЕР ЛИП СЕР ВЕР ЖОВ ЛИС ГРУ). It sits beside the card, with a 2px `--line` vertical rule behind the date column. On phone the column is 3.2rem.
  - The kick row shows the time `HH:MM` from `createdAt` in mono.
  - The title is an h2/h3 in Oswald 600 1.4rem.
  - The body renders through the existing `generateHTML` path inside `.announcement-content`, but from `splitAnnouncementImages(content).doc`.
  - Images go into `PhotoCarousel` (`ratio="16/10"`) under the text.
  - The signature line is italic `text-ink-2`: «Імʼя Прізвище «псевдо»».
  - Reactions are compact mono chips with 1px line border and radius 4px; the active one is navy fill. Keep the six emojis and the existing reaction behaviour.
  - Edit and delete buttons are `sm`, shown to the same roles as today.
  - Keep the page `h1` as today unless `announcements.spec.ts` does not assert it. If it does not, rename it to «Новини» to match the nav and the prototype. Report which.
  - Use `PageHeader` with subtitle «Журнал куреня: оголошення, збірки, фото з таборів» and the «+ Нове оголошення» button for managers.
- [ ] **Step 3: New and edit pages.**
  - Use `PageHeader` with crumb «← НОВИНИ».
  - Style the editor toolbar like `.editor-tools`: buttons 2.3rem, 1px line border, radius 4px, `--field` background, dashed bottom rule.
  - Keep `.ProseMirror`, the placeholder `Заголовок` and all toolbar functions, including «Цитата».
- [ ] **Step 4: Verify.**
  - Run e2e `announcements.spec.ts`.
  - Run the visual harness `--grep "news"` (news and news-new). Check: the blockquote announcement looks like the prototype's quote block; the 3-image post shows a carousel with dots under it; the lightbox interaction works.
- [ ] **Step 5: Commit** with `feat(web): Польовий news timeline with photo carousel`.

### Task 7: Calendar year timeline

**Files:**
- Modify: `apps/web/app/calendar/page.tsx`
- Create: `apps/web/lib/calendar-timeline.ts`
- Modify: `apps/web/visual/pages.ts` (add the calendar interaction «previous year»)
- Test: `e2e/calendar.spec.ts`

**Interfaces:**
- Produces:

  ```ts
  export type TimelineView = 'next' | number; // number = calendar year
  export function buildTimeline(events: KurinCalendarEvent[], view: TimelineView, today: Date):
    { year: number; month: number /* 0-11 */; events: KurinCalendarEvent[] }[];
  ```

  - `'next'` returns 12 months starting from today's month, with events where `(endDate ?? startDate) >= today`, sorted by `startDate` ascending.
  - A past year returns that year's months, newest first, up to the current month for the current year, with events whose `startDate < today`, sorted descending.
  - Empty months are included with `events: []`.

- [ ] **Step 1: Write `buildTimeline`** as a pure function.
- [ ] **Step 2: Page.** Match `P.calendar` in `app.js` and `.yrs`, `.ytl`, `.mo`, `.evs`, `.ev`, `.none` and `.now` in CSS.
  - Remove the horizontal scrolling «Таймлайн на рік» cards.
  - Add a segmented control of buttons with role radiogroup/radio: «Наступні 12 місяців», `{currentYear}`, `{currentYear-1}`, `{currentYear-2}`.
  - Month sections: the name in Oswald uppercase with the year in mono, a dot on the vertical rule, then event cards. Each card has the day number (navy Oswald 1.5rem), the 2-letter weekday in mono (НД ПН ВТ СР ЧТ ПТ СБ), the title and the description.
  - Multi-day events show «3–7» as the day number and the range in the subtitle.
  - Empty months show «Подій немає» in mono.
  - The current month in `'next'` view starts with an orange «Сьогодні, {d} {місяця}» marker line.
  - Past views use grey day numbers.
  - The bottom button reads «← Попередні події», or «До найближчих подій →» in a past view.
  - Keep the add-event dialog (date range picker, maxLengths) and delete-per-event for the same roles.
  - Keep the heading «Календарний план».
  - On phone, months stack per the prototype's ≤760px rules.
- [ ] **Step 3: Add the visual interaction** `previous-year`, which clicks the `{currentYear-1}` radio.
- [ ] **Step 4: Verify.**
  - Run e2e `calendar.spec.ts`. Adapt a selector only if it targeted the removed horizontal cards; report each change.
  - Run the visual harness `--grep calendar`.
- [ ] **Step 5: Commit** with `feat(web): calendar as a 12-month timeline with past years`.

### Task 8: Plastuvannia hub, proby, AI-виховник

**Files:**
- Modify: `apps/web/app/plastuvannia/page.tsx`, `apps/web/app/proby/page.tsx`, `apps/web/app/ai-vykhovnyk/page.tsx`
- Create: `apps/web/lib/proby-progress.ts`
- Test: `e2e/plastuvannia.spec.ts`, `e2e/proby.spec.ts`, `e2e/proba-stage-lock.spec.ts`, `e2e/ai-vykhovnyk.spec.ts`, `e2e/junak-degrees-and-contacts.spec.ts`

**Interfaces:**
- Produces: `probyProgress(program, progress): { stageId: string; done: number; total: number; categories: { id: string; done: number; total: number }[] }[]` plus `overallPercent(program, progress): number`, which counts points of the current OPEN stage. Use the types from `lib/queries/proby.ts`.

- [ ] **Step 1: Hub.** Match `P.plast` and `.degrees`, `.deg`, `.tiles`, `.tile` and `.bar`.
  - Degrees strip: Прихильник / Учасник / Розвідувач / Скоб, from `useJunakDegrees`. A done degree shows its date, the current one shows %, a future one shows «попереду». Current uses a dashed signal border; done uses sky-soft.
  - The tiles keep today's set, including the disabled «Запит … Скоро».
  - The «Моя проба» tile shows a progress bar.
  - The AI-виховник tile keeps the animated gradient: `.ai-gradient-ring` with `--ai-ring-fill: var(--paper)`, the title as gradient text (`bg-clip-text text-transparent` with the same gradient and `kmGradientShift` animation; dark mode uses lighter stops `#b18cff, #7fa8ff, #5fe0f0`), and the icon in `#7c3aed`.
  - Keep the ZVYAZKOVYI test-mode pill.
- [ ] **Step 2: Proby.** Match `P.proby` and `details.acc`, `.pt` and `.chk`.
  - Stage accordions show «N з M точок», or «Закрито» via the ok badge, or «Замкнено» with the explanation for LOCKED.
  - Category sub-accordions show `n/m` and a 5rem progress bar.
  - Point rows have a navy-filled square check when done.
  - Keep the heading text and every behaviour the specs assert.
- [ ] **Step 3: AI-виховник.** Match `P.ai` and `.chat`, `.convs`, `.msgs`, `.bub` and `.compose`.
  - Conversation list on the left at desktop; stacked on phone.
  - Bubbles: mine are navy fill; AI bubbles keep `.ai-gradient-ring`.
  - The compose textarea keeps `.ai-gradient-ring .ai-gradient-glow`.
  - The page title is gradient text.
  - Keep the point select, usage limits and disclaimer.
- [ ] **Step 4: Verify.**
  - Run the e2e specs listed above.
  - Run the visual harness `--grep "plastuvannia|proby|ai-vykhovnyk"` for JUNAK and ZVYAZKOVYI.
- [ ] **Step 5: Commit** with `feat(web): Польовий plastuvannia hub, proby and AI-виховник`.

### Task 9: My activity and skills

**Files:**
- Modify: `apps/web/app/my-activity/page.tsx`, `apps/web/app/skills/page.tsx`, `apps/web/components/custom-skill-dialog.tsx`, `apps/web/components/skill-requirement-list.tsx`
- Test: `e2e/my-activity.spec.ts`, `e2e/skills-catalog.spec.ts`, `e2e/junak-history-skills.spec.ts`

- [ ] **Step 1: My activity.** Match `P.activity`.
  - The form is a card. Role uses the segmented style, but keep the current control semantics the spec relies on.
  - The list is in `.list`/`.li` style.
  - Use `PageHeader` with crumb «← МОЄ ПЛАСТУВАННЯ» and keep the heading.
- [ ] **Step 2: Skills.** Match `P.skills`.
  - Group accordions.
  - Skill cards keep `data-testid="skill-card"`, with level chips as `mute` badges and «Власна» as the `signal` badge.
  - Keep the real SkillGroup names and the custom-skill dialog.
  - Keep the heading «Вмілості».
- [ ] **Step 3: Verify.**
  - Run the e2e specs listed above.
  - Run the visual harness `--grep "my-activity|skills"`.
- [ ] **Step 4: Commit** with `feat(web): Польовий activity and skills pages`.

### Task 10: Kurin, my-hurtok, hurtok pages

**Files:**
- Modify: `apps/web/app/kurin/page.tsx`, `apps/web/components/kurin-info-section.tsx`, `kurin-provid-section.tsx`, `kurin-hurtky-section.tsx`, `kurin-roster-section.tsx`, `hurtok-detail-panel.tsx`, `hurtok-settings-dialog.tsx`, `apps/web/app/my-hurtok/page.tsx`, `apps/web/app/hurtky/new/page.tsx`, `apps/web/app/[kurinNumber]/hurtky/[slug]/page.tsx`
- Test:
  - `e2e/kurin-accordion-full-tier.spec.ts`, `kurin-accordion-multi-open.spec.ts`, `hurtky-accordion.spec.ts`, `hurtky-accordion-settings.spec.ts`, `kurin-roster-zvyazkovyi.spec.ts`, `kurin-settings.spec.ts`
  - `my-hurtok.spec.ts`, `hurtok-*.spec.ts`
  - `positions.spec.ts`, `kurinniy-junak.spec.ts`

- [ ] **Step 1: Kurin.** Match `P.kurin` and `details.acc`, `.kv`, `.ranks`, `.rank` and `.hnum`.
  - The five sections become Польовий accordions with icon squares. Keep multi-open and the access gating exactly as today.
  - Info section: a `kv` definition grid.
  - Провід: `.rank` tiles, each with an initials or photo avatar, the name and the position in mono uppercase. NO chevron icons.
  - Гуртки: nested dashed accordions. Each shows a number chip coloured by a hue derived from the hurtok number (`hsl(h 40% 88%)` / `hsl(h 45% 25%)`, dark `hsl(h 25% 20%)` / `hsl(h 55% 75%)`, with h = `(number * 47) % 360`), the name, the vykhovnyk, the member count, and the member rows inside.
  - Keep the roster sections and the `lastName firstName` row text order.
- [ ] **Step 2: My-hurtok and the hurtok detail panel.**
  - Use `PageHeader` with the current h1.
  - Members use `.li` rows with avatar, name and positions.
  - Keep «+ Додати юнака» and the settings dialog, restyled through Dialog.
- [ ] **Step 3: Hurtky new page.** Restyle the form card.
- [ ] **Step 4: Verify.**
  - Run the e2e specs listed above, one at a time.
  - Run the visual harness `--grep "kurin|my-hurtok"`, including the kurin accordion interaction.
- [ ] **Step 5: Commit** with `feat(web): Польовий kurin and hurtok pages`.

### Task 11: User page, new user, my page

**Files:**
- Modify: `apps/web/app/users/[id]/page.tsx` (card chrome and layout only; 739 lines, do not change logic), `apps/web/app/users/new/page.tsx`, `apps/web/app/me/page.tsx`, `apps/web/components/junak-degrees-card.tsx`, `apps/web/components/junak-history.tsx`, `apps/web/components/junak-history/*`
- Test:
  - `e2e/users-detail.spec.ts`, `users-hurtok.spec.ts`, `users-new-direct.spec.ts`, `users-new-hurtok-prefill.spec.ts`, `users-role-filter.spec.ts`, `user-archive.spec.ts`
  - `guardian-contacts.spec.ts`, `junak-degrees-and-contacts.spec.ts`, `junak-history.spec.ts`, `junak-proba-detail.spec.ts`
  - `me-page.spec.ts`, `change-hurtok-request.spec.ts`

- [ ] **Step 1: User page.** Match `P['user-<id>']` and `.prof`, `.bigav`, `.kv` and `.guard`.
  - Profile head: a 5rem dashed navy initials or photo avatar, the name in Oswald, mono role and position.
  - Data and contacts become `kv` grids.
  - Guardians become `.guard` tiles. Keep `data-testid="guardian-row"`.
  - Degrees card: keep the testids.
  - History sections become Польовий accordions. Keep the `history-*` testids and native `summary` if the specs use it.
  - Use `WideContent`.
- [ ] **Step 2: New user.** Use `PageHeader`; the form becomes a card with a `grid2` layout. Keep `#role` and the labels.
- [ ] **Step 3: Me.** Match `P.me`.
  - Use a visible profile head, but keep the `sr-only` h1 «Моя сторінка», or make it visible with the same text.
  - Hurtok and positions use `kv`/`.li`.
- [ ] **Step 4: Verify.**
  - Run the e2e specs listed above, one at a time.
  - Run the visual harness `--grep "users-detail|users-new|me"`.
- [ ] **Step 5: Commit** with `feat(web): Польовий user, new-user and my pages`.

### Task 12: Settings (three-way theme), approval requests, audit log

**Files:**
- Modify: `apps/web/app/settings/page.tsx`, `apps/web/components/ui/theme-toggle.tsx`, `apps/web/app/layout.tsx` (theme cookie `system`), `apps/web/app/approval-requests/page.tsx`, `apps/web/app/approval-requests/[id]/page.tsx`, `apps/web/components/bulk-import-request-view.tsx`, `apps/web/app/audit-log/page.tsx`, `apps/web/components/push-notification-toggle.tsx` (style only)
- Modify tests: `e2e/theme-toggle.spec.ts`, `e2e/settings-quick-actions.spec.ts` (only the theme assertions)
- Test: `e2e/settings.spec.ts`, `approval-request-*.spec.ts`, `audit-log.spec.ts`

**Interfaces:**
- Theme:
  - The cookie `theme` takes `light | dark | system`. A missing cookie means `system`.
  - `layout.tsx` sets class `dark` server-side only for `dark`. For `system` or a missing cookie, the existing inline script applies `prefers-color-scheme` and also listens for changes.
  - `ThemeToggle` becomes a radiogroup labelled `Тема` with radios `Як у системі`, `Світла` and `Темна`, styled like the prototype's `.seg`.

- [ ] **Step 1: Theme.**
  1. Implement the three-way control and the cookie values.
  2. Update `theme-toggle.spec.ts` and the theme part of `settings-quick-actions.spec.ts` to use `getByRole('radio', { name: 'Темна' })` and the like, keeping the assertions on the `html.dark` class, cookie persistence across reload and logout/login, and `aria-checked`.
  3. Add one test: choosing `Як у системі` with `colorScheme: 'dark'` emulation gives `html.dark`.
- [ ] **Step 2: Settings page.** Match `P.prefs`.
  - Section cards: «Швидкі дії», «Вигляд» (theme seg plus the push toggle in `.sw` style), «Фото профілю», «Особисті дані», «Пароль», «Email», «Вийти».
  - Keep all copy and testids.
  - There is NO text-size control.
- [ ] **Step 3: Approval requests.** Match `P.approvals`.
  - List cards with a type badge, date, «Було / Стане» kv, and approve/reject buttons where the real page has them.
  - Keep the list → detail flow and the bulk-import diff view (restyle only; keep `data-testid="bulk-import-row"`).
- [ ] **Step 4: Audit log.** Match `P.audit`.
  - Filters row: group select, from/to dates, actor select.
  - Day groups use `SectionHeading`; rows use `.li` with a mono time column and a group badge.
  - Keep cursor pagination and the real groups.
- [ ] **Step 5: Verify.**
  - Run the e2e specs listed above, plus the updated theme specs.
  - Run the visual harness `--grep "settings|approval-requests|audit-log"`.
- [ ] **Step 6: Commit** with `feat(web): three-way theme, Польовий settings, approvals and audit log`.

### Task 13: Suddivstvo, junak import, pysarstvo, treasury, admin

**Files:**
- Modify: `apps/web/app/suddivstvo/page.tsx`, `apps/web/app/suddivstvo/junak-import/page.tsx` (restyle only; do not touch the wizard logic), `apps/web/app/pysarstvo/page.tsx`, `apps/web/app/treasury/page.tsx`, `apps/web/app/admin/page.tsx` (primitives, `PageHeader` and `WideContent` only)
- Test:
  - `e2e/suddivstvo.spec.ts`, `junak-import-*.spec.ts`
  - `treasury.spec.ts`
  - `admin-*.spec.ts`
  - `access-denied.spec.ts`

- [ ] **Step 1: Suddivstvo.** Match `P.suddivstvo`. The «Книга судді» card shows the status as a badge, the connect/sync buttons and the sync report (keep `data-testid="sync-report"`).
- [ ] **Step 2: Junak import.** Match `P.import`.
  - Use `WideContent`.
  - Wizard steps become cards; tables use a mono header row and dashed row separators.
  - Keep `data-testid="bulk-import-row"` and all labels.
- [ ] **Step 3: Pysarstvo.** Match `P.pysarstvo`: the АПД form card with pseudo checkboxes and the `Псевдо` input. Do NOT add «Останні документи», because no API exists for it.
- [ ] **Step 4: Treasury.** Match `P.treasury`.
  - Balance in PT Mono 700 2.6rem.
  - Income in `--ok`, expense in `--late`.
  - Keep the uk-UA currency formatting with kopecks (`+200,00 грн`, `1 000,00 грн`), the starting-balance edit and the delete action.
- [ ] **Step 5: Admin.** Apply `PageHeader`, `WideContent` and the primitives. No layout redesign.
- [ ] **Step 6: Verify.**
  - Run the e2e specs listed above, one at a time.
  - Run the visual harness `--grep "suddivstvo|junak-import|pysarstvo|treasury"`.
- [ ] **Step 7: Commit** with `feat(web): Польовий діловодство pages`.

### Task 14: Consistency pass, full e2e, backlog

**Files:**
- Modify: whatever the pass finds (styles only)
- Modify: `docs/backlog.md`

- [ ] **Step 1: Run the whole visual harness.**

  ```
  cd apps/web && nice npx playwright test -c playwright.visual.config.ts
  ```

  1. Review every page at phone and desktop in light and dark against the proto shots.
  2. Fix leftovers: old blue `#2F5FD9` outside the AI gradient, Manrope remnants, `rounded-xl`, `ring-1` cards, missing `PageHeader`, unreadable dark text.
  3. `grep -rn "2F5FD9\|2f5fd9\|rounded-xl\|ring-foreground" apps/web/app apps/web/components` must show only AI-gradient uses.
- [ ] **Step 2: Run the full e2e suite once.**

  ```
  cd apps/web && nice npx playwright test --workers=1
  ```

  Expected: all pass. Fix any failure the redesign caused.
- [ ] **Step 3: Backlog.** In `docs/backlog.md`, add a section «Польовий: функції, яких немає в API» with one item each:
  - «Видати» for inventory: to whom (гурток / юнак / провід), return date, quantity, «Повернуто», overdue status
  - inventory category, place, condition and code
  - pinned and topic for announcements
  - author position label in news
  - per-junak progress % in the hurtok and roster lists
  - «Останні документи» in Писарство
  - pending changes and last sync time in Суддівство
- [ ] **Step 4: Commit** with `chore(web): Польовий consistency pass; backlog for API-dependent features`.
