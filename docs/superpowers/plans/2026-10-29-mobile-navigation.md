# Нова навігація (нижня панель + бічна панель) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Замінити бургер-меню/верхнє меню `apps/web` на нижню панель з круглою центральною кнопкою (телефон) і бічну панель (комп'ютер), додати хаб «Моє пластування», «Мій гурток», «Моя сторінка» та розширити «Налаштування».

**Architecture:** Чиста функція `buildNav(session, pendingRequests)` — єдине джерело структури навігації; клієнтський `AppShell` вирішує, що рендерити (шапка + нижня панель на телефоні, бічна панель на комп'ютері, лише `children` без сесії). Нові сторінки — клієнтські компоненти на наявних хуках. Бекенд не змінюється.

**Tech Stack:** Next.js 16 (App Router, нестандартна — дивись `apps/web/AGENTS.md`), React, TanStack Query, Tailwind-токени дизайн-системи, `lucide-react`, Playwright.

Spec: `docs/superpowers/specs/2026-10-29-mobile-navigation-design.md`. Візуальний референс (інтерактивний макет з усіма станами):
`docs/superpowers/specs/assets/2026-10-29-mobile-navigation-mockup.html` — відкрити в браузері або прочитати; кольори беруться з токенів застосунку, макет задає лише структуру, розміри й поведінку.

## Global Constraints

- **Next.js нестандартний:** перед написанням сторінок/клієнтських компонентів прочитати відповідний гайд у `node_modules/next/dist/docs/` (корінь монорепо або `apps/web`) і копіювати конвенції сусідніх сторінок (`app/treasury/page.tsx`, `app/settings/page.tsx`).
- Бекенд (`apps/api`) **не змінюється**. Нових ендпоінтів немає.
- Ролі в сесії: `session.role` (`JUNAK | VYKHOVNYK | ZVYAZKOVYI`), `session.positions` (`PositionType[]`), `session.isKurinniy`, `session.userId`, `session.kurinId` (`CurrentUserPayload` у `apps/web/lib/types.ts`).
- Діловодство: доступ за позицією — `/inventory`→`INTENDANT`, `/suddivstvo`→`SUDDIA`, `/pysarstvo`→`PYSAR`, `/treasury`→`SKARBNYK`; звʼязковий і курінний бачать усі чотири (правило з `nav.tsx` лишається).
- Користувацькі тексти — українською, без росіянізмів; підписи точно як у spec: «Новини», «Календар», «Моє пластування» / «Мій гурток» / «Моя проба» (звʼязковий), «Курінь», «Діловодство», «Налаштування», «Моя сторінка».
- Тема світла/темна працює автоматично через токени; кольори — лише токени (`bg-accent-soft`, `text-accent-text`, `border-border`, `bg-popover`, `bg-muted`, `text-muted-foreground`, `bg-background`, `bg-primary`/`text-primary-foreground` тощо — звірити в `app/globals.css`), без літеральних hex (виняток: градієнт плитки AI-виховника, як у `NavLink` старої навігації).
- Іконки — з `lucide-react`.
- Мобільний `< sm` (Tailwind) = нижня панель; `≥ sm` = бічна панель. Нижня панель враховує `env(safe-area-inset-bottom)`.
- Наявний механізм примусової зміни пароля (`profile.mustChangePassword` → `router.replace('/settings')`) з `nav.tsx` **мусить зберегтися** в `AppShell`.
- Playwright: запуск з `apps/web` — `npx playwright test e2e/<file>`; потрібні в оточенні `ADMIN_USERNAME=admin`, `ADMIN_PASSWORD=dev-admin-password-change-me` і `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (згенерувати: `node -e "const w=require('web-push');console.log(w.generateVAPIDKeys())"`); змінні не писати в `.env`. Postgres на `localhost:5432` працює. Відомий **давній** збій на `main`: `e2e/treasury.spec.ts:40` («звичайний юнак бачить повідомлення…») — не наш, не виправляти.
- Типи: з `apps/web` — `npx tsc --noEmit` (ігнорувати лише помилки зі застарілих згенерованих файлів `.next/`).
- Комміти — по задачі; стейджити лише змінені файли (`git add <paths>`); не чіпати untracked `logo.png`, `ПРОБИ  старі/`, `Проби НОВІ/`.

## File Structure

| Файл | Відповідальність |
|---|---|
| `apps/web/lib/nav-model.ts` | `buildNav`, типи, `isActive` — чиста логіка навігації |
| `apps/web/lib/use-logout.ts` | хук виходу (логіка з `nav.tsx`) |
| `apps/web/components/app-shell.tsx` | каркас: сесія, редирект зміни пароля, вибір розкладки |
| `apps/web/components/mobile-header.tsx` | шапка телефона (логотип, назва куреня, аватар → `/me`) |
| `apps/web/components/bottom-nav.tsx` | нижня панель + лист «Діловодство» |
| `apps/web/components/sidebar-nav.tsx` | бічна панель (комп'ютер) |
| `apps/web/app/plastuvannia/page.tsx` | хаб «Моє пластування» |
| `apps/web/app/my-hurtok/page.tsx` | «Мій гурток» |
| `apps/web/app/me/page.tsx` | «Моя сторінка» |
| `apps/web/app/settings/page.tsx` | + блок швидких дій (запити, журнал, тема, вихід) |
| `apps/web/app/layout.tsx` | `AppShell` замість `Nav` + `<main>` |
| `apps/web/components/nav.tsx` | **видаляється** в Task 3 |
| `apps/web/e2e/*.spec.ts` | нові спеки та оновлення наявних |

---

### Task 1: Хаб «Моє пластування» і «Мій гурток»

**Files:**
- Create: `apps/web/app/plastuvannia/page.tsx`, `apps/web/app/my-hurtok/page.tsx`
- Create: `apps/web/e2e/plastuvannia.spec.ts`, `apps/web/e2e/my-hurtok.spec.ts`

**Interfaces:**
- Produces: маршрути `/plastuvannia` (доступ `JUNAK`, `ZVYAZKOVYI`) і `/my-hurtok` (доступ `VYKHOVNYK`). Task 3 лінкує на них з центральної кнопки.

- [ ] **Step 1: Написати падаючі e2e**

`e2e/plastuvannia.spec.ts` (за патерном `e2e/kurin-settings.spec.ts`: `seedProbyProgram`, `seedKurinWithZvyazkovyi`, `loginAs` з `e2e/helpers`): а) **звʼязковий** відкриває `/plastuvannia` → бачить заголовок «Моє пластування», позначку «Тестовий режим», плитки «Моя проба» (посилання на `/proby`), «AI-виховник» (посилання на `/ai-vykhovnyk`), «Додати акцію» (посилання на `/my-activity`) і плитку «Запит» з текстом «Скоро», **яка не є посиланням** (`getByRole('link', { name: /Запит/ })` має count 0). б) Якщо в хелперах є сід юнака (перевірити `e2e/helpers/seed.ts`; інакше створити юнака через наявні хелпери/API, як у `e2e/guardian-contacts.spec.ts`), юнак бачить ті самі плитки без «Тестового режиму». в) Виховник відкриває `/plastuvannia` → «Немає доступу.».

`e2e/my-hurtok.spec.ts`: виховник, прикріплений до одного гуртка (сід як у `e2e/hurtky-accordion.spec.ts`/`hurtok-add-junak-link.spec.ts`), відкриває `/my-hurtok` → бачить назву гуртка й таблицю членів (те, що рендерить `HurtokDetailPanel`); виховник без гуртків → повідомлення «Вас ще не прикріплено до жодного гуртка.»; юнак → «Немає доступу.».

- [ ] **Step 2: Запустити — очікувано FAIL** (`npx playwright test e2e/plastuvannia.spec.ts e2e/my-hurtok.spec.ts`) — маршрутів немає (404).

- [ ] **Step 3: Реалізувати `/plastuvannia`**

```tsx
'use client';

import Link from 'next/link';
import { Flag, Sparkles, CirclePlus, FileText } from 'lucide-react';
import { useSession } from '@/lib/session-client';

const TILE_BASE = 'flex min-h-[150px] flex-col justify-between rounded-2xl p-4 text-left';
const TILES: { href: string; title: string; text: string; icon: typeof Flag; ai?: boolean }[] = [
  { href: '/proby', title: 'Моя проба', text: 'Точки проби та їх стан', icon: Flag },
  { href: '/ai-vykhovnyk', title: 'AI-виховник', text: 'Запитай про будь-яку точку', icon: Sparkles, ai: true },
  { href: '/my-activity', title: 'Додати акцію', text: 'Табір, сходини, акція', icon: CirclePlus },
];

export default function PlastuvanniaPage() {
  const { data: session } = useSession();
  if (!session) return null;
  if (session.role !== 'JUNAK' && session.role !== 'ZVYAZKOVYI') {
    return <p className="text-sm text-destructive">Немає доступу.</p>;
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Моє пластування</h1>
        {session.role === 'ZVYAZKOVYI' && (
          <span className="mt-2 inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-text">
            Тестовий режим: хаб юнака
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TILES.map(({ href, title, text, icon: Icon, ai }) => (
          <Link
            key={href}
            href={href}
            className={
              ai
                ? `${TILE_BASE} bg-[linear-gradient(125deg,#7C3AED,#2F5FD9_55%,#0891B2)] text-white hover:brightness-110`
                : `${TILE_BASE} border border-border bg-background transition-colors hover:bg-accent-soft`
            }
          >
            <span className={ai ? 'grid size-10 place-items-center rounded-xl bg-white/20' : 'grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-text'}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <strong className="block text-base leading-tight">{title}</strong>
              <span className={ai ? 'text-sm text-white/90' : 'text-sm text-muted-foreground'}>{text}</span>
            </span>
          </Link>
        ))}
        <div aria-disabled="true" className={`${TILE_BASE} border border-dashed border-border opacity-60`}>
          <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
            <FileText className="size-5" aria-hidden />
          </span>
          <span>
            <strong className="block text-base leading-tight">Запит</strong>
            <span className="text-sm text-muted-foreground">Дозвіл, посвідка, документ</span>
            <span className="mt-1 block text-xs font-semibold text-accent-text">Скоро</span>
          </span>
        </div>
      </div>
    </div>
  );
}
```
Токени (`bg-background`, `bg-muted`, `border-border`, `bg-accent-soft`, `text-accent-text`) звірити з `app/globals.css`; градієнт AI-плитки — єдиний допустимий літеральний колір. Плитки «Моя проба», «AI-виховник», «Додати акцію» — справжні `<Link>`; «Запит» — **не** посилання.

- [ ] **Step 4: Реалізувати `/my-hurtok`**

```tsx
'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useHurtky } from '@/lib/queries/hurtky';
import { useVykhovnykAssignments } from '@/lib/queries/vykhovnyk-assignments';
import { HurtokDetailPanel } from '@/components/hurtok-detail-panel';

export default function MyHurtokPage() {
  const { data: session } = useSession();
  const isVykhovnyk = session?.role === 'VYKHOVNYK';
  const { data: hurtky } = useHurtky();
  const { data: assignments } = useVykhovnykAssignments(undefined, { enabled: isVykhovnyk });
  const [selected, setSelected] = useState<string | null>(null);

  if (!session) return null;
  if (!isVykhovnyk) return <p className="text-sm text-destructive">Немає доступу.</p>;
  if (!hurtky || !assignments) return <p>Завантаження...</p>;

  const mine = hurtky.filter((h) => !!h.slug && assignments.some((a) => a.hurtokId === h.id));
  if (mine.length === 0) {
    return <p className="text-sm text-muted-foreground">Вас ще не прикріплено до жодного гуртка.</p>;
  }
  const current = mine.find((h) => h.slug === selected) ?? mine[0];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Мій гурток</h1>
      {mine.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Гурток">
          {mine.map((h) => (
            <button
              key={h.id}
              type="button"
              aria-pressed={h.id === current.id}
              onClick={() => setSelected(h.slug)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${h.id === current.id ? 'border-transparent bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent-soft'}`}
            >
              {h.name}
            </button>
          ))}
        </div>
      )}
      <HurtokDetailPanel slug={current.slug!} />
    </div>
  );
}
```
(Перевірити, що `useHurtky()` не вимагає аргументів і що `Hurtok` має `slug: string | null`; токени звірити з `app/globals.css`.)

- [ ] **Step 5: Запустити e2e + tsc — PASS** (`npx playwright test e2e/plastuvannia.spec.ts e2e/my-hurtok.spec.ts`; `npx tsc --noEmit`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/plastuvannia apps/web/app/my-hurtok apps/web/e2e/plastuvannia.spec.ts apps/web/e2e/my-hurtok.spec.ts
git commit -m "feat(web): add Моє пластування hub and Мій гурток pages"
```

---

### Task 2: «Моя сторінка» і розширення «Налаштувань»

**Files:**
- Create: `apps/web/app/me/page.tsx`, `apps/web/lib/use-logout.ts`, `apps/web/e2e/me-page.spec.ts`, `apps/web/e2e/settings-quick-actions.spec.ts`
- Modify: `apps/web/app/settings/page.tsx`, `apps/web/lib/queries/approval-requests-list.ts`
- Create (за потреби): `apps/web/lib/position-labels.ts` (якщо підписів посад ще немає в коді — `grep -rn "Писар\b" apps/web` і перевикористати наявну мапу)

**Interfaces:**
- Consumes: `JunakDegreesCard` (`components/junak-degrees-card.tsx`, props `junakId`, `canEdit`), `useOwnProfile` (`lib/queries/settings.ts`), `useHurtky`, `useApprovalRequests`.
- Produces: маршрут `/me`; `useLogout(): () => Promise<void>` (виконує `POST /api/auth/logout`, `queryClient.clear()`, `router.push('/login')`, `router.refresh()` — логіка з поточного `nav.tsx`); `useApprovalRequests(status?, options?: { enabled?: boolean })`.

- [ ] **Step 1: Падаючі e2e**

`me-page.spec.ts`: (а) звʼязковий на `/me` бачить своє імʼя, пошту, картку «Діловодство» з роллю (текст «Звʼязковий» або наявний підпис ролі) і **не** бачить картки «Ступені»; (б) юнак (сід як у Task 1) бачить картку «Ступені» (заголовок/рядки як у `JunakDegreesCard` — прочитати компонент) та картку «Дані» з гуртком; (в) виховник на `/me` бачить імʼя та «Мої гуртки»/«Дані», без «Ступенів».
`settings-quick-actions.spec.ts`: (а) звʼязковий на `/settings` бачить посилання «Запити» (`/approval-requests`) та «Журнал дій» (`/audit-log`), перемикач «Перемкнути темну тему» (клас `dark` на `<html>` змінюється після кліку), кнопку «Вийти» → після кліку URL `/login`; (б) юнак бачить перемикач теми та «Вийти», **не** бачить «Запити» і «Журнал дій».

- [ ] **Step 2: Запустити — FAIL.**

- [ ] **Step 3: `useApprovalRequests` приймає `options`**

У `lib/queries/approval-requests-list.ts`:
```ts
export function useApprovalRequests(status?: ApprovalStatus, options?: { enabled?: boolean }) {
  const query = status ? `?status=${status}` : '';
  return useQuery({
    queryKey: ['approval-requests', status],
    queryFn: () => apiFetch<ApprovalRequest[]>(`/approval-requests${query}`),
    enabled: options?.enabled ?? true,
  });
}
```
(усі наявні виклики лишаються сумісними).

- [ ] **Step 4: `lib/use-logout.ts`**

```ts
'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    queryClient.clear();
    router.push('/login');
    router.refresh();
  };
}
```

- [ ] **Step 5: `/me`**

Сторінка `'use client'`: `useSession`, `useOwnProfile`, `useHurtky`. Структура (стилі — `Card`/`CardHeader`/`CardTitle`/`CardContent` з `components/ui/card`, як на `/settings`; рядки «ключ — значення» двома колонками):
- шапка: аватар (`Avatar` з `components/ui/avatar`, як у старому `nav.tsx`: `getInitials`, фото `/api/backend/users/${id}/photo?v=${photoUpdatedAt}`), імʼя, пошта, чіп ролі;
- **Ступені** — лише `session.role === 'JUNAK'`: `<JunakDegreesCard junakId={session.userId} canEdit={false} />`;
- **Діловодство** — поточні посади користувача з `session.positions` (підписи українською); для звʼязкового — рядок «Звʼязковий»; якщо порожньо — «Посад зараз немає»;
- **Дані** — гурток (назва з `useHurtky()` за `profile.hurtokId`), дата народження (`profile.birthDate`, формат `uk-UA`), телефон, проживання, навчання (рядок показувати лише якщо значення є);
- у коді коментар `// Архів діловодства, вмілості, табори, відзнаки — окремі фічі (docs/backlog.md «Історія юнака»)`; жодних заглушок в UI.
Для виховника замість «Ступенів» — картка «Мої гуртки» (гуртки з `useVykhovnykAssignments()` + `useHurtky()`, назви списком).

- [ ] **Step 6: Блок швидких дій у `/settings`**

На початку сторінки (під `<h1>`) додати `Card` «Швидкі дії»:
- `session.role === 'ZVYAZKOVYI'`: `Link` «Запити» → `/approval-requests` з бейджем кількості (`useApprovalRequests('PENDING', { enabled: isZvyazkovyi })`, показувати лише якщо `> 0`) та «Журнал дій» → `/audit-log`;
- перемикач теми: рядок «Темна тема» + `<ThemeToggle />` (`components/ui/theme-toggle`);
- кнопка «Вийти» (`useLogout()`), стиль як `Button variant="outline"` з червоним акцентом через токен `text-destructive`.
Наявні картки профілю/пароля/email не змінювати.

- [ ] **Step 7: Запустити e2e + tsc — PASS** (`npx playwright test e2e/me-page.spec.ts e2e/settings-quick-actions.spec.ts` + наявні `e2e/settings*.spec.ts`, `e2e/approval-request*.spec.ts` для регресії; `npx tsc --noEmit`).

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/me apps/web/app/settings/page.tsx apps/web/lib apps/web/e2e/me-page.spec.ts apps/web/e2e/settings-quick-actions.spec.ts
git commit -m "feat(web): add Моя сторінка and quick actions on Налаштування"
```

---

### Task 3: Навігаційний каркас: нижня панель, бічна панель, шапка

**Files:**
- Create: `apps/web/lib/nav-model.ts`, `apps/web/components/app-shell.tsx`, `apps/web/components/mobile-header.tsx`, `apps/web/components/bottom-nav.tsx`, `apps/web/components/sidebar-nav.tsx`, `apps/web/e2e/navigation-shell.spec.ts`
- Modify: `apps/web/app/layout.tsx`
- Delete: `apps/web/components/nav.tsx`
- Modify (переписати): `apps/web/e2e/nav-burger-menu.spec.ts` → замінити на `navigation-shell.spec.ts` (видалити старий файл)

**Interfaces:**
- Consumes: маршрути Task 1–2; `useLogout` не потрібен тут; `useApprovalRequests('PENDING', { enabled })` (Task 2).
- Produces: `buildNav`, `isActive`, типи `NavModel`/`NavItem` (нижче) для `BottomNav` і `SidebarNav`.

- [ ] **Step 1: Падаючі e2e `e2e/navigation-shell.spec.ts`**

(за патерном старого `nav-burger-menu.spec.ts`; **локатори уникають збігу з логотипом** — для «Курінь» вживати `{ name: 'Курінь', exact: true }`). Телефонний viewport `375×812`:
1. юнак: нижня панель `getByRole('navigation', { name: 'Основна навігація' })` містить посилання «Новини», «Календар», «Моє пластування», «Курінь», «Налаштування»; **немає** «Діловодство» (5 пунктів); клік «Моє пластування» → `/plastuvannia`; клік по фото профілю (`getByRole('link', { name: 'Моя сторінка' })`) → `/me`;
2. виховник: центральна кнопка називається «Мій гурток» → `/my-hurtok`;
3. звʼязковий: центр «Моя проба» → `/plastuvannia`; є кнопка «Діловодство» (`aria-expanded=false`); клік → видно «Облік реманенту», «Суддівство», «Писарство», «Скарбниця»; клік «Писарство» → `/pysarstvo` і лист закритий; є «Налаштування»;
4. відсутність старого: на телефоні немає кнопки «Меню» (бургера) і перемикача теми в шапці.
Десктоп `1280×800` (звʼязковий): бічна панель `getByRole('navigation', { name: 'Основна навігація' })` видима; є посилання «Моя проба», «Новини», «Календар», «Курінь», «Налаштування» і картка профілю (`getByRole('link', { name: 'Моя сторінка' })`); «Діловодство» — кнопка (`aria-expanded=false` за замовчуванням), клік → підпункти видимі; нижньої панелі немає (одна `navigation` на сторінці видима).

- [ ] **Step 2: Запустити — FAIL.**

- [ ] **Step 3: `lib/nav-model.ts`**

```ts
import type { CurrentUserPayload, PositionType } from '@/lib/types';

export type NavIconName =
  | 'news' | 'calendar' | 'flag' | 'users' | 'tent' | 'briefcase' | 'settings'
  | 'inventory' | 'scale' | 'pen' | 'coins';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  /** Додаткові префікси маршрутів, на яких пункт теж активний. */
  alsoActiveOn?: string[];
}

