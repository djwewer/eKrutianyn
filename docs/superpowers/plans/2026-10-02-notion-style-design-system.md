# Notion-Style Design System (Project 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `apps/web`'s default, unstyled shadcn/ui theme with the approved Notion-style design system (warm light/dark palette, Manrope typography, a pervasive blue accent) and build the missing base components (`Accordion`, `Badge`, `Avatar`, `ThemeToggle`, `Select`, `RowList`) that real pages need — without touching any real page's markup, so this ships as a purely additive, zero-regression-risk layer. Page-by-page rollout (including wiring an actual dark-mode toggle mechanism into the app) is Project 2, a separate future plan.

**Architecture:** Swap color/radius token *values* in `apps/web/app/globals.css` under the *same* CSS variable names shadcn's existing components and Tailwind utilities already consume (`--background`, `--foreground`, `--primary`, `--card`, `--border`, etc.) — this re-themes the 5 existing primitives and every current page instantly, with zero JSX changes and zero test-selector risk (Playwright selects by role/text/label, never by color). Load Manrope via `next/font/google` and point the existing `--font-sans`/`--font-heading` variables at it. Build the 6 new components under `apps/web/components/ui/`, following this codebase's established pattern of thin Tailwind/CVA wrappers around `@base-ui/react/*` headless primitives (the same pattern `button.tsx` and `dialog.tsx` already use) — not hand-rolled divs, not a new dependency. Prove each new component works via Playwright specs against one new, unlinked, dev-only route (`apps/web/app/dev-ui-kit/page.tsx`) built incrementally across tasks, since no component-level test runner (Jest/RTL/Storybook) exists in this project and adding one is out of scope.

**Tech Stack:** Next.js 16 (App Router) + React 19, Tailwind CSS v4, `@base-ui/react` 1.7.0 (headless component primitives — already a dependency), `class-variance-authority` + `tailwind-merge` (already used by `button.tsx`), `lucide-react` (already a dependency, for any icon not custom-drawn), Playwright (existing e2e suite).

## Global Constraints

