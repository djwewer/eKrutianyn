# Kurin Page Design-System Migration — Wave 1 (Project 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll Project 1's Notion-style components (`Accordion`, `Select`, `RowList`/`Row`, `Avatar`, `Badge`, `ThemeToggle`) out onto the first real page — `/kurin` and the five components it renders (`kurin-info-section.tsx`, `kurin-provid-section.tsx`, `kurin-hurtky-section.tsx`, `kurin-roster-section.tsx`, and the page shell itself) — replacing their current manual `Set`-based Card-accordions and native `<select>` with the real components, and wire an actual dark-mode mechanism (cookie + system-preference fallback) into the `ThemeToggle` Project 1 built but never connected to anything. No new dependency, no new base component — everything this wave needs already shipped in Project 1.

**Explicit Wave 1 boundary — deliberately NOT migrated:** `hurtok-settings-dialog.tsx` and `hurtok-detail-panel.tsx` (their own native `<select>`s and `Card` markup). They render inside the "Гуртки" section once a hurtok row is expanded, but their real home is the separate `/[kurinNumber]/hurtky/[slug]` page, which is out of scope here and belongs to a future wave. Expanding a hurtok in the new nested accordion will show the old `Card`-based member list and the old-styled "Налаштування" dialog underneath — a known, intentional, temporary seam until that wave migrates them. Do not touch `hurtok-settings-dialog.tsx`, `hurtok-detail-panel.tsx`, `app/hurtky/**`, or any of their e2e specs in this plan.

**Architecture — theming:** No `next-themes` or any other dependency. A `theme` cookie (`'light' | 'dark'`, no value = unset) is the persistence mechanism. `app/layout.tsx` becomes an async Server Component that reads the cookie via `cookies()` (already used this way in `app/api/session/route.ts`) and renders `<html class="dark">` directly when the cookie says `dark` — zero flash, deterministic, no script needed. When the cookie is **absent** (first-time visitor), the server cannot know the browser's OS preference, so it renders without the `dark` class and additionally emits one small blocking inline `<script>` in `<head>` that checks `window.matchMedia('(prefers-color-scheme: dark)')` and toggles the class before paint — the standard dependency-free FOUC-avoidance technique, confirmed supported by this Next version's own docs (`node_modules/next/dist/docs/01-app/02-guides/scripts.md`, "Inline Scripts" section). `ThemeToggle` itself becomes a self-contained controlled component: it no longer trusts a server-rendered `defaultChecked`, but syncs its visible position to whatever class `<html>` actually ended up with (cookie- or script-applied) via `useLayoutEffect` right after mount — this is the fix for Project 1's known bug ("always starts off, even if `<html>` already has `.dark`"), and runs before the browser paints so there's no visible flash. Clicking it still toggles the `.dark` class (as today) and additionally writes the `theme` cookie directly via `document.cookie` (no API route needed — it's not sensitive, not `httpOnly`).

**Why this is safe to build without `next-themes`:** the mechanism is three small, independently-testable pieces (cookie read in a Server Component, one inline script, one `useLayoutEffect` sync) rather than a context provider / hook library, matching Project 1's established "no new dependency, headless-primitive-or-nothing" posture.

**Verified against installed library source, not assumed:**
- `@base-ui/react/accordion`'s `AccordionRoot` defaults `multiple` to **`false`** (confirmed in `node_modules/@base-ui/react/accordion/root/AccordionRoot.d.ts`) — i.e. **exclusive single-open by default**. Both existing manual-`Set` accordions this plan replaces (the `/kurin` 5-section shell, and the nested hurtok list) currently allow several sections/rows open at once. Every task below that introduces an `AccordionRoot` MUST pass `multiple` explicitly, or it silently regresses to exclusive-open. This is called out again in each task that needs it — do not skip it.
- `AccordionItem` accepts a `disabled` prop (confirmed in `AccordionItem.d.ts`, inherited from the underlying Collapsible primitive) — used in Task 3 to keep slug-less hurtok rows inert, exactly as they are today.
- `Select.Root`'s `items` prop is required for `Select.Value` to resolve a label from a selected value (this is the same fact Project 1 Task 6 already discovered and fixed) — Task 5 below supplies it.
- `Select.Value` accepts a `placeholder` prop, shown when the resolved value is `null` (confirmed in `SelectValue.d.ts`) — this replaces the native `<option value="">Оберіть юнака</option>` placeholder pattern.
- Playwright's default `colorScheme` emulation is `'light'` (this repo's `playwright.config.ts` does not override it), so the new system-preference inline script will not add `.dark` under any existing or new e2e test — confirmed as a reason the theme work carries no e2e risk.

**Binding visual reference:** [`docs/superpowers/specs/assets/2026-10-02-notion-style-ui-overhaul-kurin-mockup.html`](../specs/assets/2026-10-02-notion-style-ui-overhaul-kurin-mockup.html) — already read in full for this plan. Its accordion section layout (icon + title + subtitle line, chevron), the "Інформація" section's label/value grid (`.km-info-grid`/`.km-info-row`), and the row-list treatment for Провід/Кадра/Юнацтво sections are the pattern Tasks 4 and 6 below follow. **Caveat, stated in the mockup file's own header comment:** it is "a frozen reference artifact... not a preview of the real React component tree" and its sample content (a `Назва` field, "Курінного призначає лише звʼязковий." helper text, `Активний`/`Новий` status pills) is illustrative fiction, not a literal spec of what to display — do not invent new copy, fields, or status badges this plan's tasks don't already call for just because the mockup shows them. Only its tokens (colors/radii/spacing/motion, already shipped in Project 1) and its structural layout *pattern* (label/value grid; icon+title+subtitle header) are binding.

**Also included — scaffold retirement:** Once this wave ships, all six Project 1 components have a real production consumer (`Accordion` × 2, `Select`, `RowList`/`Row`/`Avatar`/`Badge`). Project 1's own plan said its `/dev-ui-kit` test route is "temporary test scaffolding... Project 2's plan should delete or repurpose it once real pages use these components directly" — Task 7 does that deletion, including its 6 Playwright specs and the one-line `middleware.ts` allowlist entry it needed.

