# Номер куреня в URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-UUID `kurinId` URL segment with the existing `Kurin.kurinNumber` field, add a uniqueness constraint on it, auto-assign a placeholder `"П-N"` number to kurins created without one, and let zvyazkovyi self-service-edit their own kurin's number later.

**Architecture:** `Kurin.kurinNumber` gets a `@@unique` constraint. Kurin creation (admin API) auto-generates the next `"П-N"` when no number is supplied. A new `PATCH /kurins/:id/kurin-number` endpoint lets zvyazkovyi change it anytime. `kurinNumber` is added to the JWT payload (same pattern as `isKurinniy` — computed fresh at login, allowed to go stale in the token until next login, never a backend authorization source). The frontend route param renames from `[kurinId]` to `[kurinNumber]` and the `/kurin` settings page gets an edit control.

**Tech Stack:** NestJS + Prisma + PostgreSQL (backend, unchanged), Next.js App Router + TanStack Query (frontend, unchanged).

## Global Constraints

- **Additive-safe migration.** Production has exactly one real `Kurin` row (`kurinNumber: "75"`) — adding `@@unique` cannot conflict with it. No `ALTER` beyond the new index.
- **Task ordering is load-bearing.** Before the `@@unique` constraint is added, the test fixture `createKurin` (`apps/api/test/utils/fixtures.ts`) MUST be fixed to generate a unique `kurinNumber` per call by default — it currently defaults to the hardcoded string `'1'` for every call, and at least 14 existing e2e test files create two kurins in the same test (a `kurinA`/`kurinB` pattern) relying on that default, with only `name` differentiating them. Adding the constraint before fixing the fixture will break the whole suite simultaneously. Task 1 does both, in order, and verifies against the FULL suite (not just kurin-related files) specifically because of this wide, easy-to-miss blast radius.
- **`kurinNumber` in the JWT is a display/routing convenience only**, exactly like `isKurinniy` — never read by any backend authorization check. The backend's `CurrentUserPayload` (`apps/api/src/common/decorators/current-user.decorator.ts`) and `JwtStrategy.validate()` do NOT need `kurinNumber` added — only `AuthService`'s `JwtPayload` (signed into the token) and the frontend's decode of it.
- **`"П-N"` placeholder format**: prefix `П`, hyphen, next integer — `"П-1"`, `"П-2"`, etc. — computed by scanning existing kurins for the highest existing `П-*` number and incrementing.
- Git hygiene: every commit uses exact file paths in `git add`, never `-A` or `.`.

---

### Task 1: Backend — fix test fixture collision, then add `kurinNumber` uniqueness

**Files:**
- Modify: `apps/api/test/utils/fixtures.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Test: full existing e2e suite (no new test file — this task's correctness gate is that nothing regresses)

**Interfaces:**
- Consumes: nothing from other tasks (foundation task).
- Produces: `Kurin.kurinNumber` is now `@@unique`. `createKurin`'s default `kurinNumber` generation is collision-safe — Tasks 2-5 and every future test written against this fixture can call `createKurin(prisma, { probyProgramId, name })` without worrying about a second kurin in the same test colliding.

- [ ] **Step 1: Fix the fixture's default `kurinNumber` generation**

In `apps/api/test/utils/fixtures.ts`, change `createKurin` — from:

```ts
export async function createKurin(
  prisma: PrismaClient,
  overrides: {
    probyProgramId: string;
    name?: string;
    kurinNumber?: string;
    gender?: KurinGender;
    stanytsia?: string;
  },
) {
  return prisma.kurin.create({
    data: {
      name: overrides.name ?? 'Test Kurin',
      kurinNumber: overrides.kurinNumber ?? '1',
      gender: overrides.gender ?? KurinGender.MALE,
      stanytsia: overrides.stanytsia ?? 'Test Stanytsia',
      probyProgramId: overrides.probyProgramId,
    },
  });
}
```

to:

```ts
export async function createKurin(
  prisma: PrismaClient,
  overrides: {
    probyProgramId: string;
    name?: string;
    kurinNumber?: string;
    gender?: KurinGender;
    stanytsia?: string;
  },
) {
  return prisma.kurin.create({
    data: {
      name: overrides.name ?? 'Test Kurin',
      kurinNumber: overrides.kurinNumber ?? `T${Date.now()}${Math.floor(Math.random() * 100000)}`,
      gender: overrides.gender ?? KurinGender.MALE,
      stanytsia: overrides.stanytsia ?? 'Test Stanytsia',
      probyProgramId: overrides.probyProgramId,
    },
  });
}
```

(This makes every call that doesn't explicitly pass `kurinNumber` collision-safe by construction — no test file needs to change, since none of them assert on the literal value `'1'` for `kurinNumber`, only on `name`/`id`.)

- [ ] **Step 2: Add the schema constraint**

In `apps/api/prisma/schema.prisma`, change the `Kurin` model's `kurinNumber` line — from:

```prisma
  kurinNumber    String
