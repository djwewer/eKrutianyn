# Frontend Web Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first web client for the "Ядро + Проби" backend — a Next.js app covering all four roles' screens (JUNAK, VYKHOVNYK, KURINNYI, ZVYAZKOVYI) as designed in `docs/superpowers/specs/2026-08-29-frontend-design.md`.

**Architecture:** Next.js 15 (App Router) acts as a BFF proxy in front of the NestJS API. The JWT lives in an httpOnly cookie the browser's JS never touches; a single catch-all Route Handler forwards every API call server-side with the `Authorization` header attached. Client components use TanStack Query against that proxy. Tailwind + shadcn/ui for styling.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query (`@tanstack/react-query`), Playwright for e2e.

## Global Constraints

- **New workspace:** `apps/web`, sibling to `apps/api` in the existing npm-workspaces monorepo (root `package.json` already has `"workspaces": ["apps/*"]`).
- **BFF proxy only:** the browser never calls NestJS directly and never reads the JWT. All API access from client code goes through `/api/backend/...` (Next.js Route Handler), which reads the httpOnly cookie server-side and adds `Authorization: Bearer <token>`.
- **Ports:** NestJS API runs on port `3001` when co-located with the frontend (Next.js dev server owns the default `3000`). Every task's dev/test instructions assume `API_URL=http://localhost:3001`.
- **Language:** Ukrainian only, no i18n framework — every UI string is a literal Ukrainian string.
- **No pagination** — lists render everything the API returns (kurin-scale data, per the backend's own no-pagination decision).
- **No custom branding** — default shadcn palette; no custom fonts/colors/logo.
- **No offline mode** — a `manifest.json` + icon for installability only (Task 14), no service worker.
- **Simplicity in forms:** plain controlled `useState` forms throughout — no `react-hook-form`/`zod` dependency. These forms are small (a handful of fields); the extra library buys nothing here.
- **Every `User` row rendered on screen only ever contains fields the API already returned** — the frontend does no client-side filtering of sensitive fields (the backend's `select` whitelists already guarantee no `passwordHash`/`googleId` reach the client).
- **Error handling:** a `401` response from the proxy triggers a global redirect to `/login` (via TanStack Query's `QueryCache` `onError`, not per-hook). `403`/`404` render an inline "немає доступу"/"не знайдено" message, no detail. `400` shows validation messages from the API response next to the form.
- **Test infra:** Playwright e2e against a **real** Next.js dev server + a **real** NestJS dev server (`PORT=3001`) + the same Postgres test database the backend suite uses (`DATABASE_URL_TEST=postgresql://plast:plast@localhost:5432/plast_test`). Seed data via the NestJS **admin** HTTP endpoints (`x-admin-key` header, `ADMIN_API_KEY` env var) — never touch Prisma directly from `apps/web`. Every e2e task reuses the seed/login helpers built in Task 3.
- **Run e2e tests with:** `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test` (Playwright's `webServer` config starts both servers automatically — see Task 3).

## Backend Reference (exact shapes this plan's code depends on)

Copied verbatim from the backend source so no task needs to re-derive them:

- **Auth:** `POST /auth/login` `{email, password}` → `{accessToken}`. `POST /auth/google` `{idToken}` → `{accessToken}`. JWT payload: `{sub: userId, role, kurinId}`.
- **Role enum:** `JUNAK | VYKHOVNYK | KURINNYI | ZVYAZKOVYI`.
- **`GET /health`** → `{status: 'ok'}` (no auth).
- **`GET /users/me`** → `{id, firstName, lastName, nickname, email, role, birthDate, kurinId, hurtokId}`.
- **`GET /proby-programs/current`** → `{id, version, name, stages: [{id, order, name, categories: [{id, name, points: [{id, order, description}]}]}]}`.
- **`GET /junaky/:id/progress`** → `[{id, junakId, pointId, status: 'NOT_DONE'|'DONE', confirmedById, confirmedAt, transferredFromPointId, point: {id, order, description, categoryId}}]`.
- **`POST /junaky/:id/progress/:pointId/confirm`** / **`.../unconfirm`** → the upserted progress row (VYKHOVNYK only).
- **`GET /kurins/me`** → `{id, name, kurinNumber, gender, stanytsia, probyProgramId, createdAt, updatedAt}`.
- **`PATCH /kurins/:id/proby-program`** `{newProgramId}` → the updated kurin (ZVYAZKOVYI only).
- **`GET /users?role=&hurtokId=`** → array of `{id, firstName, lastName, nickname, email, role, birthDate, kurinId, hurtokId}`.
- **`GET /users/:id`** → same shape, plus `notes`, `phone`.
- **`POST /users`** `{firstName, lastName, email, role, password?, hurtokId?}` → created user (ZVYAZKOVYI only; `hurtokId` required for JUNAK/KURINNYI).
- **`PATCH /users/:id/contact-info`** `{notes?, phone?}` → updated user (KURINNYI or ZVYAZKOVYI).
- **`GET /hurtky`** → `[{id, kurinId, name, number}]`.
- **`POST /hurtky`** `{name, number?}` → created hurtok (ZVYAZKOVYI only).
- **`GET /hurtky/:id/board`** → `{hurtok: {id, name, number}, junaky: [{...user fields, progress: [...]}]}` (VYKHOVNYK if assigned, or ZVYAZKOVYI).
- **`GET /vykhovnyk-assignments?hurtokId=`** → `[{id, vykhovnykId, hurtokId}]`.
- **`POST /vykhovnyk-assignments`** `{vykhovnykId, hurtokId}` → created assignment (ZVYAZKOVYI only).
- **`DELETE /vykhovnyk-assignments/:id`** → `{success: true}` (ZVYAZKOVYI only).
- **`GET /approval-requests?status=`** → `[{id, initiatedById, junakId, actionType, oldData, newData, status, approvedById, decidedAt, createdAt}]` (ZVYAZKOVYI only).
- **`GET /approval-requests/:id`** → single request, same shape (ZVYAZKOVYI only).
- **`POST /approval-requests`** `{actionType, junakId?, newData}` → created request (KURINNYI only). `actionType` is one of `CHANGE_FULL_NAME | CHANGE_BIRTH_DATE | CHANGE_EMAIL | CHANGE_HURTOK | CREATE_JUNAK`. `junakId` required for all types except `CREATE_JUNAK`. `newData` shape by type: `CHANGE_FULL_NAME` → `{firstName, lastName}`; `CHANGE_BIRTH_DATE` → `{birthDate}`; `CHANGE_EMAIL` → `{email}`; `CHANGE_HURTOK` → `{hurtokId}`; `CREATE_JUNAK` → `{firstName, lastName, email, hurtokId, birthDate?}`.
- **`POST /approval-requests/:id/approve`** / **`.../reject`** → updated request (ZVYAZKOVYI only).
- **Admin bootstrap (header `x-admin-key: <ADMIN_API_KEY>`, no JWT):** `POST /admin/proby-programs` `{version: 'OLD'|'NEW', name}`; `POST /admin/proby-programs/:id/stages` `{order, name}`; `POST /admin/proby-stages/:id/categories` `{name}`; `POST /admin/proby-categories/:id/points` `{order, description}`; `POST /admin/kurins` `{name, kurinNumber, gender: 'MALE'|'FEMALE', stanytsia, probyProgramId}`; `POST /admin/kurins/zvyazkovyi` `{firstName, lastName, email, password, kurinId}`.

---

## Task 1: Scaffold the Next.js app

**Files:**
- Create: `apps/web/` (entire app, via `create-next-app`)
- Create: `apps/web/.env.local.example`
- Modify: root `package.json` (no change needed — `"workspaces": ["apps/*"]` already covers it; verify only)

**Interfaces:**
- Produces: the `apps/web` workspace itself, Tailwind configured, shadcn/ui initialized with `Button`, `Card`, `Input`, `Label` components available at `@/components/ui/*`. Every later task imports from these.

- [ ] **Step 1: Scaffold the app**

Run from the repo root (`/Users/user/Documents/Cowork Playground/eKrutianyn`):

```bash
npx create-next-app@latest apps/web --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
```

- [ ] **Step 2: Verify the workspace is picked up**

Run: `cat package.json` (repo root)
Expected: `"workspaces": ["apps/*"]` is already present — no edit needed. Run `npm install` from the repo root once to confirm `apps/web` resolves as a workspace member (no errors).

- [ ] **Step 3: Initialize shadcn/ui**

Run from `apps/web`:

```bash
npx shadcn@latest init -d
npx shadcn@latest add button card input label
```

- [ ] **Step 4: Install TanStack Query**

Run from `apps/web`:

```bash
npm install @tanstack/react-query
```

- [ ] **Step 5: Add the env example**

Create `apps/web/.env.local.example`:

```
API_URL=http://localhost:3001
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ADMIN_API_KEY=dev-admin-key
```

- [ ] **Step 6: Verify the app builds**

Run: `cd apps/web && npm run build`
Expected: build succeeds with the default Next.js starter page.

- [ ] **Step 7: Commit**

```bash
git add apps/web package-lock.json
git commit -m "chore: scaffold Next.js frontend app"
```

---

## Task 2: BFF proxy, session endpoint, and API client

**Files:**
- Create: `apps/web/app/api/backend/[...path]/route.ts`
- Create: `apps/web/app/api/session/route.ts`
- Create: `apps/web/lib/api-client.ts`
- Create: `apps/web/lib/types.ts`

**Interfaces:**
- Consumes: `process.env.API_URL` (set in `.env.local`, defaults to `http://localhost:3001`).
- Produces: `apiFetch<T>(path: string, options?: RequestInit): Promise<T>` and `class ApiError extends Error { status: number; body: unknown }` from `lib/api-client.ts` — every later task's data-fetching code uses this. `Role` type and `CurrentUserPayload` type from `lib/types.ts` — every later task importing role/session types uses these exact names.

- [ ] **Step 1: Create shared types**

Create `apps/web/lib/types.ts`:

```ts
export type Role = 'JUNAK' | 'VYKHOVNYK' | 'KURINNYI' | 'ZVYAZKOVYI';

export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
}

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  email: string;
  role: Role;
  birthDate: string | null;
  kurinId: string;
  hurtokId: string | null;
}

export interface UserDetail extends UserSummary {
  notes: string | null;
  phone: string | null;
}

export interface Hurtok {
  id: string;
  kurinId: string;
  name: string;
  number: string | null;
}

export interface ProbyPoint {
  id: string;
  order: number;
  description: string;
  categoryId: string;
}

export interface ProbyCategory {
  id: string;
  name: string;
  points: ProbyPoint[];
}

export interface ProbyStage {
  id: string;
  order: number;
  name: string;
  categories: ProbyCategory[];
}

export interface ProbyProgram {
  id: string;
  version: 'OLD' | 'NEW';
  name: string;
  stages: ProbyStage[];
}

export type ProgressStatus = 'NOT_DONE' | 'DONE';

export interface JunakProgress {
  id: string;
  junakId: string;
  pointId: string;
  status: ProgressStatus;
  confirmedById: string | null;
  confirmedAt: string | null;
  transferredFromPointId: string | null;
  point: ProbyPoint;
}

export interface HurtokBoard {
  hurtok: { id: string; name: string; number: string | null };
  junaky: (UserSummary & { progress: JunakProgress[] })[];
}

export interface VykhovnykAssignment {
  id: string;
  vykhovnykId: string;
  hurtokId: string;
}

export type ApprovalActionType =
  | 'CHANGE_FULL_NAME'
  | 'CHANGE_BIRTH_DATE'
  | 'CHANGE_EMAIL'
  | 'CHANGE_HURTOK'
  | 'CREATE_JUNAK';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApprovalRequest {
  id: string;
  initiatedById: string;
  junakId: string | null;
  actionType: ApprovalActionType;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown>;
  status: ApprovalStatus;
  approvedById: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface Kurin {
  id: string;
  name: string;
  kurinNumber: string;
  gender: 'MALE' | 'FEMALE';
  stanytsia: string;
  probyProgramId: string;
}
```

- [ ] **Step 2: Create the API client**

Create `apps/web/lib/api-client.ts`:

```ts
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/backend${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
```

- [ ] **Step 3: Create the BFF proxy route**

Create `apps/web/app/api/backend/[...path]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

async function proxy(request: NextRequest, path: string[]) {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  const targetUrl = `${API_URL}/${path.join('/')}${request.nextUrl.search}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const body = hasBody ? await request.text() : undefined;

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
  });

  const responseBody = await response.text();
  return new NextResponse(responseBody, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  return proxy(request, (await params).path);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  return proxy(request, (await params).path);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return proxy(request, (await params).path);
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return proxy(request, (await params).path);
}
```

- [ ] **Step 4: Create the session route**

Create `apps/web/app/api/session/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { CurrentUserPayload } from '@/lib/types';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) {
    return NextResponse.json(null);
  }

  try {
    const payloadBase64 = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));
    const session: CurrentUserPayload = {
      userId: decoded.sub,
      role: decoded.role,
      kurinId: decoded.kurinId,
    };
    return NextResponse.json(session);
  } catch {
    return NextResponse.json(null);
  }
}
```

- [ ] **Step 5: Verify manually**

Run: `cd apps/web && npm run build`
Expected: build succeeds, no TypeScript errors.

Run (with the API not yet necessarily running — this only checks the route compiles and responds):
```bash
cd apps/web && npm run dev &
sleep 3
curl -s http://localhost:3000/api/session
```
Expected: `null` (no cookie set yet).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api apps/web/lib
git commit -m "feat: add BFF proxy, session endpoint, and API client"
```

