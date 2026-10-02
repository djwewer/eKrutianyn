# Header Redesign, Accordion Polish, Profile Photo (Project 2, Wave 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the visual-fidelity gaps between Wave 1's shipped `/kurin` page and the binding mockup that Wave 1 itself never addressed — the mockup's header (org mark, breadcrumb, inline active-highlighted nav, avatar), per-section accordion icons, and entrance/hover motion — and add a genuinely new feature the mockup implied but Wave 1 didn't build: a user-uploadable profile photo, shown as the header's avatar and usable anywhere `Avatar` renders a person.

**Explicit scope boundary:** This plan does NOT include the rank/degree badges ("Прихильник"/"Учасник"/"Розвідувач") discussed alongside this work — that needs its own schema decision (the three `DEGREE_*_DATE` import-mapping targets in `lib/types.ts`/`save-junak-import-mapping.dto.ts` are recognized by the import wizard's column-mapping UI but have no backing Prisma column anywhere; nothing currently persists them) and is deliberately deferred to a separate plan.

**Architecture — profile photo storage:** The mockup's avatar is decorative (hardcoded initials), but a real upload needs a storage decision this codebase doesn't already have an answer for. The *only* existing file-upload mechanism in this app is Google Drive (`apps/api/src/inventory/inventory.controller.ts`, used for inventory item photos) — but `GoogleDriveService.uploadFile` requires a `kurinId` with Drive already connected by that kurin's zvyazkovyi (confirmed by reading `getAuthorizedClient` and the controller's existing `ServiceUnavailableException: Курінь ще не підключив Google Drive` error path used elsewhere). Reusing it for a **personal** profile photo would make the feature silently unavailable for any user whose kurin hasn't bothered to connect Drive, and would put a junak's personal photo inside the kurin's shared Drive folder — a privacy/ownership mismatch. Given there is no S3 or other object-storage integration anywhere in this codebase (confirmed by grep), this plan stores photo bytes directly in Postgres: `User.photoData Bytes?`, `User.photoMimeType String?`, `User.photoUpdatedAt DateTime?`. A dedicated `GET /users/:id/photo` endpoint streams the bytes with the right `Content-Type` and a long `Cache-Control`, with `photoUpdatedAt`'s timestamp appended to the frontend's `<img src>` as a `?v=` query param so a re-upload busts the cache without needing cache invalidation logic. This keeps the feature fully self-contained (no dependency on any kurin's Drive connection) and matches this app's actual scale (an internal tool for Plast kurins, not a high-traffic app needing a CDN). `photoData`/`photoMimeType` are **never** added to `USER_SELECT`/`USER_SELECT_PUBLIC` (the shared Prisma `select` shapes used by every other user-returning endpoint) — only `photoUpdatedAt` is, so the frontend can tell whether a photo exists (`photoUpdatedAt !== null`) without ever shipping raw image bytes inside a JSON payload that lists multiple users.

**Architecture — header:** `components/nav.tsx` is rewritten to match the mockup's `.km-header` layout (org mark, "Пласт" eyebrow + `Kurin.name`/`kurinNumber` breadcrumb title, inline pill-style nav links, header-right cluster) while preserving 100% of the *existing* real behavior Wave 1 and earlier plans built: the role-based `LINKS_BY_ROLE` link sets, the position-gated extra links (`INTENDANT`/`SUDDIA`/`isKurinniy` → Облік реманенту/Суддівство), the ZVYAZKOVYI-only "Діловодство" dropdown, and `ThemeToggle`. The mockup shows a fixed 3-link nav for its single illustrated ZVYAZKOVYI persona — that's the mockup's own limitation as a static illustration, not a license to delete real role-based routing logic. New: `usePathname()`-based active-link highlighting (`bg-accent-soft text-accent font-semibold`, matching `.km-nav-link--active`), and a real avatar (photo if the user has one, else initials) using `useOwnProfile()` — which Nav does not currently call (today it only uses the minimal JWT-derived `useSession()`, which carries no name/photo).