```

to:

```prisma
  kurinNumber    String      @unique
```

- [ ] **Step 3: Generate and apply the migration**

Run (from `apps/api/`, against your local dev database):

```bash
npx prisma migrate dev --name add_kurin_number_unique
```

Expected: it prints `Your database is now in sync with your schema`, and the generated `migration.sql` contains only `CREATE UNIQUE INDEX` on `Kurin.kurinNumber` — no other column touched. If your local dev database already has two kurins sharing the same `kurinNumber` (unlikely, but check the error message if the migration fails), resolve by manually updating one of them to a distinct value before retrying — do not weaken the constraint to work around local dev data; production has no such conflict.

- [ ] **Step 4: Run the FULL backend e2e suite — this is the real correctness gate for this task**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`

Expected: every single test still passes — all 32+ suites, 157+ tests. If ANY test fails with a Prisma unique-constraint violation on `kurinNumber`, it means that specific test explicitly passes a hardcoded `kurinNumber` override that collides with another `createKurin` call in the same test (rather than relying on the now-safe default) — find that exact test, read it, and change its explicit `kurinNumber` overrides to distinct values (or remove the override entirely if the default is now sufficient). Do not skip or weaken any test to route around a real collision — every one represents a genuine pre-existing test-data assumption that needs a two-line fix.

Run: `cd apps/api && npx tsc --noEmit` — expect clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/utils/fixtures.ts apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add unique constraint on Kurin.kurinNumber, fix test fixture collisions"
```

(If Step 4 required fixing additional test files beyond `fixtures.ts`, add those exact file paths to this `git add` command too — list every file you touched.)

---

### Task 2: Backend — auto-assign `"П-N"` when a kurin is created without a number

**Files:**
- Modify: `apps/api/src/admin/dto/create-kurin.dto.ts`
- Modify: `apps/api/src/admin/kurins-admin.service.ts`
- Test: `apps/api/test/admin-kurins.e2e-spec.ts`

**Interfaces:**
- Consumes: `Kurin.kurinNumber @unique` (Task 1) — the auto-generation logic relies on being able to trust that no two kurins ever silently share a number.
- Produces: `POST /admin/kurins` now accepts an optional `kurinNumber`; when omitted, the created kurin gets the next available `"П-N"`. No later task in this plan depends on this beyond the admin API contract itself.

- [ ] **Step 1: Make `kurinNumber` optional in the DTO**

In `apps/api/src/admin/dto/create-kurin.dto.ts`, change:

```ts
import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { KurinGender } from '@prisma/client';

export class CreateKurinDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() kurinNumber: string;
  @IsEnum(KurinGender) gender: KurinGender;
  @IsString() @IsNotEmpty() stanytsia: string;
  @IsUUID() probyProgramId: string;
}
```

to:

```ts
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { KurinGender } from '@prisma/client';

