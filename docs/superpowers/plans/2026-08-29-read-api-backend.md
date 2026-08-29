# Read API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 7 read-only GET endpoints described in `docs/superpowers/specs/2026-08-29-read-api-design.md` to the existing "Ядро + Проби" NestJS backend, so a future frontend has a full read surface to build against.

**Architecture:** Pure extension of existing modules — each task adds `GET` handlers next to the existing `POST`/`PATCH`/`DELETE` handlers in the same controller/service files, following the RBAC/tenant-isolation/`select`-whitelist/404-vs-403 patterns already established in the codebase. One new module (`proby-catalog`) is created for the one endpoint with no existing home. No new Prisma models, no migrations, no changes to any existing write path.

**Tech Stack:** NestJS 10, Prisma (PostgreSQL 16), Jest + supertest for e2e, `class-validator`/`ValidationPipe` (global, `whitelist: true, transform: true`).

## Global Constraints

- **Tenant isolation:** every query is scoped by `actor.kurinId`, taken exclusively from the JWT via `@CurrentUser()` — never from client input (path/query params). This is the single most important rule in the codebase; every task's queries must follow it.
- **No `passwordHash`/`googleId` in responses.** Every Prisma query that returns a `User` row (directly or nested) MUST use an explicit `select` — never a bare `findMany`/`findUnique` on `User` without one. Reuse this exact whitelist wherever a task returns user rows:
  ```ts
  {
    id: true, firstName: true, lastName: true, nickname: true, email: true,
    role: true, birthDate: true, kurinId: true, hurtokId: true,
  }
  ```