**Architecture — accordion icons & motion:** Icons are per-section content (info/provid/hurtky/kadra/spysok each get a different mockup icon) — passed from `app/kurin/page.tsx`'s own `sections` array into `AccordionTrigger`'s children, not baked into the shared `components/ui/accordion.tsx`. This keeps the icon choice page-specific with zero API change to the shared component. The entrance-fade and its staggered per-item delay, however, *is* added to the shared `AccordionItem` (`components/ui/accordion.tsx`) — confirmed safe because `AccordionItem` has exactly two consumers in this codebase (`app/kurin/page.tsx` and `components/kurin-hurtky-section.tsx`, both under `/kurin`; the standalone `/hurtky` listing page was deleted by the kurin-consolidation plan and never recreated) and both are already covered by Wave 1's own e2e suite, which this plan's final task re-runs in full.

## Global Constraints

- **No new runtime dependencies.** No icon library (icons are inline SVG, copied from the mockup, same as `accordion.tsx`'s own existing chevron SVG pattern), no image-processing library, no new multer config beyond what `inventory.controller.ts` already established as this codebase's convention (`FileInterceptor`/`FilesInterceptor` + `memoryStorage()` + an image-only `fileFilter`).
- **Photo endpoint size limit: 5MB**, image mimetypes only (`fileFilter` checks `file.mimetype.startsWith('image/')`, same pattern as `inventory.controller.ts` — note that file is 10MB since Drive absorbs the storage cost; this plan uses 5MB since these bytes live directly in a Postgres row).
- **`photoData`/`photoMimeType` must never be added to `USER_SELECT` or `USER_SELECT_PUBLIC`** (`apps/api/src/users/user-select.const.ts`) — every other user-returning endpoint (`list`, `findScoped`, etc.) must keep returning exactly what it returns today, plus `photoUpdatedAt` only. The photo-serving endpoint queries `photoData`/`photoMimeType` directly by id, bypassing these shared select shapes entirely.
- **Do not touch `hurtok-settings-dialog.tsx`, `hurtok-detail-panel.tsx`, or anything under `app/hurtky/**`** — same Wave 1 boundary, still out of scope.
- **Do not change `AccordionItem`'s, `AccordionTrigger`'s, or `AccordionContent`'s public prop API** — the entrance-animation task adds only a `className`/CSS addition, no new required props, so `app/kurin/page.tsx` and `kurin-hurtky-section.tsx`'s existing usage keeps compiling unchanged.
- **Nav's existing role-based link logic, the Діловодство dropdown's existing gating (`session.role === 'ZVYAZKOVYI'`), and `ThemeToggle`'s existing behavior (Wave 1) are preserved exactly** — the header task is a visual restructuring, not a functional rewrite. Every existing e2e assertion that depends on a nav link's text or `role="link"` name (`kurinniy-junak.spec.ts`, `users-role-filter.spec.ts`, and others — grep `e2e/` for `getByRole('link'` before starting) must keep passing unmodified unless this plan's own tasks explicitly say otherwise.
- **`apps/web/playwright.config.ts`'s sandbox `launchOptions.executablePath` stays in place, never committed.**
- `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test"` prefixes every API Jest e2e run; never run that suite and Playwright concurrently.
- Every task ends with `npx tsc --noEmit` clean (apps/web) and, for backend tasks, the API's own `npx tsc --noEmit` (apps/api) clean too.
- **Binding visual reference** for the header, icons, and animation timing: [`docs/superpowers/specs/assets/2026-10-02-notion-style-ui-overhaul-kurin-mockup.html`](../specs/assets/2026-10-02-notion-style-ui-overhaul-kurin-mockup.html) (`.km-header`, `.km-section-icon` SVGs, `kmFadeUp` keyframes) — already read in full for this plan, exact markup/CSS quoted in each task below. Its own content (fixed 3-link nav, fictional kurin name) stays illustrative-only, not literal, exactly as Wave 1's Global Constraints already established.

---

## Task 1: Profile photo — Prisma schema + API endpoints

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: a new Prisma migration (via `npx prisma migrate dev`)
- Modify: `apps/api/src/users/users.controller.ts`, `apps/api/src/users/users.service.ts`, `apps/api/src/users/user-select.const.ts`
- Modify: `apps/web/lib/types.ts` (add `photoUpdatedAt` to `UserSummary`)
- Modify: `apps/web/lib/queries/settings.ts` (add upload/remove mutations)

**Interfaces:**
- Produces: `PATCH /users/me/photo` (multipart, field name `photo`, replaces any existing photo), `DELETE /users/me/photo` (removes it), `GET /users/:id/photo` (streams bytes; 404 if none). `UserSummary.photoUpdatedAt: string | null` added to the shared frontend type.
- Consumes: nothing new beyond what Task 1 defines.

- [ ] **Step 1: Add the Prisma fields**

In `apps/api/prisma/schema.prisma`, inside `model User { ... }`, add (anywhere among the existing scalar fields, e.g. after `phone`):

```prisma
  photoData       Bytes?
  photoMimeType   String?
  photoUpdatedAt  DateTime?
```

Run `npx prisma migrate dev --name add_user_photo` from `apps/api`.

- [ ] **Step 2: Add `photoUpdatedAt` to `USER_SELECT` and `USER_SELECT_PUBLIC`**

In `apps/api/src/users/user-select.const.ts`, add `photoUpdatedAt: true` to both constants (never `photoData`/`photoMimeType` — see Global Constraints).

- [ ] **Step 3: Add the controller endpoints**

In `apps/api/src/users/users.controller.ts`, add (near the other `me`-scoped routes, after `updateOwnProfile`):

```ts
  @Patch('me/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, callback) => {
        callback(file.mimetype.startsWith('image/') ? null : new BadRequestException('Дозволені лише зображення'), file.mimetype.startsWith('image/'));
      },
    }),
  )
  updatePhoto(@UploadedFile() photo: Express.Multer.File | undefined, @CurrentUser() user: CurrentUserPayload) {
    if (!photo) {
      throw new BadRequestException('Файл фото обов\'язковий');
    }
    return this.service.updateOwnPhoto(user.userId, photo);
  }

  @Delete('me/photo')
  removePhoto(@CurrentUser() user: CurrentUserPayload) {
    return this.service.removeOwnPhoto(user.userId);
  }

  @Get(':id/photo')
  async getPhoto(@Param('id') id: string, @Res() res: Response) {
    const photo = await this.service.getPhoto(id);
    if (!photo) {
      throw new NotFoundException('Photo not found');
    }
    res.set('Content-Type', photo.mimeType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(photo.data);
  }
```

Add the required imports: `BadRequestException`, `Delete`, `NotFoundException`, `Res`, `UploadedFile`, `UseInterceptors` from `@nestjs/common` (merge with the existing import line); `FileInterceptor` from `@nestjs/platform-express`; `memoryStorage` from `multer`; `Response` from `express` — follow `apps/api/src/inventory/inventory.controller.ts`'s exact import pattern for these, it already has all of them.

Note: `GET :id/photo` is intentionally **not** behind a `@Roles` restriction beyond the controller's base `JwtAuthGuard` — any authenticated user can view any other user's photo by id, matching how names/roles are already visible across kurin rosters today (no new information disclosure: if you can see someone's name in a roster, their photo is no more sensitive). It does not use `findScoped`'s cross-kurin restriction since a photo alone reveals nothing about kurin structure.

- [ ] **Step 4: Add the service methods**

In `apps/api/src/users/users.service.ts`, add:

```ts
  async updateOwnPhoto(userId: string, file: Express.Multer.File) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { photoData: file.buffer, photoMimeType: file.mimetype, photoUpdatedAt: new Date() },
    });
    return { ok: true as const };
  }

  async removeOwnPhoto(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { photoData: null, photoMimeType: null, photoUpdatedAt: null },
    });
    return { ok: true as const };
  }

  async getPhoto(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { photoData: true, photoMimeType: true },
    });
    if (!user?.photoData || !user.photoMimeType) {
      return null;
    }
    return { data: user.photoData, mimeType: user.photoMimeType };
  }
```

- [ ] **Step 5: Frontend type + mutation hooks**

In `apps/web/lib/types.ts`, add `photoUpdatedAt: string | null;` to `UserSummary`.

`apps/web/lib/api-client.ts` already has exactly the right tool for this: `apiUpload<T>(path, formData, method = 'POST')`, which omits the `Content-Type` header entirely (so the browser sets its own `multipart/form-data` boundary) — unlike `apiFetch`, which unconditionally forces `Content-Type: application/json` and would silently corrupt a `FormData` body. `apps/web/lib/queries/inventory.ts` already uses `apiUpload` for inventory photo uploads — follow that exact precedent, not `apiFetch`.

In `apps/web/lib/queries/settings.ts`, add:

```ts
export function useUpdateOwnPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('photo', file);
      return apiUpload<{ ok: true }>('/users/me/photo', formData, 'PATCH');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useRemoveOwnPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/users/me/photo', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
```

Add `apiUpload` to this file's existing `apiFetch` import from `@/lib/api-client` (merge into one import statement, don't duplicate it).

- [ ] **Step 6: Verify**

From `apps/api`: `npx prisma generate`, `npx tsc --noEmit` clean. Run a quick manual check (`curl` with `-F photo=@<path>` against a logged-in session, or a throwaway Jest e2e test you delete afterward) that upload → `GET /users/:id/photo` round-trips the correct bytes and `Content-Type`, and that `DELETE /users/me/photo` then makes `GET` 404.

From `apps/web`: `npx tsc --noEmit` clean.

---

## Task 2: `Avatar` component — real photo support

**Files:**
- Modify: `apps/web/components/ui/avatar.tsx`

**Interfaces:**
- `Avatar`'s props gain an optional `photoUrl?: string | null` — when present, renders an `<img>` instead of the initials text. `initials` stays required (used for the `alt` text and as the fallback if the image fails to load — browsers don't automatically fall back from a broken `<img src>` to sibling content, so this needs an `onError` handler that swaps to the initials).