export class CreateKurinDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() @IsNotEmpty() kurinNumber?: string;
  @IsEnum(KurinGender) gender: KurinGender;
  @IsString() @IsNotEmpty() stanytsia: string;
  @IsUUID() probyProgramId: string;
}
```

- [ ] **Step 2: Auto-generate the next `"П-N"` when omitted, and reject an explicit duplicate cleanly**

In `apps/api/src/admin/kurins-admin.service.ts`, add `ConflictException` to the existing `@nestjs/common` import (it currently imports `Injectable, NotFoundException` — add `ConflictException` to that list). Change `createKurin` — from:

```ts
  async createKurin(dto: CreateKurinDto) {
    const program = await this.prisma.probyProgram.findUnique({ where: { id: dto.probyProgramId } });
    if (!program) {
      throw new NotFoundException('Proby program not found');
    }
    return this.prisma.kurin.create({ data: dto });
  }
```

to:

```ts
  async createKurin(dto: CreateKurinDto) {
    const program = await this.prisma.probyProgram.findUnique({ where: { id: dto.probyProgramId } });
    if (!program) {
      throw new NotFoundException('Proby program not found');
    }
    if (dto.kurinNumber) {
      const existing = await this.prisma.kurin.findUnique({ where: { kurinNumber: dto.kurinNumber } });
      if (existing) {
        throw new ConflictException('This kurin number is already in use');
      }
    }
    const kurinNumber = dto.kurinNumber ?? (await this.nextPreparatoryNumber());
    return this.prisma.kurin.create({ data: { ...dto, kurinNumber } });
  }

  private async nextPreparatoryNumber(): Promise<string> {
    const preparatoryKurins = await this.prisma.kurin.findMany({
      where: { kurinNumber: { startsWith: 'П-' } },
      select: { kurinNumber: true },
    });
    const highestExisting = preparatoryKurins.reduce((max, k) => {
      const n = parseInt(k.kurinNumber.slice(2), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `П-${highestExisting + 1}`;
  }
```

- [ ] **Step 3: Extend the e2e test**

In `apps/api/test/admin-kurins.e2e-spec.ts`, add these two tests inside the `describe('POST /admin/kurins', ...)` block, alongside the existing ones:

```ts
    it('auto-assigns "П-1" when kurinNumber is omitted', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);

      const response = await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .send({
          name: 'Курінь Підготовчий',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
        })
        .expect(201);

      expect(response.body.kurinNumber).toBe('П-1');
    });

    it('auto-assigns "П-2" when "П-1" already exists', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .send({ name: 'Перший', gender: KurinGender.MALE, stanytsia: 'Львів', probyProgramId: program.id })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .send({ name: 'Другий', gender: KurinGender.MALE, stanytsia: 'Львів', probyProgramId: program.id })
        .expect(201);

      expect(response.body.kurinNumber).toBe('П-2');
    });

    it('returns 409 when an explicitly provided kurinNumber is already taken', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .send({
          name: 'Перший',
          kurinNumber: '75',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .send({
          name: 'Другий',
          kurinNumber: '75',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
        })
        .expect(409);
    });
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand admin-kurins`
Expected: all tests pass (6 total: the 3 pre-existing under `POST /admin/kurins` plus the 3 new ones, plus the 2 under `POST /admin/kurins/zvyazkovyi`).

Run: `cd apps/api && npx tsc --noEmit` — expect clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin/dto/create-kurin.dto.ts apps/api/src/admin/kurins-admin.service.ts apps/api/test/admin-kurins.e2e-spec.ts
git commit -m "feat: auto-assign next П-N preparatory number when kurinNumber is omitted"
```

---

### Task 3: Backend — self-service `PATCH /kurins/:id/kurin-number`

**Files:**
- Create: `apps/api/src/kurins/dto/change-kurin-number.dto.ts`
- Modify: `apps/api/src/kurins/kurins.controller.ts`
- Modify: `apps/api/src/kurins/kurins.service.ts`
- Test: `apps/api/test/kurins-kurin-number.e2e-spec.ts`

**Interfaces:**
- Consumes: `Kurin.kurinNumber @unique` (Task 1).
- Produces: `PATCH /kurins/:id/kurin-number` (body `{ newNumber: string }`, 200/201 → updated `Kurin`, 403 if actor isn't `ZVYAZKOVYI` or `id` isn't their own kurin, 409 if `newNumber` is already taken by another kurin). No later task in this plan depends on backend internals beyond this one route — Task 5 (frontend) consumes only the HTTP contract.

- [ ] **Step 1: Write the DTO**

Create `apps/api/src/kurins/dto/change-kurin-number.dto.ts`:

```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class ChangeKurinNumberDto {
  @IsString() @IsNotEmpty() newNumber: string;
}
```

- [ ] **Step 2: Add the service method**

In `apps/api/src/kurins/kurins.service.ts`, add this import at the top:

```ts
import { ConflictException } from '@nestjs/common';
```

(Merge into the existing `import { Injectable, NotFoundException } from '@nestjs/common';` line rather than adding a duplicate import statement — the final line should read `import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';`.)

Add this method anywhere in the `KurinsService` class, e.g. right after `findById`:

```ts
  async changeKurinNumber(kurinId: string, newNumber: string) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    if (kurin.kurinNumber === newNumber) {
      return kurin;
    }
    const existing = await this.prisma.kurin.findUnique({ where: { kurinNumber: newNumber } });
    if (existing) {
      throw new ConflictException('This kurin number is already in use');
    }
    return this.prisma.kurin.update({ where: { id: kurinId }, data: { kurinNumber: newNumber } });
  }
```

- [ ] **Step 3: Add the controller route**

In `apps/api/src/kurins/kurins.controller.ts`, add the import:

```ts
import { ChangeKurinNumberDto } from './dto/change-kurin-number.dto';
```

Add this method inside `KurinsController`, right after `changeProbyProgram`:

```ts
  @Roles(Role.ZVYAZKOVYI)
  @Patch(':id/kurin-number')
  changeKurinNumber(
    @Param('id') id: string,
    @Body() dto: ChangeKurinNumberDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (id !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    return this.kurinsService.changeKurinNumber(id, dto.newNumber);
  }
```

- [ ] **Step 4: Write the e2e test**

Create `apps/api/test/kurins-kurin-number.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('PATCH /kurins/:id/kurin-number (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwtService = moduleRef.get(JwtService, { strict: false });
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  it('lets zvyazkovyi change their own kurin number to an unused value', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id, kurinNumber: 'П-1' });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/kurin-number`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newNumber: '75' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.kurinNumber).toBe('75');
  });

  it('returns 409 when the new number is already taken by another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, kurinNumber: 'П-1' });
    await createKurin(prisma, { probyProgramId: program.id, kurinNumber: '75' });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurinA.id}/kurin-number`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newNumber: '75' })
      .expect(409);
  });

  it('forbids a non-zvyazkovyi from changing the kurin number', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/kurin-number`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newNumber: '75' })
      .expect(403);
  });

  it('forbids a zvyazkovyi from changing another kurin\'s number', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurinB.id}/kurin-number`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newNumber: '999' })
      .expect(403);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand kurins-kurin-number`