---

## Task 3: Auth (login, Google SSO, logout, middleware) + Playwright infrastructure

**Files:**
- Create: `apps/web/app/login/page.tsx`
- Create: `apps/web/components/google-signin-button.tsx`
- Create: `apps/web/app/api/auth/login/route.ts`
- Create: `apps/web/app/api/auth/google/route.ts`
- Create: `apps/web/app/api/auth/logout/route.ts`
- Create: `apps/web/middleware.ts`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/helpers/seed.ts`
- Create: `apps/web/e2e/helpers/auth.ts`
- Create: `apps/web/e2e/login.spec.ts`

**Interfaces:**
- Consumes: `apiFetch` is NOT used here (auth route handlers talk to NestJS directly, not through the proxy, since they're the ones setting the cookie the proxy later reads).
- Produces: `seedKurin(prisma-free, via admin API)` helpers in `e2e/helpers/seed.ts` — `seedProbyProgram(page_or_request)`, `seedKurinWithZvyazkovyi(...)`, `createUserAs(...)` — every later task's e2e test imports these. `loginAs(page, email, password)` from `e2e/helpers/auth.ts` — every later task's e2e test uses this to log in before exercising a screen.

- [ ] **Step 1: Install Playwright**

Run from `apps/web`:

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create the login page**

Create `apps/web/app/login/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GoogleSignInButton } from '@/components/google-signin-button';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError('Невірний email або пароль');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Вхід</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Зачекайте...' : 'Увійти'}
            </Button>
          </form>
          <div className="mt-4">
            <GoogleSignInButton />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Create the Google sign-in button**

Create `apps/web/components/google-signin-button.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: { theme: string; size: string }) => void;
        };
      };
    };
  }
}

export function GoogleSignInButton() {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;

    async function handleCredential(response: { credential: string }) {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: response.credential }),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
      }
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      if (window.google && buttonRef.current) {
        window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
        window.google.accounts.id.renderButton(buttonRef.current, { theme: 'outline', size: 'large' });
      }
    };
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [router, clientId]);

  if (!clientId) return null;

  return <div ref={buttonRef} />;
}
```

Note: Google SSO is not exercised by any Playwright test in this plan — it requires a real Google account and cannot be automated without live credentials. This is a documented limitation, not a gap in this task.

- [ ] **Step 4: Create the auth route handlers**

Create `apps/web/app/api/auth/login/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const apiRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!apiRes.ok) {
    return new NextResponse(await apiRes.text(), { status: apiRes.status });
  }

  const { accessToken } = await apiRes.json();
  const response = NextResponse.json({ success: true });
  response.cookies.set('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  });
  return response;
}
```

Create `apps/web/app/api/auth/google/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const apiRes = await fetch(`${API_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!apiRes.ok) {
    return new NextResponse(await apiRes.text(), { status: apiRes.status });
  }

  const { accessToken } = await apiRes.json();
  const response = NextResponse.json({ success: true });
  response.cookies.set('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  });
  return response;
}
```

Create `apps/web/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('accessToken');
  return response;
}
```

- [ ] **Step 5: Create the middleware**

Create `apps/web/middleware.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('accessToken');
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 6: Create the Playwright config**

Create `apps/web/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

const DATABASE_URL_TEST =
  process.env.DATABASE_URL_TEST ?? 'postgresql://plast:plast@localhost:5432/plast_test';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: [
    {
      command: 'npm run start:dev',
      cwd: '../api',
      url: 'http://localhost:3001/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: '3001',
        DATABASE_URL: DATABASE_URL_TEST,
        ADMIN_API_KEY,
        JWT_SECRET,
      },
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        API_URL: 'http://localhost:3001',
      },
    },
  ],
});
```

- [ ] **Step 7: Create the seed helper**

Create `apps/web/e2e/helpers/seed.ts`:

```ts
const API_URL = 'http://localhost:3001';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

async function adminPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Admin seed request failed: ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function seedProbyProgram(pointDescriptions: string[] = ['Точка 1']) {
  const program = await adminPost<{ id: string }>('/admin/proby-programs', {
    version: 'OLD',
    name: `Програма ${Date.now()}`,
  });
  const stage = await adminPost<{ id: string }>(`/admin/proby-programs/${program.id}/stages`, {
    order: 1,
    name: 'Ступінь 1',
  });
  const category = await adminPost<{ id: string }>(`/admin/proby-stages/${stage.id}/categories`, {
    name: 'Категорія 1',
  });
  const points = [];
  for (let i = 0; i < pointDescriptions.length; i++) {
    points.push(
      await adminPost<{ id: string }>(`/admin/proby-categories/${category.id}/points`, {
        order: i + 1,
        description: pointDescriptions[i],
      }),
    );
  }
  return { program, stage, category, points };
}

export async function seedKurinWithZvyazkovyi(probyProgramId: string) {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const kurin = await adminPost<{ id: string }>('/admin/kurins', {
    name: `Курінь ${uniqueSuffix}`,
    kurinNumber: '1',
    gender: 'MALE',
    stanytsia: 'Тестова станиця',
    probyProgramId,
  });
  const email = `zvyazkovyi-${uniqueSuffix}@example.com`;
  const password = 'password123';
  const zvyazkovyi = await adminPost<{ id: string; email: string }>('/admin/kurins/zvyazkovyi', {
    firstName: 'Зв\'язковий',
    lastName: 'Тестовий',
    email,
    password,
    kurinId: kurin.id,
  });
  return { kurin, zvyazkovyi, zvyazkovyiEmail: email, zvyazkovyiPassword: password };
}
```

- [ ] **Step 8: Create the login helper**

Create `apps/web/e2e/helpers/auth.ts`:

```ts
import { Page } from '@playwright/test';

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Увійти' }).click();
  await page.waitForURL((url) => url.pathname !== '/login');
}
```

- [ ] **Step 9: Write the login e2e test**

Create `apps/web/e2e/login.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets a zvyazkovyi log in with email and password', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);

  await expect(page).not.toHaveURL(/\/login$/);
});

test('shows an error and stays on the login page for wrong credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Пароль').fill('wrongpassword');
  await page.getByRole('button', { name: 'Увійти' }).click();

  await expect(page.getByText('Невірний email або пароль')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('redirects an unauthenticated visitor to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});
```

- [ ] **Step 10: Run the tests**

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test e2e/login.spec.ts`
Expected: 3 tests pass. (At this point in the plan, `/` still serves the default starter page `create-next-app` generated in Task 1 — Task 4 replaces it with the real role-based redirect. The login tests only assert the URL is no longer `/login` after a successful submit, which holds regardless of what `/` currently renders, so all 3 tests pass now and continue to pass unchanged after Task 4 replaces the page content.)

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/login apps/web/app/api/auth apps/web/components/google-signin-button.tsx apps/web/middleware.ts apps/web/playwright.config.ts apps/web/e2e package.json package-lock.json
git commit -m "feat: add login, Google SSO, logout, and auth middleware"
```

---

## Task 4: Shared shell — root layout, nav, QueryClientProvider, home redirect

**Files:**
- Create: `apps/web/components/query-provider.tsx`
- Create: `apps/web/lib/session-client.ts`
- Create: `apps/web/components/nav.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/page.tsx` (currently the default `create-next-app` starter page from Task 1)
- Test: `apps/web/e2e/home-redirect.spec.ts`

**Interfaces:**
- Consumes: `apiFetch`, `CurrentUserPayload`, `Role` (Task 2); `loginAs`, `seedProbyProgram`, `seedKurinWithZvyazkovyi` (Task 3).
- Produces: `useSession(): { data: CurrentUserPayload | null | undefined, isLoading: boolean }` from `lib/session-client.ts` — every later task's role-aware component uses this. `<QueryProvider>` wraps the whole app — no later task needs to re-wrap anything.

- [ ] **Step 1: Create the QueryClientProvider with global 401 handling**

Create `apps/web/components/query-provider.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api-client';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (error instanceof ApiError && error.status === 401) {
              router.push('/login');
            }
          },
        }),
        defaultOptions: {
          queries: { retry: false },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 2: Create the session hook**

Create `apps/web/lib/session-client.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import type { CurrentUserPayload } from '@/lib/types';

async function fetchSession(): Promise<CurrentUserPayload | null> {
  const res = await fetch('/api/session');
  return res.json();
}

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: fetchSession,
  });
}
```

- [ ] **Step 3: Create the nav component**

Create `apps/web/components/nav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';
import { Button } from '@/components/ui/button';

const LINKS_BY_ROLE: Record<string, { href: string; label: string }[]> = {
  JUNAK: [{ href: '/proby', label: 'Моя проба' }],
  VYKHOVNYK: [{ href: '/hurtky', label: 'Мої гуртки' }],
  KURINNYI: [
    { href: '/proby', label: 'Моя проба' },
    { href: '/users', label: 'Юнаки' },
    { href: '/vykhovnyk-assignments', label: 'Виховники' },
  ],
  ZVYAZKOVYI: [
    { href: '/approval-requests', label: 'Запити' },
    { href: '/users', label: 'Люди' },
    { href: '/hurtky', label: 'Гуртки' },
    { href: '/vykhovnyk-assignments', label: 'Призначення' },
    { href: '/kurin', label: 'Курінь' },
  ],
};

export function Nav() {
  const router = useRouter();
  const { data: session } = useSession();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  if (!session) return null;

  const links = LINKS_BY_ROLE[session.role] ?? [];

  return (
    <nav className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-4">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="text-sm font-medium">
            {link.label}
          </Link>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={handleLogout}>
        Вийти
      </Button>
    </nav>
  );
}
```

- [ ] **Step 4: Wire the layout**

Replace the contents of `apps/web/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/components/query-provider';
import { Nav } from '@/components/nav';

export const metadata: Metadata = {
  title: 'Пласт — Ядро і Проби',
  description: 'Облік проб та структури куреня',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
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

- [ ] **Step 5: Replace the home page with the role-based redirect**

Replace the full contents of `apps/web/app/page.tsx` (currently the `create-next-app` starter page) with:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';

const HOME_BY_ROLE: Record<string, string> = {
  JUNAK: '/proby',
  VYKHOVNYK: '/hurtky',
  KURINNYI: '/proby',
  ZVYAZKOVYI: '/approval-requests',
};

export default function HomePage() {
  const router = useRouter();
  const { data: session, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading && session) {
      router.replace(HOME_BY_ROLE[session.role] ?? '/login');
    }
  }, [session, isLoading, router]);

  return null;
}
```

- [ ] **Step 6: Write the home-redirect e2e test**

Create `apps/web/e2e/home-redirect.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('redirects zvyazkovyi from / to /approval-requests', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);

  await expect(page).toHaveURL(/\/approval-requests$/);
});
```

- [ ] **Step 7: Run the tests**

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test e2e/login.spec.ts e2e/home-redirect.spec.ts`
Expected: all tests pass (the two Step-9-Task-3 tests that depended on `/` now correctly assert the final destination).

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/query-provider.tsx apps/web/lib/session-client.ts apps/web/components/nav.tsx apps/web/app/layout.tsx apps/web/app/page.tsx apps/web/e2e/home-redirect.spec.ts
git commit -m "feat: add app shell, role-based nav, and home redirect"
```

---

## Task 5: Proby screen (JUNAK and KURINNYI)

**Files:**
- Create: `apps/web/lib/queries/proby.ts`
- Create: `apps/web/app/proby/page.tsx`
- Create: `apps/web/e2e/helpers/proby-seed.ts`
- Test: `apps/web/e2e/proby.spec.ts`

**Interfaces:**
- Consumes: `apiFetch`, types from Task 2; `useSession` (Task 4); `seedProbyProgram`, `seedKurinWithZvyazkovyi` (Task 3).
- Produces: `useProbyProgram()`, `useJunakProgress(junakId: string)` hooks — no later task in this plan depends on these directly, but Task 6's board reuses the same progress-rendering pattern.

- [ ] **Step 1: Create the proby query hooks**

Create `apps/web/lib/queries/proby.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProbyProgram, JunakProgress } from '@/lib/types';

export function useProbyProgram() {
  return useQuery({
    queryKey: ['proby-programs', 'current'],
    queryFn: () => apiFetch<ProbyProgram>('/proby-programs/current'),
  });
}

export function useJunakProgress(junakId: string | undefined) {
  return useQuery({
    queryKey: ['junaky', junakId, 'progress'],
    queryFn: () => apiFetch<JunakProgress[]>(`/junaky/${junakId}/progress`),
    enabled: !!junakId,
  });
}
```

- [ ] **Step 2: Create the proby page**

Create `apps/web/app/proby/page.tsx`:

```tsx
'use client';