- **404 vs 403:** return `404 Not Found` when a resource exists but is outside the caller's tenant/assignment scope (don't reveal that it exists). Return `403 Forbidden` only when the resource is inside the caller's own kurin but the caller's role is not permitted to see that *kind* of resource (e.g. a курінний requesting `?role=VYKHOVNYK`). This matches the existing `NotFoundException('... not found in this kurin')` pattern used throughout the codebase.
- **No pagination.** Return full arrays scoped by kurin/assignment. This is an explicit MVP limitation from the spec, not an oversight — do not add `limit`/`offset`.
- **No DTOs for query filters.** Every existing list endpoint in this codebase validates query params inline in the controller with `@Query('name', new ParseEnumPipe(EnumType, { optional: true }))` for enums and plain `@Query('name') name: string | undefined` for strings (see `approval-requests.controller.ts`'s `list()`). Follow this — do not create a new DTO class for query filtering.
- **Route ordering:** NestJS/Express matches routes in the order handler methods are declared in the controller class. A literal path segment (e.g. `me`) MUST be declared in the class before a parameterized sibling at the same position (e.g. `:id`), or the literal route will never be reached.
- **Test infra:** every e2e test file follows the exact boilerplate already used throughout `apps/api/test/*.e2e-spec.ts` — `Test.createTestingModule({ imports: [AppModule] })`, a raw `PrismaClient` pointed at `process.env.DATABASE_URL_TEST`, `cleanDatabase()` in `beforeEach`, and the fixtures in `test/utils/fixtures.ts` (`createProbyProgramTree`, `createKurin`, `createUser`, `issueTokenFor`). Do not invent new test setup.
- **Run e2e tests with:** `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/<file>.e2e-spec.ts` (run from `apps/api/`).
- **Run unit tests with:** `npm test` (run from `apps/api/`) — only if a task adds a `.spec.ts` unit test; none of these tasks do.

---

## Task 1: Proby catalog read endpoint

**Files:**
- Create: `apps/api/src/proby-catalog/proby-catalog.controller.ts`
- Create: `apps/api/src/proby-catalog/proby-catalog.service.ts`
- Create: `apps/api/src/proby-catalog/proby-catalog.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/proby-catalog.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`apps/api/src/prisma/prisma.service.ts`), `JwtAuthGuard` (`apps/api/src/common/guards/jwt-auth.guard.ts`), `CurrentUser`/`CurrentUserPayload` (`apps/api/src/common/decorators/current-user.decorator.ts`) — all pre-existing.
- Produces: `GET /proby-programs/current` — no other task depends on this.

- [ ] **Step 1: Write the failing e2e tests**

Create `apps/api/test/proby-catalog.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Proby catalog (e2e)', () => {
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

  it("returns the proby program tree active for the caller's kurin, not other programs", async () => {
    const { program: programA } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, [
      'Point A1',
      'Point A2',
    ]);
    await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Point B1']);
    const kurin = await createKurin(prisma, { probyProgramId: programA.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    const response = await request(app.getHttpServer())
      .get('/proby-programs/current')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(programA.id);
    expect(response.body.stages).toHaveLength(1);
    expect(response.body.stages[0].categories).toHaveLength(1);
    const descriptions = response.body.stages[0].categories[0].points.map((p: any) => p.description);
    expect(descriptions.sort()).toEqual(['Point A1', 'Point A2']);
  });

  it('allows a kurinniy to read the catalog', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinniy);

    await request(app.getHttpServer())
      .get('/proby-programs/current')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer()).get('/proby-programs/current').expect(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/proby-catalog.e2e-spec.ts`
Expected: FAIL — `Cannot GET /proby-programs/current` (404, route doesn't exist yet)

- [ ] **Step 3: Create the service**

Create `apps/api/src/proby-catalog/proby-catalog.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProbyCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentForKurin(kurinId: string) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }

    const program = await this.prisma.probyProgram.findUnique({
      where: { id: kurin.probyProgramId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            categories: {
              include: {
                points: { orderBy: { order: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (!program) {
      throw new NotFoundException('Proby program not found');
    }
    return program;
  }
}
```

- [ ] **Step 4: Create the controller**

Create `apps/api/src/proby-catalog/proby-catalog.controller.ts`:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ProbyCatalogService } from './proby-catalog.service';

@UseGuards(JwtAuthGuard)
@Controller('proby-programs')
export class ProbyCatalogController {
  constructor(private readonly service: ProbyCatalogService) {}

  @Get('current')
  getCurrent(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getCurrentForKurin(user.kurinId);
  }
}
```

- [ ] **Step 5: Create the module**

Create `apps/api/src/proby-catalog/proby-catalog.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProbyCatalogController } from './proby-catalog.controller';
import { ProbyCatalogService } from './proby-catalog.service';

@Module({
  imports: [AuthModule],
  controllers: [ProbyCatalogController],
  providers: [ProbyCatalogService],
})
export class ProbyCatalogModule {}
```

- [ ] **Step 6: Wire the module into AppModule**

In `apps/api/src/app.module.ts`, add the import:

```ts
import { ProbyCatalogModule } from './proby-catalog/proby-catalog.module';
```

And add `ProbyCatalogModule` to the `imports` array (anywhere in the list — order doesn't matter):

```ts
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AdminModule,
    HurtkyModule,
    UsersModule,
    VykhovnykAssignmentsModule,
    ProbyProgressModule,
    KurinsModule,
    ApprovalRequestsModule,
    ProbyCatalogModule,
  ],
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/proby-catalog.e2e-spec.ts`
Expected: PASS — 3 tests passed

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/proby-catalog apps/api/src/app.module.ts apps/api/test/proby-catalog.e2e-spec.ts
git commit -m "feat: add GET /proby-programs/current read endpoint"
```

---

## Task 2: Kurin self-read endpoint

**Files:**
- Modify: `apps/api/src/kurins/kurins.controller.ts`
- Modify: `apps/api/src/kurins/kurins.service.ts`
- Test: `apps/api/test/kurins-me.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtAuthGuard`, `RolesGuard`, `CurrentUser`/`CurrentUserPayload` — all pre-existing.
- Produces: `GET /kurins/me` — no other task depends on this.

- [ ] **Step 1: Write the failing e2e tests**

Create `apps/api/test/kurins-me.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Kurins self-read (e2e)', () => {
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

  it("returns the caller's own kurin", async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id, name: 'Курінь Орлів' });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    const response = await request(app.getHttpServer())
      .get('/kurins/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(kurin.id);
    expect(response.body.name).toBe('Курінь Орлів');
    expect(response.body.probyProgramId).toBe(program.id);
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer()).get('/kurins/me').expect(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/kurins-me.e2e-spec.ts`
Expected: FAIL — `Cannot GET /kurins/me` (404, route doesn't exist yet)

- [ ] **Step 3: Add the service method**

In `apps/api/src/kurins/kurins.service.ts`, add this method inside the `KurinsService` class (alongside the existing `changeProbyProgram`):

```ts
  async findById(kurinId: string) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    return kurin;
  }
```

- [ ] **Step 4: Add the controller route**

In `apps/api/src/kurins/kurins.controller.ts`, update the import line to add `Get`:

```ts
import { Body, Controller, ForbiddenException, Get, Param, Patch, UseGuards } from '@nestjs/common';
```

Then add this method inside the `KurinsController` class, declared BEFORE `changeProbyProgram`:

```ts
  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.kurinsService.findById(user.kurinId);
  }
```

The full class body should now read (method order matters — `me` first):

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kurins')
export class KurinsController {
  constructor(private readonly kurinsService: KurinsService) {}

  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.kurinsService.findById(user.kurinId);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Patch(':id/proby-program')
  changeProbyProgram(
    @Param('id') id: string,
    @Body() dto: ChangeProbyProgramDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (id !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    return this.kurinsService.changeProbyProgram(id, dto.newProgramId, user.userId);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/kurins-me.e2e-spec.ts`
Expected: PASS — 2 tests passed

- [ ] **Step 6: Run the full kurins e2e suite to check for regressions**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/kurins-proby-program.e2e-spec.ts`
Expected: PASS — no regressions from the `me` route insertion

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/kurins apps/api/test/kurins-me.e2e-spec.ts
git commit -m "feat: add GET /kurins/me read endpoint"
```

---

## Task 3: Users list and detail endpoints

**Files:**
- Modify: `apps/api/src/users/users.controller.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Test: `apps/api/test/users-list.e2e-spec.ts`
- Test: `apps/api/test/users-detail.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtAuthGuard`, `RolesGuard`, `CurrentUser`/`CurrentUserPayload` — all pre-existing.
- Produces: `GET /users?role=&hurtokId=`, `GET /users/:id` — no other task depends on these.

**Visibility rules (from the design spec):**
- JUNAK: 403 on the list; on detail, only their own id (otherwise 404).
- VYKHOVNYK: list/detail only JUNAK users in hurtky they're assigned to, plus hurtokless JUNAK users (consistent with the existing Task 13 ruling in `proby-progress.service.ts`, where виховники can act on hurtokless юнаки without seeing them "as part of a hurtok"). `?role=VYKHOVNYK` → 403.
- KURINNYI: list/detail only JUNAK users in their kurin. `?role=VYKHOVNYK` → 403.
- ZVYAZKOVYI: list/detail JUNAK and VYKHOVNYK users in their kurin. With no `role` filter, both roles are returned together.
- `?hurtokId=` filter: 404 if the hurtok doesn't belong to the caller's kurin, or (for VYKHOVNYK) isn't one of their assignments.

- [ ] **Step 1: Write the failing e2e tests for the list endpoint**

Create `apps/api/test/users-list.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('GET /users (e2e)', () => {
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

  it('forbids a junak from listing users', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lets a vykhovnyk list only junaky from their assigned hurtok plus hurtokless junaky', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtokA = await prisma.hurtok.create({ data: { name: 'A', kurinId: kurin.id } });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'B', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtokA.id } });

    const junakA = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtokA.id });
    await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtokB.id });
    const junakNoHurtok = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });

    const token = issueTokenFor(jwtService, vykhovnyk);
    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = response.body.map((u: any) => u.id).sort();
    expect(ids).toEqual([junakA.id, junakNoHurtok.id].sort());
  });

  it('forbids a vykhovnyk from filtering by role=VYKHOVNYK', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get('/users?role=VYKHOVNYK')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lets a kurinniy list all junaky in the kurin but forbids role=VYKHOVNYK', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const junak1 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const junak2 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinniy);

    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.map((u: any) => u.id).sort()).toEqual([junak1.id, junak2.id].sort());

    await request(app.getHttpServer())
      .get('/users?role=VYKHOVNYK')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lets a zvyazkovyi list both junaky and vykhovnyky with no filter, and filter by role', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const all = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(all.body.map((u: any) => u.id).sort()).toEqual([junak.id, vykhovnyk.id].sort());

    const onlyVykhovnyky = await request(app.getHttpServer())
      .get('/users?role=VYKHOVNYK')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(onlyVykhovnyky.body).toHaveLength(1);
    expect(onlyVykhovnyky.body[0].id).toBe(vykhovnyk.id);
  });

  it('returns 404 when hurtokId belongs to another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'B', kurinId: kurinB.id } });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get(`/users?hurtokId=${hurtokB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer()).get('/users').expect(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/users-list.e2e-spec.ts`
Expected: FAIL — `GET /users` returns 404 (route doesn't exist yet)

- [ ] **Step 3: Write the failing e2e tests for the detail endpoint**

Create `apps/api/test/users-detail.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('GET /users/:id (e2e)', () => {
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

  it('lets a junak fetch their own record but not another user', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const otherJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    const self = await request(app.getHttpServer())
      .get(`/users/${junak.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(self.body.id).toBe(junak.id);
    expect(self.body.passwordHash).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/users/${otherJunak.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('lets a vykhovnyk fetch an assigned or hurtokless junak but not one from another hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtokA = await prisma.hurtok.create({ data: { name: 'A', kurinId: kurin.id } });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'B', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtokA.id } });
    const junakA = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtokA.id });
    const junakB = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtokB.id });
    const junakNoHurtok = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get(`/users/${junakA.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/users/${junakNoHurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/users/${junakB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('forbids a vykhovnyk from fetching another vykhovnyk (404)', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const otherVykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get(`/users/${otherVykhovnyk.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('lets a zvyazkovyi fetch a junak or a vykhovnyk in their kurin, and 404s cross-tenant', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const junakA = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinA.id });
    const vykhovnykA = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurinA.id });
    const junakB = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinB.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get(`/users/${junakA.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/users/${vykhovnykA.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/users/${junakB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 404 for a nonexistent id', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .get('/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/users-detail.e2e-spec.ts`
Expected: FAIL — `GET /users/:id` returns 404 for every case including ones expected to be 200 (route doesn't exist yet)

- [ ] **Step 5: Add the service methods**

In `apps/api/src/users/users.service.ts`, add these two methods inside the `UsersService` class (alongside the existing `create`, `updateContactInfo`, `findById`). This file needs `ForbiddenException` and `CurrentUserPayload` added to its imports:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateContactInfoDto } from './dto/update-contact-info.dto';
```

Add these methods:

```ts
  async list(actor: CurrentUserPayload, filters: { role?: Role; hurtokId?: string }) {
    if (actor.role === Role.JUNAK) {
      throw new ForbiddenException('Junak cannot list users');
    }
    if (filters.role === Role.VYKHOVNYK && actor.role !== Role.ZVYAZKOVYI) {
      throw new ForbiddenException('Only zvyazkovyi can list vykhovnyky');
    }
    if (filters.hurtokId) {
      const hurtok = await this.prisma.hurtok.findUnique({ where: { id: filters.hurtokId } });
      if (!hurtok || hurtok.kurinId !== actor.kurinId) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }

    const select = {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      email: true,
      role: true,
      birthDate: true,
      kurinId: true,
      hurtokId: true,
    };

    if (actor.role === Role.VYKHOVNYK) {
      const assignments = await this.prisma.vykhovnykHurtok.findMany({
        where: { vykhovnykId: actor.userId },
        select: { hurtokId: true },
      });
      const assignedHurtokIds = assignments.map((a) => a.hurtokId);

      if (filters.hurtokId) {
        if (!assignedHurtokIds.includes(filters.hurtokId)) {
          throw new NotFoundException('Hurtok not found in this kurin');
        }
        return this.prisma.user.findMany({
          where: { kurinId: actor.kurinId, role: Role.JUNAK, hurtokId: filters.hurtokId },
          select,
        });
      }

      return this.prisma.user.findMany({
        where: {
          kurinId: actor.kurinId,
          role: Role.JUNAK,
          OR: [{ hurtokId: { in: assignedHurtokIds } }, { hurtokId: null }],
        },
        select,
      });
    }

    if (actor.role === Role.KURINNYI) {
      return this.prisma.user.findMany({
        where: {
          kurinId: actor.kurinId,
          role: Role.JUNAK,
          ...(filters.hurtokId ? { hurtokId: filters.hurtokId } : {}),
        },
        select,
      });
    }

    return this.prisma.user.findMany({
      where: {
        kurinId: actor.kurinId,
        role: filters.role ?? { in: [Role.JUNAK, Role.VYKHOVNYK] },
        ...(filters.hurtokId ? { hurtokId: filters.hurtokId } : {}),
      },
      select,
    });
  }

  async findScoped(id: string, actor: CurrentUserPayload) {
    if (actor.role === Role.JUNAK) {
      if (actor.userId !== id) {
        throw new NotFoundException('User not found');
      }
      return this.findById(id);
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        email: true,
        role: true,
        birthDate: true,
        kurinId: true,
        hurtokId: true,
      },
    });
    if (!user || user.kurinId !== actor.kurinId) {
      throw new NotFoundException('User not found');
    }

    const visible = await this.isVisibleTo(actor, user);
    if (!visible) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async isVisibleTo(
    actor: CurrentUserPayload,
    target: { role: Role; hurtokId: string | null },
  ): Promise<boolean> {
    if (actor.role === Role.ZVYAZKOVYI) {
      return target.role === Role.JUNAK || target.role === Role.VYKHOVNYK;
    }
    if (actor.role === Role.KURINNYI) {
      return target.role === Role.JUNAK;
    }
    if (actor.role === Role.VYKHOVNYK) {
      if (target.role !== Role.JUNAK) return false;
      if (target.hurtokId === null) return true;
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId: target.hurtokId },
      });
      return !!assigned;
    }
    return false;
  }
