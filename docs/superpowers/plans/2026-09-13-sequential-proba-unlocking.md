# Послідовне відкриття проб Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A junak starts with only the first proba stage open. A vykhovnyk/zvyazkovyi explicitly closes a stage (even if incomplete) to unlock the next one; the closed stage stays editable until its remaining points are confirmed, then it auto-locks (read-only) — reversible via an explicit "reopen." Enforced server-side, not just cosmetically in the UI.

**Architecture:** One new Prisma model, `JunakStageProgress` (one row per junak-per-stage, tracking a one-way `firstClosedAt` that gates the next stage plus a toggleable `closedAt`). A shared private method on the existing `ProbyProgressService` computes each stage's `LOCKED`/`OPEN`/`CLOSED` status on demand (nothing is cached). Two new endpoints (`close`/`reopen`) let a vykhovnyk/zvyazkovyi transition a stage; the existing `confirm`/`unconfirm` endpoints gain a guard that rejects the action unless the point's stage is currently `OPEN`. The frontend renders this status per stage on both the junak's own read-only view and the vykhovnyk/zvyazkovyi's confirm view.

**Tech Stack:** NestJS + Prisma + PostgreSQL (backend, unchanged), Next.js App Router + TanStack Query (frontend, unchanged).

## Global Constraints

- **Additive migration only.** Production has live users but zero existing proba progress data (confirmed by the product owner) — this plan's migration adds one new table (`JunakStageProgress`) and new relation array fields on `User`/`ProbyStage` only. No `ALTER` on any existing column, no backfill logic needed.
- **Server-side enforcement is mandatory, not cosmetic.** A direct API call to `confirm`/`unconfirm` on a point in a `LOCKED` or `CLOSED` stage must be rejected by the backend (403), regardless of what the frontend shows.
- **Two-timestamp model is required exactly as specified — do not collapse to one field.** `firstClosedAt` is set exactly once (the first time a stage is closed) and never cleared — it is what makes the *next* stage reachable, permanently. `closedAt` toggles on every close/reopen and, combined with "are all this stage's points done," determines whether *this* stage is currently read-only. Reopening a stage must never re-lock a later stage that was already unlocked.
- **Stage-level locking only.** No category-level sequencing within a stage — an entire `ProbyStage` opens or closes as one unit.
- **Applies identically to both `ProbyProgramVersion.OLD` and `NEW`.** No version-specific branching anywhere in this feature — the logic operates purely on `ProbyStage.order` within whatever program a kurin is currently on.
- **`GET /junaky/:junakId/progress`'s response shape changes** from a bare array to `{ points, stages }`. This is an internal endpoint with two known consumers (both updated in Task 3) and no external consumers — the breaking change is acceptable, same precedent as prior plans in this project.
- Git hygiene: every commit uses exact file paths in `git add`, never `-A` or `.`.

---

## Task 1: Backend — `JunakStageProgress` model + close/reopen endpoints

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/proby-progress/proby-progress.service.ts`
- Modify: `apps/api/src/proby-progress/proby-progress.controller.ts`
- Test: `apps/api/test/proby-stage-lock.e2e-spec.ts`

**Interfaces:**
- Consumes: nothing from other tasks (self-contained).
- Produces:
  - A new private method on `ProbyProgressService`: `getStageStatuses(junakId: string, programId: string): Promise<Map<string, 'LOCKED' | 'OPEN' | 'CLOSED'>>`, keyed by `stageId`, in `ProbyStage.order` ascending order (Map insertion order). Task 2 reuses this exact method (same class, so no export needed — Task 2's steps modify methods in this same file).
  - Two new endpoints: `POST /junaky/:junakId/progress/stages/:stageId/close` and `POST /junaky/:junakId/progress/stages/:stageId/reopen`, both roles `VYKHOVNYK`/`ZVYAZKOVYI`, both returning the `JunakStageProgress` row on success.
  - The `JunakStageProgress` Prisma model with fields `id`, `junakId`, `stageId`, `firstClosedAt`, `closedAt`, `closedById`, unique on `[junakId, stageId]`.

### Step 1: Add the schema additions

Open `apps/api/prisma/schema.prisma`. Add this model anywhere after the `JunakProgress` model:

```prisma
model JunakStageProgress {
  id            String     @id @default(uuid())
  junakId       String
  junak         User       @relation("JunakStageProgressEntries", fields: [junakId], references: [id])
  stageId       String
  stage         ProbyStage @relation(fields: [stageId], references: [id])
  firstClosedAt DateTime?
  closedAt      DateTime?
  closedById    String?
  closedBy      User?      @relation("StageClosedByUser", fields: [closedById], references: [id])

  @@unique([junakId, stageId])
}
```

In the `ProbyStage` model, add this line right after the existing `categories ProbyCategory[]` line:

```prisma
  stageProgressEntries JunakStageProgress[]