Expected: 4 tests pass.

Run: `cd apps/api && npx tsc --noEmit` — expect clean.

Run the full e2e suite to confirm nothing broke: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/kurins/dto/change-kurin-number.dto.ts apps/api/src/kurins/kurins.controller.ts apps/api/src/kurins/kurins.service.ts apps/api/test/kurins-kurin-number.e2e-spec.ts
git commit -m "feat: let zvyazkovyi self-service change their kurin's number"
```

---

### Task 4: Backend — `kurinNumber` in the JWT payload

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-3 directly (independent of the kurins module changes, though it reads the same `Kurin.kurinNumber` field).
- Produces: `JwtPayload.kurinNumber: string` — the frontend (Task 5) decodes this from the signed token via `/api/session`. `AuthService.signToken` now takes a 5th parameter, `kurinNumber: string`.

- [ ] **Step 1: Extend `JwtPayload` and `signToken`**

In `apps/api/src/auth/auth.service.ts`, change:

```ts
export interface JwtPayload {
  sub: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
}
```

to:

```ts
export interface JwtPayload {
  sub: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
  kurinNumber: string;
}
```

Change `signToken` — from:

```ts
  signToken(userId: string, role: Role, kurinId: string, isKurinniy: boolean): { accessToken: string } {
    const payload: JwtPayload = { sub: userId, role, kurinId, isKurinniy };
    return { accessToken: this.jwtService.sign(payload) };
  }