- [ ] **Step 1: Add photo support**

Replace the component with:

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

function Avatar({
  initials,
  photoUrl,
  className,
  ...props
}: React.ComponentProps<"div"> & { initials: string; photoUrl?: string | null }) {
  const [imageFailed, setImageFailed] = React.useState(false)

  return (
    <div
      data-slot="avatar"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-xs font-bold text-accent-text",
        className
      )}
      {...props}
    >
      {photoUrl && !imageFailed ? (
        <img
          src={photoUrl}
          alt={initials}
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials
      )}
    </div>
  )
}

export { Avatar }
```

Note: `imageFailed` resets to `false` only on remount, not when `photoUrl` itself changes to a new value after a failed load — acceptable here since a photo URL change always comes with a fresh `photoUpdatedAt` cache-busting query param from a genuine re-upload, which is a rare, user-initiated action, not a prop that churns on every render.

- [ ] **Step 2: Verify**

`npx tsc --noEmit` from `apps/web` clean. `Avatar`'s two current callers (`components/ui/row-list.tsx`'s `Row`, which passes `initials` only — no `photoUrl`) must keep rendering exactly as before (initials, no `<img>`) since `photoUrl` is optional and undefined there. Confirm by re-running `e2e/kurin-accordion-full-tier.spec.ts` (exercises the roster `Row`/`Avatar` usage).

---

## Task 3: Settings page — photo upload UI

**Files:**
- Modify: `apps/web/app/settings/page.tsx`

**Interfaces:**
- Consumes: `useUpdateOwnPhoto`, `useRemoveOwnPhoto` (Task 1), `Avatar` with `photoUrl` (Task 2), `useOwnProfile` (already imported).

- [ ] **Step 1: Add a photo card**

Add a new `<Card>` as the **first** card in the page (before "Особисті дані"):

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Фото профілю</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar
            initials={getInitials(profile.firstName, profile.lastName)}
            photoUrl={profile.photoUpdatedAt ? `/api/backend/users/${profile.id}/photo?v=${profile.photoUpdatedAt}` : null}
            className="size-16 text-base"
          />
          <div className="flex flex-col gap-2">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) updatePhoto.mutate(file);
                e.target.value = '';
              }}
            />
            <Button type="button" size="sm" variant="outline" disabled={updatePhoto.isPending} onClick={() => photoInputRef.current?.click()}>
              {profile.photoUpdatedAt ? 'Змінити фото' : 'Завантажити фото'}
            </Button>
            {profile.photoUpdatedAt && (
              <Button type="button" size="sm" variant="ghost" disabled={removePhoto.isPending} onClick={() => removePhoto.mutate()}>
                Видалити фото
              </Button>
            )}
            {updatePhoto.isError && <p className="text-sm text-destructive">Не вдалося завантажити фото.</p>}
          </div>
        </CardContent>
      </Card>
```