```

- [ ] **Step 6: Add the controller routes**

In `apps/api/src/users/users.controller.ts`, update the imports:

```ts
import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
```

Add a `list` method AFTER `me` and a `findOne` method AFTER `list` (order matters — `me` must stay before any `:id`-shaped route). The full class body should read:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Roles(Role.ZVYAZKOVYI)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user.kurinId);
  }

  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findById(user.userId);
  }

  @Get()
  list(
    @Query('role', new ParseEnumPipe(Role, { optional: true })) role: Role | undefined,
    @Query('hurtokId') hurtokId: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.list(user, { role, hurtokId });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findScoped(id, user);
  }

  @Roles(Role.KURINNYI, Role.ZVYAZKOVYI)
  @Patch(':id/contact-info')
  updateContactInfo(
    @Param('id') id: string,
    @Body() dto: UpdateContactInfoDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateContactInfo(id, dto, user.kurinId);
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/users-list.e2e-spec.ts test/users-detail.e2e-spec.ts`
Expected: PASS — 12 tests passed (7 in `users-list.e2e-spec.ts` + 5 in `users-detail.e2e-spec.ts`)

- [ ] **Step 8: Run the full users e2e suite to check for regressions**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/users.e2e-spec.ts test/users-contact-info.e2e-spec.ts`
Expected: PASS — no regressions from the new routes/imports

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/users apps/api/test/users-list.e2e-spec.ts apps/api/test/users-detail.e2e-spec.ts
git commit -m "feat: add GET /users list and GET /users/:id detail endpoints"
```