## Global Constraints

- **Do not touch** `hurtok-settings-dialog.tsx`, `hurtok-detail-panel.tsx`, anything under `app/hurtky/**`, or their e2e specs (`hurtok-settings.spec.ts`, `hurtok-add-junak-link.spec.ts`, `hurtok-create.spec.ts`, `hurtok-members.spec.ts`, `hurtok-archive.spec.ts`, `users-hurtok.spec.ts`, `users-new-hurtok-prefill.spec.ts`, `change-hurtok-request.spec.ts`). These own selects/Cards stay native shadcn-default until a future wave.
- **No new runtime dependencies.** No `next-themes`, no new `@radix-ui/*`, nothing beyond what Project 1 already installed.
- **Do not change the public prop API** of `button.tsx`, `card.tsx`, `dialog.tsx`, `input.tsx`, `label.tsx`, or the six Project 1 `components/ui/*` components (`accordion.tsx`, `select.tsx`, `row-list.tsx`, `avatar.tsx`, `badge.tsx`, `theme-toggle.tsx`) — **except** `theme-toggle.tsx` itself, whose internal implementation Task 1 changes (it becomes self-managed/controlled instead of forwarding `onCheckedChange`+`...props` straight through), while its external usage (`<ThemeToggle />`, no required props) stays identical, so `app/dev-ui-kit/page.tsx`'s existing usage keeps compiling unchanged until Task 7 deletes that file anyway.
- **`AccordionRoot` usages introduced by this plan must pass `multiple`** (see "Verified against installed library source" above) everywhere the current manual-`Set` implementation allows simultaneous multi-open — that is both the `/kurin` page shell (Task 2) and the nested hurtok list (Task 3). Getting this wrong silently changes real user-facing behavior (sections start clobbering each other shut) with no type error and no obviously-failing test, so check it by hand too: open two sections, confirm both stay open.
- **Theme cookie name is exactly `theme`**, values exactly `'light'` / `'dark'` (string), unset = system-preference fallback. `path=/`, a long `max-age` (e.g. one year, `31536000`), no `httpOnly` (read by both server and the client-side toggle), `samesite=lax`. Do not introduce a `'system'` value stored in the cookie — once a user clicks the toggle, their cookie is explicitly `'light'` or `'dark'` from then on; only a *never-set* cookie means "follow system", matching `ThemeToggle`'s binary (not tri-state) nature.
- **`apps/web/playwright.config.ts`'s `use.launchOptions.executablePath` tweak must be present before running Playwright, and never committed** (same sandbox-only requirement as Project 1; `git status` should show it modified-but-unstaged before and after every task's test run).
- `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test"` must prefix every API Jest e2e run; never run that suite and Playwright concurrently (shared `plast_test` DB).
- Every task that touches a `.tsx` file ends with `npx tsc --noEmit` clean (run from `apps/web`) before moving on.
- Keep the diff additive/surgical per task — do not reformat or restructure code this plan doesn't ask you to touch (e.g. don't touch `kurin-provid-section.tsx`'s `ProvidSlot` layout beyond its `<select>`, don't touch `useKurin`/`useUsers`/`useKurinPositions` query hooks at all — this is a pure presentation-layer migration, zero backend/API changes anywhere in this plan).

---

## Task 1: Theme mechanism — cookie + system preference + self-syncing `ThemeToggle` + `Nav` wiring

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/components/ui/theme-toggle.tsx`
- Modify: `apps/web/components/nav.tsx`

**Interfaces:**
- Produces: a working dark-mode toggle visible in `Nav` on every authenticated page, backed by a `theme` cookie, with no visible flash and no hydration-mismatch warning.
- Consumes: nothing new — `cookies()` from `next/headers` (already used in `apps/web/app/api/session/route.ts` and `apps/web/app/api/backend/[...path]/route.ts`), `cn()` from `@/lib/utils`.

- [x] **Step 1: Rewrite `apps/web/app/layout.tsx`**

Current file is a plain (non-async) function component. Replace its entire contents with:

```tsx
import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { QueryProvider } from '@/components/query-provider';
import { Nav } from '@/components/nav';
import { cn } from '@/lib/utils';

const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'єПластун',
  description: 'Облік проб та структури куреня',
  manifest: '/manifest.json',
};

// Runs before hydration, only when no `theme` cookie exists yet (first-time
// visitor). Mirrors the system color scheme so there's no flash of the
// wrong theme before ThemeToggle's own useLayoutEffect sync takes over.
const THEME_PREFERENCE_SCRIPT = `(function(){try{if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = cookieStore.get('theme')?.value;

  return (
    <html lang="uk" className={cn(manrope.variable, theme === 'dark' && 'dark')}>
      <head>
        {theme !== 'light' && theme !== 'dark' && (
          <script dangerouslySetInnerHTML={{ __html: THEME_PREFERENCE_SCRIPT }} />
        )}
      </head>
      <body>
        <QueryProvider>
          <Nav />
          <main className="p-4">{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}
```

Notes for the implementer:
- This makes `RootLayout` `async` — that's required to `await cookies()`; it's a Server Component today (no `'use client'` at the top) so this is allowed.
- The inline `<script>` only renders when the cookie is neither `'light'` nor `'dark'` (i.e. unset) — once a user has ever clicked the toggle, the server already knows the answer and renders the class directly, so the script disappears from the response entirely for them.
- Do not add an `id` to the `<script>` tag — that's only required when using the `next/script` `<Script>` component (which defers/optimizes loading); a plain inline `<script>` in `<head>` runs synchronously in document order, which is what's needed here (must run before first paint).

- [x] **Step 2: Rewrite `apps/web/components/ui/theme-toggle.tsx`**

Replace its entire contents with:

```tsx
'use client';

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function setThemeCookie(value: "light" | "dark") {
  document.cookie = `theme=${value}; path=/; max-age=31536000; samesite=lax`
}

function ThemeToggle({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, "checked" | "defaultChecked" | "onCheckedChange">) {
  const [checked, setChecked] = React.useState(false)

  // Syncs the switch's visual position to whatever `.dark` state the
  // cookie (SSR) or the system-preference inline script (app/layout.tsx)
  // already applied to <html>, before the browser paints — this is what
  // fixes the toggle always rendering "off" even when the page loaded dark.
  React.useLayoutEffect(() => {
    setChecked(document.documentElement.classList.contains("dark"))
  }, [])

  return (
    <SwitchPrimitive.Root
      data-slot="theme-toggle"
      aria-label="Перемкнути темну тему"
      checked={checked}
      className={cn(
        "relative inline-flex h-6 w-[42px] shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted outline-none transition-colors data-[checked]:bg-accent-soft focus-visible:ring-3 focus-visible:ring-accent/40",
        className
      )}
      onCheckedChange={(next) => {
        document.documentElement.classList.toggle("dark", next)
        setThemeCookie(next ? "dark" : "light")
        setChecked(next)
      }}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[18px] translate-x-0.5 rounded-full bg-background shadow transition-transform duration-260 ease-[cubic-bezier(.4,0,.2,1)] data-[checked]:translate-x-[20px]" />
    </SwitchPrimitive.Root>
  )
}

export { ThemeToggle }
```

Notes:
- `checked`/`onCheckedChange` are now owned internally — the component no longer forwards an external `onCheckedChange` (nothing in the codebase passes one in; `app/dev-ui-kit/page.tsx` calls `<ThemeToggle />` with zero props, so this is not a breaking change for that file until Task 7 deletes it).
- `React.useLayoutEffect` (not `useEffect`) is required — it runs synchronously after the DOM is updated but before the browser paints, which is what makes the correction invisible to the user. Using `useEffect` here would be a visible one-frame flash on every page load.
- Server-rendered and first-client-render `checked` are both `false` — this means hydration never mismatches (no warning), and the `useLayoutEffect` correction is what fixes it up a moment later, before paint.

- [x] **Step 3: Add `ThemeToggle` to `apps/web/components/nav.tsx`**

Import it and render it next to the existing "Вийти" button:

```tsx
import { ThemeToggle } from '@/components/ui/theme-toggle';
```

```tsx
      <Button variant="outline" size="sm" onClick={handleLogout}>
        Вийти
      </Button>
```

becomes:

```tsx
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Вийти
        </Button>
      </div>
```