```

In the `User` model, add these two lines right after the existing `guardianContacts  GuardianContact[] @relation("JunakGuardians")` line:

```prisma
  stageProgressEntries JunakStageProgress[] @relation("JunakStageProgressEntries")
  stageClosedLogs      JunakStageProgress[] @relation("StageClosedByUser")
```

### Step 2: Generate and apply the migration

Run (from `apps/api/`, against your local dev database):

```bash
npx prisma migrate dev --name add_junak_stage_progress
```

Expected: it prints `Your database is now in sync with your schema`, and the generated `migration.sql` contains only `CREATE TABLE "JunakStageProgress"` and its `ADD CONSTRAINT` foreign keys (to `User` twice, to `ProbyStage` once) plus a unique index on `("junakId", "stageId")` — no `ALTER TABLE` touching any existing table's columns. If you see anything else, stop — Step 1 was applied incorrectly.

### Step 3: Add the shared stage-status computation and the close/reopen service methods

Open `apps/api/src/proby-progress/proby-progress.service.ts`. First, update the import line at the top from:

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
```

to:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
```

Then add these three new methods to the `ProbyProgressService` class — place them right after the existing `unconfirm` method and before the existing `private async assertPointExists` method:

```ts
  async closeStage(junakId: string, stageId: string, actor: CurrentUserPayload) {
    await this.assertCanConfirm(junakId, actor);
    const stage = await this.prisma.probyStage.findUnique({ where: { id: stageId } });
    if (!stage) {
      throw new NotFoundException('Stage not found');
    }
    const statuses = await this.getStageStatuses(junakId, stage.programId);
    if (statuses.get(stageId) === 'LOCKED') {
      throw new BadRequestException('Cannot close a locked stage');
    }

    return this.prisma.junakStageProgress.upsert({
      where: { junakId_stageId: { junakId, stageId } },
      update: { closedAt: new Date(), closedById: actor.userId },
      create: {
        junakId,
        stageId,
        closedAt: new Date(),
        closedById: actor.userId,
        firstClosedAt: new Date(),
      },
    });
  }

  async reopenStage(junakId: string, stageId: string, actor: CurrentUserPayload) {
    await this.assertCanConfirm(junakId, actor);
    const stage = await this.prisma.probyStage.findUnique({ where: { id: stageId } });
    if (!stage) {
      throw new NotFoundException('Stage not found');
    }
    const statuses = await this.getStageStatuses(junakId, stage.programId);
    if (statuses.get(stageId) !== 'CLOSED') {
      throw new BadRequestException('Only a closed stage can be reopened');
    }

    return this.prisma.junakStageProgress.update({
      where: { junakId_stageId: { junakId, stageId } },
      data: { closedAt: null },
    });
  }

  private async getStageStatuses(
    junakId: string,
    programId: string,
  ): Promise<Map<string, 'LOCKED' | 'OPEN' | 'CLOSED'>> {
    const stages = await this.prisma.probyStage.findMany({
      where: { programId },
      orderBy: { order: 'asc' },
      include: { categories: { include: { points: { select: { id: true } } } } },
    });

    const stageProgressRows = await this.prisma.junakStageProgress.findMany({
      where: { junakId, stageId: { in: stages.map((s) => s.id) } },
    });
    const stageProgressByStageId = new Map(stageProgressRows.map((row) => [row.stageId, row]));

    const doneEntries = await this.prisma.junakProgress.findMany({
      where: {
        junakId,
        status: ProgressStatus.DONE,
        point: { category: { stage: { programId } } },
      },
      select: { point: { select: { category: { select: { stageId: true } } } } },
    });
    const doneCountByStageId = new Map<string, number>();
    for (const entry of doneEntries) {
      const stageId = entry.point.category.stageId;
      doneCountByStageId.set(stageId, (doneCountByStageId.get(stageId) ?? 0) + 1);
    }

    const statuses = new Map<string, 'LOCKED' | 'OPEN' | 'CLOSED'>();
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const previousStage = i > 0 ? stages[i - 1] : null;
      const previousStageProgress = previousStage ? stageProgressByStageId.get(previousStage.id) : undefined;
      const reachable = i === 0 || !!previousStageProgress?.firstClosedAt;

      if (!reachable) {
        statuses.set(stage.id, 'LOCKED');
        continue;
      }

      const totalPoints = stage.categories.reduce((sum, category) => sum + category.points.length, 0);
      const doneCount = doneCountByStageId.get(stage.id) ?? 0;
      const allDone = doneCount === totalPoints;
      const thisStageProgress = stageProgressByStageId.get(stage.id);
      const closedNow = !!thisStageProgress?.closedAt;

      statuses.set(stage.id, closedNow && allDone ? 'CLOSED' : 'OPEN');
    }

    return statuses;
  }