export interface NavModel {
  left: NavItem[];
  center: NavItem;
  kurin: NavItem;
  dilovody: NavItem[];
  settings: NavItem & { badge: number };
}

const DILOVODY_PAGES: (NavItem & { position: PositionType })[] = [
  { href: '/inventory', label: 'Облік реманенту', icon: 'inventory', position: 'INTENDANT' },
  { href: '/suddivstvo', label: 'Суддівство', icon: 'scale', position: 'SUDDIA' },
  { href: '/pysarstvo', label: 'Писарство', icon: 'pen', position: 'PYSAR' },
  { href: '/treasury', label: 'Скарбниця', icon: 'coins', position: 'SKARBNYK' },
];

export function isActive(item: NavItem, pathname: string | null): boolean {
  if (!pathname) return false;
  const prefixes = [item.href, ...(item.alsoActiveOn ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function buildNav(session: CurrentUserPayload, pendingRequests: number): NavModel {
  const center: NavItem =
    session.role === 'VYKHOVNYK'
      ? { href: '/my-hurtok', label: 'Мій гурток', icon: 'users' }
      : {
          href: '/plastuvannia',
          label: session.role === 'ZVYAZKOVYI' ? 'Моя проба' : 'Моє пластування',
          icon: 'flag',
          alsoActiveOn: ['/proby', '/ai-vykhovnyk', '/my-activity'],
        };

  const dilovody = DILOVODY_PAGES.filter(
    (page) =>
      session.role === 'ZVYAZKOVYI' || session.isKurinniy || session.positions.includes(page.position),
  ).map(({ position: _position, ...item }) => item);

  return {
    left: [
      { href: '/news', label: 'Новини', icon: 'news' },
      { href: '/calendar', label: 'Календар', icon: 'calendar' },
    ],
    center,
    kurin: { href: '/kurin', label: 'Курінь', icon: 'tent' },
    dilovody,
    settings: {
      href: '/settings',
      label: 'Налаштування',
      icon: 'settings',
      badge: session.role === 'ZVYAZKOVYI' ? pendingRequests : 0,
      alsoActiveOn: ['/approval-requests', '/audit-log'],
    },
  };
}
```
(Іконки в компонентах: мапа `NavIconName` → `lucide-react` — `Newspaper`, `CalendarDays`, `Flag`, `Users`, `Tent`, `Briefcase`, `SlidersHorizontal`, `Boxes`, `Scale`, `PenLine`, `Coins`; якщо якоїсь іконки немає в наявній версії `lucide-react`, підібрати найближчу.)

- [ ] **Step 4: `components/app-shell.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';
import { useOwnProfile } from '@/lib/queries/settings';
import { useKurin } from '@/lib/queries/kurin';
import { useApprovalRequests } from '@/lib/queries/approval-requests-list';
import { buildNav } from '@/lib/nav-model';
import { MobileHeader } from '@/components/mobile-header';
import { BottomNav } from '@/components/bottom-nav';
import { SidebarNav } from '@/components/sidebar-nav';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const { data: kurin } = useKurin({ enabled: !!session });
  const { data: profile } = useOwnProfile({ enabled: !!session });
  const isZvyazkovyi = session?.role === 'ZVYAZKOVYI';
  const { data: pending } = useApprovalRequests('PENDING', { enabled: isZvyazkovyi });

  // Пароль, призначений за користувача (новий звʼязковий, юнак з тимчасовим паролем),
  // треба замінити до будь-чого іншого — читаємо наживо з профілю, а не з JWT.
  useEffect(() => {
    if (profile?.mustChangePassword && pathname !== '/settings') {
      router.replace('/settings');
    }
  }, [profile?.mustChangePassword, pathname, router]);

  if (!session) return <main className="p-4">{children}</main>;

  const nav = buildNav(session, pending?.length ?? 0);
  const kurinTitle = kurin
    ? `${kurin.kurinNumber ? `Курінь ч.${kurin.kurinNumber}` : 'Підготовчий курінь'} ${kurin.name.replace(/^курінь\s+/i, '')}`
    : '';

  return (
    <div className="sm:flex sm:min-h-screen">
      <SidebarNav nav={nav} profile={profile} role={session.role} kurinTitle={kurinTitle} pathname={pathname} />
      <div className="min-w-0 flex-1">
        <MobileHeader profile={profile} kurinTitle={kurinTitle} />
        <main className="p-4 pb-32 sm:p-8">{children}</main>
      </div>
      <BottomNav nav={nav} pathname={pathname} />
    </div>
  );
}
```
(Підібрати точні типи пропсів: `profile` — `UserDetail | undefined`; перед кодом переконатися, що поточна поведінка «без сесії» (сторінка логіну тощо) не змінилась — раніше `<Nav />` повертав `null`, а `<main className="p-4">` рендерився завжди.)

- [ ] **Step 5: `components/mobile-header.tsx`**

`sm:hidden`. Логотип (`/logo.webp`, `next/image`, як у старому `nav.tsx`), `єПластун` + назва куреня в один рядок з `truncate`, праворуч **посилання** `<Link href="/me" aria-label="Моя сторінка">` з `Avatar` (initials + фото, як у старому `nav.tsx`). Жодного перемикача теми, бургера, «Вийти».

- [ ] **Step 6: `components/bottom-nav.tsx`**

`'use client'`; `sm:hidden fixed inset-x-3 z-40` з `bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))`; `<nav aria-label="Основна навігація">`; капсула: `rounded-[2rem] border border-border bg-popover shadow-lg px-1.5 py-2`; сітка `grid items-end`: 5 колонок `grid-cols-[1fr_1fr_5rem_1fr_1fr]` без діловодства, 6 колонок `grid-cols-[1fr_1fr_4.5rem_1fr_1fr_1fr]` з ним (підпис у 6-колонковому режимі — `text-[9.5px]`, інакше `text-[10.5px]`). Порядок: `nav.left[0]`, `nav.left[1]`, **центр**, `nav.kurin`, [Діловодство], `nav.settings`.
- Звичайний пункт: `Link` з іконкою у плашці `h-[30px] w-9 rounded-[11px]` (активний — `bg-primary text-primary-foreground`, інакше без фону) і підписом; `aria-current="page"` для активного (`isActive`). Бейдж запитів (`nav.settings.badge > 0`) — кружок угорі іконки.
- Центр: `Link` з круглою іконкою `size-[62px] -mt-8 rounded-full bg-primary text-primary-foreground` з обідком `border-[5px]` кольору панелі (`border-popover`), підпис під нею; активний — кільце `ring-4 ring-accent-soft`.
- Діловодство: якщо `nav.dilovody.length === 0` — пункту немає (5 колонок); якщо `=== 1` — звичайне `Link` на цю єдину сторінку з її власними іконкою та підписом (6 колонок, лист не потрібен); якщо `> 1` — `button` (`aria-expanded`, `aria-haspopup="dialog"`) що відкриває лист: абсолютний блок над панеллю (`bottom` над капсулою, `rounded-[1.4rem] border bg-popover p-2 shadow-lg`, `role="dialog" aria-label="Діловодство"`) зі списком `Link` (іконка + підпис) і напівпрозорим фоном-закривачем; лист закривається по кліку на фон, на пункт і при зміні `pathname` (`useEffect`). Активний — коли поточний маршрут один із `nav.dilovody`.
- Візуально звіритись із макетом (`bottom` панель у режимах «Юнак», «Звʼязковий», з/без діловодства).

- [ ] **Step 7: `components/sidebar-nav.tsx`**

`hidden sm:flex`, `w-[250px] shrink-0 flex-col gap-3.5 border-r border-border bg-popover px-3 py-[18px] sticky top-0 h-screen`; всередині `<nav aria-label="Основна навігація">` (одна видима `navigation` на сторінці: на десктопі нижня панель має `sm:hidden`, тож не конфліктує):
- верх: логотип + `єПластун` + назва куреня;
- виділена кнопка центру (`bg-primary text-primary-foreground`, іконка + підпис), активна — кільце;
- «Новини», «Календар», «Курінь» — пункти (`rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent-soft hover:text-accent-text`, активний — `bg-accent-soft text-accent-text font-semibold`, `aria-current="page"`);
- «Діловодство»: якщо `dilovody.length > 1` — `button` (`aria-expanded`, шеврон) що розгортає вкладений список (`ml-5 border-l pl-2`); **за замовчуванням згорнуто, якщо активна сторінка не всередині групи** (тоді розгорнуто); якщо `=== 1` — звичайне посилання на цю сторінку з її власним підписом; якщо `0` — немає;
- низ (`mt-auto`): «Налаштування» (з бейджем) і картка профілю — `Link href="/me" aria-label="Моя сторінка"` з аватаром, імʼям і чипом ролі (підписи ролей: «Юнак», «Виховник», «Звʼязковий»; використати підписи посад, якщо користувач має єдину позицію — це не обовʼязково).
- Для `profile` ще не завантаженого — скелетон/порожньо без помилок.

- [ ] **Step 8: Підключити в `app/layout.tsx`**

Замінити
```tsx
<Nav />
<main className="p-4">{children}</main>
```
на `<AppShell>{children}</AppShell>` (імпорт `@/components/app-shell`); видалити імпорт `Nav`. Видалити файл `components/nav.tsx` та `e2e/nav-burger-menu.spec.ts` (його покриття переходить у `navigation-shell.spec.ts`).

- [ ] **Step 9: Запустити e2e + tsc — PASS**

`npx playwright test e2e/navigation-shell.spec.ts` і `npx tsc --noEmit`. Зробити по одному скріншоту (Playwright `page.screenshot`) на `375×812` (юнак, звʼязковий) і `1280×800` (звʼязковий) у тимчасову теку (не коміттити), переглянути й виправити явні дефекти (обрізання підписів, накладання, відступи).

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/nav-model.ts apps/web/components apps/web/app/layout.tsx apps/web/e2e
git commit -m "feat(web): bottom navigation on mobile and sidebar on desktop, replace burger menu"
```