(Wrap just those two elements in the new `div` — the rest of `Nav`'s JSX, including the outer `<nav className="flex items-center justify-between ...">`, is unchanged.)

- [x] **Step 4: Verify**

Run `npx tsc --noEmit` from `apps/web` — must be clean.

Run the existing `apps/web/e2e/dev-ui-kit-theme-toggle.spec.ts` (still present until Task 7) and confirm it still passes unmodified — it only asserts click-toggles-the-class-and-background-color behavior, which this rewrite preserves.

Manually verify in a real browser session (or via a throwaway Playwright script) that: (a) with no `theme` cookie, a system-dark browser renders dark on first paint with no flash; (b) clicking the toggle in `Nav` on any authenticated page persists across a hard reload (cookie round-trip); (c) `document.cookie` after a click contains `theme=dark` or `theme=light` as expected.

---

## Task 2: `/kurin` page shell — manual accordion → real `AccordionRoot`

**Files:**
- Modify: `apps/web/app/kurin/page.tsx`

**Interfaces:**
- Consumes: `AccordionRoot`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` from `@/components/ui/accordion`.
- No change to any of the four section components' own props — `KurinInfoSection`, `KurinProvidSection`, `KurinHurtkySection`, `KurinRosterSection` keep being rendered exactly as today; only what wraps them changes.

- [x] **Step 1: Replace the manual `Set`-based accordion with `AccordionRoot`**

Replace `KurinPageContent`'s body (from `const hasFullAccess = ...` down) with:

```tsx
function KurinPageContent() {
  const { data: session } = useSession();

  const hasFullAccess =
    session?.role === 'ZVYAZKOVYI' || session?.isKurinniy || (session?.positions ?? []).includes('SUDDIA');

  const sections: { key: string; title: string; render: () => React.ReactNode }[] = [
    { key: 'info', title: 'Інформація по куреню', render: () => <KurinInfoSection /> },
    { key: 'provid', title: 'Провід куреня', render: () => <KurinProvidSection /> },
    { key: 'hurtky', title: 'Гуртки', render: () => <KurinHurtkySection /> },
    ...(hasFullAccess
      ? [
          { key: 'vykhovnyky', title: 'Кадра виховників', render: () => <KurinRosterSection role="VYKHOVNYK" /> },
          { key: 'junatstvo', title: 'Список юнацтва', render: () => <KurinRosterSection role="JUNAK" /> },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Курінь</h1>
      <AccordionRoot multiple>
        {sections.map((section) => (
          <AccordionItem key={section.key} value={section.key}>
            <AccordionTrigger>{section.title}</AccordionTrigger>
            <AccordionContent>{section.render()}</AccordionContent>
          </AccordionItem>
        ))}
      </AccordionRoot>
    </div>
  );
}
```

- `multiple` is required here — see Global Constraints. Without it, opening "Гуртки" would silently close "Інформація по куреню" if it was already open, which is a real behavior regression from today's independent per-section `Set`.
- The `SectionKey` type alias and the `toggle`/`expanded`/`useState` plumbing are now entirely replaced by the Accordion's own internal state — delete the `SectionKey` type, the `expanded` state, and the `toggle` function.
- `AccordionContent` always renders its children (it controls visibility via height/CSS, not conditional mounting) — unlike the old `isExpanded && <CardContent>...` pattern which only mounted content once expanded. This means all 5 (or 3) section components now mount immediately on page load instead of lazily on first expand. Confirm this is acceptable: each section component already guards its own loading/error/empty states internally (`if (isLoading) return ...`), and each fetches via React Query hooks that are cheap to have mounted-but-collapsed (the existing `/dev-ui-kit` nested-accordion demo and the already-shipped `/hurtky` accordion page — see `kurin-hurtky-section.tsx`'s own current `isExpanded && h.slug && <HurtokDetailPanel .../>` pattern used *inside* a Card, not `AccordionContent` — establish this is a fine, already-used-elsewhere data-fetching pattern in this codebase, not a new risk). No action needed beyond being aware of it.

- [x] **Step 2: Update imports**

Add the Accordion import, remove the now-unused `Card`/`CardAction`/`CardContent`/`CardHeader`/`CardTitle` import and the `useState` import (still need `Suspense` and `useSession`):

```tsx
'use client';

import { Suspense } from 'react';
import { useSession } from '@/lib/session-client';
import { AccordionRoot, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { KurinInfoSection } from '@/components/kurin-info-section';
import { KurinProvidSection } from '@/components/kurin-provid-section';
import { KurinHurtkySection } from '@/components/kurin-hurtky-section';
import { KurinRosterSection } from '@/components/kurin-roster-section';
```

`KurinPage` (the outer `Suspense` wrapper) is unchanged.

- [x] **Step 3: Verify**

`npx tsc --noEmit` clean.

Run (against the real dev server + DB, `DATABASE_URL_TEST` prefixed) `e2e/kurin-accordion-full-tier.spec.ts`, `e2e/kurin-settings.spec.ts`, and `e2e/kurinniy-junak.spec.ts` — all three should pass unmodified (they interact via `getByText(sectionTitle).click()`, which still works since `AccordionTrigger` is a `<button>` containing that text). Pay particular attention to `kurin-accordion-full-tier.spec.ts`: it expands "Гуртки" then "Кадра виховників" then "Список юнацтва" in sequence while asserting each stays visible — this is the test that will catch a missing `multiple` prop, since without it each new expand would collapse the previous one and the later assertions (`await expect(page.getByText('Петренко Петро')).toBeVisible()`, checked after "Список юнацтва" expands, while "Гуртки" was expanded earlier in the same test) could still pass incidentally since the test doesn't re-check "Гуртки" stays open — manually also confirm by opening two sections and eyeballing that both stay expanded, don't rely on this test alone to catch the regression.

---

## Task 3: `kurin-hurtky-section.tsx` — nested `AccordionRoot` for the hurtok list

**Files:**
- Modify: `apps/web/components/kurin-hurtky-section.tsx`

**Interfaces:**
- Consumes: `AccordionRoot`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` from `@/components/ui/accordion` (nested inside the outer "Гуртки" `AccordionItem` from Task 2 — same nesting pattern already proven in `app/dev-ui-kit/page.tsx`'s "Accordion (with nesting)" demo and reviewed clean in Project 1 Task 5).
- No change to `useHurtky`, `useVykhovnykAssignments`, `useUsers` hooks or `HurtokDetailPanel` (out of Wave 1 scope — see Global Constraints).

- [x] **Step 1: Replace the manual `Set`-based expand/collapse with `AccordionRoot`**

Replace the component body from `const [expandedSlugs, setExpandedSlugs] = useState...` down (keeping everything above `KurinHurtkySection`'s `return` unchanged, since `vykhovnykNameByHurtokId` is still needed):

```tsx
export function KurinHurtkySection() {
  const { data: session } = useSession();
  const {
    data: hurtky,
    isLoading: hurtkyLoading,
    isError: hurtkyIsError,
    error: hurtkyError,
  } = useHurtky();
  const { data: allVykhovnykAssignments } = useVykhovnykAssignments();
  const { data: vykhovnykUsers } = useUsers({ role: 'VYKHOVNYK' });

  if (hurtkyLoading) return <p>Завантаження...</p>;
  if (hurtkyIsError) {
    return <p className="text-sm text-destructive">{accessErrorMessage(hurtkyError)}</p>;
  }

  const displayedHurtky: Hurtok[] = hurtky ?? [];

  const vykhovnykNameByHurtokId = Object.fromEntries(
    (allVykhovnykAssignments ?? []).map((a) => {
      const v = (vykhovnykUsers ?? []).find((u) => u.id === a.vykhovnykId);
      return [a.hurtokId, v ? `${v.lastName} ${v.firstName}` : null];
    }),
  );

  return (
    <div className="space-y-4">
      {session?.role === 'ZVYAZKOVYI' && (
        <Link href="/hurtky/new">
          <Button size="sm">Новий гурток</Button>
        </Link>
      )}
      <AccordionRoot multiple>
        {displayedHurtky.map((h) => (
          <AccordionItem key={h.id} value={h.slug ?? h.id} disabled={!h.slug}>
            <AccordionTrigger>
              {h.name}
              {h.number ? ` №${h.number}` : ''}
              {vykhovnykNameByHurtokId[h.id] && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  · {vykhovnykNameByHurtokId[h.id]}
                </span>
              )}
            </AccordionTrigger>
            {h.slug && (
              <AccordionContent>
                <HurtokDetailPanel slug={h.slug} />
              </AccordionContent>
            )}
          </AccordionItem>
        ))}
      </AccordionRoot>
    </div>
  );
}
```

Notes:
- `multiple` required again (same reasoning as Task 2 — today's `expandedSlugs` is a `Set`, letting several hurtok rows be open simultaneously).
- `value={h.slug ?? h.id}` — `h.id` is always present and unique, used as a safe fallback `value` for the rare hurtok with a `null` slug so `AccordionItem` always has a stable, unique identity even though that item is `disabled` and never actually opens.
- `disabled={!h.slug}` — preserves today's exact behavior for slug-less hurtky: the row's header currently does nothing on click (`h.slug && toggle(h.slug)`) and never shows a detail panel. `disabled` on `AccordionItem` makes the trigger inert (no open/close, no hover affordance) instead of expanding into an empty panel — confirmed as a real, supported prop in `AccordionItem.d.ts` (see Global Constraints). Omitting `<AccordionContent>` entirely when there's no slug (rather than rendering it empty) keeps this honest even if `disabled` behaves unexpectedly.
- `AccordionTrigger`'s children here mix plain strings and a conditional `<span>`, exactly like the original `<CardTitle>` did — no change needed to that part beyond moving it from `CardTitle` into `AccordionTrigger`.

- [x] **Step 2: Update imports**

Remove `useState` (no longer used) and the `Card`/`CardAction`/`CardContent`/`CardHeader`/`CardTitle` import; add the Accordion import:

```tsx
'use client';

import Link from 'next/link';
import { useHurtky } from '@/lib/queries/hurtky';
import { useVykhovnykAssignments } from '@/lib/queries/vykhovnyk-assignments';
import { useUsers } from '@/lib/queries/users';
import { useSession } from '@/lib/session-client';
import { AccordionRoot, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';
import { HurtokDetailPanel } from '@/components/hurtok-detail-panel';
import type { Hurtok } from '@/lib/types';
```

Also delete the now-unused `toggle` function entirely (it's removed as part of Step 1's rewrite above, called out separately here so it isn't missed).

- [x] **Step 3: Verify**

`npx tsc --noEmit` clean.

Re-run `e2e/kurin-accordion-full-tier.spec.ts` (expands "Гуртки" then clicks the hurtok name "Орлики" and asserts a member becomes visible — exercises exactly this nested accordion). Also manually confirm two hurtok rows can be expanded at the same time (the `multiple` check, same caveat as Task 2 — the existing test doesn't independently re-assert this).

---

## Task 4: `kurin-roster-section.tsx` — `RowList`/`Row`/`Avatar`/`Badge`

**Files:**
- Modify: `apps/web/lib/utils.ts` (add a small `getInitials` helper — no existing one exists anywhere in the codebase, confirmed by search)
- Modify: `apps/web/components/kurin-roster-section.tsx`

**Interfaces:**
- Produces: `getInitials(firstName: string, lastName: string): string` in `@/lib/utils`, usable by any future row-list migration (Task 6 reuses nothing from here, but this is a generically useful helper, not page-specific, hence `lib/utils.ts` not a new file).
- Consumes: `RowList`, `Row` from `@/components/ui/row-list`, `Badge` from `@/components/ui/badge`.

- [x] **Step 1: Add `getInitials` to `apps/web/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(firstName: string, lastName: string): string {
  return `${lastName.charAt(0)}${firstName.charAt(0)}`.toUpperCase()
}
```

(Order is last-initial-then-first, matching this app's existing `"${lastName} ${firstName}"` display convention used everywhere else in the codebase — e.g. `kurin-roster-section.tsx` itself, `kurin-provid-section.tsx`, `hurtok-detail-panel.tsx`.)

- [x] **Step 2: Replace the `Card`+`Link` rows in `kurin-roster-section.tsx`**

Replace the `return` statement with:

```tsx
  return (
    <div className="space-y-4">
      {canCreate && (
        <Link href={`/users/new?role=${role}`}>
          <Button size="sm">Додати людину</Button>
        </Link>
      )}
      <RowList>
        {(users ?? []).map((u) => (
          <Link key={u.id} href={`/users/${u.id}`}>
            <Row initials={getInitials(u.firstName, u.lastName)} title={`${u.lastName} ${u.firstName}`}>
              <Badge variant="neutral">{ROLE_LABELS[u.role]}</Badge>
            </Row>
          </Link>
        ))}
      </RowList>
    </div>
  );
```

Note: `Row` is a `data-slot="row"` `<div>`, not an anchor — keep the existing pattern of wrapping it in `<Link>` (exactly as the old code wrapped `<Card>` in `<Link>`); `Row`'s own markup/hover styles don't need to know about the link, same as before.

- [x] **Step 3: Update imports**

```tsx
'use client';

import Link from 'next/link';
import { useSession } from '@/lib/session-client';
import { useUsers } from '@/lib/queries/users';
import { ROLE_LABELS } from '@/lib/role-labels';
import { RowList, Row } from '@/components/ui/row-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/lib/utils';
import { accessErrorMessage } from '@/lib/error-message';
import type { Role } from '@/lib/types';
```

(`Card`/`CardContent` import is removed; everything else in the file — the `canCreate` logic, the component signature — is unchanged.)

- [x] **Step 4: Verify**

`npx tsc --noEmit` clean.

Run `e2e/kurin-accordion-full-tier.spec.ts` (asserts `getByText('Овник Вих')` and `getByText('Петренко Петро')` visible after expanding "Кадра виховників" / "Список юнацтва" — both still just text-content assertions, unaffected by the `Card`→`Row` swap). Also grep the full e2e suite for any other spec asserting on this page's old DOM structure beyond text content (e.g. role="link" names) before running the full suite in Task 7 — a quick `grep -rn "Кадра виховників\|Список юнацтва" apps/web/e2e/` to confirm no other spec depends on structure here.

---

## Task 5: `kurin-provid-section.tsx` — native `<select>` → `Select`

**Files:**
- Modify: `apps/web/components/kurin-provid-section.tsx`
- Modify: `apps/web/e2e/positions.spec.ts`

**Interfaces:**
- Consumes: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` from `@/components/ui/select`.
- `ProvidSlot`'s own exported behavior (the `assign`/`remove` mutations, the reassignment-conflict `window.confirm`, the `canEdit` gating) is **unchanged** — per the agreed design, `ProvidSlot`'s overall layout (label + value-or-control + button) stays its own bespoke markup, not forced into `Row`. Only the native `<select>` inside the "can assign" branch is swapped.

- [x] **Step 1: Replace the native `<select>` block in `ProvidSlot`**

Current code (inside the `canEdit` branch of `ProvidSlot`):

```tsx
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 rounded-md border px-2 py-1 text-sm"
            >
              <option value="">Оберіть юнака</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.lastName} {c.firstName}
                </option>
              ))}
            </select>
```

Replace with:

```tsx
            <Select
              value={selectedUserId || null}
              onValueChange={(value) => setSelectedUserId(value ?? '')}
              items={Object.fromEntries(candidates.map((c) => [c.id, `${c.lastName} ${c.firstName}`]))}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Оберіть юнака" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.lastName} {c.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
```

Notes:
- `selectedUserId` stays a plain `string` (`useState('')`) exactly as today — `value={selectedUserId || null}` converts the empty-string "nothing selected" sentinel to `null`, which is what `Select.Root`/`Select.Value` expect for "no selection" (confirmed in `SelectRoot.d.ts`: `value?: ... | null`). `onValueChange`'s `value ?? ''` converts back, so every other line in `ProvidSlot` (`disabled={!selectedUserId}`, `assign.mutate({ userId: selectedUserId, ... })`, the `onSuccess: () => setSelectedUserId('')` reset) needs **zero changes**.
- `items={...}` is required for `SelectValue` to resolve and display the chosen candidate's name in the trigger (this is the same fact Project 1 Task 6 discovered: a bare `<SelectValue />` needs the `Root`'s `items` map, it doesn't auto-derive labels from `<SelectItem>` children). Rebuilding this object on every render is fine — `candidates` is already a small, per-render-derived array (`junaky ?? []`), same cost profile as the `.map()` already done for the native `<option>`s today.
- `SelectTrigger`'s `flex-1` className replaces the native select's `flex-1 rounded-md border px-2 py-1 text-sm` — `SelectTrigger` already has its own `rounded-md border ... text-sm` baked in (see `select.tsx`), so only the layout-affecting `flex-1` needs to be passed through.
- No `aria-label` is added to `SelectTrigger` — the native `<select>` it replaces had none either, and the e2e tests (Step 3 below) locate it by DOM proximity to the slot's label text, not by accessible name, so parity is exact either way.

- [x] **Step 2: Update imports**

```tsx
'use client';

import { useState } from 'react';
import { useKurinPositions, useAssignPosition, useRemovePosition } from '@/lib/queries/positions';
import { useUsers } from '@/lib/queries/users';
import { useSession } from '@/lib/session-client';
import { accessErrorMessage } from '@/lib/error-message';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { KurinPosition, PositionType } from '@/lib/types';
```

(`Card`/`CardContent`/`CardHeader`/`CardTitle` stay — the outer `KurinProvidSection` still wraps everything in a single `<Card>` with a `<CardTitle>Провід куреня</CardTitle>`, per the agreed design: `ProvidSlot`'s own per-row markup is what's touched, not `KurinProvidSection`'s wrapper. Do not remove this `Card` import.)

- [x] **Step 3: Rewrite the 4 `selectOption` interactions in `e2e/positions.spec.ts`**

`Select` is a headless popup component now, not a native `<select>` — Playwright's `.selectOption()` only works on real `<select>` elements, so these calls must become click-the-trigger-then-click-the-option, exactly the pattern already proven working against this same `Select` component in `e2e/dev-ui-kit-select.spec.ts` (`trigger.click()` then `page.getByRole('option', { name: ... }).click()` — the popup renders via `Select.Portal` to `document.body`, so the option is queried at the page level, not scoped under the slot's `.locator('..')`).

Four call sites to change (line numbers from the current file):

Line 26:
```ts
await page.getByText('Курінний').locator('..').getByRole('combobox').selectOption({ label: 'Петренко Петро' });
```
becomes:
```ts
await page.getByText('Курінний').locator('..').getByRole('combobox').click();
await page.getByRole('option', { name: 'Петренко Петро' }).click();
```

Line 55:
```ts
await page.getByText('Курінний').locator('..').getByRole('combobox').selectOption({ label: 'Іваненко Іван' });
```
becomes:
```ts
await page.getByText('Курінний').locator('..').getByRole('combobox').click();
await page.getByRole('option', { name: 'Іваненко Іван' }).click();
```

Line 59:
```ts
await page.getByText('Суддя').locator('..').getByRole('combobox').selectOption({ label: 'Іваненко Іван' });
```
becomes:
```ts
await page.getByText('Суддя').locator('..').getByRole('combobox').click();
await page.getByRole('option', { name: 'Іваненко Іван' }).click();
```

Line 117:
```ts
await page.getByText('Писар').locator('..').getByRole('combobox').selectOption({ label: 'Петренко Петро' });
```
becomes:
```ts
await page.getByText('Писар').locator('..').getByRole('combobox').click();
await page.getByRole('option', { name: 'Петренко Петро' }).click();
```

Every other line in the file (the `.locator('..').getByRole('combobox')` visibility/count assertions at lines 32, 70, 76, 113; the `window.confirm` dialog handling; the `getByRole('button', { name: ... })` clicks) stays exactly as-is — `Select`'s trigger still has `role="combobox"` (confirmed: this is exactly the role `dev-ui-kit-select.spec.ts` already successfully queries on the same component), so those assertions continue to pass unmodified.

- [x] **Step 4: Verify**

`npx tsc --noEmit` clean.

Run `e2e/positions.spec.ts` on its own first (all 3 tests) — this is the test most likely to need a second look if the click-sequencing assumption doesn't hold exactly (e.g. if a still-open popup from a previous interaction intercepts the next click; the existing `dev-ui-kit-select.spec.ts` only ever opens one popup per test, so a multi-interaction test like `positions.spec.ts`'s second test — which opens two different selects in sequence — is new territory and deserves actual observation, not just an assumption that it'll work).

---

## Task 6: `kurin-info-section.tsx` — merge 3 Cards into one section

**Files:**
- Modify: `apps/web/components/kurin-info-section.tsx`
- Modify: `apps/web/e2e/kurin-accordion-full-tier.spec.ts` (one assertion, see Step 5)

**Interfaces:**
- No hook or prop changes — `useKurin`, `useChangeProbyProgram`, `useChangeKurinNumber`, `useSession`, `useGoogleDriveStatus`, `useConnectGoogleDrive`, `useSetGoogleDriveFolder`, `fetchGoogleDrivePickerToken`, `openGoogleDriveFolderPicker` all stay exactly as called today. This task is pure markup restructuring: 3 `<Card>`s → 3 plain subsections inside one `<div>` (this component is rendered as the single child of Task 2's "Інформація по куреню" `AccordionContent` — it must not render its own nested `Card`/accordion chrome).

- [x] **Step 1: Replace the outer structure and the "Дані куреня" card**

Current:
```tsx
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Дані куреня</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>Номер: {kurin.kurinNumber}</p>
          <p>Станиця: {kurin.stanytsia}</p>
          <p>Стать: {kurin.gender === 'MALE' ? 'Чоловіча' : 'Жіноча'}</p>
          {canChangeProgram && (
            <div className="space-y-2">
              ...
            </div>
          )}
        </CardContent>
      </Card>
```

Replace with:
```tsx
  return (
    <div className="space-y-6 text-sm">
      <div className="space-y-4">
        <h3 className="font-heading text-sm font-semibold">Дані куреня</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Номер</span>
            <span className="font-medium">{kurin.kurinNumber}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Станиця</span>
            <span className="font-medium">{kurin.stanytsia}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Стать</span>
            <span className="font-medium">{kurin.gender === 'MALE' ? 'Чоловіча' : 'Жіноча'}</span>
          </div>
        </div>
        {canChangeProgram && (
          <div className="space-y-2">
            <Label htmlFor="newKurinNumber">Змінити номер куреня</Label>
            <Input
              id="newKurinNumber"
              value={newKurinNumber}
              onChange={(e) => setNewKurinNumber(e.target.value)}
              placeholder={kurin.kurinNumber}
            />
            <Button
              size="sm"
              disabled={!newKurinNumber || changeKurinNumber.isPending}
              onClick={() =>
                changeKurinNumber.mutate(newKurinNumber, { onSuccess: () => setNewKurinNumber('') })
              }
            >
              Змінити номер
            </Button>
            {changeKurinNumber.isError && (
              <p className="text-sm text-destructive">
                {changeKurinNumber.error instanceof ApiError && changeKurinNumber.error.status === 409
                  ? 'Цей номер уже зайнятий.'
                  : accessErrorMessage(changeKurinNumber.error)}
              </p>
            )}
          </div>
        )}
      </div>
```

(The `canChangeProgram` block's own JSX content is byte-for-byte unchanged from the current file — only re-indented one level since it's no longer inside `<CardContent>`. The 3-field `grid-cols-2` label/value layout follows the binding mockup's `.km-info-grid`/`.km-info-row` pattern — label in `text-xs text-muted-foreground`, value in `font-medium` — adapted to this component's actual 3 fields (Номер/Станиця/Стать), not the mockup's fictional `Назва`/`Пробна програма`/`Google Drive`-as-pill set, which belong to the next two subsections below instead.)

- [x] **Step 2: Replace the "Програма проб" card**

Current:
```tsx
      <Card>
        <CardHeader>
          <CardTitle>Програма проб</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          ...
        </CardContent>
      </Card>
```

Replace with:
```tsx
      <div className="space-y-4">
        <h3 className="font-heading text-sm font-semibold">Програма проб</h3>
        ... (the exact same children that were inside <CardContent className="space-y-4">, unchanged)
      </div>
```

i.e. only the wrapping tags change (`Card`+`CardHeader`+`CardTitle`+`CardContent` → a `div` + `h3`), the `<p className="text-sm text-muted-foreground">Поточна програма: ...` paragraph and the entire `canChangeProgram` radio-button block underneath it (including the `window.confirm` dialog on the "Змінити програму" button) are copied verbatim.

- [x] **Step 3: Replace the "Google Drive" card**

Current:
```tsx
      {canChangeProgram && (
        <Card>
          <CardHeader>
            <CardTitle>Google Drive</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            ...
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

Replace with:
```tsx
      {canChangeProgram && (
        <div className="space-y-4">
          <h3 className="font-heading text-sm font-semibold">Google Drive</h3>
          ... (the exact same children that were inside <CardContent className="space-y-4 text-sm">, unchanged)
        </div>
      )}
    </div>
  );
}
```

All of the Google Drive branch's content (the `driveConnected`/`driveError` query-param banners, the connected/not-connected conditional, the `handlePickFolder` button, `pickerError`) is copied verbatim — only the wrapping `Card`/`CardHeader`/`CardTitle`/`CardContent` is removed in favor of the `div`+`h3` pattern.

- [x] **Step 4: Update imports**

Remove the now-unused `Card`/`CardContent`/`CardHeader`/`CardTitle` import (no `Card` family component is used anywhere in this file anymore):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useKurin, useChangeProbyProgram, useChangeKurinNumber } from '@/lib/queries/kurin';
import { useSession } from '@/lib/session-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accessErrorMessage } from '@/lib/error-message';
import { ApiError } from '@/lib/api-client';
import { useGoogleDriveStatus, useConnectGoogleDrive, useSetGoogleDriveFolder, fetchGoogleDrivePickerToken } from '@/lib/queries/google-drive';
import { openGoogleDriveFolderPicker } from '@/lib/google-picker';
```

Everything above `return (` in the component (all the hooks, `handlePickFolder`, the `useEffect`, the `isLoading`/`!kurin` early returns) is unchanged.

- [x] **Step 5: Fix the one e2e assertion Step 1 breaks**

`e2e/kurin-accordion-full-tier.spec.ts` currently has (line 35):

```ts
  await page.getByText('Інформація по куреню').click();
  await expect(page.getByText(/Номер:/)).toBeVisible();
```

This matches the old single text node `"Номер: {value}"` (one `<p>`, colon included). Step 1 replaces it with a label/value pair as two separate `<span>`s — `<span>Номер</span>` (no colon) and the value in its own sibling `<span>` — so this regex no longer matches anything. Update it to:

```ts
  await page.getByText('Інформація по куреню').click();
  await expect(page.getByText('Номер', { exact: true })).toBeVisible();
```

- [x] **Step 6: Verify**

`npx tsc --noEmit` clean.

Run `e2e/kurin-accordion-full-tier.spec.ts` (with Step 5's fix applied). Also run `e2e/kurin-settings.spec.ts` (its `"Поточна програма: Стара"`/`"Поточна програма: Нова"` text assertions are untouched by this task's markup-only change, so it should pass with no edits — confirm, don't assume) and `e2e/kurinniy-junak.spec.ts`.

---

## Task 7: Retire the `/dev-ui-kit` scaffold + final whole-branch regression

**Files:**
- Delete: `apps/web/app/dev-ui-kit/page.tsx`
- Delete: `apps/web/e2e/dev-ui-kit-accordion.spec.ts`, `dev-ui-kit-badge.spec.ts`, `dev-ui-kit-theme-toggle.spec.ts`, `dev-ui-kit-row-list.spec.ts`, `dev-ui-kit-select.spec.ts`, `dev-ui-kit-avatar.spec.ts`
- Modify: `apps/web/middleware.ts` (remove the now-unneeded `/dev-ui-kit` entry from `PUBLIC_PATHS`)

**Rationale:** Project 1's own plan explicitly deferred this cleanup to "Project 2['s plan]... once real pages use these components directly." After Tasks 1–6, every one of the 6 components (`Accordion` ×2 real usages, `Select`, `RowList`/`Row`/`Avatar`/`Badge`) has a production consumer on `/kurin`, so the scaffold and its specs are now pure dead weight, and the one-line `middleware.ts` exception Project 1 needed for it is no longer needed either.

- [x] **Step 1: Delete the scaffold route and its 6 specs**

```
rm apps/web/app/dev-ui-kit/page.tsx
rmdir apps/web/app/dev-ui-kit  # only if now empty
rm apps/web/e2e/dev-ui-kit-accordion.spec.ts apps/web/e2e/dev-ui-kit-badge.spec.ts apps/web/e2e/dev-ui-kit-theme-toggle.spec.ts apps/web/e2e/dev-ui-kit-row-list.spec.ts apps/web/e2e/dev-ui-kit-select.spec.ts apps/web/e2e/dev-ui-kit-avatar.spec.ts
```

- [x] **Step 2: Remove the `/dev-ui-kit` entry from `middleware.ts`**

```ts
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/confirm-email-change', '/privacy', '/terms', '/dev-ui-kit'];
```
becomes:
```ts
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/confirm-email-change', '/privacy', '/terms'];
```

- [x] **Step 3: `tsc` + full lint pass**

`npx tsc --noEmit` from `apps/web` — clean (no leftover import of the deleted page anywhere; there shouldn't be any, since nothing ever linked to `/dev-ui-kit`).

`npm run lint` — confirm no new errors introduced by this plan's 6 changed component files or the 2 new/changed e2e specs (`positions.spec.ts`, `kurin-accordion-full-tier.spec.ts`). Pre-existing lint errors in files this plan never touched are out of scope, same policy as Project 1 Task 9.

- [x] **Step 4: Full regression**

Before deleting anything in Step 1, record the current baseline test count: `grep -h "^test(" apps/web/e2e/*.spec.ts | wc -l` (68 at the time this plan was written — confirm it's still 68 before you start, in case something changed since). The 6 deleted files contain 8 `test(...)` cases between them, not 6 (`dev-ui-kit-accordion.spec.ts` alone has 3; the other 5 have 1 each) — verify this with the same `grep -c "^test(" apps/web/e2e/dev-ui-kit-*.spec.ts` command before deleting, don't assume file-count equals test-count. This plan adds no new spec *files* and no new `test(...)` cases to any file it edits (`positions.spec.ts` and `kurin-accordion-full-tier.spec.ts` keep the same number of tests, just different bodies), so after Step 1 the expected total is baseline **− 8**. Run the entire Playwright suite (`cd apps/web && npx playwright test`, with the sandbox `executablePath` tweak in place) and confirm the final count matches that arithmetic exactly, all passing. Pay special attention to the full set this plan touches: `kurin-accordion-full-tier.spec.ts`, `kurin-settings.spec.ts`, `kurinniy-junak.spec.ts`, `positions.spec.ts` — plus the full remaining suite, to catch anything this plan didn't anticipate touching `/kurin`'s DOM.

Run the full API Jest e2e suite too (`DATABASE_URL_TEST=postgresql://plast:plast@localhost:5432/plast_test npm run test:e2e` from `apps/api`, **not concurrently with Playwright**) — this plan makes zero backend changes, so the count should be identical to the pre-plan baseline (289/289 per Project 1's last count, though re-confirm the actual current count since other plans may have shipped since).

- [x] **Step 5: Manual spot-check**

Since this plan is pure frontend presentation and no automated test specifically asserts "two sections can be open simultaneously" end-to-end (see Tasks 2 and 3's verify notes), manually open `/kurin` as a `ZVYAZKOVYI` user and confirm: expand "Інформація по куреню" and "Гуртки" together, both stay open; inside "Гуртки", expand two different hurtok rows together, both stay open. Also manually confirm the dark-mode toggle: click it in `Nav`, confirm the whole app (not just `/kurin`) re-themes, reload the page, confirm it stays dark (cookie persisted), log out and back in, confirm it's still dark.

- [x] **Step 6: Decide on merge**

If everything above is clean, this wave is ready — follow this repository's established pattern from prior plans (see `.superpowers/sdd/progress.md`) of a final whole-branch review before considering the branch ready, consistent with how Project 1 and every prior plan on this branch closed out.