```

### Step 4: Add the controller endpoints

Open `apps/api/src/proby-progress/proby-progress.controller.ts`. Add these two methods right after the existing `unconfirm` method, before the closing `}` of the class:

```ts
  @UseGuards(RolesGuard)
  @Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)
  @Post('stages/:stageId/close')
  closeStage(
    @Param('junakId') junakId: string,
    @Param('stageId') stageId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.closeStage(junakId, stageId, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)
  @Post('stages/:stageId/reopen')
  reopenStage(
    @Param('junakId') junakId: string,
    @Param('stageId') stageId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.reopenStage(junakId, stageId, user);
  }
```

No new imports are needed in this file — `Post`, `Param`, `UseGuards`, `Role`, `RolesGuard`, `Roles`, `CurrentUser`, `CurrentUserPayload` are all already imported for the existing `confirm`/`unconfirm` methods.

### Step 5: Write the e2e tests

Create `apps/api/test/proby-stage-lock.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Proby stage lock (e2e)', () => {
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

  async function setup() {
    const program = await prisma.probyProgram.create({ data: { version: ProbyProgramVersion.OLD, name: 'Test program' } });
    const stage1 = await prisma.probyStage.create({ data: { programId: program.id, order: 1, name: 'Stage 1' } });
    const category1 = await prisma.probyCategory.create({ data: { stageId: stage1.id, name: 'Category 1' } });
    const point1a = await prisma.probyPoint.create({ data: { categoryId: category1.id, order: 1, description: 'Point 1a' } });
    const point1b = await prisma.probyPoint.create({ data: { categoryId: category1.id, order: 2, description: 'Point 1b' } });
    const stage2 = await prisma.probyStage.create({ data: { programId: program.id, order: 2, name: 'Stage 2' } });
    const category2 = await prisma.probyCategory.create({ data: { stageId: stage2.id, name: 'Category 2' } });
    const point2a = await prisma.probyPoint.create({ data: { categoryId: category2.id, order: 1, description: 'Point 2a' } });

    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const token = issueTokenFor(jwtService, vykhovnyk);

    return { kurin, hurtok, junak, vykhovnyk, token, stage1, stage2, point1a, point1b, point2a };
  }

  it('forbids closing a stage that is not yet reachable', async () => {
    const { junak, token, stage2 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage2.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('lets an assigned vykhovnyk close the first stage even with incomplete points, unlocking the next stage', async () => {
    const { junak, token, stage1, stage2 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage2.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('forbids reopening a stage that was closed with debt (not fully done)', async () => {
    const { junak, token, stage1 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('forbids reopening a stage that was never closed', async () => {
    const { junak, token, stage1 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('lets an assigned vykhovnyk reopen a fully-closed stage without re-locking the next one', async () => {
    const { junak, token, stage1, stage2, point1a, point1b } = await setup();

    await prisma.junakProgress.create({ data: { junakId: junak.id, pointId: point1a.id, status: ProgressStatus.DONE } });
    await prisma.junakProgress.create({ data: { junakId: junak.id, pointId: point1b.id, status: ProgressStatus.DONE } });

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    // Stage 1 is now closed AND fully done => CLOSED status. Reopen must succeed.
    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    // Stage 2 must still be reachable — reopening stage 1 must not re-lock it.
    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage2.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('forbids an unassigned vykhovnyk from closing a stage', async () => {
    const { junak, kurin, stage1 } = await setup();
    const unassignedVykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, unassignedVykhovnyk);

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 404 when the stageId does not exist', async () => {
    const { junak, token } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/00000000-0000-0000-0000-000000000000/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('is idempotent: closing an already-closed stage keeps firstClosedAt unchanged', async () => {
    const { junak, token, stage1 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const firstRow = await prisma.junakStageProgress.findUnique({
      where: { junakId_stageId: { junakId: junak.id, stageId: stage1.id } },
    });

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const secondRow = await prisma.junakStageProgress.findUnique({
      where: { junakId_stageId: { junakId: junak.id, stageId: stage1.id } },
    });

    expect(secondRow?.firstClosedAt).toEqual(firstRow?.firstClosedAt);
  });
});
```

### Step 6: Run the tests

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand proby-stage-lock`
Expected: PASS, 8 tests.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

### Step 7: Run the full backend e2e suite to confirm no regressions

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`
Expected: all suites pass (no regressions — the existing `confirm`/`unconfirm`/`getProgressFor` behavior is untouched in this task).

### Step 8: Commit

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/proby-progress/proby-progress.service.ts apps/api/src/proby-progress/proby-progress.controller.ts apps/api/test/proby-stage-lock.e2e-spec.ts
git commit -m "feat: add JunakStageProgress model and stage close/reopen endpoints"
```

---

## Task 2: Backend — guard confirm/unconfirm, change GET response shape

**Files:**
- Modify: `apps/api/src/proby-progress/proby-progress.service.ts`
- Modify: `apps/api/test/proby-progress.e2e-spec.ts`
- Test: `apps/api/test/proby-progress-stage-guard.e2e-spec.ts`

**Interfaces:**
- Consumes: the private `getStageStatuses(junakId, programId)` method added to `ProbyProgressService` in Task 1 (same class — no import needed, just calling `this.getStageStatuses(...)`).
- Produces: `GET /junaky/:junakId/progress` now returns `{ points: JunakProgress[], stages: { stageId: string; status: 'LOCKED' | 'OPEN' | 'CLOSED' }[] }` instead of a bare array. `confirm`/`unconfirm` now throw `ForbiddenException` when the point's stage is not `OPEN` for that junak. Task 3 (frontend) consumes this exact response shape.

### Step 1: Update the existing GET-progress e2e assertions to the new response shape

Open `apps/api/test/proby-progress.e2e-spec.ts`. There are three places asserting on the bare response body — change each from `response.body` to `response.body.points`:

Replace (line 53-54):
```ts
    expect(response.body).toHaveLength(1);
    expect(response.body[0].status).toBe(ProgressStatus.DONE);
```
with:
```ts
    expect(response.body.points).toHaveLength(1);
    expect(response.body.points[0].status).toBe(ProgressStatus.DONE);
```

Replace (line 137-138, identical text — the second occurrence, in the "lets a kurinnyi view their own progress" test):
```ts
    expect(response.body).toHaveLength(1);
    expect(response.body[0].status).toBe(ProgressStatus.DONE);
```
with:
```ts
    expect(response.body.points).toHaveLength(1);
    expect(response.body.points[0].status).toBe(ProgressStatus.DONE);
```

Replace (line 172, in the "lets zvyazkovyi view a kurinnyi's progress" test):
```ts
    expect(response.body).toHaveLength(1);
```
with:
```ts
    expect(response.body.points).toHaveLength(1);
```

No other line in this file changes — all other tests in this file only check the HTTP status code, not the body shape.

### Step 2: Run the updated tests to verify they fail

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand proby-progress.e2e-spec`
Expected: FAIL — `getProgressFor` still returns a bare array, so `response.body.points` is `undefined`.

### Step 3: Change `getProgressFor`'s return shape

Open `apps/api/src/proby-progress/proby-progress.service.ts`. Replace the `getProgressFor` method's final return statement — find this at the end of the method:

```ts
    return this.prisma.junakProgress.findMany({
      where: { junakId },
      include: { point: true },
    });
```

Replace it with:

```ts
    const points = await this.prisma.junakProgress.findMany({
      where: { junakId },
      include: { point: true },
    });

    const kurin = await this.prisma.kurin.findUnique({ where: { id: junak.kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    const statuses = await this.getStageStatuses(junakId, kurin.probyProgramId);
    const stages = Array.from(statuses.entries()).map(([stageId, status]) => ({ stageId, status }));

    return { points, stages };
```

### Step 4: Run the GET-progress tests to verify they pass

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand proby-progress.e2e-spec`
Expected: PASS, all tests in this file.

### Step 5: Write the failing tests for the confirm/unconfirm guard

Create `apps/api/test/proby-progress-stage-guard.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Proby progress confirm/unconfirm stage guard (e2e)', () => {
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

  async function setup() {
    const program = await prisma.probyProgram.create({ data: { version: ProbyProgramVersion.NEW, name: 'Test program' } });
    const stage1 = await prisma.probyStage.create({ data: { programId: program.id, order: 1, name: 'Stage 1' } });
    const category1 = await prisma.probyCategory.create({ data: { stageId: stage1.id, name: 'Category 1' } });
    const point1 = await prisma.probyPoint.create({ data: { categoryId: category1.id, order: 1, description: 'Point 1' } });
    const stage2 = await prisma.probyStage.create({ data: { programId: program.id, order: 2, name: 'Stage 2' } });
    const category2 = await prisma.probyCategory.create({ data: { stageId: stage2.id, name: 'Category 2' } });
    const point2 = await prisma.probyPoint.create({ data: { categoryId: category2.id, order: 1, description: 'Point 2' } });

    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const token = issueTokenFor(jwtService, vykhovnyk);

    return { junak, token, stage1, stage2, point1, point2 };
  }

  it('forbids confirming a point in a stage that is still locked', async () => {
    const { junak, token, point2 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${point2.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lets confirming a point in a closed-with-debt stage (still OPEN)', async () => {
    const { junak, token, stage1, point1 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${point1.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('lets confirming a point in the newly-unlocked next stage', async () => {
    const { junak, token, stage1, point2 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${point2.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('forbids confirming (and unconfirming) a point in an auto-locked (CLOSED) stage', async () => {
    const { junak, token, stage1, point1 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${point1.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    // Stage 1 is now closed AND fully done => CLOSED (auto-locked, read-only).
    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${point1.id}/unconfirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('GET /progress returns correct LOCKED/OPEN status for a fresh junak', async () => {
    const { junak, token, stage1, stage2 } = await setup();

    const response = await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const statusByStageId = new Map(response.body.stages.map((s: { stageId: string; status: string }) => [s.stageId, s.status]));
    expect(statusByStageId.get(stage1.id)).toBe('OPEN');
    expect(statusByStageId.get(stage2.id)).toBe('LOCKED');
  });

  it('GET /progress returns CLOSED status once a stage is closed and fully done', async () => {
    const { junak, token, stage1, point1 } = await setup();

    await prisma.junakProgress.create({ data: { junakId: junak.id, pointId: point1.id, status: ProgressStatus.DONE } });
    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const response = await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const statusByStageId = new Map(response.body.stages.map((s: { stageId: string; status: string }) => [s.stageId, s.status]));
    expect(statusByStageId.get(stage1.id)).toBe('CLOSED');
  });
});
```

### Step 6: Run the new guard tests to verify they fail

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand proby-progress-stage-guard`
Expected: FAIL — the "forbids confirming a point in a stage that is still locked" test expects 403 but currently gets 201 (no guard exists yet).

### Step 7: Add the guard to `confirm` and `unconfirm`

Open `apps/api/src/proby-progress/proby-progress.service.ts`. Add a new private method right after `getStageStatuses` (or anywhere else in the class after it — placement doesn't matter, just keep it inside the class):

```ts
  private async assertStageIsOpenForPoint(junakId: string, pointId: string) {
    const point = await this.prisma.probyPoint.findUnique({
      where: { id: pointId },
      select: { category: { select: { stageId: true, stage: { select: { programId: true } } } } },
    });
    if (!point) {
      return;
    }
    const statuses = await this.getStageStatuses(junakId, point.category.stage.programId);
    if (statuses.get(point.category.stageId) !== 'OPEN') {
      throw new ForbiddenException('This proba stage is locked or closed');
    }
  }
```

Then update `confirm` and `unconfirm` to call it. In `confirm`, change:

```ts
  async confirm(junakId: string, pointId: string, actor: CurrentUserPayload) {
    await this.assertCanConfirm(junakId, actor);
    await this.assertPointExists(pointId);
```

to:

```ts
  async confirm(junakId: string, pointId: string, actor: CurrentUserPayload) {
    await this.assertCanConfirm(junakId, actor);
    await this.assertPointExists(pointId);
    await this.assertStageIsOpenForPoint(junakId, pointId);
```

In `unconfirm`, change:

```ts
  async unconfirm(junakId: string, pointId: string, actor: CurrentUserPayload) {
    await this.assertCanConfirm(junakId, actor);
    await this.assertPointExists(pointId);
```

to:

```ts
  async unconfirm(junakId: string, pointId: string, actor: CurrentUserPayload) {
    await this.assertCanConfirm(junakId, actor);
    await this.assertPointExists(pointId);
    await this.assertStageIsOpenForPoint(junakId, pointId);
```

### Step 8: Run the new guard tests to verify they pass

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand proby-progress-stage-guard`
Expected: PASS, all 6 tests.

### Step 9: Run the full backend e2e suite and typecheck

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`
Expected: all suites pass, including every existing `proby-progress-confirm.e2e-spec.ts` and `proby-progress-unconfirm.e2e-spec.ts` test unmodified (they all use a single-stage program via `createProbyProgramTree`, so the point's stage is always the program's first and only stage — always reachable and never auto-closed in those tests, so the new guard never fires there).

### Step 10: Commit

```bash
git add apps/api/src/proby-progress/proby-progress.service.ts apps/api/test/proby-progress.e2e-spec.ts apps/api/test/proby-progress-stage-guard.e2e-spec.ts
git commit -m "feat: guard confirm/unconfirm by stage status, return stage statuses from GET /progress"
```

---

## Task 3: Frontend — stage lock UI on both proba pages

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/queries/proby.ts`
- Modify: `apps/web/app/users/[id]/page.tsx`
- Modify: `apps/web/app/proby/page.tsx`
- Test: `apps/web/e2e/proba-stage-lock.spec.ts`

**Interfaces:**
- Consumes: the backend contract from Task 2 — `GET /junaky/:junakId/progress` returns `{ points: JunakProgress[], stages: { stageId: string; status: 'LOCKED' | 'OPEN' | 'CLOSED' }[] }`; `POST /junaky/:junakId/progress/stages/:stageId/close` and `.../reopen` from Task 1, both returning the `JunakStageProgress` row (frontend doesn't need its exact shape, just that the call succeeds).
- Produces: nothing consumed by later tasks (last task in this plan).

### Step 1: Update the `JunakProgress`-related types

Open `apps/web/lib/types.ts`. Find the existing `JunakProgress` interface (ends with `point: ProbyPoint;`). Right after it, add:

```ts
export type StageStatus = 'LOCKED' | 'OPEN' | 'CLOSED';

export interface JunakProgressResponse {
  points: JunakProgress[];
  stages: { stageId: string; status: StageStatus }[];
}
```

### Step 2: Update the query hooks

Open `apps/web/lib/queries/proby.ts`. Change the import line from:

```ts
import type { ProbyProgram, JunakProgress } from '@/lib/types';
```

to:

```ts
import type { ProbyProgram, JunakProgressResponse } from '@/lib/types';
```

Change `useJunakProgress`'s `queryFn` generic from `JunakProgress[]` to `JunakProgressResponse`:

```ts
export function useJunakProgress(junakId: string | undefined) {
  return useQuery({
    queryKey: ['junaky', junakId, 'progress'],
    queryFn: () => apiFetch<JunakProgressResponse>(`/junaky/${junakId}/progress`),
    enabled: !!junakId,
  });
}
```

Add two new mutation hooks at the end of the file, after `useUnconfirmPoint`:

```ts
export function useCloseStage(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) =>
      apiFetch(`/junaky/${junakId}/progress/stages/${stageId}/close`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['junaky', junakId, 'progress'] });
    },
  });
}

export function useReopenStage(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) =>
      apiFetch(`/junaky/${junakId}/progress/stages/${stageId}/reopen`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['junaky', junakId, 'progress'] });
    },
  });
}
```

### Step 3: Typecheck to confirm no other consumer broke

Run: `cd apps/web && npx tsc --noEmit`
Expected: FAIL at this point — `apps/web/app/users/[id]/page.tsx` and `apps/web/app/proby/page.tsx` both still treat `junakProgress`/`progress` as a bare array (`.filter(...)` on the query result directly). This confirms exactly the two consumers that Steps 4-5 must fix.

### Step 4: Update `apps/web/app/users/[id]/page.tsx`

Read the current file first. Three changes are needed: the import line, the `doneByPointId` computation, and the stage-rendering loop (replacing the whole `isJunak && probyProgram` block).

Change the import line from:

```ts
import { useProbyProgram, useJunakProgress, useConfirmPoint, useUnconfirmPoint } from '@/lib/queries/proby';
```

to:

```ts
import {
  useProbyProgram,
  useJunakProgress,
  useConfirmPoint,
  useUnconfirmPoint,
  useCloseStage,
  useReopenStage,
} from '@/lib/queries/proby';
```

Add two new hook calls right after the existing `const unconfirmPoint = useUnconfirmPoint(id);` line:

```ts
  const closeStage = useCloseStage(id);
  const reopenStage = useReopenStage(id);
```

Inside the `CardContent` block under `{isJunak && probyProgram && (`, find this line (the `doneByPointId` computation reads from `junakProgress ?? []` as if it were an array):

```ts
                const doneByPointId = new Set(
                  (junakProgress ?? []).filter((p) => p.status === 'DONE').map((p) => p.pointId),
                );
```

Replace it with:

```ts
                const doneByPointId = new Set(
                  (junakProgress?.points ?? []).filter((p) => p.status === 'DONE').map((p) => p.pointId),
                );
                const statusByStageId = new Map(
                  (junakProgress?.stages ?? []).map((s) => [s.stageId, s.status]),
                );
```

Then replace the entire `return probyProgram.stages...` block that follows (through its closing `));`):

```ts
                return probyProgram.stages
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((stage) => (
                    <div key={stage.id} className="mb-4 last:mb-0">
                      <h3 className="mb-2 text-sm font-bold uppercase text-muted-foreground">{stage.name}</h3>
                      {stage.categories.map((category) => (
                        <ProbyCategorySection
                          key={category.id}
                          category={category}
                          doneByPointId={doneByPointId}
                          canConfirm={canConfirmProby}
                          onConfirm={(pointId) => confirmPoint.mutate(pointId)}
                          onUnconfirm={(pointId) => unconfirmPoint.mutate(pointId)}
                        />
                      ))}
                    </div>
                  ));
```

with:

```ts
                return probyProgram.stages
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((stage) => {
                    const status = statusByStageId.get(stage.id);
                    if (status === 'LOCKED') {
                      return (
                        <div key={stage.id} className="mb-4 last:mb-0 opacity-50">
                          <h3 className="text-sm font-bold uppercase text-muted-foreground">
                            🔒 {stage.name}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Розблокується після закриття попередньої проби
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div key={stage.id} className="mb-4 last:mb-0">
                        <div className="mb-2 flex items-center justify-between">
                          <h3 className="text-sm font-bold uppercase text-muted-foreground">{stage.name}</h3>
                          {canConfirmProby &&
                            (status === 'CLOSED' ? (
                              <Button size="sm" variant="outline" onClick={() => reopenStage.mutate(stage.id)}>
                                🔓 Перевідкрити пробу
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => closeStage.mutate(stage.id)}>
                                Закрити пробу
                              </Button>
                            ))}
                        </div>
                        {stage.categories.map((category) => (
                          <ProbyCategorySection
                            key={category.id}
                            category={category}
                            doneByPointId={doneByPointId}
                            canConfirm={canConfirmProby && status !== 'CLOSED'}
                            onConfirm={(pointId) => confirmPoint.mutate(pointId)}
                            onUnconfirm={(pointId) => unconfirmPoint.mutate(pointId)}
                          />
                        ))}
                      </div>
                    );
                  });
```

Note: `canConfirm={canConfirmProby && status !== 'CLOSED'}` reuses the existing `ProbyCategorySection` component unchanged — passing `canConfirm={false}` for a `CLOSED` stage already hides the Підтвердити/Зняти buttons via that component's existing `{canConfirm && (...)}` conditional, no changes needed to `ProbyCategorySection` itself.

### Step 5: Update `apps/web/app/proby/page.tsx`

Read the current file first. Replace its entire contents with:

```tsx
'use client';

import { useSession } from '@/lib/session-client';
import { useProbyProgram, useJunakProgress } from '@/lib/queries/proby';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ProbyPage() {
  const { data: session } = useSession();
  const { data: program, isLoading: programLoading } = useProbyProgram();
  const { data: progressData, isLoading: progressLoading } = useJunakProgress(session?.userId);

  if (programLoading || progressLoading) {
    return <p>Завантаження...</p>;
  }

  if (!program) {
    return <p>Не вдалося завантажити програму проб.</p>;
  }

  const doneByPointId = new Set(
    (progressData?.points ?? []).filter((p) => p.status === 'DONE').map((p) => p.pointId),
  );
  const statusByStageId = new Map((progressData?.stages ?? []).map((s) => [s.stageId, s.status]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{program.name}</h1>
      {program.stages
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((stage) => {
          const status = statusByStageId.get(stage.id);
          if (status === 'LOCKED') {
            return (
              <Card key={stage.id} className="opacity-50">
                <CardHeader>
                  <CardTitle>🔒 {stage.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Розблокується після закриття попередньої проби
                  </p>
                </CardContent>
              </Card>
            );
          }
          return (
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
          );
        })}
    </div>
  );
}
```

### Step 6: Typecheck

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

### Step 7: Write the Playwright e2e test

Create `apps/web/e2e/proba-stage-lock.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

async function adminPost<T>(path: string, body: unknown, adminKey = ADMIN_API_KEY): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Admin seed request failed: ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function seedTwoStageProgram() {
  const program = await adminPost<{ id: string }>('/admin/proby-programs', {
    version: 'OLD',
    name: `Програма ${Date.now()}`,
  });
  const stage1 = await adminPost<{ id: string }>(`/admin/proby-programs/${program.id}/stages`, {
    order: 1,
    name: 'Стадія 1',
  });
  const category1 = await adminPost<{ id: string }>(`/admin/proby-stages/${stage1.id}/categories`, {
    name: 'Категорія 1',
  });
  const point1 = await adminPost<{ id: string }>(`/admin/proby-categories/${category1.id}/points`, {
    order: 1,
    description: 'Точка 1',
  });
  const stage2 = await adminPost<{ id: string }>(`/admin/proby-programs/${program.id}/stages`, {
    order: 2,
    name: 'Стадія 2',
  });
  const category2 = await adminPost<{ id: string }>(`/admin/proby-stages/${stage2.id}/categories`, {
    name: 'Категорія 2',
  });
  const point2 = await adminPost<{ id: string }>(`/admin/proby-categories/${category2.id}/points`, {
    order: 1,
    description: 'Точка 2',
  });
  return { program, stage1, point1, stage2, point2 };
}

test('lets zvyazkovyi close a stage with debt, work in the next stage, then close and reopen the first', async ({ page }) => {
  const { program, stage1, point1, stage2 } = await seedTwoStageProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: `junak-stage-lock-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/${junak.id}`);

  await expect(page.getByText('🔒 Стадія 2')).toBeVisible();

  await page.getByRole('button', { name: 'Закрити пробу' }).first().click();

  await expect(page.getByText('🔒 Стадія 2')).not.toBeVisible();
  await expect(page.getByText('Категорія 2 (0/1)')).toBeVisible();

  await page.getByText('Категорія 1 (0/1)').click();
  await page.getByRole('button', { name: 'Підтвердити' }).first().click();

  await expect(page.getByRole('button', { name: '🔓 Перевідкрити пробу' })).toBeVisible();

  await page.getByRole('button', { name: '🔓 Перевідкрити пробу' }).click();

  // Stage 2 is also OPEN by now (unaffected by reopening stage 1), so two
  // "Закрити пробу" buttons exist on the page at this point — assert on
  // the first rather than a bare locator to avoid a Playwright strict-mode
  // violation from matching multiple elements.
  await expect(page.getByRole('button', { name: 'Закрити пробу' }).first()).toBeVisible();
  await expect(page.getByText('🔒 Стадія 2')).not.toBeVisible();
});
```

### Step 8: Run the new Playwright test

Run: `cd apps/web && npx playwright test proba-stage-lock`
Expected: PASS.

### Step 9: Run the full Playwright suite to confirm no regressions

Run: `cd apps/web && npx playwright test`
Expected: all tests pass — in particular `junak-proba-detail.spec.ts` (uses `seedProbyProgram()`'s single-stage program, so the new lock UI never shows a 🔒 there and the existing confirm-button assertions are unaffected) and `proby.spec.ts` (the junak's own single-stage view).

### Step 10: Commit

```bash
git add apps/web/lib/types.ts apps/web/lib/queries/proby.ts "apps/web/app/users/[id]/page.tsx" apps/web/app/proby/page.tsx apps/web/e2e/proba-stage-lock.spec.ts
git commit -m "feat: render stage lock status and close/reopen controls on both proba pages"
```