`/api/backend/...` is confirmed correct — `lib/api-client.ts`'s `apiFetch`/`apiUpload` both prefix every request with exactly this (`fetch(\`/api/backend${path}\`, ...)`), and it's the same proxy route (`apps/web/app/api/backend/[...path]/route.ts`) that forwards cookie-based auth to the real API for every other request in this app. Use it verbatim in the `<img src>`, no further investigation needed.

- [ ] **Step 2: Wire up the hooks and imports**

Add to the component body (with the other hook calls at the top):

```tsx
  const updatePhoto = useUpdateOwnPhoto();
  const removePhoto = useRemoveOwnPhoto();
  const photoInputRef = useRef<HTMLInputElement>(null);
```

Add imports: `useRef` from `'react'` (merge with existing `useEffect, useState` import), `useUpdateOwnPhoto, useRemoveOwnPhoto` from `'@/lib/queries/settings'` (merge with existing import), `Avatar` from `'@/components/ui/avatar'`, `getInitials` from `'@/lib/utils'`.

- [ ] **Step 3: Verify**

`npx tsc --noEmit` clean. Manually (or via a throwaway Playwright test using `setInputFiles` on the hidden file input) verify: uploading a small test image shows it in the Avatar immediately after the mutation succeeds (React Query's `invalidateQueries` on `['users']` should trigger `useOwnProfile`'s refetch, which includes `['users', 'me']` — confirm this query key actually matches and invalidates; `useOwnProfile`'s key is `['users', 'me']`, and the mutation invalidates `['users']` as a prefix, which **should** match it under React Query's default partial-key matching, but verify this actually refetches rather than assuming). Verify "Видалити фото" removes it and falls back to initials.