- **Binding visual reference**: [`docs/superpowers/specs/assets/2026-10-02-notion-style-ui-overhaul-kurin-mockup.html`](../specs/assets/2026-10-02-notion-style-ui-overhaul-kurin-mockup.html) is the authoritative source for every color, font, radius, shadow, and motion value in this plan — open it directly (it is a plain, dependency-free HTML file) rather than relying only on this plan's transcription. If anything here and that file disagree, the file wins and this plan has a bug.
- **No new runtime dependencies.** Do not add `@radix-ui/*`, `framer-motion`, `gsap`, a CSS framework other than Tailwind, or any component-testing framework (Jest, Vitest, Storybook, `@testing-library/*`). Everything needed (headless primitives, CVA, class merging, icons) is already installed.
- **Font: Manrope only, everywhere, no serif.** Both `--font-sans` and `--font-heading` resolve to Manrope. No other `@font-face`/Google Font is introduced.
- **Accent color is one CSS variable**, default `#2F5FD9`, never hardcoded inline in a component — every new component reads it via the `accent`/`accent-soft`/`accent-foreground` Tailwind utilities this plan registers in Task 1, exactly like `destructive`/`muted` already work today.
- **Follow the existing `@base-ui/react` + CVA + `cn()` wrapping convention** established by `apps/web/components/ui/button.tsx` and `apps/web/components/ui/dialog.tsx` for every new *interactive* primitive (`Accordion`, `Select`, `ThemeToggle`). Do not hand-roll a native-element replacement for something `@base-ui/react` already ships a primitive for.
- **Do not modify any file under `apps/web/app/**` except**: `apps/web/app/globals.css` (tokens), `apps/web/app/layout.tsx` (font wiring), and the new `apps/web/app/dev-ui-kit/page.tsx` (this plan's own test scaffold, not a real page — not linked from `components/nav.tsx`, not reachable by any user role). No existing real page's JSX changes.
- **`apps/web/middleware.ts` has one legitimate one-line change**: `/dev-ui-kit` is listed in its `PUBLIC_PATHS` array (discovered necessary during Task 3 — without it, the app's global auth middleware redirects every unauthenticated request, including Playwright's, to `/login`, so the dev-ui-kit scaffold would never actually render for any task's tests). This is the one exception to "don't touch shared app infrastructure" — no other line in this file changes.
- **Do not change the public prop API of the 5 existing components** (`button.tsx`, `card.tsx`, `dialog.tsx`, `input.tsx`, `label.tsx`). They keep working exactly as before; only their inherited colors/radii change via the global token swap.
- **Radius scale is pinned, not calculated**: `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`, `--radius-xl: 20px`, `--radius-2xl: 24px`, `--radius-3xl: 28px`, `--radius-4xl: 32px` (continuing the mockup's +4px steps past what it defines). `--radius` itself stays defined (as `12px`, same as `--radius-md`) in case anything references it directly.
- **`apps/web/app/dev-ui-kit/page.tsx` is temporary test scaffolding**, not a shipped feature — say so in a one-line comment at the top of the file. Project 2's plan should delete or repurpose it once real pages use these components directly.
- Every task's Playwright run uses the sandbox's Chromium: `apps/web/playwright.config.ts` needs its local, **never-committed** `use.launchOptions.executablePath: '/opt/pw-browsers/chromium'` addition present before running `npx playwright test` (restore it if a prior `git` operation reverted it; never `git add`/commit it).
- Never run the API Jest e2e suite and the Playwright suite concurrently (shared `plast_test` DB). `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test"` must prefix every API e2e run.

---

## Task 1: Replace the color and radius tokens in `globals.css`

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: the Tailwind utility classes every later task's components use — `bg-background`, `text-foreground`, `bg-card`, `border-border`, `bg-primary`/`text-primary-foreground`, `bg-muted`/`text-muted-foreground`, and three **new** utilities this task introduces: `bg-accent`/`text-accent`/`border-accent` (brand blue), `bg-accent-soft`/`text-accent-soft` (light accent tint), `bg-warning-soft`/`text-warning-foreground` (amber "vacancy"/warning pills). Radius utilities `rounded-sm`/`rounded-md`/`rounded-lg` resolve to 8px/12px/16px.

- [ ] **Step 1: Read the current file to confirm line numbers before editing**

Run: `grep -n "" apps/web/app/globals.css | sed -n '1,130p'`

This file currently has two blocks you will change: the `@theme inline { ... }` block (which maps CSS variables to Tailwind utility names) and the `:root { ... }` / `.dark { ... }` blocks (which hold this app's actual default-shadcn gray values today).

- [ ] **Step 2: Replace the `@theme inline` block**

Replace the entire existing `@theme inline { ... }` block with:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-sans);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-accent-soft: var(--accent-soft);
  --color-warning-soft: var(--warning-soft);
  --color-warning-foreground: var(--warning-foreground);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-2xl: 24px;
  --radius-3xl: 28px;
  --radius-4xl: 32px;
}
```

(This is the same block as before, with `--radius-*` now pinned instead of `calc()`-derived, and three new `--color-accent-soft`/`--color-warning-soft`/`--color-warning-foreground` lines added — every other line is unchanged, so nothing that already worked stops working.)

- [ ] **Step 3: Replace the `:root` block**

Replace the entire existing `:root { ... }` block with:

```css
:root {
  --background: #FBFAF8;
  --foreground: #2B2A27;
  --card: #FFFFFF;
  --card-foreground: #2B2A27;
  --popover: #FFFFFF;
  --popover-foreground: #2B2A27;
  --primary: #2F5FD9;
  --primary-foreground: #FFFFFF;
  --secondary: #F3F1EC;
  --secondary-foreground: #2B2A27;
  --muted: #F3F1EC;
  --muted-foreground: #6F6C66;
  --accent: #2F5FD9;
  --accent-foreground: #FFFFFF;
  --accent-soft: #E8EEFC;
  --warning-soft: #FBF0DC;
  --warning-foreground: #8A5A12;
  --destructive: oklch(0.577 0.245 27.325);
  --border: #E8E6E1;
  --input: #E8E6E1;
  --ring: #2F5FD9;
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 12px;
  --sidebar: #FFFFFF;
  --sidebar-foreground: #2B2A27;
  --sidebar-primary: #2F5FD9;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #F3F1EC;
  --sidebar-accent-foreground: #2B2A27;
  --sidebar-border: #E8E6E1;
  --sidebar-ring: #2F5FD9;
}
```

(`--destructive` and the five `--chart-*` tokens are deliberately left at their existing default values — the spec has no warning/error color requirement beyond the amber "vacancy" pill, which uses the new `--warning-*` tokens instead, and no page currently renders a chart. `--sidebar-*` tokens are likewise unused today — no sidebar layout exists — and are set to sensible values consistent with the rest of the palette rather than left as stale gray defaults, in case something starts using them later.)

- [ ] **Step 4: Replace the `.dark` block**

Replace the entire existing `.dark { ... }` block with:

```css
.dark {
  --background: #1C1C1A;
  --foreground: #EDECE9;
  --card: #242320;
  --card-foreground: #EDECE9;
  --popover: #242320;
  --popover-foreground: #EDECE9;
  --primary: #2F5FD9;
  --primary-foreground: #FFFFFF;
  --secondary: #191917;
  --secondary-foreground: #EDECE9;
  --muted: #191917;
  --muted-foreground: #9B9890;
  --accent: #2F5FD9;
  --accent-foreground: #FFFFFF;
  --accent-soft: rgba(94, 140, 255, 0.16);
  --warning-soft: rgba(217, 164, 65, 0.14);
  --warning-foreground: #E6B766;
  --destructive: oklch(0.704 0.191 22.216);
  --border: rgba(255, 255, 255, 0.09);
  --input: rgba(255, 255, 255, 0.15);
  --ring: #2F5FD9;
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: #242320;
  --sidebar-foreground: #EDECE9;
  --sidebar-primary: #2F5FD9;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #191917;
  --sidebar-accent-foreground: #EDECE9;
  --sidebar-border: rgba(255, 255, 255, 0.09);
  --sidebar-ring: #2F5FD9;
}
```

- [ ] **Step 5: Confirm nothing else in the codebase references a token this didn't account for**

Run: `grep -rn "var(--radius)" apps/web/components apps/web/app --include=*.tsx --include=*.css`
Expected: zero matches, or only matches inside files this task itself just edited. (Button's `xs`/`sm` sizes use `min(var(--radius-md),10px)`-style arbitrary values, not `var(--radius)` directly, so this should come back empty — confirming the radius change is safe.)

- [ ] **Step 6: Verify the app still builds**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors (CSS changes don't affect TypeScript, this just confirms the repo's baseline is still clean before you commit).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(web): replace default shadcn theme with Notion-style tokens"
```

---

## Task 2: Load Manrope and wire it as the app's font

**Files:**
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: the `--font-sans` CSS variable resolving to Manrope on every page (consumed implicitly by every component via the `font-sans`/`font-heading` Tailwind utilities Task 1 already wires up).

- [ ] **Step 1: Read the current file**

Run: `cat apps/web/app/layout.tsx`

- [ ] **Step 2: Add the Manrope import and font instance**

Near the top of the file, add:

```tsx
import { Manrope } from 'next/font/google';

const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});
```

- [ ] **Step 3: Apply the font's CSS variable to `<html>`**

Find the root `<html ...>` element in the file's returned JSX and add `manrope.variable` to its `className` (creating a `className` prop if one doesn't already exist, or appending to it with a template string if it does — keep whatever `lang` or other existing attributes are already there).

- [ ] **Step 4: Verify the build succeeds with the new font**

Run: `cd apps/web && npm run build`
Expected: build succeeds with no font-subset error. (If this specific command errors with a message naming an invalid subset for Manrope, that is the one acceptable reason to come back and remove `'cyrillic'` from the `subsets` array in Step 2 and rebuild — do not pre-emptively remove it without seeing that exact error, since Manrope does support Cyrillic on Google Fonts and the self-hosted subset is what gives every page's Ukrainian text crisp Manrope rendering instead of a fallback font.)

Run: `rm -rf apps/web/.next` if you need a clean rebuild after fixing anything (Next.js's dev cache can go stale across edits — see `apps/web/AGENTS.md`).

- [ ] **Step 5: Spot-check the font is actually served**

Run: `cd apps/web && npm run dev &` then, once `http://localhost:3000` responds, `curl -s http://localhost:3000/login | grep -o 'Manrope' | head -1`
Expected: prints `Manrope` (Next.js embeds the font's generated class/family name in the page's inlined styles). Stop the dev server afterward (`kill %1` or `fg` then Ctrl-C).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/layout.tsx
git commit -m "feat(web): load Manrope as the app's font"
```

---

## Task 3: `Badge` component + the dev-ui-kit test scaffold page

**Files:**
- Create: `apps/web/components/ui/badge.tsx`
- Create: `apps/web/app/dev-ui-kit/page.tsx`
- Test: `apps/web/e2e/dev-ui-kit-badge.spec.ts`

**Interfaces:**
- Consumes: `cn` from `apps/web/lib/utils.ts` (`export function cn(...inputs: ClassValue[]): string`, already exists).
- Produces: `Badge` — `function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>)`, variants `"accent" | "warning" | "neutral"` (default `"accent"`). Later tasks (6, 8) import `{ Badge } from "@/components/ui/badge"`. Also produces the `apps/web/app/dev-ui-kit/page.tsx` file structure every later task appends a `<section>` to.

- [ ] **Step 1: Write the Badge component**

Create `apps/web/components/ui/badge.tsx`:

```tsx
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
  {
    variants: {
      variant: {
        accent: "bg-accent-soft text-accent",
        warning: "bg-warning-soft text-warning-foreground",
        neutral: "bg-card text-accent ring-1 ring-accent-soft",
      },
    },
    defaultVariants: {
      variant: "accent",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
```

- [ ] **Step 2: Create the dev-ui-kit scaffold page with a Badge section**

Create `apps/web/app/dev-ui-kit/page.tsx`:

```tsx
// Internal test scaffold for the Project 1 design-system components.
// Not linked from app navigation, not a real page — Project 2 deletes or
// repurposes this once real pages render these components directly.
import { Badge } from "@/components/ui/badge"

export default function DevUiKitPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 p-8">
      <section aria-labelledby="badge-heading">
        <h2 id="badge-heading" className="mb-3 font-heading text-lg font-semibold">
          Badge
        </h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="accent">Активний</Badge>
          <Badge variant="warning">Вакансія</Badge>
          <Badge variant="neutral">Гуртковий</Badge>
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Write the Playwright test**

Create `apps/web/e2e/dev-ui-kit-badge.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('renders all three Badge variants with distinct backgrounds', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  const accent = page.getByText('Активний');
  const warning = page.getByText('Вакансія');
  const neutral = page.getByText('Гуртковий');

  await expect(accent).toBeVisible();
  await expect(warning).toBeVisible();
  await expect(neutral).toBeVisible();

  const accentBg = await accent.evaluate((el) => getComputedStyle(el).backgroundColor);
  const warningBg = await warning.evaluate((el) => getComputedStyle(el).backgroundColor);
  const neutralBg = await neutral.evaluate((el) => getComputedStyle(el).backgroundColor);

  expect(accentBg).not.toBe(warningBg);
  expect(accentBg).not.toBe(neutralBg);
  expect(warningBg).not.toBe(neutralBg);
});
```

This route renders with no authentication and no backend data, so it does not need any seed helpers other Playwright specs use.

- [ ] **Step 4: Run the test and confirm it passes**

Restore the sandbox-local Chromium path in `apps/web/playwright.config.ts` if a prior `git` operation reverted it (see Global Constraints), then:

Run: `cd apps/web && npx playwright test e2e/dev-ui-kit-badge.spec.ts`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/badge.tsx apps/web/app/dev-ui-kit/page.tsx apps/web/e2e/dev-ui-kit-badge.spec.ts
git commit -m "feat(web): add Badge component and dev-ui-kit test scaffold"
```

---

## Task 4: `Avatar` component

**Files:**
- Create: `apps/web/components/ui/avatar.tsx`
- Modify: `apps/web/app/dev-ui-kit/page.tsx`
- Test: `apps/web/e2e/dev-ui-kit-avatar.spec.ts`

**Interfaces:**
- Consumes: `cn` from `apps/web/lib/utils.ts`.
- Produces: `Avatar` — `function Avatar({ initials, className, ...props }: React.ComponentProps<"div"> & { initials: string })`. Later task (8) imports `{ Avatar } from "@/components/ui/avatar"`.

- [ ] **Step 1: Write the Avatar component**

Create `apps/web/components/ui/avatar.tsx`:

```tsx
import { cn } from "@/lib/utils"

function Avatar({
  initials,
  className,
  ...props
}: React.ComponentProps<"div"> & { initials: string }) {
  return (
    <div
      data-slot="avatar"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent",
        className
      )}
      {...props}
    >
      {initials}
    </div>
  )
}

export { Avatar }
```

- [ ] **Step 2: Add an Avatar section to the dev-ui-kit page**

In `apps/web/app/dev-ui-kit/page.tsx`, add the import `import { Avatar } from "@/components/ui/avatar"` and a new `<section>` right after the Badge section:

```tsx
      <section aria-labelledby="avatar-heading">
        <h2 id="avatar-heading" className="mb-3 font-heading text-lg font-semibold">
          Avatar
        </h2>
        <div className="flex gap-2">
          <Avatar initials="ТШ" />
          <Avatar initials="МК" />
        </div>
      </section>
```

- [ ] **Step 3: Write the Playwright test**

Create `apps/web/e2e/dev-ui-kit-avatar.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('renders avatar initials', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  await expect(page.getByText('ТШ', { exact: true })).toBeVisible();
  await expect(page.getByText('МК', { exact: true })).toBeVisible();
});
```

- [ ] **Step 4: Run the test**

Run: `cd apps/web && npx playwright test e2e/dev-ui-kit-avatar.spec.ts`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/avatar.tsx apps/web/app/dev-ui-kit/page.tsx apps/web/e2e/dev-ui-kit-avatar.spec.ts
git commit -m "feat(web): add Avatar component"
```

---

## Task 5: `Accordion` component, including nested support

**Files:**
- Create: `apps/web/components/ui/accordion.tsx`
- Modify: `apps/web/app/dev-ui-kit/page.tsx`
- Test: `apps/web/e2e/dev-ui-kit-accordion.spec.ts`

**Interfaces:**
- Consumes: `cn` from `apps/web/lib/utils.ts`; `Accordion` from `@base-ui/react/accordion` (installed — exposes `Accordion.Root`, `Accordion.Item`, `Accordion.Header`, `Accordion.Trigger`, `Accordion.Panel`; `Accordion.Item` carries a `data-open` attribute when its panel is open; `Accordion.Panel` exposes a `--accordion-panel-height` CSS variable and `data-starting-style`/`data-ending-style` attributes for height transitions; `Accordion.Root`'s `multiple` prop defaults to `false`, i.e. single-item-open-at-a-time by default).
- Produces: `AccordionRoot`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` (all typed re-exports of the underlying primitives with this app's styling baked in). Project 2 (not this plan) will import these on real pages.

- [ ] **Step 1: Write the Accordion component**

Create `apps/web/components/ui/accordion.tsx`:

```tsx
'use client';

import * as React from "react"
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"

import { cn } from "@/lib/utils"

function AccordionRoot({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("flex flex-col gap-2.5", className)}
      {...props}
    />
  )
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors data-[open]:border-accent",
        className
      )}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header>
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group flex w-full items-center justify-between gap-3.5 rounded-lg px-5 py-4 text-left font-medium transition-colors hover:bg-accent-soft",
          className
        )}
        {...props}
      >
        {children}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="shrink-0 text-muted-foreground transition-transform duration-260 ease-[cubic-bezier(.4,0,.2,1)] group-data-panel-open:rotate-180"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Panel>) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className={cn(
        "h-[var(--accordion-panel-height)] overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(.4,0,.2,1)] data-[starting-style]:h-0 data-[ending-style]:h-0",
        className
      )}
      {...props}
    >
      <div className="px-5 pb-5">{children}</div>
    </AccordionPrimitive.Panel>
  )
}