```

to:

```ts
  signToken(
    userId: string,
    role: Role,
    kurinId: string,
    isKurinniy: boolean,
    kurinNumber: string,
  ): { accessToken: string } {
    const payload: JwtPayload = { sub: userId, role, kurinId, isKurinniy, kurinNumber };
    return { accessToken: this.jwtService.sign(payload) };
  }
```

- [ ] **Step 2: Fetch `kurinNumber` at login and pass it to `signToken`**

Change `loginWithPassword`'s final two lines — from:

```ts
    const isKurinniy = await isKurinniyForUser(this.prisma, user.id);
    return this.signToken(user.id, user.role, user.kurinId, isKurinniy);
```

to:

```ts
    const isKurinniy = await isKurinniyForUser(this.prisma, user.id);
    const kurin = await this.prisma.kurin.findUnique({ where: { id: user.kurinId } });
    return this.signToken(user.id, user.role, user.kurinId, isKurinniy, kurin!.kurinNumber);
```

Change `loginWithGoogle`'s final two lines the same way — from:

```ts
    const isKurinniy = await isKurinniyForUser(this.prisma, user.id);
    return this.signToken(user.id, user.role, user.kurinId, isKurinniy);
```

to:

```ts
    const isKurinniy = await isKurinniyForUser(this.prisma, user.id);
    const kurin = await this.prisma.kurin.findUnique({ where: { id: user.kurinId } });
    return this.signToken(user.id, user.role, user.kurinId, isKurinniy, kurin!.kurinNumber);
```

(The non-null assertion `kurin!` is safe here: `user.kurinId` is a required foreign key to an existing `Kurin` row — a user can never exist with a `kurinId` pointing to a deleted or nonexistent kurin.)

- [ ] **Step 3: Update the unit test**

In `apps/api/src/auth/auth.service.spec.ts`, change the `prisma` mock in `beforeEach` — from:

```ts
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      kurinPosition: { findFirst: jest.fn().mockResolvedValue(null) },
    };
```

to:

```ts
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      kurinPosition: { findFirst: jest.fn().mockResolvedValue(null) },
      kurin: { findUnique: jest.fn().mockResolvedValue({ kurinNumber: '75' }) },
    };
```

Change the `signToken` test — from:

```ts
  describe('signToken', () => {
    it('signs a JWT carrying sub/role/kurinId/isKurinniy and it decodes back', () => {
      const { accessToken } = service.signToken('user-1', Role.ZVYAZKOVYI, 'kurin-1', false);
      const decoded: any = jwtService.verify(accessToken);
      expect(decoded).toMatchObject({ sub: 'user-1', role: Role.ZVYAZKOVYI, kurinId: 'kurin-1', isKurinniy: false });
    });
  });
