# Notion-style UI overhaul — design system (Project 1 of 2)

## Context

The current `apps/web` frontend is the default shadcn/ui starter theme, unmodified: default oklch grayscale tokens, no brand color, default font stack, and only 5 UI primitives (`button`, `card`, `dialog`, `input`, `label`). Several features (the `/kurin` accordion, hurtok settings dialogs) are hand-rolled with raw `<div>`s and Tailwind utility classes rather than real components, because no `Accordion`, `Select`, `Tabs`, `Table`, or `Badge` primitive exists to build them from.

The user asked for a full visual rebuild ("з нуля"), not an incremental patch, in a Notion-inspired direction: warm neutral surfaces, soft rounded cards, calm typography, smooth modern motion, full light/dark support, and a kurin-identity accent color applied liberally across the UI (not just one logo mark).

This is too large for one plan (19 pages, 35 e2e spec files, ~60 Playwright tests). It is split into two independently-specced projects:

1. **This spec — the design system**: tokens, theming, and the base component library. No page gets its final look yet.
2. **A later spec — page rollout**: applying the system to all 19 pages in waves, starting with `/kurin` as the pilot (already prototyped). Not detailed here beyond a rough wave order (see "Out of scope").

A visual mockup of `/kurin` was built collaboratively as a reference during brainstorming and approved by the user: https://claude.ai/artifact/Houns6SmVwD3PDuEkVkwrv. All tokens and component shapes below are taken directly from that approved mockup, not re-derived from scratch.

**Binding reference file**: [`docs/superpowers/specs/assets/2026-10-02-notion-style-ui-overhaul-kurin-mockup.html`](assets/2026-10-02-notion-style-ui-overhaul-kurin-mockup.html) is a de-templated, standalone, dependency-free copy of that same approved mockup — open it directly in any browser (no build step, no Artifact platform access needed). It is the actual source the token tables and component list below were transcribed from. **Any implementation task (Project 1 or Project 2) must treat this file as the authoritative visual reference** — read its CSS directly rather than relying solely on this document's summarized tables, and if anything here and the file ever disagree, the file wins.

## Goals