---

## Task 4: Header redesign — `components/nav.tsx`

**Files:**
- Modify: `apps/web/components/nav.tsx`

**Interfaces:**
- Consumes: `useKurin()` (already exists, `GET /kurins/me`, confirmed accessible to every role — no `@Roles` restriction on that endpoint), `useOwnProfile()` (Task 1's `photoUpdatedAt` field flows through it automatically since it returns `UserDetail extends UserSummary`), `usePathname` from `next/navigation`, `Avatar` (Task 2), `getInitials` (already in `lib/utils.ts` since Wave 1).
- Preserves exactly: `LINKS_BY_ROLE`, the `INTENDANT`/`SUDDIA`/`isKurinniy` extra-link gating, the ZVYAZKOVYI-only `DILOVODY_PAGES` dropdown, `ThemeToggle`, `handleLogout`.

- [ ] **Step 1: Read the mockup's header markup/CSS once more before writing this**

Relevant excerpt (already fully read for this plan; reproduced here so the implementer doesn't need to open the mockup file to get the exact values):

```css
.km-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 20px 32px; border-bottom: 1px solid var(--km-border); flex-wrap: wrap; }
.km-header-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
.km-mark { width: 36px; height: 36px; border-radius: var(--km-radius-sm); background: var(--km-accent); color: var(--km-accent-fg); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; flex-shrink: 0; }
.km-org { font-size: 12px; color: var(--km-accent); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.km-kurin-title { font-weight: 700; font-size: 19px; margin: 0; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.km-nav-link { font-size: 14px; font-weight: 500; color: var(--km-text-muted); padding: 8px 12px; border-radius: var(--km-radius-sm); transition: background-color 160ms ease, color 160ms ease; }
.km-nav-link:hover { background: var(--km-accent-soft); color: var(--km-accent); }
.km-nav-link--active { color: var(--km-accent); background: var(--km-accent-soft); font-weight: 600; }
```

- [ ] **Step 2: Rewrite `components/nav.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/session-client';
import { useKurin } from '@/lib/queries/kurin';
import { useOwnProfile } from '@/lib/queries/settings';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Avatar } from '@/components/ui/avatar';
import { getInitials, cn } from '@/lib/utils';

const LINKS_BY_ROLE: Record<string, { href: string; label: string }[]> = {
  JUNAK: [
    { href: '/proby', label: 'Моя проба' },
    { href: '/kurin', label: 'Курінь' },
    { href: '/settings', label: 'Налаштування' },
  ],
  VYKHOVNYK: [
    { href: '/kurin', label: 'Курінь' },
    { href: '/settings', label: 'Налаштування' },
  ],
  ZVYAZKOVYI: [
    { href: '/approval-requests', label: 'Запити' },
    { href: '/kurin', label: 'Курінь' },
    { href: '/settings', label: 'Налаштування' },
  ],
};

const DILOVODY_PAGES = [
  { href: '/inventory', label: 'Облік реманенту' },
  { href: '/suddivstvo', label: 'Суддівство' },
];

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent-soft hover:text-accent-text',
        active && 'bg-accent-soft font-semibold text-accent-text'
      )}
    >
      {label}
    </Link>
  );
}

export function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { data: kurin } = useKurin();
  const { data: profile } = useOwnProfile();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    queryClient.clear();
    router.push('/login');
    router.refresh();
  }

  if (!session) return null;

  const links = [...(LINKS_BY_ROLE[session.role] ?? [])];
  if (session.role !== 'ZVYAZKOVYI' && (session.positions.includes('INTENDANT') || session.isKurinniy)) {
    links.push({ href: '/inventory', label: 'Облік реманенту' });
  }
  if (session.role !== 'ZVYAZKOVYI' && (session.positions.includes('SUDDIA') || session.isKurinniy)) {
    links.push({ href: '/suddivstvo', label: 'Суддівство' });
  }

  const dilovodyActive = DILOVODY_PAGES.some((p) => pathname?.startsWith(p.href));

  return (
    <nav className="flex flex-wrap items-center justify-between gap-6 border-b px-8 py-5">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-base font-bold text-accent-foreground">
          К
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold tracking-wide text-accent uppercase">Пласт</span>
          {kurin && (
            <h1 className="truncate text-[19px] font-bold tracking-tight">
              Курінь ч. {kurin.kurinNumber} «{kurin.name}»
            </h1>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {links.map((link) => (
          <NavLink key={link.href} href={link.href} label={link.label} active={pathname === link.href} />
        ))}
        {session.role === 'ZVYAZKOVYI' && (
          <details className="relative">
            <summary
              className={cn(
                'cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent-soft hover:text-accent-text',
                dilovodyActive && 'bg-accent-soft font-semibold text-accent-text'
              )}
            >
              Діловодство
            </summary>
            <div className="absolute z-10 mt-1 flex flex-col rounded-md border bg-popover p-1 shadow-lg">
              {DILOVODY_PAGES.map((page) => (
                <Link
                  key={page.href}
                  href={page.href}
                  className="whitespace-nowrap rounded-sm px-2.5 py-1.5 text-sm hover:bg-accent-soft"
                >
                  {page.label}
                </Link>
              ))}
            </div>
          </details>
        )}
      </div>
      <div className="flex items-center gap-3.5">
        <ThemeToggle />
        {profile && (
          <Avatar
            initials={getInitials(profile.firstName, profile.lastName)}
            photoUrl={profile.photoUpdatedAt ? `/api/backend/users/${profile.id}/photo?v=${profile.photoUpdatedAt}` : null}
          />
        )}
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Вийти
        </Button>
      </div>
    </nav>
  );
}
```

Notes:
- `pathname === link.href` for exact-match active highlighting on the simple top-level routes; `dilovodyActive` uses `startsWith` since `/inventory` and `/suddivstvo` both have nested routes (`/suddivstvo/junak-import`) that should still highlight the parent trigger.
- `kurin` can be `undefined` momentarily on first render (React Query loading state) — the `{kurin && (...)}` guard prevents rendering a broken breadcrumb with `undefined` values; the org mark and nav links still render immediately since they don't depend on it.
- `cn` needs adding to the `@/lib/utils` import — confirm it's already exported there (it is, Wave 1 uses it in `layout.tsx`) and that this file doesn't already import something else under the same name.

- [ ] **Step 3: Verify**

`npx tsc --noEmit` clean.

Run the **full** Playwright suite's nav-dependent specs, not just `/kurin`'s — grep `e2e/*.spec.ts` for `getByRole('link'` and `Nav` usage first to build the exact list (at minimum expect `kurinniy-junak.spec.ts`, `users-role-filter.spec.ts`, and anything asserting on "Вийти"/"Діловодство"/role-specific link visibility). This component renders on every authenticated page, so a mistake here has the widest blast radius of any task in this plan — run close to the **entire** suite, not a curated subset, before considering this task done.

---

## Task 5: `/kurin` accordion section icons

**Files:**
- Modify: `apps/web/app/kurin/page.tsx`

**Interfaces:**
- No prop change to `AccordionTrigger` — icons are composed into its `children` alongside the existing title text, same technique already used for the vykhovnyk-name span in `kurin-hurtky-section.tsx`.

- [ ] **Step 1: Read the mockup's 5 section icons**

Already read in full for this plan. Exact SVGs per section (all `width="17" height="17" viewBox="0 0 16 16" fill="none"`, `stroke="currentColor"`):

- Інформація по куреню: `<circle cx="8" cy="8" r="6" stroke-width="1.3"/><path d="M8 7.2v4M8 5.1v.1" stroke-width="1.5" stroke-linecap="round"/>`
- Провід куреня: `<path d="M8 1.5l5 2v4c0 3.5-2.2 5.8-5 7-2.8-1.2-5-3.5-5-7v-4z" stroke-width="1.3" stroke-linejoin="round"/>`
- Гуртки: `<path d="M8 2l6 3-6 3-6-3 6-3z" stroke-width="1.3" stroke-linejoin="round"/><path d="M2 8l6 3 6-3" stroke-width="1.3" stroke-linejoin="round"/><path d="M2 11l6 3 6-3" stroke-width="1.3" stroke-linejoin="round"/>`
- Кадра виховників: `<circle cx="8" cy="6" r="3.4" stroke-width="1.3"/><path d="M6 8.8L5 14l3-1.6L11 14l-1-5.2" stroke-width="1.3" stroke-linejoin="round"/>`
- Список юнацтва: `<circle cx="2.5" cy="4" r="0.9" fill="currentColor"/><circle cx="2.5" cy="8" r="0.9" fill="currentColor"/><circle cx="2.5" cy="12" r="0.9" fill="currentColor"/><path d="M5.5 4h8M5.5 8h8M5.5 12h8" stroke-width="1.3" stroke-linecap="round"/>`

- [ ] **Step 2: Add an icon per section and render it in the trigger**

Change the `sections` array's type and entries to carry an `icon` ReactNode, and update the `AccordionTrigger` to render it:

```tsx
  const sections: { key: string; title: string; icon: React.ReactNode; render: () => React.ReactNode }[] = [
    {
      key: 'info',
      title: 'Інформація по куреню',
      icon: (
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <circle cx="8" cy="8" r="6" strokeWidth="1.3" />
          <path d="M8 7.2v4M8 5.1v.1" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
      render: () => <KurinInfoSection />,
    },
    // ...repeat for 'provid', 'hurtky', and (inside hasFullAccess's array) 'vykhovnyky', 'junatstvo'
    // with each section's own icon from Step 1.
  ];
```

And in the `.map()` that renders `AccordionTrigger`:

```tsx
          <AccordionItem key={section.key} value={section.key}>
            <AccordionTrigger>
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                {section.icon}
              </span>
              <span className="min-w-0 flex-1">{section.title}</span>
            </AccordionTrigger>
            <AccordionContent>{section.render()}</AccordionContent>
          </AccordionItem>
```

**This exact wrapping pattern (icon span + flex-1 title span as the only two direct children before the trigger's own chevron) is required** — Wave 1's final review found a real, visible bug (`kurin-hurtky-section.tsx`'s vykhovnyk span) from `AccordionTrigger`'s `justify-between` flex container treating multiple loose children as separate flex items instead of one. Do not pass the icon and title as separate top-level children without a wrapping flex-1 span on the title, or the icon and title will separate with unpredictable spacing instead of sitting together on the left.

- [ ] **Step 3: Verify**

`npx tsc --noEmit` clean. Run `e2e/kurin-accordion-full-tier.spec.ts` — the icons are decorative `<svg>` with no text content, so this should pass unmodified (confirm, don't assume — an icon rendered as a sibling before the title text could theoretically shift what `getByText(title).click()` resolves to if the click target's bounding box changes in a way that matters, though it shouldn't for a text-based locator).

---

## Task 6: Accordion entrance animation + hover polish

**Files:**
- Modify: `apps/web/app/globals.css` (new `@keyframes`)
- Modify: `apps/web/components/ui/accordion.tsx`

**Interfaces:**
- No prop API change. Purely a `className`/CSS addition to the existing `AccordionItem`.

- [ ] **Step 1: Add the keyframe to `globals.css`**

Add, anywhere outside the existing `@layer base` block (e.g. right after the `.dark { ... }` block):

```css
@keyframes kmFadeUp {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 2: Apply it to `AccordionItem` with a staggered delay**

In `components/ui/accordion.tsx`, add to `AccordionItem`'s className: `animate-[kmFadeUp_460ms_cubic-bezier(0.2,0.7,0.3,1)_both]`.

For the stagger, add this to `globals.css` (targeting the actual rendered DOM structure — `AccordionItem` renders `data-slot="accordion-item"` as a direct child of `AccordionRoot`'s `data-slot="accordion"`):

```css
[data-slot="accordion"] > [data-slot="accordion-item"]:nth-child(1) { animation-delay: 20ms; }
[data-slot="accordion"] > [data-slot="accordion-item"]:nth-child(2) { animation-delay: 70ms; }
[data-slot="accordion"] > [data-slot="accordion-item"]:nth-child(3) { animation-delay: 120ms; }
[data-slot="accordion"] > [data-slot="accordion-item"]:nth-child(4) { animation-delay: 170ms; }
[data-slot="accordion"] > [data-slot="accordion-item"]:nth-child(5) { animation-delay: 220ms; }
```

**Read `components/ui/accordion.tsx`'s actual current DOM output before assuming the `:nth-child` selector above matches** — confirm `AccordionItem` doesn't render any wrapping element between it and `AccordionRoot`'s own container that would make `:nth-child` count something other than the visible section rows (e.g. a `<Fragment>` is invisible to `:nth-child` and fine; an actual wrapper `<div>` per item would break the selector and need adjusting to target that wrapper instead).

This animation fires every time an `AccordionItem` mounts, not just on initial page load — since `AccordionContent` only mounts collapsed sections once interacted with in some cases but `AccordionItem` itself (the header row) is always mounted for every item from first render (confirmed in Wave 1: `keepMounted` defaults to `false` for the *panel*, but the item/trigger row itself renders immediately). This means the fade-up plays once per item on `/kurin`'s initial load and does **not** replay on expand/collapse — exactly matching the mockup's intent (entrance animation, not an expand animation). Verify this assumption holds by watching it in a real browser load, not just reading the code.

- [ ] **Step 3: Verify, with explicit attention to animation-induced test flakiness**

`npx tsc --noEmit` clean.

Run the full set of `/kurin`-touching specs (`kurin-accordion-full-tier.spec.ts`, `kurin-accordion-multi-open.spec.ts`, `kurin-settings.spec.ts`, `kurinniy-junak.spec.ts`, `positions.spec.ts`, `theme-toggle.spec.ts`) at least twice in a row — animation-introduced timing issues (an element not yet at `opacity: 1` when Playwright's auto-waiting checks visibility) are exactly the kind of flake that passes once and fails intermittently. Playwright's `toBeVisible()` checks computed visibility, not opacity, so `opacity: 0` mid-animation should still count as visible — confirm this is actually true in practice, don't just assume it from how the assertion is named. If any flakiness appears, the fix is almost certainly adding `prefers-reduced-motion` handling or reducing reliance on timing — do not simply retry until it passes.

---

## Task 7: Final integration + regression

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck + lint**

`npx tsc --noEmit` clean from both `apps/web` and `apps/api`. `npm run lint` from `apps/web` — confirm no new errors beyond the one pre-existing `kurin-info-section.tsx` issue already tracked from Wave 1.

- [ ] **Step 2: Full Playwright regression**

Record the baseline count before this plan's changes (`grep -h "^test(" apps/web/e2e/*.spec.ts | wc -l` — 62 at the time this plan was written, confirm it's still 62 before starting). This plan adds zero new spec files unless a task above needed one for verification (delete any throwaway specs before this step). Run the entire suite and confirm it passes in full — pay particular attention to Task 4's header rewrite, which has the widest blast radius of anything in this plan (renders on every page).

- [ ] **Step 3: Full API e2e regression**

`DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e` from `apps/api`. This plan adds real backend surface (Task 1) for the first time in this Project-2 arc — unlike Wave 1, a regression here is possible and must be checked, not assumed away. Confirm the baseline count (289 at the time this plan was written) plus any new tests this plan's Task 1 added.

- [ ] **Step 4: Manual verification**

Upload a photo in Settings, confirm it appears in the header avatar immediately and after a hard reload. Remove it, confirm it falls back to initials everywhere (Settings and header both). Confirm the header's active-link highlighting updates correctly when navigating between every role's available pages (test as JUNAK, VYKHOVNYK, and ZVYAZKOVYI — the three role-specific link sets). Confirm the accordion's entrance animation and icons render as expected on `/kurin` in both light and dark mode.

- [ ] **Step 5: Decide on merge**

If everything above is clean, follow this repository's established pattern of a final whole-branch review before considering this wave ready, consistent with Wave 1 and every prior plan on this branch.