---

### Task 4: Регресія e2e, прибирання, документація

**Files:**
- Modify: наявні `apps/web/e2e/*.spec.ts`, що клікають старі пункти меню
- Modify: `docs/backlog.md`

**Interfaces:**
- Consumes: усе з Task 1–3.

- [ ] **Step 1: Прогнати весь web e2e**

З `apps/web`, з env з Global Constraints: `npx playwright test 2>&1 | tail -60`. (Може тривати кілька хвилин — використати великий timeout або фон.) Зібрати список падінь.

- [ ] **Step 2: Класифікувати й виправити**

Для кожного падіння з'ясувати причину. **Очікувані** (виправляти в тестах, не в коді): тести, що клікають зниклі пункти першого рівня — `Моя проба`, `Моя активність`, `AI-виховник`, `Запити`, `Журнал дій`, `Налаштування` (тепер це `Налаштування` + швидкі дії), випадне «Діловодство» (`page.getByText('Діловодство').click()` має працювати й надалі: на десктопі це кнопка в бічній панелі). Оновити навігаційні кроки: до «Моя проба/Моя активність/AI-виховник» — через `/plastuvannia` (клік «Моє пластування», потім плитка) або прямий `page.goto`; до «Запитів/Журналу» — через «Налаштування». Використовувати `exact: true` там, де `name: 'Курінь'` збігається з логотипом. **Не очікувані** падіння (поведінка змінилась, а тест не мав би) — це дефект коду; виправити код. Давній `treasury.spec.ts:40` — пропустити (не наш).