- Replace the default shadcn grayscale theme with a warm, Notion-inspired light/dark theme, toggleable at runtime.
- Introduce one accent color (blue, user-tunable) used pervasively: active nav state, avatars, hover states, borders, badges — not confined to a single logo chip.
- Build real, reusable primitives for the patterns every data-heavy page in this app needs: accordion (top-level and nested), badge/pill, table-ish row list, select, tabs — so hand-rolled accordion markup (like `/kurin`'s today) is replaced by a shared component, not duplicated per page.
- Modern, smooth, non-jarring motion: section expand/collapse, hover states, theme-switch transitions, page-load entrance. All via CSS transitions/animations — no new animation library (no framer-motion, no GSAP) unless a specific later need can't be met with CSS alone.
- Typography: Manrope (sans-serif, full Cyrillic coverage) for both headings and body — no serif anywhere, per explicit user direction.
- Keep accessibility basics intact: real `<button>`/`<a>` for interactive elements, visible focus states, sufficient contrast in both themes (checked, not assumed).

## Non-goals

- Changing any page's information architecture, copy, or user-facing text/labels. This is a visual and component-layer change only. (Risk-mitigation for the e2e suite — see "Testing".)
- Migrating to a different CSS framework or component library (Tailwind v4 + shadcn/ui conventions stay; we extend shadcn's primitive set, we don't replace shadcn).
- Applying the new look to any actual page. That is Project 2.
- Per-kurin customizable brand colors (e.g., a distinct color per kurin tenant). This idea came up during brainstorming (a dark-navy header tied to "our kurin's color") and was explicitly reversed by the user in favor of one app-wide accent. Multi-tenant per-kurin theming is a plausible future feature but is out of scope here and not assumed by anything below.

## Visual direction (approved)

| Aspect | Decision |
|---|---|
| Structural reference | Notion: warm neutral surfaces, soft rounded cards, generous whitespace, calm information density |
| Typography | Manrope everywhere (headings + body), no serif |
| Accent color | Blue, default `#2F5FD9`, user-tunable (not a fixed brand lock-in); used widely, not just in one spot |
| Theme | Light and dark, both fully designed; toggle persists per session (implementation detail for Project 2) |
| Motion | Smooth, modern, restrained — CSS transitions only; no flashy/GSAP-style motion (ruled out `taste-skill`/`gpt-tasteskill`/`brutalist-skill` for this reason — they explicitly target landing pages, not data-dense admin tools) |
| Header | Theme-aware like the rest of the page (a fixed-color brand header was tried and explicitly rejected by the user) |

## Design tokens

All values below come from the approved mockup. These become CSS custom properties in `apps/web/app/globals.css`, replacing the current default shadcn grayscale block — not a new parallel system.

### Color — light theme

| Token | Value | Use |
|---|---|---|
| `--background` | `#FBFAF8` | page background (warm paper, not pure white) |
| `--surface-elevated` | `#FFFFFF` | cards, section bodies |
| `--surface-sunken` | `#F3F1EC` | rows, nested cards, toggle track |
| `--border` | `#E8E6E1` | all hairline borders |
| `--foreground` | `#2B2A27` | primary text |
| `--muted-foreground` | `#6F6C66` | secondary text, meta labels |
| `--accent` | `#2F5FD9` (tunable; see "Accent color options") | primary brand/interactive color |
| `--accent-soft` | `#E8EEFC` | accent tint backgrounds (hover, badges, avatars) |
| `--accent-foreground` | `#FFFFFF` | text/icons on solid `--accent` fills |
| `--warning-soft` | `#FBF0DC` | warning/vacancy pill background |
| `--warning-foreground` | `#8A5A12` | warning pill text |

### Color — dark theme

| Token | Value |
|---|---|
| `--background` | `#1C1C1A` |
| `--surface-elevated` | `#242320` |
| `--surface-sunken` | `#191917` |
| `--border` | `rgba(255,255,255,0.09)` |
| `--foreground` | `#EDECE9` |
| `--muted-foreground` | `#9B9890` |
| `--accent` | same as light (tunable) |
| `--accent-soft` | `rgba(94,140,255,0.16)` |
| `--accent-foreground` | `#FFFFFF` |
| `--warning-soft` | `rgba(217,164,65,0.14)` |
| `--warning-foreground` | `#E6B766` |

### Accent color options

Exposed as a single source-of-truth token (not hardcoded per-component), with these 4 presets available from the start (shown as swatches wherever an accent picker exists — e.g. kurin settings, if one gets built later): `#2F5FD9` (default), `#1E4FC7`, `#4B74E0`, `#16397A`. Storage/UI for choosing among them is Project 2 scope (or later); Project 1 only needs the token to be a single variable so swapping it is a one-line change.

### Typography

- Font: Manrope, loaded via Google Fonts (`family=Manrope:wght@500;600;700;800`), with fallback stack `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`.
- One family for both headings and body — weight is what differentiates them (headings 600–700, body 400–500).
- Scale (approximate, to be refined per-component in Project 2): page title 19–24px/700, section title 16px/600, body 14px/400–500, meta/label 12px/500–600.

### Shape & elevation

- Radii: `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px` (cards/sections use `lg`, rows/chips use `sm`/`md`).
- Shadows: deliberately subtle — `--shadow: 0 1px 2px rgba(0,0,0,.04), 0 2px 10px rgba(0,0,0,.04)` (light), heavier equivalent in dark; a stronger `--shadow-hover` only on interactive hover (cards), not resting state. No heavy drop shadows anywhere (ruled out by Notion reference and `minimalist-skill`'s own "no heavy shadows" rule).

### Motion

- Theme switch: `background-color`/`color`/`border-color` transition at 220–260ms ease on the root and bordered surfaces — a cross-fade, not a flash.
- Accordion expand/collapse (top-level sections and nested rows, e.g. a hurtok row expanding to show members): CSS Grid `grid-template-rows: 0fr → 1fr` with `overflow: hidden` on the inner wrapper, 280–320ms `cubic-bezier(.4,0,.2,1)`. This animates height smoothly without JS height measurement — confirmed working in the mockup. No `max-height` hacks (they either clip or need an arbitrary large value).
- Chevron rotation: 180° over 260ms, same easing family.
- Hover: cards lift 2px with a shadow transition (160ms); rows/buttons get a background or border color transition (160ms), never a layout-shifting hover effect.
- Page-load entrance: a one-time fade-up (`opacity 0→1`, `translateY(6px→0)`, ~460ms, staggered ~50ms per top-level section) on first mount only — not replayed on every re-render or route change within the same session (implementation detail for Project 2: this must be gated so it doesn't replay on, e.g., React Query refetches).

## Components to build

All as real, typed React components under `apps/web/components/ui/`, following existing shadcn conventions (the 5 that exist today keep their current API; nothing here breaks them). Each takes the tokens above via Tailwind classes / CSS variables, not hardcoded colors.

| Component | Why | Replaces |
|---|---|---|
| `Accordion` (root + item + trigger + content) | Used by `/kurin` (top-level, 5 sections) and now also needed *nested* (a hurtok row expanding to show members) — must support nesting one Accordion-like unit inside another item's content | `/kurin`'s hand-rolled `<details>`-less div/state markup |
| `Badge`/`Pill` | Status tags (Активний/Новий/Вакансія/Підключено), role tags (Гуртковий/Писар) | ad-hoc `<span>` + inline classes scattered per page |
| `Avatar` | Initials circle, accent-tinted | ad-hoc divs |
| `ThemeToggle` | The pill switch with sliding thumb, wired to the app's actual theme mechanism (see "Open questions") | nothing exists today — app has no theme switching at all |
| `Select` | Needed by several existing hand-rolled `<select>` elements (hurtok settings dialog, position assignment) — bring to the new visual language | native `<select>` styled minimally today |
| `Table`/row-list primitives | The repeated "avatar + name + meta + pill" row pattern (provid, vykhovnyky, yunaky, hurtok members) appears 4+ times already and will appear more after rollout | per-page duplicated row markup |

Icons: inline stroke SVGs in the same minimal style as the mockup (generic geometric glyphs — info circle, shield, layered-groups, ribbon, list), consistent stroke width (~1.3–1.6px). No icon font, no emoji. `lucide-react` (already a dependency) may be used directly where an existing Lucide icon matches this visual weight — no need to hand-draw an icon Lucide already covers well; hand-drawn SVGs are for the handful of custom glyphs from the mockup (shield, ribbon, layered groups) that don't have a clean Lucide equivalent at this stroke weight.

## Testing

This is the main risk of the whole overhaul: ~60 Playwright tests and ~289 API e2e tests currently pass against the *current* markup and copy.

- **API tests are unaffected** — this is a frontend-only visual/component change; no endpoint, payload, or authorization logic changes. No backend test should need touching.
- **Playwright tests select mostly by role/text/label** (`getByRole('button', { name: '...' })`, `getByText('...')`, `getByLabel('...')`), not by CSS class or DOM structure, per this project's established conventions (see the `kurin-consolidation` plan's repeated fixes for the one place this wasn't true — `CardTitle` rendering a `<div>` instead of a heading role). As long as Project 2 preserves visible text and uses real semantic elements (`<button>`, proper `aria-expanded`, etc. — which this spec requires anyway for accessibility), most existing selectors should keep matching through a visual-only change.
- **Known risk**: swapping hand-rolled accordion `<div>`s for a real `Accordion` component changes the DOM structure (e.g., `role="region"`/`aria-expanded` appearing where they didn't before, or a wrapping element changing). Project 2's plan must budget time to run the full Playwright suite after each page's rollout and fix any selector breakage — this is expected mechanical work, not a sign something is wrong.
- Project 1 itself (this spec) ships no page changes, so it cannot break any existing test by definition; its own component work should get new, focused tests (component-level or a small dedicated Playwright spec per new primitive — e.g., one spec proving `Accordion` expands/collapses/nests correctly) rather than relying on page tests that don't exist yet.

## Open questions (resolved or deferred)

- **How is dark/light theme chosen and persisted?** Not decided here — this spec defines the two palettes and the toggle's *look*, not its state mechanism (cookie vs. `localStorage` vs. user profile field). Decide in Project 2's plan, since it's a cross-cutting app concern, not specific to one page's layout. Default to system preference changes (standard, inoffensive).
- **Per-kurin accent color**: raised and withdrawn during brainstorming (see "Non-goals"). Revisit only if explicitly requested later — don't build speculative plumbing for it now.
- **Accent color picker UI**: not built in Project 1. The token architecture supports it (single CSS variable), so adding a picker later (e.g., in kurin settings) is additive, not a rework.

## Out of scope / next steps

Project 2 (separate future spec + plan) applies this system to real pages, in rough priority order: `/kurin` first (pilot, closest to done via the mockup), then the remaining pages reachable from it (`/hurtky/[slug]` deep links, `/approval-requests`, `/users/new`), then auth/settings pages, then legal/static pages last. Exact waves and task breakdown belong in that later plan, not here.