**Post-implementation revision (2026-08-29):** the task review found that this
task's original `list()` code let ZVYAZKOVYI pass `?role=KURINNYI` and read
KURINNYI/ZVYAZKOVYI peer records — flagged Critical since the plan's original
visibility rules never granted that. Raised to the human partner, who used
this finding to correct the underlying design (not just the code): КУРІННИЙ
can now *view* (not edit) VYKHOVNYK and ZVYAZKOVYI records, and ZVYAZKOVYI can
view every role in their kurin, including KURINNYI — see the updated
"Ролі та доступи" table in `docs/superpowers/specs/2026-08-28-yadro-proby-design.md`
and the "3. Список користувачів" section of
`docs/superpowers/specs/2026-08-29-read-api-design.md` for the authoritative
rules. `list()`'s KURINNYI/ZVYAZKOVYI branches and `isVisibleTo`'s role checks
were revised accordingly in the fix commit — the code blocks above are no
longer accurate for those two branches; the spec docs and the git history are
the record. The `?role=VYKHOVNYK&hurtokId=` combination was confirmed to
correctly return empty (viховники aren't linked to a hurtok via the `hurtokId`
column) and left as-is by explicit human decision. The 9-field select
whitelist, previously duplicated three times in `users.service.ts`, was
extracted into a shared module-level constant in the same fix.