export { AccordionRoot, AccordionItem, AccordionTrigger, AccordionContent }
```

- [ ] **Step 2: Add a nested-accordion section to the dev-ui-kit page**

In `apps/web/app/dev-ui-kit/page.tsx`, add the import:

```tsx
import {
  AccordionRoot,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
```

and a new `<section>`:

```tsx
      <section aria-labelledby="accordion-heading">
        <h2 id="accordion-heading" className="mb-3 font-heading text-lg font-semibold">
          Accordion (with nesting)
        </h2>
        <AccordionRoot>
          <AccordionItem value="info">
            <AccordionTrigger>Інформація по куреню</AccordionTrigger>
            <AccordionContent>Назва, номер, пробна програма.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="hurtky">
            <AccordionTrigger>Гуртки</AccordionTrigger>
            <AccordionContent>
              <AccordionRoot>
                <AccordionItem value="orlyky">
                  <AccordionTrigger>Орлики</AccordionTrigger>
                  <AccordionContent>Тарас Шевчук — Гуртковий</AccordionContent>
                </AccordionItem>
                <AccordionItem value="sokoly">
                  <AccordionTrigger>Соколи</AccordionTrigger>
                  <AccordionContent>Соломія Гнатюк — Гуртковий</AccordionContent>
                </AccordionItem>
              </AccordionRoot>
            </AccordionContent>
          </AccordionItem>
        </AccordionRoot>
      </section>
```

- [ ] **Step 3: Write the Playwright test**

Create `apps/web/e2e/dev-ui-kit-accordion.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('expands and collapses a top-level accordion item', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  const trigger = page.getByRole('button', { name: 'Інформація по куреню' });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Назва, номер, пробна програма.')).not.toBeVisible();

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Назва, номер, пробна програма.')).toBeVisible();

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('a nested accordion inside an item expands independently of its parent', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  await page.getByRole('button', { name: 'Гуртки' }).click();
  const nestedTrigger = page.getByRole('button', { name: 'Орлики' });
  await expect(nestedTrigger).toBeVisible();
  await expect(nestedTrigger).toHaveAttribute('aria-expanded', 'false');

  await nestedTrigger.click();
  await expect(nestedTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Тарас Шевчук — Гуртковий')).toBeVisible();

  // The parent item ("Гуртки") must still be open — opening the nested
  // item must not collapse or otherwise affect its ancestor.
  await expect(page.getByRole('button', { name: 'Гуртки' })).toHaveAttribute('aria-expanded', 'true');
});

test('opening a second top-level item closes the first (single-open accordion)', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  await page.getByRole('button', { name: 'Інформація по куреню' }).click();
  await page.getByRole('button', { name: 'Гуртки' }).click();

  await expect(page.getByRole('button', { name: 'Інформація по куреню' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Гуртки' })).toHaveAttribute('aria-expanded', 'true');
});
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/web && npx playwright test e2e/dev-ui-kit-accordion.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/accordion.tsx apps/web/app/dev-ui-kit/page.tsx apps/web/e2e/dev-ui-kit-accordion.spec.ts
git commit -m "feat(web): add Accordion component with nested-expansion support"
```

---

## Task 6: `Select` component

**Files:**
- Create: `apps/web/components/ui/select.tsx`
- Modify: `apps/web/app/dev-ui-kit/page.tsx`
- Test: `apps/web/e2e/dev-ui-kit-select.spec.ts`

**Interfaces:**
- Consumes: `cn`; `Select` from `@base-ui/react/select` (installed — exposes `Select.Root`, `Select.Trigger`, `Select.Value`, `Select.Icon`, `Select.Portal`, `Select.Positioner`, `Select.Popup`, `Select.Item`, `Select.ItemText`, `Select.ItemIndicator`); `Badge` is not used here.
- Produces: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` (typed re-exports with this app's styling). Project 2 will use these to replace the hand-rolled `<select>` elements in `components/hurtok-settings-dialog.tsx` and position-assignment forms (not this plan's job).

- [ ] **Step 1: Write the Select component**

Create `apps/web/components/ui/select.tsx`:

```tsx
'use client';

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root {...props} />
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="text-muted-foreground">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value {...props} />
}

function SelectContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Popup>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner sideOffset={6}>
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "max-h-64 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg",
            className
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "flex cursor-pointer items-center justify-between rounded-sm px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
```

- [ ] **Step 2: Add a Select section to the dev-ui-kit page**

In `apps/web/app/dev-ui-kit/page.tsx`, add the import:

```tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
```

and a new `<section>`:

```tsx
      <section aria-labelledby="select-heading">
        <h2 id="select-heading" className="mb-3 font-heading text-lg font-semibold">
          Select
        </h2>
        <Select defaultValue="orlyky">
          <SelectTrigger className="w-56" aria-label="Гурток">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="orlyky">Орлики</SelectItem>
            <SelectItem value="sokoly">Соколи</SelectItem>
            <SelectItem value="vovky">Вовки</SelectItem>
          </SelectContent>
        </Select>
      </section>
```

- [ ] **Step 3: Write the Playwright test**

Create `apps/web/e2e/dev-ui-kit-select.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('opens the select, shows options, and selecting one updates the trigger', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  const trigger = page.getByRole('combobox', { name: 'Гурток' });
  await expect(trigger).toContainText('Орлики');

  await trigger.click();
  const sokolyOption = page.getByRole('option', { name: 'Соколи' });
  await expect(sokolyOption).toBeVisible();

  await sokolyOption.click();
  await expect(trigger).toContainText('Соколи');
});
```

- [ ] **Step 4: Run the test**

Run: `cd apps/web && npx playwright test e2e/dev-ui-kit-select.spec.ts`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/select.tsx apps/web/app/dev-ui-kit/page.tsx apps/web/e2e/dev-ui-kit-select.spec.ts
git commit -m "feat(web): add Select component"
```

---

## Task 7: `ThemeToggle` component

**Files:**
- Create: `apps/web/components/ui/theme-toggle.tsx`
- Modify: `apps/web/app/dev-ui-kit/page.tsx`
- Test: `apps/web/e2e/dev-ui-kit-theme-toggle.spec.ts`

**Interfaces:**
- Consumes: `cn`; `Switch` from `@base-ui/react/switch` (installed — exposes `Switch.Root`, `Switch.Thumb`; `Switch.Root` carries `data-checked`/`data-unchecked` attributes).
- Produces: `ThemeToggle` — `function ThemeToggle(props: React.ComponentProps<typeof SwitchPrimitive.Root>)`. This component **only** flips the `dark` class on `document.documentElement` when clicked — it has no persistence (`localStorage`/cookie) and no system-preference detection. Deciding and building the app's actual theme-persistence architecture (so a toggle anywhere in the real app would mean something across page loads) is explicitly Project 2's job per the design spec's "Open questions" section — this component is the *visual control* only, proven to work in isolation.

- [ ] **Step 1: Write the ThemeToggle component**

Create `apps/web/components/ui/theme-toggle.tsx`:

```tsx
'use client';

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function ThemeToggle({
  className,
  onCheckedChange,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="theme-toggle"
      aria-label="Перемкнути темну тему"
      className={cn(
        "relative inline-flex h-6 w-[42px] shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted transition-colors data-[checked]:bg-accent-soft",
        className
      )}
      onCheckedChange={(checked, eventDetails) => {
        document.documentElement.classList.toggle("dark", checked)
        onCheckedChange?.(checked, eventDetails)
      }}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[18px] translate-x-0.5 rounded-full bg-background shadow transition-transform duration-260 ease-[cubic-bezier(.4,0,.2,1)] data-[checked]:translate-x-[20px]" />
    </SwitchPrimitive.Root>
  )
}

export { ThemeToggle }
```

- [ ] **Step 2: Add a ThemeToggle section to the dev-ui-kit page**

In `apps/web/app/dev-ui-kit/page.tsx`, add the import `import { ThemeToggle } from "@/components/ui/theme-toggle"` and a new `<section>`:

```tsx
      <section aria-labelledby="theme-toggle-heading">
        <h2 id="theme-toggle-heading" className="mb-3 font-heading text-lg font-semibold">
          Theme toggle
        </h2>
        <ThemeToggle />
      </section>
```

- [ ] **Step 3: Write the Playwright test**

Create `apps/web/e2e/dev-ui-kit-theme-toggle.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('clicking the theme toggle flips dark mode and the page background color changes', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);

  const bgBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  const toggle = page.getByRole('switch', { name: 'Перемкнути темну тему' });
  await toggle.click();

  await expect(html).toHaveClass(/dark/);
  const bgAfter = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bgAfter).not.toBe(bgBefore);

  await toggle.click();
  await expect(html).not.toHaveClass(/dark/);
});
```

- [ ] **Step 4: Run the test**

Run: `cd apps/web && npx playwright test e2e/dev-ui-kit-theme-toggle.spec.ts`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/theme-toggle.tsx apps/web/app/dev-ui-kit/page.tsx apps/web/e2e/dev-ui-kit-theme-toggle.spec.ts
git commit -m "feat(web): add ThemeToggle component (visual control only, no persistence)"
```

---

## Task 8: `RowList` / `Row` primitive

**Files:**
- Create: `apps/web/components/ui/row-list.tsx`
- Modify: `apps/web/app/dev-ui-kit/page.tsx`
- Test: `apps/web/e2e/dev-ui-kit-row-list.spec.ts`

**Interfaces:**
- Consumes: `cn`; `Avatar` from `@/components/ui/avatar` (Task 4: `function Avatar({ initials, className, ...props }: ... & { initials: string })`).
- Produces: `RowList` — `function RowList({ className, ...props }: React.ComponentProps<"div">)`; `Row` — `function Row({ initials, title, subtitle, children, className, ...props }: React.ComponentProps<"div"> & { initials: string; title: string; subtitle?: string })` (`children` renders trailing content, e.g. a `Badge`). Project 2 will use these to replace the four existing duplicated "avatar + name + meta + pill" row blocks across the app (provid, vykhovnyky, yunaky, hurtok members) — not this plan's job.

- [ ] **Step 1: Write the RowList/Row component**

Create `apps/web/components/ui/row-list.tsx`:

```tsx
import { cn } from "@/lib/utils"
import { Avatar } from "@/components/ui/avatar"

function RowList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="row-list"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function Row({
  initials,
  title,
  subtitle,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  initials: string
  title: string
  subtitle?: string
}) {
  return (
    <div
      data-slot="row"
      className={cn(
        "flex items-center gap-3.5 rounded-md border border-transparent bg-muted p-3 transition-colors hover:border-accent",
        className
      )}
      {...props}
    >
      <Avatar initials={initials} />
      <div className="flex min-w-0 flex-grow flex-col gap-px">
        <span className="text-sm font-medium">{title}</span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

export { RowList, Row }
```

- [ ] **Step 2: Add a RowList section to the dev-ui-kit page**

In `apps/web/app/dev-ui-kit/page.tsx`, add the imports `import { RowList, Row } from "@/components/ui/row-list"` and `import { Badge } from "@/components/ui/badge"` (if `Badge` is not already imported from Task 3), and a new `<section>`:

```tsx
      <section aria-labelledby="row-list-heading">
        <h2 id="row-list-heading" className="mb-3 font-heading text-lg font-semibold">
          Row list
        </h2>
        <RowList>
          <Row initials="ІМ" title="Іван Мельник" subtitle="Курінний" />
          <Row initials="ОТ" title="Олена Ткаченко" subtitle="Писар">
            <Badge variant="neutral">Писар</Badge>
          </Row>
        </RowList>
      </section>
```

- [ ] **Step 3: Write the Playwright test**

Create `apps/web/e2e/dev-ui-kit-row-list.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('renders rows with avatar initials, name, subtitle, and trailing content', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  await expect(page.getByText('Іван Мельник')).toBeVisible();
  await expect(page.getByText('Курінний')).toBeVisible();
  await expect(page.getByText('Олена Ткаченко')).toBeVisible();

  const rowListSection = page.locator('section', { has: page.getByRole('heading', { name: 'Row list' }) });
  await expect(rowListSection.getByText('ІМ', { exact: true })).toBeVisible();
  await expect(rowListSection.getByText('ОТ', { exact: true })).toBeVisible();
});
```

- [ ] **Step 4: Run the test**

Run: `cd apps/web && npx playwright test e2e/dev-ui-kit-row-list.spec.ts`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/row-list.tsx apps/web/app/dev-ui-kit/page.tsx apps/web/e2e/dev-ui-kit-row-list.spec.ts
git commit -m "feat(web): add RowList/Row primitive"
```

---

## Task 9: tsc/lint cleanliness pass

**Files:**
- Modify: whichever of the Task 1-8 files need fixes (expected to be none or trivial).

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task only verifies static correctness across everything built so far before the final regression task.

- [ ] **Step 1: Run the TypeScript check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors. If there are errors, fix them in the relevant component file from Tasks 1-8 (not by changing the test files' expectations) and re-run until clean.

- [ ] **Step 2: Run the linter**

Run: `cd apps/web && npm run lint`
Expected: no errors in any file this plan created or touched. Pre-existing warnings/errors in unrelated files (if any) are not this plan's responsibility to fix.

- [ ] **Step 3: Commit (only if Step 1 or 2 required a fix)**

```bash
git add -A
git commit -m "fix(web): tsc/lint cleanup for design-system components"
```

If no fixes were needed, skip this step — there is nothing to commit.

---

## Task 10: Full regression — prove this was purely additive

**Files:** none (verification only).

**Interfaces:** none — this is the plan's final confirmation gate.

- [ ] **Step 1: Confirm no existing page or component's public file changed**

Run: `git diff --stat $(git merge-base main HEAD) HEAD -- apps/web/app apps/web/components`
Expected: every listed path under `apps/web/app/` is either `globals.css`, `layout.tsx`, or something under `app/dev-ui-kit/`; every listed path under `apps/web/components/` is a brand-new file under `components/ui/` (badge.tsx, avatar.tsx, accordion.tsx, select.tsx, theme-toggle.tsx, row-list.tsx) — no existing component file (`button.tsx`, `card.tsx`, `dialog.tsx`, `input.tsx`, `label.tsx`, `nav.tsx`, `hurtok-settings-dialog.tsx`, `kurin-*.tsx`, etc.) appears in this diff. If one does, stop and investigate — this plan is specified as additive-only and a change here means a constraint was violated somewhere in Tasks 1-9.

- [ ] **Step 2: Run the full existing Playwright suite (not just this plan's new specs)**

Restore the sandbox-local Chromium path in `apps/web/playwright.config.ts` if needed (see Global Constraints).

Run: `cd apps/web && npx playwright test`
Expected: every pre-existing spec still passes, plus the 8 new specs from Tasks 3-8 (1 + 1 + 3 + 1 + 1 + 1 = 8 new tests across those 6 files). Total pass count should be the prior full-suite count (confirm via `git log`/the ledger for the last known total, e.g. the kurin-consolidation plan's final count) plus 8.

- [ ] **Step 3: Run the full API e2e suite**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: the same suite/test counts as before this plan started (this plan touched zero files under `apps/api`) — confirms the "API is unaffected by a frontend-only change" claim from the spec's Testing section is actually true, not just assumed.

- [ ] **Step 4: Open `/dev-ui-kit` manually one more time as a sanity check**

Run: `cd apps/web && npm run dev &`, then once ready, `curl -s http://localhost:3000/dev-ui-kit | grep -c 'data-slot='`
Expected: a number greater than 0 (confirms the page renders server-side without crashing). Stop the dev server afterward.

- [ ] **Step 5: Update the plan's own checklist and report**

No code change — this step is just confirming every checkbox above (Tasks 1-10) is now checked before considering Project 1 done. If following subagent-driven-development, this is also the point to update `.superpowers/sdd/progress.md` with a final "Project 1 complete" line and to decide, per that skill's own process, whether this branch gets reviewed/merged now or held until Project 2 is also ready (recommended: merge now — Project 1 is additive and complete on its own, and holding it only delays the token/font change from reaching `main`).