```

to:

```ts
  describe('signToken', () => {
    it('signs a JWT carrying sub/role/kurinId/isKurinniy/kurinNumber and it decodes back', () => {
      const { accessToken } = service.signToken('user-1', Role.ZVYAZKOVYI, 'kurin-1', false, '75');
      const decoded: any = jwtService.verify(accessToken);
      expect(decoded).toMatchObject({
        sub: 'user-1',
        role: Role.ZVYAZKOVYI,
        kurinId: 'kurin-1',
        isKurinniy: false,
        kurinNumber: '75',
      });
    });
  });
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/auth/auth.service.spec.ts`
Expected: all tests pass (the `beforeEach` mock change doesn't require touching `loginWithPassword`'s or `loginWithGoogle`'s individual test bodies — they already mock `prisma.user.findUnique` per-test, and now also implicitly get a working `prisma.kurin.findUnique` from the shared `beforeEach` mock).

Run: `cd apps/api && npx tsc --noEmit` — expect clean.

Run the full backend suite (unit + e2e) to confirm nothing else broke: `cd apps/api && npx jest && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "feat: add kurinNumber to the JWT payload for frontend routing"
```

---

### Task 5: Frontend — expose `kurinNumber`, rename the route param, editable settings field

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/app/api/session/route.ts`
- Create: `apps/web/app/[kurinNumber]/hurtky/[slug]/page.tsx`
- Delete: `apps/web/app/[kurinId]/hurtky/[slug]/page.tsx`
- Modify: `apps/web/app/hurtky/page.tsx`
- Modify: `apps/web/lib/queries/kurin.ts`
- Modify: `apps/web/app/kurin/page.tsx`
- Test: `apps/web/e2e/kurin-number.spec.ts`

**Interfaces:**
- Consumes: `PATCH /kurins/:id/kurin-number` (Task 3), `kurinNumber` in the decoded JWT (Task 4).
- Produces: `CurrentUserPayload.kurinNumber: string` (`apps/web/lib/types.ts`) — the final shape of the session object. No later task in this plan depends on it beyond this task's own pages.

- [ ] **Step 1: Add `kurinNumber` to the session type and decode**

In `apps/web/lib/types.ts`, change:

```ts
export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
}
```

to:

```ts
export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
  kurinNumber: string;
}
```

In `apps/web/app/api/session/route.ts`, change:

```ts
    const session: CurrentUserPayload = {
      userId: decoded.sub,
      role: decoded.role,
      kurinId: decoded.kurinId,
      isKurinniy: !!decoded.isKurinniy,
    };
```

to:

```ts
    const session: CurrentUserPayload = {
      userId: decoded.sub,
      role: decoded.role,
      kurinId: decoded.kurinId,
      isKurinniy: !!decoded.isKurinniy,
      kurinNumber: decoded.kurinNumber,
    };
```

- [ ] **Step 2: Move the hurtok page to the renamed route folder**

Create `apps/web/app/[kurinNumber]/hurtky/[slug]/page.tsx` with this exact content (identical to the current `apps/web/app/[kurinId]/hurtky/[slug]/page.tsx`, only the `params` type's key renamed from `kurinId` to `kurinNumber` — the component still doesn't read that param, matching the design spec's decision that this URL segment is decorative):

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useHurtokBySlug } from '@/lib/queries/hurtky';
import { ROLE_LABELS, POSITION_LABELS } from '@/lib/role-labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { accessErrorMessage } from '@/lib/error-message';