---

## Task 4: Vykhovnyk assignments list endpoint

**Files:**
- Modify: `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.controller.ts`
- Modify: `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.service.ts`
- Test: `apps/api/test/vykhovnyk-assignments-list.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtAuthGuard`, `RolesGuard`, `Roles`, `CurrentUser`/`CurrentUserPayload` — all pre-existing.
- Produces: `GET /vykhovnyk-assignments?hurtokId=` — no other task depends on this.

- [ ] **Step 1: Write the failing e2e tests**

Create `apps/api/test/vykhovnyk-assignments-list.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('GET /vykhovnyk-assignments (e2e)', () => {
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

  it('lets a zvyazkovyi list all assignments in their kurin, excluding other kurins', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const hurtokA = await prisma.hurtok.create({ data: { name: 'HA', kurinId: kurinA.id } });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'HB', kurinId: kurinB.id } });
    const vykhovnykA = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurinA.id });
    const vykhovnykB = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurinB.id });
    const assignmentA = await prisma.vykhovnykHurtok.create({
      data: { vykhovnykId: vykhovnykA.id, hurtokId: hurtokA.id },
    });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnykB.id, hurtokId: hurtokB.id } });

    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    const response = await request(app.getHttpServer())
      .get('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(assignmentA.id);
  });

  it('lets a vykhovnyk list only their own assignments', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtokA = await prisma.hurtok.create({ data: { name: 'A', kurinId: kurin.id } });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'B', kurinId: kurin.id } });
    const vykhovnyk1 = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const vykhovnyk2 = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const assignment1 = await prisma.vykhovnykHurtok.create({
      data: { vykhovnykId: vykhovnyk1.id, hurtokId: hurtokA.id },
    });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk2.id, hurtokId: hurtokB.id } });

    const token = issueTokenFor(jwtService, vykhovnyk1);
    const response = await request(app.getHttpServer())
      .get('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(assignment1.id);
  });

  it('forbids a kurinniy and a junak from listing assignments', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });

    await request(app.getHttpServer())
      .get('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, kurinniy)}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
      .expect(403);
  });

  it('returns 404 when hurtokId belongs to another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'HB', kurinId: kurinB.id } });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get(`/vykhovnyk-assignments?hurtokId=${hurtokB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer()).get('/vykhovnyk-assignments').expect(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/vykhovnyk-assignments-list.e2e-spec.ts`
Expected: FAIL — `GET /vykhovnyk-assignments` returns 403 for the zvyazkovyi/vykhovnyk cases (class-level `@Roles(Role.ZVYAZKOVYI)` blocks the route entirely, and no `list` method exists yet, so the whole file fails)

- [ ] **Step 3: Add the service method**

In `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.service.ts`, add this method inside the `VykhovnykAssignmentsService` class (alongside `assign`/`unassign`). This file needs `CurrentUserPayload` added to its imports:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AssignVykhovnykDto } from './dto/assign-vykhovnyk.dto';
```

```ts
  async list(actor: CurrentUserPayload, hurtokId?: string) {
    if (hurtokId) {
      const hurtok = await this.prisma.hurtok.findUnique({ where: { id: hurtokId } });
      if (!hurtok || hurtok.kurinId !== actor.kurinId) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }

    if (actor.role === Role.VYKHOVNYK) {
      return this.prisma.vykhovnykHurtok.findMany({
        where: {
          vykhovnykId: actor.userId,
          ...(hurtokId ? { hurtokId } : {}),
        },
      });
    }

    return this.prisma.vykhovnykHurtok.findMany({
      where: {
        hurtok: { kurinId: actor.kurinId },
        ...(hurtokId ? { hurtokId } : {}),
      },
    });
  }
```

- [ ] **Step 4: Update the controller**

Replace the full contents of `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.controller.ts` with:

```ts
import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { VykhovnykAssignmentsService } from './vykhovnyk-assignments.service';
import { AssignVykhovnykDto } from './dto/assign-vykhovnyk.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vykhovnyk-assignments')
export class VykhovnykAssignmentsController {
  constructor(private readonly service: VykhovnykAssignmentsService) {}

  @Roles(Role.ZVYAZKOVYI)
  @Post()
  assign(@Body() dto: AssignVykhovnykDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.assign(dto, user.kurinId);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Delete(':id')
  unassign(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.unassign(id, user.kurinId);
  }

  @Roles(Role.ZVYAZKOVYI, Role.VYKHOVNYK)
  @Get()
  list(@Query('hurtokId') hurtokId: string | undefined, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user, hurtokId);
  }
}
```

Note: `@Roles` moved from the class level down to each individual method — `assign`/`unassign` keep the same `ZVYAZKOVYI`-only restriction as before, and `list` now allows both `ZVYAZKOVYI` and `VYKHOVNYK`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/vykhovnyk-assignments-list.e2e-spec.ts`
Expected: PASS — 5 tests passed

- [ ] **Step 6: Run the full vykhovnyk-assignments e2e suite to check for regressions**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/vykhovnyk-assignments.e2e-spec.ts`
Expected: PASS — `assign`/`unassign` still behave exactly as before (still ZVYAZKOVYI-only)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/vykhovnyk-assignments apps/api/test/vykhovnyk-assignments-list.e2e-spec.ts
git commit -m "feat: add GET /vykhovnyk-assignments read endpoint"
```

---

## Task 5: Hurtok board aggregate view

**Files:**
- Modify: `apps/api/src/hurtky/hurtky.controller.ts`
- Modify: `apps/api/src/hurtky/hurtky.service.ts`
- Test: `apps/api/test/hurtky-board.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtAuthGuard`, `RolesGuard`, `Roles`, `CurrentUser`/`CurrentUserPayload` — all pre-existing.
- Produces: `GET /hurtky/:id/board` — no other task depends on this.

- [ ] **Step 1: Write the failing e2e tests**

Create `apps/api/test/hurtky-board.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('GET /hurtky/:id/board (e2e)', () => {
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

  it('lets an assigned vykhovnyk see the hurtok, its junaky, and their progress', async () => {
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    await prisma.junakProgress.create({
      data: { junakId: junak.id, pointId: points[0].id, status: ProgressStatus.DONE, confirmedById: vykhovnyk.id, confirmedAt: new Date() },
    });

    const token = issueTokenFor(jwtService, vykhovnyk);
    const response = await request(app.getHttpServer())
      .get(`/hurtky/${hurtok.id}/board`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.hurtok.id).toBe(hurtok.id);
    expect(response.body.junaky).toHaveLength(1);
    expect(response.body.junaky[0].id).toBe(junak.id);
    expect(response.body.junaky[0].passwordHash).toBeUndefined();
    expect(response.body.junaky[0].progress).toHaveLength(1);
    expect(response.body.junaky[0].progress[0].status).toBe(ProgressStatus.DONE);
    expect(response.body.junaky[0].progress[0].point.id).toBe(points[0].id);
  });

  it('returns 404 for a vykhovnyk not assigned to the hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get(`/hurtky/${hurtok.id}/board`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('lets a zvyazkovyi view any hurtok board in their kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .get(`/hurtky/${hurtok.id}/board`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('forbids a kurinniy and a junak from viewing the board', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const kurinniy = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });

    await request(app.getHttpServer())
      .get(`/hurtky/${hurtok.id}/board`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, kurinniy)}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/hurtky/${hurtok.id}/board`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
      .expect(403);
  });

  it('returns 404 for a hurtok from another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'HB', kurinId: kurinB.id } });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get(`/hurtky/${hurtokB.id}/board`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 401 without a token', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });

    await request(app.getHttpServer()).get(`/hurtky/${hurtok.id}/board`).expect(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/hurtky-board.e2e-spec.ts`
Expected: FAIL — `Cannot GET /hurtky/:id/board` (404, route doesn't exist yet)

- [ ] **Step 3: Add the service method**

Replace the full contents of `apps/api/src/hurtky/hurtky.service.ts` with:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateHurtokDto } from './dto/create-hurtok.dto';

@Injectable()
export class HurtkyService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateHurtokDto, kurinId: string) {
    return this.prisma.hurtok.create({ data: { name: dto.name, number: dto.number, kurinId } });
  }

  listForKurin(kurinId: string) {
    return this.prisma.hurtok.findMany({ where: { kurinId } });
  }

  async getBoard(hurtokId: string, actor: CurrentUserPayload) {
    const hurtok = await this.prisma.hurtok.findUnique({ where: { id: hurtokId } });
    if (!hurtok || hurtok.kurinId !== actor.kurinId) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }

    if (actor.role === Role.VYKHOVNYK) {
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId },
      });
      if (!assigned) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }

    const junaky = await this.prisma.user.findMany({
      where: { hurtokId, role: Role.JUNAK },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        email: true,
        role: true,
        birthDate: true,
        kurinId: true,
        hurtokId: true,
      },
    });

    const junakyWithProgress = await Promise.all(
      junaky.map(async (junak) => {
        const progress = await this.prisma.junakProgress.findMany({
          where: { junakId: junak.id },
          include: { point: true },
        });
        return { ...junak, progress };
      }),
    );

    return {
      hurtok: { id: hurtok.id, name: hurtok.name, number: hurtok.number },
      junaky: junakyWithProgress,
    };
  }
}
```

- [ ] **Step 4: Add the controller route**

Replace the full contents of `apps/api/src/hurtky/hurtky.controller.ts` with:

```ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HurtkyService } from './hurtky.service';
import { CreateHurtokDto } from './dto/create-hurtok.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hurtky')
export class HurtkyController {
  constructor(private readonly service: HurtkyService) {}