import { useSession } from '@/lib/session-client';
import { useProbyProgram, useJunakProgress } from '@/lib/queries/proby';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ProbyPage() {
  const { data: session } = useSession();
  const { data: program, isLoading: programLoading } = useProbyProgram();
  const { data: progress, isLoading: progressLoading } = useJunakProgress(session?.userId);

  if (programLoading || progressLoading) {
    return <p>Завантаження...</p>;
  }

  if (!program) {
    return <p>Не вдалося завантажити програму проб.</p>;
  }

  const doneByPointId = new Set(
    (progress ?? []).filter((p) => p.status === 'DONE').map((p) => p.pointId),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{program.name}</h1>
      {program.stages
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((stage) => (
          <Card key={stage.id}>
            <CardHeader>
              <CardTitle>{stage.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {stage.categories.map((category) => (
                <div key={category.id}>
                  <h3 className="mb-2 font-semibold">{category.name}</h3>
                  <ul className="space-y-1">
                    {category.points
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((point) => {
                        const done = doneByPointId.has(point.id);
                        return (
                          <li key={point.id} className="flex items-center gap-2">
                            <span aria-hidden>{done ? '✅' : '⬜'}</span>
                            <span>{point.description}</span>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
```

- [ ] **Step 3: Add a proby-progress seed helper**

Create `apps/web/e2e/helpers/proby-seed.ts`:

```ts
const API_URL = 'http://localhost:3001';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

export async function createHurtok(zvyazkovyiToken: string, name: string) {
  const res = await fetch(`${API_URL}/hurtky`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function createUserAs(zvyazkovyiToken: string, dto: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    throw new Error(`createUserAs failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function loginForToken(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const { accessToken } = await res.json();
  return accessToken;
}

export async function confirmPointAs(vykhovnykToken: string, junakId: string, pointId: string) {
  const res = await fetch(`${API_URL}/junaky/${junakId}/progress/${pointId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vykhovnykToken}` },
  });
  if (!res.ok) {
    throw new Error(`confirmPointAs failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function assignVykhovnyk(zvyazkovyiToken: string, vykhovnykId: string, hurtokId: string) {
  const res = await fetch(`${API_URL}/vykhovnyk-assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ vykhovnykId, hurtokId }),
  });
  if (!res.ok) {
    throw new Error(`assignVykhovnyk failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
```

- [ ] **Step 4: Write the e2e test**

Create `apps/web/e2e/proby.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken, confirmPointAs } from './helpers/proby-seed';

test('shows a junak their own confirmed and unconfirmed points', async ({ page }) => {
  const { program, points } = await seedProbyProgram(['Точка А', 'Точка Б']);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Вих',
    lastName: 'Овник',
    email: `vykhovnyk-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Юн',
    lastName: 'Ак',
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  const vykhovnykToken = await loginForToken(vykhovnyk.email, 'password123');
  // vykhovnyk needs an assignment to confirm; assign directly via API for setup speed
  await fetch('http://localhost:3001/vykhovnyk-assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id }),
  });
  const freshVykhovnykToken = await loginForToken(vykhovnyk.email, 'password123');
  await confirmPointAs(freshVykhovnykToken, junak.id, points[0].id);

  await loginAs(page, junak.email, 'password123');
  await page.goto('/proby');

  await expect(page.getByText('Точка А')).toBeVisible();
  await expect(page.getByText('Точка Б')).toBeVisible();
  const doneRow = page.locator('li', { hasText: 'Точка А' });
  await expect(doneRow).toContainText('✅');
  const notDoneRow = page.locator('li', { hasText: 'Точка Б' });
  await expect(notDoneRow).toContainText('⬜');
});
```

Note: `createUserAs` requires the created JUNAK to have `password` set (the fixture already includes it) since the test needs to log in as that junak afterward.

- [ ] **Step 5: Run the test**

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test e2e/proby.spec.ts`
Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/queries/proby.ts apps/web/app/proby apps/web/e2e/helpers/proby-seed.ts apps/web/e2e/proby.spec.ts
git commit -m "feat: add proby progress screen for junak and kurinniy"
```

---

## Task 6: Vykhovnyk — hurtky list and board (confirm/unconfirm)

**Files:**
- Create: `apps/web/lib/queries/hurtky.ts`
- Create: `apps/web/app/hurtky/page.tsx`
- Create: `apps/web/app/hurtky/[id]/page.tsx`
- Test: `apps/web/e2e/board.spec.ts`

**Interfaces:**
- Consumes: `apiFetch`, types (Task 2); `useSession` (Task 4); seed/auth helpers (Tasks 3, 5).
- Produces: `useHurtky()`, `useHurtokBoard(id)`, `useConfirmPoint()`, `useUnconfirmPoint()` — no later task depends on these directly.

- [ ] **Step 1: Create the hurtky query hooks**

Create `apps/web/lib/queries/hurtky.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { Hurtok, HurtokBoard } from '@/lib/types';

export function useHurtky() {
  return useQuery({
    queryKey: ['hurtky'],
    queryFn: () => apiFetch<Hurtok[]>('/hurtky'),
  });
}

export function useHurtokBoard(hurtokId: string | undefined) {
  return useQuery({
    queryKey: ['hurtky', hurtokId, 'board'],
    queryFn: () => apiFetch<HurtokBoard>(`/hurtky/${hurtokId}/board`),
    enabled: !!hurtokId,
  });
}

export function useConfirmPoint(hurtokId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ junakId, pointId }: { junakId: string; pointId: string }) =>
      apiFetch(`/junaky/${junakId}/progress/${pointId}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hurtky', hurtokId, 'board'] });
    },
  });
}

export function useUnconfirmPoint(hurtokId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ junakId, pointId }: { junakId: string; pointId: string }) =>
      apiFetch(`/junaky/${junakId}/progress/${pointId}/unconfirm`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hurtky', hurtokId, 'board'] });
    },
  });
}
```

- [ ] **Step 2: Create the hurtky list page**

Create `apps/web/app/hurtky/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useHurtky } from '@/lib/queries/hurtky';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function HurtkyPage() {
  const { data: hurtky, isLoading } = useHurtky();

  if (isLoading) return <p>Завантаження...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Гуртки</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {(hurtky ?? []).map((h) => (
          <Link key={h.id} href={`/hurtky/${h.id}`}>
            <Card>
              <CardHeader>
                <CardTitle>
                  {h.name}
                  {h.number ? ` №${h.number}` : ''}
                </CardTitle>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the board page**

Create `apps/web/app/hurtky/[id]/page.tsx`:

```tsx
'use client';

import { use } from 'react';
import { useHurtokBoard, useConfirmPoint, useUnconfirmPoint } from '@/lib/queries/hurtky';
import { useProbyProgram } from '@/lib/queries/proby';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function HurtokBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: board, isLoading } = useHurtokBoard(id);
  const { data: program } = useProbyProgram();
  const confirmMutation = useConfirmPoint(id);
  const unconfirmMutation = useUnconfirmPoint(id);

  if (isLoading) return <p>Завантаження...</p>;
  if (!board) return <p>Гурток не знайдено.</p>;

  const allPoints = (program?.stages ?? []).flatMap((stage) =>
    stage.categories.flatMap((category) => category.points),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{board.hurtok.name}</h1>
      {board.junaky.map((junak) => {
        const doneByPointId = new Map(
          junak.progress.filter((p) => p.status === 'DONE').map((p) => [p.pointId, p]),
        );
        return (
          <Card key={junak.id}>
            <CardHeader>
              <CardTitle>
                {junak.lastName} {junak.firstName}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {allPoints.map((point) => {
                const done = doneByPointId.has(point.id);
                return (
                  <div key={point.id} className="flex items-center justify-between gap-2">
                    <span>{point.description}</span>
                    {done ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          unconfirmMutation.mutate({ junakId: junak.id, pointId: point.id })
                        }
                      >
                        Зняти
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() =>
                          confirmMutation.mutate({ junakId: junak.id, pointId: point.id })
                        }
                      >
                        Підтвердити
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Write the e2e test**

Create `apps/web/e2e/board.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken, assignVykhovnyk } from './helpers/proby-seed';

test('lets a vykhovnyk confirm a point on the hurtok board', async ({ page }) => {
  const { program, points } = await seedProbyProgram(['Точка А']);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const vykhovnykEmail = `vykhovnyk-${Date.now()}@example.com`;
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Вих',
    lastName: 'Овник',
    email: vykhovnykEmail,
    role: 'VYKHOVNYK',
    password: 'password123',
  });
  await assignVykhovnyk(zvyazkovyiToken, vykhovnyk.id, hurtok.id);
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Юн',
    lastName: 'Ак',
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, vykhovnykEmail, 'password123');
  await page.goto(`/hurtky/${hurtok.id}`);

  await expect(page.getByText(`${junak.lastName} ${junak.firstName}`)).toBeVisible();
  await page.getByRole('button', { name: 'Підтвердити' }).click();
  await expect(page.getByRole('button', { name: 'Зняти' })).toBeVisible();
});
```

- [ ] **Step 5: Run the test**

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test e2e/board.spec.ts`
Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/queries/hurtky.ts apps/web/app/hurtky apps/web/e2e/board.spec.ts
git commit -m "feat: add hurtky list and board with confirm/unconfirm"
```

---

## Task 7: Kurinniy/Zvyazkovyi — users list and detail (view + direct contact-info edit)

**Files:**
- Create: `apps/web/lib/queries/users.ts`
- Create: `apps/web/app/users/page.tsx`
- Create: `apps/web/app/users/[id]/page.tsx`
- Test: `apps/web/e2e/users-detail.spec.ts`

**Interfaces:**
- Consumes: `apiFetch`, types (Task 2); `useSession` (Task 4).
- Produces: `useUsers(filters)`, `useUser(id)`, `useUpdateContactInfo(id)` — Task 8 and Task 9 reuse `useUsers`/`useUser`.

- [ ] **Step 1: Create the users query hooks**

Create `apps/web/lib/queries/users.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { UserSummary, UserDetail, Role } from '@/lib/types';

export function useUsers(filters: { role?: Role; hurtokId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.role) params.set('role', filters.role);
  if (filters.hurtokId) params.set('hurtokId', filters.hurtokId);
  const query = params.toString();

  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => apiFetch<UserSummary[]>(`/users${query ? `?${query}` : ''}`),
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => apiFetch<UserDetail>(`/users/${id}`),
    enabled: !!id,
  });
}

export function useUpdateContactInfo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { notes?: string; phone?: string }) =>
      apiFetch<UserDetail>(`/users/${id}/contact-info`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', id] });
    },
  });
}
```

- [ ] **Step 2: Create the users list page**

Create `apps/web/app/users/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useSession } from '@/lib/session-client';
import { useUsers } from '@/lib/queries/users';
import { Card, CardContent } from '@/components/ui/card';

export default function UsersPage() {
  const { data: session } = useSession();
  const { data: users, isLoading } = useUsers();

  if (isLoading) return <p>Завантаження...</p>;

  const title = session?.role === 'ZVYAZKOVYI' ? 'Люди куреня' : 'Юнаки куреня';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="space-y-2">
        {(users ?? []).map((u) => (
          <Link key={u.id} href={`/users/${u.id}`}>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <span>
                  {u.lastName} {u.firstName}
                </span>
                <span className="text-sm text-muted-foreground">{u.role}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the user detail page**

Create `apps/web/app/users/[id]/page.tsx`:

```tsx
'use client';

import { use, useState, useEffect } from 'react';
import { useUser, useUpdateContactInfo } from '@/lib/queries/users';
import { useSession } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: user, isLoading } = useUser(id);
  const { data: session } = useSession();
  const updateContactInfo = useUpdateContactInfo(id);
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (user) {
      setNotes(user.notes ?? '');
      setPhone(user.phone ?? '');
    }
  }, [user]);

  if (isLoading) return <p>Завантаження...</p>;
  if (!user) return <p>Не знайдено.</p>;

  const canEditContactInfo =
    session?.role === 'ZVYAZKOVYI' || (session?.role === 'KURINNYI' && user.role === 'JUNAK');

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">
        {user.lastName} {user.firstName}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Дані</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Email: {user.email}</p>
          <p>Роль: {user.role}</p>
          {user.birthDate && <p>Дата народження: {user.birthDate}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Контакти</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Телефон</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!canEditContactInfo}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Нотатки</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEditContactInfo}
            />
          </div>
          {canEditContactInfo && (
            <Button onClick={() => updateContactInfo.mutate({ notes, phone })}>
              Зберегти
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Write the e2e test**

Create `apps/web/e2e/users-detail.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi edit a junak\'s contact info directly', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Юн',
    lastName: 'Ак',
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/${junak.id}`);

  await page.getByLabel('Телефон').fill('+380001112233');
  await page.getByRole('button', { name: 'Зберегти' }).click();

  await page.reload();
  await expect(page.getByLabel('Телефон')).toHaveValue('+380001112233');
});
```

- [ ] **Step 5: Run the test**

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test e2e/users-detail.spec.ts`
Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/queries/users.ts apps/web/app/users apps/web/e2e/users-detail.spec.ts
git commit -m "feat: add users list and detail with contact-info editing"
```

---

## Task 8: Kurinniy — create junak and key-field changes via approval-request

**Files:**
- Create: `apps/web/lib/queries/approval-requests.ts`
- Create: `apps/web/app/users/new/page.tsx`
- Modify: `apps/web/app/users/[id]/page.tsx`
- Test: `apps/web/e2e/approval-request-create.spec.ts`

**Interfaces:**
- Consumes: `apiFetch`, types (Task 2); `useUser` (Task 7).
- Produces: `useCreateApprovalRequest()` — Task 12 (zvyazkovyi's approve/reject screen) does NOT reuse this mutation (it uses its own approve/reject mutations), but reads the same `ApprovalRequest` type from Task 2.

- [ ] **Step 1: Create the approval-request creation hook**

Create `apps/web/lib/queries/approval-requests.ts`:

```ts
'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ApprovalActionType, ApprovalRequest } from '@/lib/types';

export function useCreateApprovalRequest() {
  return useMutation({
    mutationFn: (data: { actionType: ApprovalActionType; junakId?: string; newData: Record<string, unknown> }) =>
      apiFetch<ApprovalRequest>('/approval-requests', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}
```

- [ ] **Step 2: Create the "add junak" page (kurinniy only — creates an approval-request, not a user directly)**

Create `apps/web/app/users/new/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateApprovalRequest } from '@/lib/queries/approval-requests';
import { useHurtky } from '@/lib/queries/hurtky';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function NewJunakRequestPage() {
  const router = useRouter();
  const { data: hurtky } = useHurtky();
  const createRequest = useCreateApprovalRequest();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [hurtokId, setHurtokId] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createRequest.mutateAsync({
      actionType: 'CREATE_JUNAK',
      newData: { firstName, lastName, email, hurtokId },
    });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Card className="max-w-md">
        <CardContent className="p-6">
          <p>Запит створено. Юнак з&apos;явиться після затвердження зв&apos;язковим.</p>
          <Button className="mt-4" onClick={() => router.push('/users')}>
            До списку
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Запит на створення юнака</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Ім&apos;я</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Прізвище</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hurtokId">Гурток</Label>
            <select
              id="hurtokId"
              value={hurtokId}
              onChange={(e) => setHurtokId(e.target.value)}
              required
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Оберіть гурток</option>
              {(hurtky ?? []).map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={createRequest.isPending}>
            Надіслати запит
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Add a key-field-change form to the user detail page**

In `apps/web/app/users/[id]/page.tsx`, add the import `useCreateApprovalRequest` from `@/lib/queries/approval-requests`, and add a new card for changing the full name via approval-request, rendered only when `session?.role === 'KURINNYI' && user.role === 'JUNAK'`. Insert this new `<Card>` block right after the existing "Контакти" card, and add the needed state/hook calls at the top of the component alongside the existing `notes`/`phone` state:

```tsx
import { useCreateApprovalRequest } from '@/lib/queries/approval-requests';
```

Add inside the component, alongside the existing `useState` calls:

```tsx
  const createRequest = useCreateApprovalRequest();
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [nameRequestSent, setNameRequestSent] = useState(false);
```

Add this card after the "Контакти" `<Card>` block, before the closing `</div>`:

```tsx
      {session?.role === 'KURINNYI' && user.role === 'JUNAK' && (
        <Card>
          <CardHeader>
            <CardTitle>Змінити ПІБ (потребує затвердження)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {nameRequestSent ? (
              <p>Запит надіслано, очікує затвердження зв&apos;язковим.</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="newFirstName">Нове ім&apos;я</Label>
                  <Input
                    id="newFirstName"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder={user.firstName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newLastName">Нове прізвище</Label>
                  <Input
                    id="newLastName"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder={user.lastName}
                  />
                </div>
                <Button
                  onClick={async () => {
                    await createRequest.mutateAsync({
                      actionType: 'CHANGE_FULL_NAME',
                      junakId: user.id,
                      newData: {
                        firstName: newFirstName || user.firstName,
                        lastName: newLastName || user.lastName,
                      },
                    });
                    setNameRequestSent(true);
                  }}
                >
                  Надіслати запит
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 4: Write the e2e test**

Create `apps/web/e2e/approval-request-create.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets kurinniy request a new junak via approval-request', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const kurinnyiEmail = `kurinnyi-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Кур',
    lastName: 'Інний',
    email: kurinnyiEmail,
    role: 'KURINNYI',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, kurinnyiEmail, 'password123');
  await page.goto('/users/new');

  await page.getByLabel('Ім\'я').fill('Новий');
  await page.getByLabel('Прізвище').fill('Юнак');
  await page.getByLabel('Email').fill(`new-junak-${Date.now()}@example.com`);
  await page.getByLabel('Гурток').selectOption({ label: 'Орлики' });
  await page.getByRole('button', { name: 'Надіслати запит' }).click();

  await expect(page.getByText('Запит створено')).toBeVisible();
});
```

- [ ] **Step 5: Run the test**

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test e2e/approval-request-create.spec.ts`
Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/queries/approval-requests.ts apps/web/app/users/new apps/web/app/users/[id]/page.tsx apps/web/e2e/approval-request-create.spec.ts
git commit -m "feat: let kurinniy request junak creation and key-field changes"
```

---

## Task 9: Kurinniy — read-only view of vykhovnyk/zvyazkovyi contacts

**Files:**
- Modify: `apps/web/app/users/page.tsx`
- Test: `apps/web/e2e/users-role-filter.spec.ts`

**Interfaces:**
- Consumes: `useUsers` (Task 7).

- [ ] **Step 1: Add a role filter to the users list page**

Replace the contents of `apps/web/app/users/page.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useUsers } from '@/lib/queries/users';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Role } from '@/lib/types';

const FILTERS_BY_ROLE: Record<string, { value: Role | undefined; label: string }[]> = {
  KURINNYI: [
    { value: undefined, label: 'Юнаки' },
    { value: 'VYKHOVNYK', label: 'Виховники' },
    { value: 'ZVYAZKOVYI', label: 'Зв\'язковий' },
  ],
  ZVYAZKOVYI: [
    { value: undefined, label: 'Усі' },
    { value: 'JUNAK', label: 'Юнаки' },
    { value: 'VYKHOVNYK', label: 'Виховники' },
    { value: 'KURINNYI', label: 'Курінні' },
  ],
};

export default function UsersPage() {
  const { data: session } = useSession();
  const [roleFilter, setRoleFilter] = useState<Role | undefined>(undefined);
  const { data: users, isLoading } = useUsers({ role: roleFilter });

  if (isLoading) return <p>Завантаження...</p>;

  const filters = session ? FILTERS_BY_ROLE[session.role] ?? [] : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Люди куреня</h1>
      {filters.length > 0 && (
        <div className="flex gap-2">
          {filters.map((f) => (
            <Button
              key={f.label}
              variant={roleFilter === f.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoleFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {(users ?? []).map((u) => (
          <Link key={u.id} href={`/users/${u.id}`}>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <span>
                  {u.lastName} {u.firstName}
                </span>
                <span className="text-sm text-muted-foreground">{u.role}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

Note: `useUsers({ role: undefined })` sends no `role` query param (the hook already omits falsy filters), matching each role's default list.

- [ ] **Step 2: Write the e2e test**

Create `apps/web/e2e/users-role-filter.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets kurinniy view vykhovnyk contacts read-only', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Вих',
    lastName: 'Овник',
    email: `vykhovnyk-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });
  const kurinnyiEmail = `kurinnyi-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Кур',
    lastName: 'Інний',
    email: kurinnyiEmail,
    role: 'KURINNYI',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, kurinnyiEmail, 'password123');
  await page.goto('/users');
  await page.getByRole('button', { name: 'Виховники' }).click();

  await expect(page.getByText(`${vykhovnyk.lastName} ${vykhovnyk.firstName}`)).toBeVisible();

  await page.getByText(`${vykhovnyk.lastName} ${vykhovnyk.firstName}`).click();
  await expect(page.getByLabel('Телефон')).toBeDisabled();
});
```

- [ ] **Step 3: Run the test**

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test e2e/users-role-filter.spec.ts`
Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/users/page.tsx apps/web/e2e/users-role-filter.spec.ts
git commit -m "feat: add role filter for viewing vykhovnyk/zvyazkovyi contacts"
```

---

## Task 10: Zvyazkovyi — create hurtok and manage vykhovnyk assignments

**Files:**
- Create: `apps/web/lib/queries/vykhovnyk-assignments.ts`
- Create: `apps/web/app/hurtky/new/page.tsx`
- Create: `apps/web/app/vykhovnyk-assignments/page.tsx`
- Modify: `apps/web/app/hurtky/page.tsx`
- Test: `apps/web/e2e/vykhovnyk-assignments.spec.ts`

**Interfaces:**
- Consumes: `apiFetch`, types (Task 2); `useHurtky` (Task 6); `useUsers` (Task 7).
- Produces: `useVykhovnykAssignments(filters)`, `useAssignVykhovnyk()`, `useUnassignVykhovnyk()` — no later task depends on these.

- [ ] **Step 1: Create the vykhovnyk-assignments query hooks**

Create `apps/web/lib/queries/vykhovnyk-assignments.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { VykhovnykAssignment } from '@/lib/types';

export function useVykhovnykAssignments(hurtokId?: string) {
  const query = hurtokId ? `?hurtokId=${hurtokId}` : '';
  return useQuery({
    queryKey: ['vykhovnyk-assignments', hurtokId],
    queryFn: () => apiFetch<VykhovnykAssignment[]>(`/vykhovnyk-assignments${query}`),
  });
}

export function useAssignVykhovnyk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { vykhovnykId: string; hurtokId: string }) =>
      apiFetch<VykhovnykAssignment>('/vykhovnyk-assignments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vykhovnyk-assignments'] });
    },
  });
}

export function useUnassignVykhovnyk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/vykhovnyk-assignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vykhovnyk-assignments'] });
    },
  });
}
```

- [ ] **Step 2: Create the "new hurtok" page**

Create `apps/web/app/hurtky/new/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { Hurtok } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function NewHurtokPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');

  const createHurtok = useMutation({
    mutationFn: () =>
      apiFetch<Hurtok>('/hurtky', {
        method: 'POST',
        body: JSON.stringify({ name, number: number || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hurtky'] });
      router.push('/hurtky');
    },
  });

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Новий гурток</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createHurtok.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Назва</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="number">Номер (опційно)</Label>
            <Input id="number" value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <Button type="submit" disabled={createHurtok.isPending}>
            Створити
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Add a "new hurtok" link for zvyazkovyi**

In `apps/web/app/hurtky/page.tsx`, add the import `useSession` from `@/lib/session-client` and `Link` is already imported. Add this right after the `<h1>` element:

```tsx
      {session?.role === 'ZVYAZKOVYI' && (
        <Link href="/hurtky/new">
          <Button size="sm">Новий гурток</Button>
        </Link>
      )}
```

And add `const { data: session } = useSession();` alongside the existing `useHurtky()` call, and import `Button` from `@/components/ui/button`.

- [ ] **Step 4: Create the vykhovnyk-assignments management page**

Create `apps/web/app/vykhovnyk-assignments/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useHurtky } from '@/lib/queries/hurtky';
import { useUsers } from '@/lib/queries/users';
import {
  useVykhovnykAssignments,
  useAssignVykhovnyk,
  useUnassignVykhovnyk,
} from '@/lib/queries/vykhovnyk-assignments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function VykhovnykAssignmentsPage() {
  const { data: session } = useSession();
  const { data: assignments, isLoading } = useVykhovnykAssignments();
  const { data: hurtky } = useHurtky();
  const { data: vykhovnyky } = useUsers({ role: 'VYKHOVNYK' });
  const assign = useAssignVykhovnyk();
  const unassign = useUnassignVykhovnyk();
  const [selectedVykhovnyk, setSelectedVykhovnyk] = useState('');
  const [selectedHurtok, setSelectedHurtok] = useState('');

  const canManage = session?.role === 'ZVYAZKOVYI';

  if (isLoading) return <p>Завантаження...</p>;

  const hurtokById = new Map((hurtky ?? []).map((h) => [h.id, h]));
  const vykhovnykById = new Map((vykhovnyky ?? []).map((v) => [v.id, v]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Призначення виховників</h1>

      {canManage && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Призначити виховника</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <select
              value={selectedVykhovnyk}
              onChange={(e) => setSelectedVykhovnyk(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Оберіть виховника</option>
              {(vykhovnyky ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.lastName} {v.firstName}
                </option>
              ))}
            </select>
            <select
              value={selectedHurtok}
              onChange={(e) => setSelectedHurtok(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Оберіть гурток</option>
              {(hurtky ?? []).map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
            <Button
              disabled={!selectedVykhovnyk || !selectedHurtok}
              onClick={() =>
                assign.mutate({ vykhovnykId: selectedVykhovnyk, hurtokId: selectedHurtok })
              }
            >
              Призначити
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {(assignments ?? []).map((a) => (
          <Card key={a.id}>
            <CardContent className="flex items-center justify-between p-4">
              <span>
                {vykhovnykById.get(a.vykhovnykId)
                  ? `${vykhovnykById.get(a.vykhovnykId)!.lastName} ${vykhovnykById.get(a.vykhovnykId)!.firstName}`
                  : a.vykhovnykId}{' '}
                → {hurtokById.get(a.hurtokId)?.name ?? a.hurtokId}
              </span>
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => unassign.mutate(a.id)}>
                  Зняти
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the e2e test**

Create `apps/web/e2e/vykhovnyk-assignments.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi create a hurtok and assign a vykhovnyk to it', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Вих',
    lastName: 'Овник',
    email: `vykhovnyk-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/hurtky/new');
  await page.getByLabel('Назва').fill('Соколи');
  await page.getByRole('button', { name: 'Створити' }).click();
  await expect(page).toHaveURL(/\/hurtky$/);

  await page.goto('/vykhovnyk-assignments');
  await page.locator('select').first().selectOption({ label: `${vykhovnyk.lastName} ${vykhovnyk.firstName}` });
  await page.locator('select').nth(1).selectOption({ label: 'Соколи' });
  await page.getByRole('button', { name: 'Призначити' }).click();

  await expect(page.getByText(`${vykhovnyk.lastName} ${vykhovnyk.firstName} → Соколи`)).toBeVisible();
});
```

- [ ] **Step 6: Run the test**

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test e2e/vykhovnyk-assignments.spec.ts`
Expected: 1 test passes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/queries/vykhovnyk-assignments.ts apps/web/app/hurtky apps/web/e2e/vykhovnyk-assignments.spec.ts
git commit -m "feat: add hurtok creation and vykhovnyk assignment management"
```

---

## Task 11: Zvyazkovyi — direct user creation

**Files:**
- Modify: `apps/web/app/users/new/page.tsx`
- Test: `apps/web/e2e/users-new-direct.spec.ts`

**Interfaces:**
- Consumes: `apiFetch`, types (Task 2); `useHurtky` (Task 6); `useSession` (Task 4).

- [ ] **Step 1: Extend the "new user" page with a zvyazkovyi-only direct-creation path**

Replace the contents of `apps/web/app/users/new/page.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useCreateApprovalRequest } from '@/lib/queries/approval-requests';
import { useHurtky } from '@/lib/queries/hurtky';
import { useSession } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Role, UserSummary } from '@/lib/types';

function ZvyazkovyiDirectCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: hurtky } = useHurtky();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('JUNAK');
  const [hurtokId, setHurtokId] = useState('');
  const [password, setPassword] = useState('');

  const createUser = useMutation({
    mutationFn: () =>
      apiFetch<UserSummary>('/users', {
        method: 'POST',
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          role,
          password: password || undefined,
          hurtokId: hurtokId || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      router.push('/users');
    },
  });

  const needsHurtok = role === 'JUNAK' || role === 'KURINNYI';

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Новий користувач</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createUser.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="role">Роль</Label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="JUNAK">Юнак</option>
              <option value="VYKHOVNYK">Виховник</option>
              <option value="KURINNYI">Курінний</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="firstName">Ім&apos;я</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Прізвище</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Пароль (опційно, можна додати пізніше)</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {needsHurtok && (
            <div className="space-y-2">
              <Label htmlFor="hurtokId">Гурток</Label>
              <select
                id="hurtokId"
                value={hurtokId}
                onChange={(e) => setHurtokId(e.target.value)}
                required
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Оберіть гурток</option>
                {(hurtky ?? []).map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {createUser.isError && <p className="text-sm text-destructive">Не вдалося створити користувача.</p>}
          <Button type="submit" disabled={createUser.isPending}>
            Створити
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function KurinnyiApprovalRequestForm() {
  const router = useRouter();
  const { data: hurtky } = useHurtky();
  const createRequest = useCreateApprovalRequest();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [hurtokId, setHurtokId] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createRequest.mutateAsync({
      actionType: 'CREATE_JUNAK',
      newData: { firstName, lastName, email, hurtokId },
    });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Card className="max-w-md">
        <CardContent className="p-6">
          <p>Запит створено. Юнак з&apos;явиться після затвердження зв&apos;язковим.</p>
          <Button className="mt-4" onClick={() => router.push('/users')}>
            До списку
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Запит на створення юнака</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Ім&apos;я</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Прізвище</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hurtokId">Гурток</Label>
            <select
              id="hurtokId"
              value={hurtokId}
              onChange={(e) => setHurtokId(e.target.value)}
              required
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Оберіть гурток</option>
              {(hurtky ?? []).map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={createRequest.isPending}>
            Надіслати запит
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function NewUserPage() {
  const { data: session } = useSession();

  if (session?.role === 'ZVYAZKOVYI') {
    return <ZvyazkovyiDirectCreateForm />;
  }
  return <KurinnyiApprovalRequestForm />;
}
```

Note: this replaces Task 8's `NewJunakRequestPage` component with `KurinnyiApprovalRequestForm`, same behavior, now living alongside the zvyazkovyi form in one role-switched page. The e2e test from Task 8 (`approval-request-create.spec.ts`) continues to pass unchanged — the route and rendered form for a kurinniy are identical.

- [ ] **Step 2: Write the e2e test**

Create `apps/web/e2e/users-new-direct.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi create a vykhovnyk directly, no approval needed', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/users/new');

  await page.getByLabel('Роль').selectOption('VYKHOVNYK');
  await page.getByLabel('Ім\'я').fill('Новий');
  await page.getByLabel('Прізвище').fill('Виховник');
  await page.getByLabel('Email').fill(`new-vykhovnyk-${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Створити' }).click();

  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByText('Виховник Новий')).toBeVisible();
});
```

- [ ] **Step 3: Run both tests to confirm no regression from Task 8**

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test e2e/users-new-direct.spec.ts e2e/approval-request-create.spec.ts`
Expected: both tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/users/new/page.tsx apps/web/e2e/users-new-direct.spec.ts
git commit -m "feat: add direct user creation for zvyazkovyi"
```

---

## Task 12: Zvyazkovyi — approval-requests queue and detail (approve/reject)

**Files:**
- Create: `apps/web/lib/queries/approval-requests-list.ts`
- Create: `apps/web/app/approval-requests/page.tsx`
- Create: `apps/web/app/approval-requests/[id]/page.tsx`
- Test: `apps/web/e2e/approval-request-decide.spec.ts`

**Interfaces:**
- Consumes: `apiFetch`, types (Task 2).
- Produces: `useApprovalRequests(status)`, `useApprovalRequest(id)`, `useApproveRequest()`, `useRejectRequest()` — no later task depends on these.

- [ ] **Step 1: Create the approval-requests list/detail query hooks**

Create `apps/web/lib/queries/approval-requests-list.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ApprovalRequest, ApprovalStatus } from '@/lib/types';

export function useApprovalRequests(status?: ApprovalStatus) {
  const query = status ? `?status=${status}` : '';
  return useQuery({
    queryKey: ['approval-requests', status],
    queryFn: () => apiFetch<ApprovalRequest[]>(`/approval-requests${query}`),
  });
}

export function useApprovalRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['approval-requests', id],
    queryFn: () => apiFetch<ApprovalRequest>(`/approval-requests/${id}`),
    enabled: !!id,
  });
}

export function useApproveRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<ApprovalRequest>(`/approval-requests/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
    },
  });
}

export function useRejectRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<ApprovalRequest>(`/approval-requests/${id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
    },
  });
}
```

- [ ] **Step 2: Create the approval-requests list page**

Create `apps/web/app/approval-requests/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useApprovalRequests } from '@/lib/queries/approval-requests-list';
import { Card, CardContent } from '@/components/ui/card';

const ACTION_LABELS: Record<string, string> = {
  CHANGE_FULL_NAME: 'Зміна ПІБ',
  CHANGE_BIRTH_DATE: 'Зміна дати народження',
  CHANGE_EMAIL: 'Зміна email',
  CHANGE_HURTOK: 'Переведення в інший гурток',
  CREATE_JUNAK: 'Створення юнака',
};

export default function ApprovalRequestsPage() {
  const { data: requests, isLoading } = useApprovalRequests('PENDING');

  if (isLoading) return <p>Завантаження...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Запити на затвердження</h1>
      <div className="space-y-2">
        {(requests ?? []).length === 0 && <p className="text-muted-foreground">Немає запитів, що очікують.</p>}
        {(requests ?? []).map((r) => (
          <Link key={r.id} href={`/approval-requests/${r.id}`}>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <span>{ACTION_LABELS[r.actionType] ?? r.actionType}</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString('uk-UA')}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the approval-request detail page**

Create `apps/web/app/approval-requests/[id]/page.tsx`:

```tsx
'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import {
  useApprovalRequest,
  useApproveRequest,
  useRejectRequest,
} from '@/lib/queries/approval-requests-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const ACTION_LABELS: Record<string, string> = {
  CHANGE_FULL_NAME: 'Зміна ПІБ',
  CHANGE_BIRTH_DATE: 'Зміна дати народження',
  CHANGE_EMAIL: 'Зміна email',
  CHANGE_HURTOK: 'Переведення в інший гурток',
  CREATE_JUNAK: 'Створення юнака',
};

export default function ApprovalRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: request, isLoading } = useApprovalRequest(id);
  const approve = useApproveRequest(id);
  const reject = useRejectRequest(id);

  if (isLoading) return <p>Завантаження...</p>;
  if (!request) return <p>Не знайдено.</p>;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{ACTION_LABELS[request.actionType] ?? request.actionType}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="mb-1 font-semibold">Нові дані</h3>
          <pre className="rounded bg-muted p-2 text-xs">{JSON.stringify(request.newData, null, 2)}</pre>
        </div>
        {request.oldData && (
          <div>
            <h3 className="mb-1 font-semibold">Поточні дані</h3>
            <pre className="rounded bg-muted p-2 text-xs">{JSON.stringify(request.oldData, null, 2)}</pre>
          </div>
        )}
        <p className="text-sm text-muted-foreground">Статус: {request.status}</p>
        {request.status === 'PENDING' && (
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                await approve.mutateAsync();
                router.push('/approval-requests');
              }}
            >
              Затвердити
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await reject.mutateAsync();
                router.push('/approval-requests');
              }}
            >
              Відхилити
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Write the e2e test**

Create `apps/web/e2e/approval-request-decide.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi approve a pending request and the change takes effect', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const kurinnyiEmail = `kurinnyi-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Кур',
    lastName: 'Інний',
    email: kurinnyiEmail,
    role: 'KURINNYI',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  // kurinniy creates the request
  await loginAs(page, kurinnyiEmail, 'password123');
  await page.goto('/users/new');
  const newJunakEmail = `approved-junak-${Date.now()}@example.com`;
  await page.getByLabel('Ім\'я').fill('Схвалений');
  await page.getByLabel('Прізвище').fill('Юнак');
  await page.getByLabel('Email').fill(newJunakEmail);
  await page.getByLabel('Гурток').selectOption({ label: 'Орлики' });
  await page.getByRole('button', { name: 'Надіслати запит' }).click();
  await expect(page.getByText('Запит створено')).toBeVisible();

  await page.request.post('http://localhost:3000/api/auth/logout');

  // zvyazkovyi approves it
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/approval-requests');
  await page.getByText('Створення юнака').first().click();
  await page.getByRole('button', { name: 'Затвердити' }).click();
  await expect(page).toHaveURL(/\/approval-requests$/);

  await page.goto('/users');
  await expect(page.getByText('Юнак Схвалений')).toBeVisible();
});
```

- [ ] **Step 5: Run the test**

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test e2e/approval-request-decide.spec.ts`
Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/queries/approval-requests-list.ts apps/web/app/approval-requests apps/web/e2e/approval-request-decide.spec.ts
git commit -m "feat: add approval-requests queue and approve/reject"
```

---

## Task 13: Zvyazkovyi — kurin settings

**Files:**
- Create: `apps/web/lib/queries/kurin.ts`
- Create: `apps/web/app/kurin/page.tsx`
- Test: `apps/web/e2e/kurin-settings.spec.ts`

**Interfaces:**
- Consumes: `apiFetch`, types (Task 2).

- [ ] **Step 1: Create the kurin query hooks**

Create `apps/web/lib/queries/kurin.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { Kurin } from '@/lib/types';

export function useKurin() {
  return useQuery({
    queryKey: ['kurin', 'me'],
    queryFn: () => apiFetch<Kurin>('/kurins/me'),
  });
}

export function useChangeProbyProgram(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newProgramId: string) =>
      apiFetch<Kurin>(`/kurins/${kurinId}/proby-program`, {
        method: 'PATCH',
        body: JSON.stringify({ newProgramId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kurin', 'me'] });
    },
  });
}
```

- [ ] **Step 2: Create the kurin settings page**

Create `apps/web/app/kurin/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useKurin, useChangeProbyProgram } from '@/lib/queries/kurin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function KurinPage() {
  const { data: kurin, isLoading } = useKurin();
  const [newProgramId, setNewProgramId] = useState('');
  const changeProgram = useChangeProbyProgram(kurin?.id ?? '');

  if (isLoading) return <p>Завантаження...</p>;
  if (!kurin) return <p>Не знайдено.</p>;

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{kurin.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Дані куреня</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Номер: {kurin.kurinNumber}</p>
          <p>Станиця: {kurin.stanytsia}</p>
          <p>Стать: {kurin.gender === 'MALE' ? 'Чоловіча' : 'Жіноча'}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Програма проб</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Поточна програма: {kurin.probyProgramId}</p>
          <div className="space-y-2">
            <Label htmlFor="newProgramId">ID нової програми</Label>
            <Input
              id="newProgramId"
              value={newProgramId}
              onChange={(e) => setNewProgramId(e.target.value)}
            />
          </div>
          <Button
            disabled={!newProgramId || changeProgram.isPending}
            onClick={() => changeProgram.mutate(newProgramId)}
          >
            Змінити програму
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

Note: the program picker is a raw ID input rather than a dropdown of program names, because `GET /proby-programs/current` only returns the *active* program (see the read-API spec's documented MVP limitation — comparing/browsing other programs isn't available through this API). A zvyazkovyi switching programs already knows the target program's id from the admin bootstrap step; a friendlier picker needs a new backend endpoint and is out of scope for this plan.

- [ ] **Step 3: Write the e2e test**

Create `apps/web/e2e/kurin-settings.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi view kurin settings and change the proby program', async ({ page }) => {
  const { program: oldProgram } = await seedProbyProgram(['Стара точка']);
  const { program: newProgram } = await seedProbyProgram(['Нова точка']);
  const { zvyazkovyiEmail, zvyazkovyiPassword, kurin } = await seedKurinWithZvyazkovyi(oldProgram.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');

  await expect(page.getByText(kurin.name)).toBeVisible();
  await page.getByLabel('ID нової програми').fill(newProgram.id);
  await page.getByRole('button', { name: 'Змінити програму' }).click();

  await expect(page.getByText(`Поточна програма: ${newProgram.id}`)).toBeVisible();
});
```

- [ ] **Step 4: Run the test**

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test e2e/kurin-settings.spec.ts`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/kurin.ts apps/web/app/kurin apps/web/e2e/kurin-settings.spec.ts
git commit -m "feat: add kurin settings and proby-program switch"
```

---

## Task 14: PWA installability (manifest + icon)

**Files:**
- Create: `apps/web/public/manifest.json`
- Create: `apps/web/public/icon-192.png`
- Create: `apps/web/public/icon-512.png`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- None — this is a leaf task with no dependents.

- [ ] **Step 1: Create the manifest**

Create `apps/web/public/manifest.json`:

```json
{
  "name": "Пласт — Ядро і Проби",
  "short_name": "Проби",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0f172a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Generate placeholder icons**

Run from `apps/web/public`:

```bash
node -e "
const { createCanvas } = (() => { try { return require('canvas'); } catch { return {}; } })();
if (!createCanvas) { console.log('canvas package not available, see manual step below'); process.exit(0); }
for (const size of [192, 512]) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.font = \`bold \${size / 3}px sans-serif\`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('П', size / 2, size / 2);
  require('fs').writeFileSync(\`icon-\${size}.png\`, canvas.toBuffer('image/png'));
}
"
```

If the `canvas` package isn't available (it requires native build tools and is not worth adding as a project dependency just for two placeholder icons), skip the script and instead create two solid-color PNG placeholders by any available means (e.g. downloading a plain colored square, or using an existing image editor) named `icon-192.png` (192×192) and `icon-512.png` (512×512) and placing them in `apps/web/public/`. A real logo can replace these later — this step only needs to satisfy the manifest's icon references so the app is installable.

- [ ] **Step 3: Link the manifest in the layout**

In `apps/web/app/layout.tsx`, add `manifest: '/manifest.json'` to the exported `metadata` object:

```tsx
export const metadata: Metadata = {
  title: 'Пласт — Ядро і Проби',
  description: 'Облік проб та структури куреня',
  manifest: '/manifest.json',
};
```

- [ ] **Step 4: Verify**

Run: `cd apps/web && npm run build`
Expected: build succeeds. Manually verify in a browser dev tools "Application" tab (or Lighthouse) that the manifest is picked up and the install prompt is available — this is a visual/browser-level check, not something Playwright asserts in this plan.

- [ ] **Step 5: Commit**

```bash
git add apps/web/public/manifest.json apps/web/public/icon-192.png apps/web/public/icon-512.png apps/web/app/layout.tsx
git commit -m "feat: add PWA manifest and icons for installability"
```

---

## Final Step: Full Suite Verification

After all 14 tasks are complete, run the entire Playwright suite once to confirm no cross-task regressions:

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test`
Expected: all e2e spec files pass (login, home-redirect, proby, board, users-detail, approval-request-create, users-role-filter, vykhovnyk-assignments, users-new-direct, approval-request-decide, kurin-settings).

Also re-run the backend's own suite to confirm the frontend work introduced no backend regressions (it shouldn't have touched `apps/api` at all):

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: PASS — unchanged from before this plan.