export default function HurtokMembersPage({ params }: { params: Promise<{ kurinNumber: string; slug: string }> }) {
  const { slug } = use(params);
  const { data, isLoading, isError, error } = useHurtokBySlug(slug);

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Гурток не знайдено.'}</p>;
  if (!data) return <p>Гурток не знайдено.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        {data.hurtok.name}
        {data.hurtok.number ? ` №${data.hurtok.number}` : ''}
      </h1>
      <div className="space-y-2">
        {data.members.map((member) => (
          <Link key={member.id} href={`/users/${member.id}`}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {member.lastName} {member.firstName}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {ROLE_LABELS[member.role]}
                {member.positions.length > 0 &&
                  ` · ${member.positions.map((p) => POSITION_LABELS[p.positionType]).join(', ')}`}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Delete the old route folder**

```bash
git rm apps/web/app/[kurinId]/hurtky/[slug]/page.tsx
```

- [ ] **Step 4: Update the hurtky list page's link**

In `apps/web/app/hurtky/page.tsx`, change:

```tsx
          <Link key={h.id} href={`/${session?.kurinId}/hurtky/${h.slug}`}>
```

to:

```tsx
          <Link key={h.id} href={`/${session?.kurinNumber}/hurtky/${h.slug}`}>
```

- [ ] **Step 5: Add the change-kurin-number mutation hook**

In `apps/web/lib/queries/kurin.ts`, add this export (keep the existing `useKurin`/`useChangeProbyProgram` as-is):

```ts
export function useChangeKurinNumber(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newNumber: string) =>
      apiFetch<Kurin>(`/kurins/${kurinId}/kurin-number`, {
        method: 'PATCH',
        body: JSON.stringify({ newNumber }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kurin', 'me'] });
    },
  });
}
```

- [ ] **Step 6: Add the editable number field to `/kurin`**

Open `apps/web/app/kurin/page.tsx`. Add the import:

```tsx
import { useKurin, useChangeProbyProgram, useChangeKurinNumber } from '@/lib/queries/kurin';
```

(This replaces the existing `import { useKurin, useChangeProbyProgram } from '@/lib/queries/kurin';` line — merge into one import, don't duplicate.)

Add this hook call and state right after the existing `const changeProgram = useChangeProbyProgram(kurin?.id ?? '');` line:

```tsx
  const changeKurinNumber = useChangeKurinNumber(kurin?.id ?? '');
  const [newKurinNumber, setNewKurinNumber] = useState('');
```

Replace the "Дані куреня" `<Card>`'s content — from:

```tsx
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
```

to:

```tsx
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
                  {accessErrorMessage(changeKurinNumber.error) ?? 'Цей номер уже зайнятий.'}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
```

(`canChangeProgram` already exists in this file, reused here since it's the same `session?.role === 'ZVYAZKOVYI'` check. This file does not currently import `accessErrorMessage` — add `import { accessErrorMessage } from '@/lib/error-message';` as a new import line at the top of the file, alongside the existing `Card`/`Button`/`Input`/`Label` imports.)

- [ ] **Step 7: Write the e2e test**

Create `apps/web/e2e/kurin-number.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi change their kurin number from the settings page', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');

  await page.getByPlaceholder('1').fill('75');
  await page.getByRole('button', { name: 'Змінити номер' }).click();

  await expect(page.getByText('Номер: 75')).toBeVisible();
});
```

(`seedKurinWithZvyazkovyi` in `apps/web/e2e/helpers/seed.ts:44` passes `kurinNumber: '1'` explicitly to `/admin/kurins` — the seeded kurin's number is always exactly `'1'`, not auto-generated, so the input's `placeholder={kurin.kurinNumber}` is always `'1'` in this test.)

- [ ] **Step 8: Run the tests**

Run: `cd apps/web && npx tsc --noEmit` — expect clean.

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test`
Expected: the full suite passes, including the new `kurin-number.spec.ts` and the pre-existing `hurtok-members.spec.ts` (which navigates through `/hurtky` to the renamed route — confirm its assertion `toHaveURL(/\/hurtky\/vovky$/)` still matches, since it doesn't anchor on the first path segment's name, only the trailing `/hurtky/vovky` part, so the rename from `[kurinId]` to `[kurinNumber]` shouldn't break it — but the actual VALUE in that segment changes from a UUID to a `kurinNumber` value, which that test's regex doesn't care about either way).

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/types.ts apps/web/app/api/session/route.ts "apps/web/app/[kurinNumber]" apps/web/app/hurtky/page.tsx apps/web/lib/queries/kurin.ts apps/web/app/kurin/page.tsx apps/web/e2e/kurin-number.spec.ts
git commit -m "feat: use kurinNumber in hurtok URLs, editable in kurin settings"
```

---

## Final Step: Full Suite Verification

Run the entire suite once more, end to end, to confirm no cross-task regressions:

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: all backend e2e specs pass.

Run: `cd apps/api && npx jest`
Expected: all backend unit tests pass.

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test`
Expected: all frontend e2e specs pass.

Deploys via the existing `git pull && docker compose up -d --build` flow — the container's start command already runs `prisma migrate deploy`. No new environment variables are needed. After this deploy, the production kurin's existing `kurinNumber` ("75") already satisfies the new uniqueness constraint — no manual data fix is needed, unlike the hurtok-slug backfill from the prior subproject.