  @Roles(Role.ZVYAZKOVYI)
  @Post()
  create(@Body() dto: CreateHurtokDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user.kurinId);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.listForKurin(user.kurinId);
  }

  @Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)
  @Get(':id/board')
  board(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getBoard(id, user);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/hurtky-board.e2e-spec.ts`
Expected: PASS — 6 tests passed

- [ ] **Step 6: Run the full hurtky e2e suite to check for regressions**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/hurtky.e2e-spec.ts`
Expected: PASS — `create`/`list` still behave exactly as before

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/hurtky apps/api/test/hurtky-board.e2e-spec.ts
git commit -m "feat: add GET /hurtky/:id/board aggregate view"
```

---

## Task 6: Approval request detail endpoint

**Files:**
- Modify: `apps/api/src/approval-requests/approval-requests.controller.ts`
- Modify: `apps/api/src/approval-requests/approval-requests.service.ts`
- Test: `apps/api/test/approval-requests-detail.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtAuthGuard`, `RolesGuard`, `Roles`, `CurrentUser`/`CurrentUserPayload` — all pre-existing.
- Produces: `GET /approval-requests/:id` — no other task depends on this.

- [ ] **Step 1: Write the failing e2e tests**

Create `apps/api/test/approval-requests-detail.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ApprovalActionType, ApprovalStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('GET /approval-requests/:id (e2e)', () => {
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

  it('lets a zvyazkovyi view a pending request in their own kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const req = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinniy.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_FULL_NAME,
        newData: { firstName: 'Нове', lastName: "Ім'я" },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(req.id);
    expect(response.body.status).toBe(ApprovalStatus.PENDING);
  });

  it('lets a zvyazkovyi view an already-decided request', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const req = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinniy.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_FULL_NAME,
        newData: { firstName: 'Нове', lastName: "Ім'я" },
        status: ApprovalStatus.APPROVED,
        approvedById: zvyazkovyi.id,
        decidedAt: new Date(),
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.status).toBe(ApprovalStatus.APPROVED);
  });

  it('returns 404 for a request from another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const kurinniyB = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurinB.id });
    const junakB = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinB.id });
    const req = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinniyB.id,
        junakId: junakB.id,
        actionType: ApprovalActionType.CHANGE_FULL_NAME,
        newData: { firstName: 'X', lastName: 'Y' },
        status: ApprovalStatus.PENDING,
      },
    });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('forbids kurinniy, vykhovnyk, and junak from viewing request detail', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const req = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinniy.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_FULL_NAME,
        newData: { firstName: 'X', lastName: 'Y' },
        status: ApprovalStatus.PENDING,
      },
    });

    await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, kurinniy)}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, vykhovnyk)}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
      .expect(403);
  });

  it('returns 404 for a nonexistent id', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .get('/approval-requests/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/approval-requests-detail.e2e-spec.ts`
Expected: FAIL — `Cannot GET /approval-requests/:id` (404, route doesn't exist yet)

- [ ] **Step 3: Add the service method**

In `apps/api/src/approval-requests/approval-requests.service.ts`, add this method inside the `ApprovalRequestsService` class (alongside `create`, `list`, `approve`, `reject`):

```ts
  async findOne(id: string, kurinId: string) {
    const req = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!req) {
      throw new NotFoundException('Request not found');
    }
    const initiator = await this.prisma.user.findUnique({ where: { id: req.initiatedById } });
    if (!initiator || initiator.kurinId !== kurinId) {
      throw new NotFoundException('Request not found');
    }
    return req;
  }
```

- [ ] **Step 4: Add the controller route**

In `apps/api/src/approval-requests/approval-requests.controller.ts`, add this method inside the `ApprovalRequestsController` class, after `list`:

```ts
  @Roles(Role.ZVYAZKOVYI)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user.kurinId);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/approval-requests-detail.e2e-spec.ts`
Expected: PASS — 5 tests passed

- [ ] **Step 6: Run the full approval-requests e2e suite to check for regressions**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/approval-requests-create.e2e-spec.ts test/approval-requests-decide.e2e-spec.ts`
Expected: PASS — `create`/`list`/`approve`/`reject` still behave exactly as before

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/approval-requests apps/api/test/approval-requests-detail.e2e-spec.ts
git commit -m "feat: add GET /approval-requests/:id detail endpoint"
```

---

## Final Step: Full Suite Verification

After all 6 tasks are complete, run the entire e2e and unit suites once to confirm no cross-task regressions:

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: PASS — all suites green (24 files: 18 pre-existing + 6 new)

Run: `cd apps/api && npm test`
Expected: PASS — 2 suites, 11 tests (unchanged — this plan adds no unit tests)