- [ ] **Step 3: Повторний повний прогін — усе зелене, крім `treasury.spec.ts:40`.** Записати підсумок (кількість спеків/тестів) у відповідь.

- [ ] **Step 4: Беклог**

У `docs/backlog.md` пункт `## 🔴 Мобільна навігація: нижня панель і хаб «Моє пластування»` перетворити на `## 🟢 Нова навігація: нижня панель, бічна панель, хаб «Моє пластування», «Моя сторінка»` у форматі сусідніх 🟢 пунктів (**Опис / Що зроблено / Поза скоупом / Далі**), лише фактично зроблене: нижня панель (5/6 пунктів, центр за роллю), лист «Діловодство», шапка з фото → `/me`, бічна панель на комп'ютері, `/plastuvannia`, `/my-hurtok`, `/me`, швидкі дії в `/settings` (запити, журнал, тема, вихід), бейдж запитів; spec/план; поза скоупом: плитка «Запит» неактивна («Скоро», чекає на «Запит юнака на документ»), історія юнака на `/me`, згорнута бічна панель. Прибрати з беклогу застарілі формулювання «потребує підтвердження» і чернетки рішень, що вже зроблені. Мову дотримати (без росіянізмів).

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e docs/backlog.md
git commit -m "test(web): update e2e for new navigation; docs: mark navigation redesign done"
```
