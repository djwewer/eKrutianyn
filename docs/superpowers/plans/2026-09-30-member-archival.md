# Member Archival Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add soft-delete ("archive") capability for a junak, a vykhovnyk, and a hurtok — no data is ever physically deleted, and an archived account loses login access.

**Architecture:** Two nullable columns (`archivedAt`, `archivedById`) on `User` and on `Hurtok`, mirroring the existing `KurinPosition.removedAt`/`removedById` soft-delete precedent. A single reusable `UsersService.archiveUser()` method enforces preconditions and does the write; it is called both by a direct `PATCH /users/:id/archive` (zvyazkovyi only) and by the `ApprovalRequest` flow for a new `ARCHIVE_JUNAK` action type (kurinniy or suddya-position-holder can initiate, zvyazkovyi approves). Archived accounts are rejected at login and on every subsequent authenticated request.

**Tech Stack:** NestJS + Prisma (apps/api), Next.js + React Query (apps/web), Jest e2e (apps/api/test), Playwright e2e (apps/web/e2e).

## Global Constraints

- No physical deletes — ever. Every "archive" is `archivedAt`/`archivedById` set on the existing row.
- Precondition before archiving (block, don't cascade): junak needs no active `KurinPosition` (any scope) and `hurtokId === null`; vykhovnyk needs no active `VykhovnykHurtok` row; hurtok needs no junak with `hurtokId` = it, no active `VykhovnykHurtok` on it, and no active `KurinPosition` with `hurtokId` = it.
- Junak archive: zvyazkovyi direct, OR kurinniy/suddya-position-holder via `ApprovalRequest` (`ARCHIVE_JUNAK`) that zvyazkovyi approves.
- Vykhovnyk archive and hurtok archive: zvyazkovyi only, no approval path (matches existing asymmetry: vykhovnyk/hurtok creation have no kurinniy approval path either).
- Archived account cannot log in (`loginWithPassword`, `loginWithGoogle`) and loses access on every subsequent request (`JwtStrategy.validate()`), not just at next login.
- Default list queries (`users.service.ts` `list()`, `hurtky.service.ts` `listForKurin()`) exclude archived rows; `findById`/`findScoped` do NOT filter — an archived profile stays reachable by direct link.
- No unarchive UI, no "view archived" list — out of scope (spec's explicit YAGNI).

---

### Task 1: Schema, migration, and the cross-scope "has active position" helper

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev --name add_archival_fields` (run from `apps/api`)
- Modify: `apps/api/src/common/positions.util.ts`
- Test: `apps/api/src/common/positions.util.spec.ts` (new file)

**Interfaces:**
- Produces: `hasAnyActivePosition(prisma: PrismaService, userId: string): Promise<boolean>` — consumed by Task 2's `UsersService.archiveUser`.
- Produces: `User.archivedAt: DateTime?`, `User.archivedById: String?`, `Hurtok.archivedAt: DateTime?`, `Hurtok.archivedById: String?`, `ApprovalActionType.ARCHIVE_JUNAK` — consumed by every later task.

- [x] **Step 1: Write the failing unit test for the helper**

Create `apps/api/src/common/positions.util.spec.ts`:

```ts
import { hasAnyActivePosition } from './positions.util';

describe('hasAnyActivePosition', () => {
  it('returns true when the user holds any active position, regardless of scope', async () => {
    const prisma = { kurinPosition: { findFirst: jest.fn().mockResolvedValue({ id: 'pos-1' }) } } as any;

    const result = await hasAnyActivePosition(prisma, 'user-1');

    expect(result).toBe(true);
    expect(prisma.kurinPosition.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', removedAt: null },
    });
  });

  it('returns false when the user holds no active position', async () => {
    const prisma = { kurinPosition: { findFirst: jest.fn().mockResolvedValue(null) } } as any;

    const result = await hasAnyActivePosition(prisma, 'user-1');

    expect(result).toBe(false);
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `cd apps/api && npx jest src/common/positions.util.spec.ts`
Expected: FAIL — `hasAnyActivePosition is not a function` (or import error).

- [x] **Step 3: Add the schema fields**

In `apps/api/prisma/schema.prisma`, add to the `User` model (right after the existing `updatedAt DateTime @updatedAt` line):

```prisma
  archivedAt   DateTime?
  archivedById String?
  archivedBy   User?     @relation("UserArchivedBy", fields: [archivedById], references: [id])
  archivedUsers User[]   @relation("UserArchivedBy")
```

Add to the `Hurtok` model (right after the existing `number String?` line):

```prisma
  archivedAt   DateTime?
  archivedById String?
  archivedBy   User?     @relation("HurtokArchivedBy", fields: [archivedById], references: [id])
```

Add `ARCHIVE_JUNAK` to the `ApprovalActionType` enum (after `BULK_IMPORT_JUNAKY`):

```prisma
enum ApprovalActionType {
  CHANGE_FULL_NAME
  CHANGE_BIRTH_DATE
  CHANGE_EMAIL
  CHANGE_HURTOK
  CREATE_JUNAK
  BULK_IMPORT_JUNAKY
  ARCHIVE_JUNAK
}
```

- [x] **Step 4: Generate and run the migration against the dev database**

Run: `cd apps/api && npx prisma migrate dev --name add_archival_fields`
Expected: a new folder under `apps/api/prisma/migrations/` (e.g. `2026XXXXXXXXXX_add_archival_fields`) containing `migration.sql` with `ALTER TABLE "User" ADD COLUMN ...` and `ALTER TABLE "Hurtok" ADD COLUMN ...` and `ALTER TYPE "ApprovalActionType" ADD VALUE ...`; command exits 0. This applies the migration to `DATABASE_URL` (`plast_dev` per `apps/api/.env`).

- [x] **Step 4b: Apply the same migration to the test database**

`plast_test` (used by every `*.e2e-spec.ts` in `apps/api/test/`, via `DATABASE_URL_TEST`) is a SEPARATE database from `plast_dev` and does NOT get migrated by Step 4 — every e2e test written in Tasks 2 through 6 will fail with a "column does not exist" error until this runs.

Run: `cd apps/api && DATABASE_URL="postgresql://plast:plast@localhost:5432/plast_test" npx prisma migrate deploy`
Expected: `X migrations found... Applying migration add_archival_fields... The following migration have been applied: ... 20260930..._add_archival_fields`, exits 0. (`migrate deploy`, not `migrate dev` — it applies existing migration files as-is without prompting or generating anything new, which is what a non-primary database needs.)

- [x] **Step 5: Add the helper function**

In `apps/api/src/common/positions.util.ts`, append (below the existing `getActiveKurinPositions`):

```ts
export async function hasAnyActivePosition(prisma: PrismaService, userId: string): Promise<boolean> {
  const active = await prisma.kurinPosition.findFirst({ where: { userId, removedAt: null } });
  return !!active;
}
```

- [x] **Step 6: Run the test to confirm it passes**

Run: `cd apps/api && npx jest src/common/positions.util.spec.ts`
Expected: PASS (2/2)

- [x] **Step 7: Regenerate the Prisma client and typecheck**

Run: `cd apps/api && npx prisma generate && npx tsc --noEmit -p tsconfig.json`
Expected: both exit 0 (no type errors — nothing else references the new fields yet).

- [x] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/common/positions.util.ts apps/api/src/common/positions.util.spec.ts
git commit -m "feat: add archival columns, ARCHIVE_JUNAK action type, and hasAnyActivePosition helper"
```

---

### Task 2: Archive a User (junak or vykhovnyk) — direct zvyazkovyi endpoint

**Files:**
- Modify: `apps/api/src/users/user-select.const.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.controller.ts`
- Test: `apps/api/test/users-archive.e2e-spec.ts` (new file)

**Interfaces:**
- Consumes: `hasAnyActivePosition` from Task 1 (`../common/positions.util`).
- Produces: `UsersService.archiveUser(userId: string, actor: CurrentUserPayload): Promise<UserDetail-shaped object>` — consumed by Task 6's approval flow.
- Produces: `PATCH /users/:id/archive` (ZVYAZKOVYI only) — consumed by Task 7/8's frontend hook.

- [x] **Step 1: Write the failing e2e tests**

Create `apps/api/test/users-archive.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, PositionScope, PositionType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('User archival (e2e)', () => {
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

  it('lets zvyazkovyi archive a junak with no hurtok and no positions', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .patch(`/users/${junak.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(junak.id);
    const updated = await prisma.user.findUnique({ where: { id: junak.id } });
    expect(updated?.archivedAt).not.toBeNull();
    expect(updated?.archivedById).toBe(zvyazkovyi.id);
  });

  it('blocks archiving a junak who still has a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/users/${junak.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const unchanged = await prisma.user.findUnique({ where: { id: junak.id } });
    expect(unchanged?.archivedAt).toBeNull();
  });

  it('blocks archiving a junak who still holds an active position', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.PYSAR,
        userId: junak.id,
        assignedById: zvyazkovyi.id,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/users/${junak.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('lets zvyazkovyi archive a vykhovnyk with no active hurtok assignment', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/users/${vykhovnyk.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('blocks archiving a vykhovnyk who still has an active hurtok assignment', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/users/${vykhovnyk.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('forbids a non-zvyazkovyi from archiving directly', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .patch(`/users/${junak.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 404 for a user in another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const junakB = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinB.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .patch(`/users/${junakB.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('rejects archiving an already-archived user', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.user.update({ where: { id: junak.id }, data: { archivedAt: new Date(), archivedById: zvyazkovyi.id } });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/users/${junak.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
```

- [x] **Step 2: Run to confirm the tests fail**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- users-archive.e2e-spec.ts`
Expected: FAIL — `404 Not Found` (route doesn't exist yet) on every test.

- [x] **Step 3: Add `archivedAt` to `USER_SELECT`**

In `apps/api/src/users/user-select.const.ts`, replace the whole file:

```ts
export const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  email: true,
  role: true,
  birthDate: true,
  kurinId: true,
  hurtokId: true,
  archivedAt: true,
} as const;
```

- [x] **Step 4: Add `archiveUser` to `UsersService`**

In `apps/api/src/users/users.service.ts`, add this import line alongside the existing ones at the top:

```ts
import { hasAnyActivePosition } from '../common/positions.util';
```

Then add this method to the class (anywhere among the other public methods, e.g. right after `updateHurtok`):

```ts
  async archiveUser(userId: string, actor: CurrentUserPayload) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.kurinId !== actor.kurinId) {
      throw new NotFoundException('User not found');
    }
    if (target.archivedAt) {
      throw new BadRequestException('Уже архівовано');
    }
    if (target.role === Role.VYKHOVNYK) {
      const activeAssignment = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: userId },
      });
      if (activeAssignment) {
        throw new BadRequestException('Спершу зніміть виховника з гуртка(ів)');
      }
    } else if (target.role === Role.JUNAK) {
      const hasPosition = await hasAnyActivePosition(this.prisma, userId);
      if (hasPosition || target.hurtokId !== null) {
        throw new BadRequestException('Спершу зніміть юнака з гуртка та всіх посад');
      }
    } else {
      throw new BadRequestException('Цю роль не можна архівувати');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { archivedAt: new Date(), archivedById: actor.userId },
      select: USER_SELECT,
    });
  }
```

- [x] **Step 5: Add the controller route**

In `apps/api/src/users/users.controller.ts`, add this method to the class (after `updateHurtok`):

```ts
  @Roles(Role.ZVYAZKOVYI)
  @Patch(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.archiveUser(id, user);
  }
```

- [x] **Step 6: Run the tests to confirm they pass**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- users-archive.e2e-spec.ts`
Expected: PASS (9/9)

- [x] **Step 7: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [x] **Step 8: Commit**

```bash
git add apps/api/src/users/user-select.const.ts apps/api/src/users/users.service.ts apps/api/src/users/users.controller.ts apps/api/test/users-archive.e2e-spec.ts
git commit -m "feat: add PATCH /users/:id/archive with precondition checks"
```

---

### Task 3: Archive a Hurtok

**Files:**
- Modify: `apps/api/src/hurtky/hurtky.service.ts`
- Modify: `apps/api/src/hurtky/hurtky.controller.ts`
- Test: `apps/api/test/hurtky-archive.e2e-spec.ts` (new file)

**Interfaces:**
- Produces: `HurtkyService.archiveHurtok(hurtokId: string, actor: CurrentUserPayload): Promise<Hurtok>` and `PATCH /hurtky/:id/archive` (ZVYAZKOVYI only) — consumed by Task 9's frontend hook.

- [x] **Step 1: Write the failing e2e tests**

Create `apps/api/test/hurtky-archive.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, PositionScope, PositionType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Hurtok archival (e2e)', () => {
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

  it('lets zvyazkovyi archive an empty hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(hurtok.id);
    const updated = await prisma.hurtok.findUnique({ where: { id: hurtok.id } });
    expect(updated?.archivedAt).not.toBeNull();
  });

  it('blocks archiving a hurtok that still has a junak', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('blocks archiving a hurtok that still has an active vykhovnyk assignment', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('blocks archiving a hurtok that still has an active position tied to it', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        hurtokId: hurtok.id,
        scope: PositionScope.HURTOK,
        positionType: PositionType.HURTKOVYI,
        userId: junak.id,
        assignedById: zvyazkovyi.id,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('forbids a non-zvyazkovyi from archiving a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 404 for a hurtok in another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'Hurtok B', kurinId: kurinB.id } });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtokB.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
```

- [x] **Step 2: Run to confirm the tests fail**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- hurtky-archive.e2e-spec.ts`
Expected: FAIL — `404 Not Found` on every test (route doesn't exist).

- [x] **Step 3: Add `archiveHurtok` to `HurtkyService`**

In `apps/api/src/hurtky/hurtky.service.ts`, change the import line to add `BadRequestException`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
```

Then add this method to the class (after `create`):

```ts
  async archiveHurtok(hurtokId: string, actor: CurrentUserPayload) {
    const hurtok = await this.prisma.hurtok.findUnique({ where: { id: hurtokId } });
    if (!hurtok || hurtok.kurinId !== actor.kurinId) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }
    if (hurtok.archivedAt) {
      throw new BadRequestException('Уже архівовано');
    }
    const activeJunak = await this.prisma.user.findFirst({ where: { hurtokId } });
    if (activeJunak) {
      throw new BadRequestException('У гуртку ще є юнаки');
    }
    const activeVykhovnyk = await this.prisma.vykhovnykHurtok.findFirst({ where: { hurtokId } });
    if (activeVykhovnyk) {
      throw new BadRequestException('До гуртка ще прикріплені виховники');
    }
    const activePosition = await this.prisma.kurinPosition.findFirst({ where: { hurtokId, removedAt: null } });
    if (activePosition) {
      throw new BadRequestException('У гуртку є активна посада');
    }
    return this.prisma.hurtok.update({
      where: { id: hurtokId },
      data: { archivedAt: new Date(), archivedById: actor.userId },
    });
  }
```

- [x] **Step 4: Add the controller route**

In `apps/api/src/hurtky/hurtky.controller.ts`, add `Patch` to the import from `@nestjs/common`:

```ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
```

Then add this method to the class (after `create`):

```ts
  @Roles(Role.ZVYAZKOVYI)
  @Patch(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.archiveHurtok(id, user);
  }
```

- [x] **Step 5: Run the tests to confirm they pass**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- hurtky-archive.e2e-spec.ts`
Expected: PASS (6/6)

- [x] **Step 6: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [x] **Step 7: Commit**

```bash
git add apps/api/src/hurtky/hurtky.service.ts apps/api/src/hurtky/hurtky.controller.ts apps/api/test/hurtky-archive.e2e-spec.ts
git commit -m "feat: add PATCH /hurtky/:id/archive with precondition checks"
```

---

### Task 4: Block login and API access for archived accounts

**Files:**
- Modify: `apps/api/src/auth/strategies/jwt.strategy.ts`
- Modify: `apps/api/src/auth/strategies/jwt.strategy.spec.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/test/users-archive-login.e2e-spec.ts` (new file)

**Interfaces:**
- Consumes: `User.archivedAt` from Task 1.
- No new exports — this task changes existing behavior only.

- [x] **Step 1: Update the existing JwtStrategy unit test and add the archived-rejection case**

In `apps/api/src/auth/strategies/jwt.strategy.spec.ts`, replace the whole file:

```ts
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: any;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      kurinPosition: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    };
    strategy = new JwtStrategy(prisma);
  });

  it('rejects a payload with no sub (e.g. a replayed Google-Drive state token)', async () => {
    await expect(strategy.validate({ kurinId: 'kurin-1' } as any)).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a normal payload with sub and returns the expected shape', async () => {
    const result = await strategy.validate({
      sub: 'user-1',
      role: 'ZVYAZKOVYI',
      kurinId: 'kurin-1',
    } as any);

    expect(result).toEqual({
      userId: 'user-1',
      role: 'ZVYAZKOVYI',
      kurinId: 'kurin-1',
      isKurinniy: false,
      positions: [],
    });
  });

  it('rejects a token for a user that no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'user-1', role: 'ZVYAZKOVYI', kurinId: 'kurin-1' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token for an archived user, even before the JWT expires', async () => {
    prisma.user.findUnique.mockResolvedValue({ archivedAt: new Date('2026-01-01') });

    await expect(
      strategy.validate({ sub: 'user-1', role: 'ZVYAZKOVYI', kurinId: 'kurin-1' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });
});
```

- [x] **Step 2: Run it to confirm the new tests fail**

Run: `cd apps/api && npx jest src/auth/strategies/jwt.strategy.spec.ts`
Expected: FAIL on the two new tests — `validate()` never calls `prisma.user.findUnique` yet, so an archived/missing user is never detected.

- [x] **Step 3: Update `JwtStrategy.validate()`**

In `apps/api/src/auth/strategies/jwt.strategy.ts`, replace the `validate` method:

```ts
  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.archivedAt) {
      throw new UnauthorizedException('Account not found or archived');
    }
    const isKurinniy = await isKurinniyForUser(this.prisma, payload.sub);
    const positions = await getActiveKurinPositions(this.prisma, payload.sub, payload.kurinId);
    return { userId: payload.sub, role: payload.role, kurinId: payload.kurinId, isKurinniy, positions };
  }
```

- [x] **Step 4: Run the unit tests to confirm they pass**

Run: `cd apps/api && npx jest src/auth/strategies/jwt.strategy.spec.ts`
Expected: PASS (4/4)

- [x] **Step 5: Write the failing e2e test for login**

Create `apps/api/test/users-archive-login.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser } from './utils/fixtures';

describe('Login blocked for archived accounts (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  it('rejects password login for an archived account', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, {
      role: Role.ZVYAZKOVYI,
      kurinId: kurin.id,
      email: 'archived@example.com',
      password: 'secret123',
    });
    await prisma.user.update({ where: { id: user.id }, data: { archivedAt: new Date(), archivedById: user.id } });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'archived@example.com', password: 'secret123' })
      .expect(401);
  });
});
```

- [x] **Step 6: Run to confirm it fails**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- users-archive-login.e2e-spec.ts`
Expected: FAIL — currently returns 201 with a valid token.

- [x] **Step 7: Block login for archived accounts in `AuthService`**

In `apps/api/src/auth/auth.service.ts`, in `loginWithPassword`, right after the existing `if (!user || !user.passwordHash) { throw new UnauthorizedException('Invalid credentials'); }` block, add:

```ts
    if (user.archivedAt) {
      throw new UnauthorizedException('Account archived');
    }
```

In `loginWithGoogle`, right after the existing `if (!user) { throw new UnauthorizedException('No account found for this email'); }` block, add the same check:

```ts
    if (user.archivedAt) {
      throw new UnauthorizedException('Account archived');
    }
```

- [x] **Step 8: Run the e2e test to confirm it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- users-archive-login.e2e-spec.ts`
Expected: PASS (1/1)

- [x] **Step 9: Run the full existing e2e suite for regressions**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: all pass — no other spec relies on `JwtStrategy` skipping the DB lookup.

- [x] **Step 10: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [x] **Step 11: Commit**

```bash
git add apps/api/src/auth/strategies/jwt.strategy.ts apps/api/src/auth/strategies/jwt.strategy.spec.ts apps/api/src/auth/auth.service.ts apps/api/test/users-archive-login.e2e-spec.ts
git commit -m "fix: reject login and revoke access for archived accounts"
```

---

### Task 5: Exclude archived rows from default lists

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/hurtky/hurtky.service.ts`
- Test: `apps/api/test/users-archive-lists.e2e-spec.ts` (new file)

**Interfaces:**
- No new exports — filters existing `list()` and `listForKurin()` query results.

- [x] **Step 1: Write the failing e2e tests**

Create `apps/api/test/users-archive-lists.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Archived rows excluded from lists (e2e)', () => {
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

  it('GET /users excludes an archived junak but GET /users/:id still finds them', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.user.update({ where: { id: junak.id }, data: { archivedAt: new Date(), archivedById: zvyazkovyi.id } });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const list = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.find((u: { id: string }) => u.id === junak.id)).toBeUndefined();

    const detail = await request(app.getHttpServer())
      .get(`/users/${junak.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.id).toBe(junak.id);
  });

  it('GET /hurtky excludes an archived hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    await prisma.hurtok.update({ where: { id: hurtok.id }, data: { archivedAt: new Date(), archivedById: zvyazkovyi.id } });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const list = await request(app.getHttpServer())
      .get('/hurtky')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.find((h: { id: string }) => h.id === hurtok.id)).toBeUndefined();
  });
});
```

- [x] **Step 2: Run to confirm the tests fail**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- users-archive-lists.e2e-spec.ts`
Expected: FAIL — the archived rows currently show up in both lists.

- [x] **Step 3: Filter `users.service.ts`'s `list()`**

In `apps/api/src/users/users.service.ts`, in the `list()` method, add `archivedAt: null` to the `where` clause of EACH of the four `findMany` calls (the VYKHOVNYK-with-hurtokId-filter branch, the VYKHOVNYK-default branch, the `actor.isKurinniy` branch, and the final ZVYAZKOVYI-sees-everyone branch). For example, the final branch becomes:

```ts
    // ZVYAZKOVYI — sees every role in their kurin
    return this.prisma.user.findMany({
      where: {
        kurinId: actor.kurinId,
        archivedAt: null,
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.hurtokId ? { hurtokId: filters.hurtokId } : {}),
      },
      select: USER_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
```

Apply the same `archivedAt: null,` addition to the `where` object of the other three `findMany` calls in this method (the two VYKHOVNYK branches and the `actor.isKurinniy` branch).

- [x] **Step 4: Filter `hurtky.service.ts`'s `listForKurin()`**

In `apps/api/src/hurtky/hurtky.service.ts`, replace:

```ts
  listForKurin(kurinId: string) {
    return this.prisma.hurtok.findMany({ where: { kurinId } });
  }
```

with:

```ts
  listForKurin(kurinId: string) {
    return this.prisma.hurtok.findMany({ where: { kurinId, archivedAt: null } });
  }
```

- [x] **Step 5: Run the tests to confirm they pass**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- users-archive-lists.e2e-spec.ts`
Expected: PASS (2/2)

- [x] **Step 6: Run the full existing e2e suite for regressions**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: all pass

- [x] **Step 7: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [x] **Step 8: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/hurtky/hurtky.service.ts apps/api/test/users-archive-lists.e2e-spec.ts
git commit -m "fix: exclude archived users and hurtky from default lists"
```

---

### Task 6: `ARCHIVE_JUNAK` approval-request flow

**Files:**
- Modify: `apps/api/src/users/users.module.ts`
- Modify: `apps/api/src/approval-requests/approval-requests.module.ts`
- Modify: `apps/api/src/approval-requests/approval-requests.service.ts`
- Test: `apps/api/test/approval-requests-archive-junak.e2e-spec.ts` (new file)

**Interfaces:**
- Consumes: `UsersService.archiveUser(userId, actor)` from Task 2.
- No new exports — extends the existing `create()`/`approve()` dispatch.

- [x] **Step 1: Write the failing e2e tests**

Create `apps/api/test/approval-requests-archive-junak.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, PositionScope, PositionType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

describe('ARCHIVE_JUNAK approval flow (e2e)', () => {
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

  it('lets kurinniy create an ARCHIVE_JUNAK request and zvyazkovyi approve it', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const kurinniyToken = issueTokenFor(jwtService, kurinniy);
    const zvyazkovyiToken = issueTokenFor(jwtService, zvyazkovyi);

    const createResponse = await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${kurinniyToken}`)
      .send({ actionType: 'ARCHIVE_JUNAK', junakId: junak.id, newData: {} })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/approval-requests/${createResponse.body.id}/approve`)
      .set('Authorization', `Bearer ${zvyazkovyiToken}`)
      .expect(201);

    const updated = await prisma.user.findUnique({ where: { id: junak.id } });
    expect(updated?.archivedAt).not.toBeNull();
    expect(updated?.archivedById).toBe(zvyazkovyi.id);
  });

  it('lets a suddya-position-holder (not kurinniy) create an ARCHIVE_JUNAK request', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const suddya = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const anyZvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.SUDDIA,
        userId: suddya.id,
        assignedById: anyZvyazkovyi.id,
      },
    });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const suddyaToken = issueTokenFor(jwtService, suddya);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${suddyaToken}`)
      .send({ actionType: 'ARCHIVE_JUNAK', junakId: junak.id, newData: {} })
      .expect(201);
  });

  it('forbids a plain junak (no kurinniy, no suddya) from creating an ARCHIVE_JUNAK request', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const plainJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const targetJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, plainJunak);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: 'ARCHIVE_JUNAK', junakId: targetJunak.id, newData: {} })
      .expect(403);
  });

  it('leaves the request PENDING if the junak gained a position after the request was created', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const kurinniyToken = issueTokenFor(jwtService, kurinniy);
    const zvyazkovyiToken = issueTokenFor(jwtService, zvyazkovyi);

    const createResponse = await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${kurinniyToken}`)
      .send({ actionType: 'ARCHIVE_JUNAK', junakId: junak.id, newData: {} })
      .expect(201);

    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.PYSAR,
        userId: junak.id,
        assignedById: zvyazkovyi.id,
      },
    });

    await request(app.getHttpServer())
      .post(`/approval-requests/${createResponse.body.id}/approve`)
      .set('Authorization', `Bearer ${zvyazkovyiToken}`)
      .expect(400);

    const stillPending = await prisma.approvalRequest.findUnique({ where: { id: createResponse.body.id } });
    expect(stillPending?.status).toBe('PENDING');
    const unchangedJunak = await prisma.user.findUnique({ where: { id: junak.id } });
    expect(unchangedJunak?.archivedAt).toBeNull();
  });
});
```

- [x] **Step 2: Run to confirm the tests fail**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- approval-requests-archive-junak.e2e-spec.ts`
Expected: FAIL — `create()` rejects `ARCHIVE_JUNAK` as an unknown case in `extractRelevantFields`, and `approve()` has no branch for it.

- [x] **Step 3: Export `UsersService` and wire the module import**

In `apps/api/src/users/users.module.ts`, add `exports: [UsersService]`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

In `apps/api/src/approval-requests/approval-requests.module.ts`, import `UsersModule`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JunakImportModule } from '../junak-import/junak-import.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { UsersModule } from '../users/users.module';
import { ApprovalRequestsController } from './approval-requests.controller';
import { ApprovalRequestsService } from './approval-requests.service';

@Module({
  imports: [AuthModule, JunakImportModule, GoogleDriveModule, UsersModule],
  controllers: [ApprovalRequestsController],
  providers: [ApprovalRequestsService],
})
export class ApprovalRequestsModule {}
```

- [x] **Step 4: Extend `approval-requests.service.ts`**

In `apps/api/src/approval-requests/approval-requests.service.ts`:

Add the import and constructor injection:

```ts
import { UsersService } from '../users/users.service';
```

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly rowProcessor: JunakImportRowProcessorService,
    private readonly googleDrive: GoogleDriveService,
    private readonly usersService: UsersService,
  ) {}
```

In `create()`, replace the gate:

```ts
    const canInitiateBulkImport =
      dto.actionType === ApprovalActionType.BULK_IMPORT_JUNAKY && actor.positions.includes(PositionType.SUDDIA);
    if (!actor.isKurinniy && !canInitiateBulkImport) {
      throw new ForbiddenException('Only kurinniy can create approval requests');
    }
```

with:

```ts
    const canInitiateBulkImport =
      dto.actionType === ApprovalActionType.BULK_IMPORT_JUNAKY && actor.positions.includes(PositionType.SUDDIA);
    const canInitiateArchive =
      dto.actionType === ApprovalActionType.ARCHIVE_JUNAK && actor.positions.includes(PositionType.SUDDIA);
    if (!actor.isKurinniy && !canInitiateBulkImport && !canInitiateArchive) {
      throw new ForbiddenException('Only kurinniy can create approval requests');
    }
```

In `approve()`, add a new branch right after the existing `BULK_IMPORT_JUNAKY` early-return:

```ts
    if (req.actionType === ApprovalActionType.BULK_IMPORT_JUNAKY) {
      return this.approveBulkImport(req, actor);
    }
    if (req.actionType === ApprovalActionType.ARCHIVE_JUNAK) {
      await this.usersService.archiveUser(req.junakId!, actor);
      return this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: ApprovalStatus.APPROVED, approvedById: actor.userId, decidedAt: new Date() },
      });
    }
```

In `extractRelevantFields()`, add a case (before the `default` line):

```ts
      case ApprovalActionType.ARCHIVE_JUNAK:
        return {};
```

- [x] **Step 5: Run the tests to confirm they pass**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- approval-requests-archive-junak.e2e-spec.ts`
Expected: PASS (4/4)

- [x] **Step 6: Run the full existing e2e suite for regressions**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: all pass

- [x] **Step 7: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [x] **Step 8: Commit**

```bash
git add apps/api/src/users/users.module.ts apps/api/src/approval-requests/approval-requests.module.ts apps/api/src/approval-requests/approval-requests.service.ts apps/api/test/approval-requests-archive-junak.e2e-spec.ts
git commit -m "feat: add ARCHIVE_JUNAK approval-request flow"
```

---

### Task 7: Frontend types and query hooks

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/queries/users.ts`
- Modify: `apps/web/lib/queries/hurtky.ts`

**Interfaces:**
- Consumes: backend `PATCH /users/:id/archive` (Task 2), `PATCH /hurtky/:id/archive` (Task 3), `USER_SELECT`'s new `archivedAt` field (Task 2).
- Produces: `UserDetail.archivedAt: string | null`, `useArchiveUser(id: string)`, `useArchiveHurtok()` — consumed by Task 8 and Task 9.

- [x] **Step 1: Add `archivedAt` to the frontend types**

In `apps/web/lib/types.ts`, update `UserSummary` (the backend's `USER_SELECT` — used by both `GET /users` and `GET /users/:id` — now includes `archivedAt`, so it belongs on the shared base type, not just `UserDetail`):

```ts
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
  archivedAt: string | null;
}
```

Add `'ARCHIVE_JUNAK'` to the `ApprovalActionType` union:

```ts
export type ApprovalActionType =
  | 'CHANGE_FULL_NAME'
  | 'CHANGE_BIRTH_DATE'
  | 'CHANGE_EMAIL'
  | 'CHANGE_HURTOK'
  | 'CREATE_JUNAK'
  | 'BULK_IMPORT_JUNAKY'
  | 'ARCHIVE_JUNAK';
```

- [x] **Step 2: Add `useArchiveUser` to `apps/web/lib/queries/users.ts`**

Append to the file:

```ts
export function useArchiveUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<UserDetail>(`/users/${id}/archive`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', id] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
```

- [x] **Step 3: Add `useArchiveHurtok` to `apps/web/lib/queries/hurtky.ts`**

Replace the whole file:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { Hurtok, HurtokMembers } from '@/lib/types';

export function useHurtky() {
  return useQuery({
    queryKey: ['hurtky'],
    queryFn: () => apiFetch<Hurtok[]>('/hurtky'),
  });
}

export function useHurtokBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ['hurtky', 'by-slug', slug],
    queryFn: () => apiFetch<HurtokMembers>(`/hurtky/by-slug/${slug}`),
    enabled: !!slug,
  });
}

export function useArchiveHurtok(id: string, slug: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<Hurtok>(`/hurtky/${id}/archive`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hurtky'] });
      queryClient.invalidateQueries({ queryKey: ['hurtky', 'by-slug', slug] });
    },
  });
}
```

- [x] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [x] **Step 5: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/queries/users.ts apps/web/lib/queries/hurtky.ts
git commit -m "feat: add frontend types and query hooks for archival"
```

---

### Task 8: Frontend — archive a junak/vykhovnyk from `/users/[id]`

**Files:**
- Modify: `apps/web/app/users/[id]/page.tsx`
- Modify: `apps/web/app/approval-requests/[id]/page.tsx`
- Modify: `apps/web/app/approval-requests/page.tsx`
- Test: `apps/web/e2e/user-archive.spec.ts` (new file)

**Interfaces:**
- Consumes: `useArchiveUser` and `useCreateApprovalRequest` (already used elsewhere on this page) from Task 7.

- [x] **Step 1: Write the failing e2e tests**

Create `apps/web/e2e/user-archive.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('zvyazkovyi archives a junak with no hurtok and no positions', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  await fetch(`${API_URL}/users/${junak.id}/hurtok`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ hurtokId: null }),
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/${junak.id}`);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Архівувати' }).click();

  await expect(page.getByText(/Архівовано/)).toBeVisible();
});

test('archive button is hidden while the junak still has a hurtok', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Соколи');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak2-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/${junak.id}`);

  await expect(page.getByRole('button', { name: 'Архівувати' })).not.toBeVisible();
  await expect(page.getByText('Спершу зніміть юнака з гуртка та посад')).toBeVisible();
});

test('kurinniy sends an archive request for a junak instead of archiving directly', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtokForJunak3 = await createHurtok(zvyazkovyiToken, 'Ведмеді');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak3-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtokForJunak3.id,
  });
  await fetch(`${API_URL}/users/${junak.id}/hurtok`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ hurtokId: null }),
  });
  const kurinniyEmail = `kurinniy-${Date.now()}@example.com`;
  const kurinniy = await createUserAs(zvyazkovyiToken, {
    firstName: 'Курінний',
    lastName: `Тест${Date.now()}`,
    email: kurinniyEmail,
    role: 'JUNAK',
    password: 'password123',
  });
  await fetch(`${API_URL}/kurin-positions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ userId: kurinniy.id, scope: 'KURIN', positionType: 'KURINNYI' }),
  });

  await loginAs(page, kurinniyEmail, 'password123');
  await page.goto(`/users/${junak.id}`);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Архівувати' }).click();

  await expect(page.getByText(/Запит на архівацію надіслано/)).toBeVisible();
});
```

- [x] **Step 2: Run to confirm the tests fail**

Run: `cd apps/web && npx playwright test e2e/user-archive.spec.ts --workers=1`
Expected: FAIL — there is no "Архівувати" button on the page yet.

- [x] **Step 3: Add the archive UI to `/users/[id]/page.tsx`**

In `apps/web/app/users/[id]/page.tsx`, change the import line:

```ts
import { useUser, useUpdateContactInfo, useUpdateHurtok, useArchiveUser } from '@/lib/queries/users';
```

Add this import alongside the other type imports:

```ts
import type { GuardianContact, ProbyCategory, UserDetail, CurrentUserPayload } from '@/lib/types';
```

(This replaces the existing `import type { GuardianContact, ProbyCategory } from '@/lib/types';` line — it now also imports `UserDetail` and `CurrentUserPayload`.)

Add this new component, placed right after the `ProbyCategorySection` function and before `export default function UserDetailPage`:

```tsx
function ArchiveUserCard({
  user,
  session,
}: {
  user: UserDetail;
  session: CurrentUserPayload | undefined;
}) {
  const archiveUser = useArchiveUser(user.id);
  const createRequest = useCreateApprovalRequest();
  const [requestSent, setRequestSent] = useState(false);

  if (user.archivedAt) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Архівовано {new Date(user.archivedAt).toLocaleDateString('uk-UA')}
        </CardContent>
      </Card>
    );
  }

  const isZvyazkovyi = session?.role === 'ZVYAZKOVYI';
  const canRequestArchive =
    user.role === 'JUNAK' && (session?.isKurinniy || (session?.positions ?? []).includes('SUDDIA'));
  if (!isZvyazkovyi && !canRequestArchive) {
    return null;
  }

  if (user.role === 'JUNAK' && user.hurtokId !== null) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Спершу зніміть юнака з гуртка та посад
        </CardContent>
      </Card>
    );
  }

  if (requestSent) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Запит на архівацію надіслано, очікує затвердження зв&apos;язковим.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <Button
          variant="outline"
          disabled={archiveUser.isPending || createRequest.isPending}
          onClick={() => {
            if (!window.confirm(`Архівувати ${user.firstName} ${user.lastName}? Втратить доступ до входу.`)) {
              return;
            }
            if (isZvyazkovyi) {
              archiveUser.mutate();
            } else {
              createRequest.mutate(
                { actionType: 'ARCHIVE_JUNAK', junakId: user.id, newData: {} },
                { onSuccess: () => setRequestSent(true) },
              );
            }
          }}
        >
          Архівувати
        </Button>
        {archiveUser.isError && (
          <p className="text-sm text-destructive">
            {accessErrorMessage(archiveUser.error) ?? 'Не вдалося архівувати.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

In the `UserDetailPage` component's returned JSX, add `<ArchiveUserCard user={user} session={session} />` as the very last element inside the outer `<div className="max-w-md space-y-4">`, right after the closing `)}` of the "Змінити ПІБ" card block and before the final `</div>`:

```tsx
      {session?.isKurinniy && user.role === 'JUNAK' && (
        <Card>
          {/* ...existing "Змінити ПІБ" card content, unchanged... */}
        </Card>
      )}
      <ArchiveUserCard user={user} session={session} />
    </div>
  );
}
```

- [x] **Step 4: Update `ACTION_LABELS` in both approval-requests pages**

In `apps/web/app/approval-requests/[id]/page.tsx`, replace:

```ts
const ACTION_LABELS: Record<string, string> = {
  CHANGE_FULL_NAME: 'Зміна ПІБ',
  CHANGE_BIRTH_DATE: 'Зміна дати народження',
  CHANGE_EMAIL: 'Зміна email',
  CHANGE_HURTOK: 'Переведення в інший гурток',
  CREATE_JUNAK: 'Створення юнака',
  BULK_IMPORT_JUNAKY: 'Масовий імпорт юнаків з Книги судді',
};
```

with:

```ts
const ACTION_LABELS: Record<string, string> = {
  CHANGE_FULL_NAME: 'Зміна ПІБ',
  CHANGE_BIRTH_DATE: 'Зміна дати народження',
  CHANGE_EMAIL: 'Зміна email',
  CHANGE_HURTOK: 'Переведення в інший гурток',
  CREATE_JUNAK: 'Створення юнака',
  BULK_IMPORT_JUNAKY: 'Масовий імпорт юнаків з Книги судді',
  ARCHIVE_JUNAK: 'Архівація юнака',
};
```

Apply the exact same change (add the `ARCHIVE_JUNAK: 'Архівація юнака',` line) to the identical `ACTION_LABELS` constant in `apps/web/app/approval-requests/page.tsx`.

- [x] **Step 5: Run the tests to confirm they pass**

Run: `cd apps/web && npx playwright test e2e/user-archive.spec.ts --workers=1`
Expected: PASS (3/3)

- [x] **Step 6: Run the full existing e2e suite for regressions**

Run: `cd apps/web && npx playwright test --workers=1`
Expected: all pass

- [x] **Step 7: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [x] **Step 8: Commit**

```bash
git add apps/web/app/users/[id]/page.tsx apps/web/app/approval-requests/[id]/page.tsx apps/web/app/approval-requests/page.tsx apps/web/e2e/user-archive.spec.ts
git commit -m "feat: add archive UI to the user detail page"
```

---

### Task 9: Frontend — archive a hurtok from its detail page

**Files:**
- Modify: `apps/api/src/hurtky/hurtky.service.ts`
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/app/[kurinNumber]/hurtky/[slug]/page.tsx`
- Test: `apps/web/e2e/hurtok-archive.spec.ts` (new file)

**Interfaces:**
- Consumes: `useArchiveHurtok(id, slug)` from Task 7, `PATCH /hurtky/:id/archive` from Task 3.
- Modifies: `HurtkyService.getMembersBySlug()`'s returned `hurtok` object now includes `archivedAt`, so the frontend can show a banner after archiving without a page reload.

- [x] **Step 1: Add `archivedAt` to `getMembersBySlug`'s response**

In `apps/api/src/hurtky/hurtky.service.ts`, in `getMembersBySlug`, replace:

```ts
    return {
      hurtok: { id: hurtok.id, name: hurtok.name, slug: hurtok.slug, number: hurtok.number },
```

with:

```ts
    return {
      hurtok: { id: hurtok.id, name: hurtok.name, slug: hurtok.slug, number: hurtok.number, archivedAt: hurtok.archivedAt },
```

- [x] **Step 2: Update the `HurtokMembers` frontend type**

In `apps/web/lib/types.ts`, replace:

```ts
export interface HurtokMembers {
  hurtok: { id: string; name: string; slug: string | null; number: string | null };
  members: HurtokMember[];
}
```

with:

```ts
export interface HurtokMembers {
  hurtok: { id: string; name: string; slug: string | null; number: string | null; archivedAt: string | null };
  members: HurtokMember[];
}
```

- [x] **Step 3: Write the failing e2e tests**

Create `apps/web/e2e/hurtok-archive.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('zvyazkovyi archives an empty hurtok', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Пусті Орли');

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Архівувати гурток' }).click();

  await expect(page.getByText(/Архівовано/)).toBeVisible();
});

test('archive button is hidden while the hurtok still has a junak', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Непорожні Орли');
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  await expect(page.getByRole('button', { name: 'Архівувати гурток' })).not.toBeVisible();
});

test('a vykhovnyk does not see the archive button', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Тестові Орли');
  const vykhovnykEmail = `vykhovnyk-${Date.now()}@example.com`;
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Виховник',
    lastName: `Тест${Date.now()}`,
    email: vykhovnykEmail,
    role: 'VYKHOVNYK',
    password: 'password123',
  });
  await fetch(`${API_URL}/vykhovnyk-assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id }),
  });

  await loginAs(page, vykhovnykEmail, 'password123');
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  await expect(page.getByRole('button', { name: 'Архівувати гурток' })).not.toBeVisible();
});
```

- [x] **Step 4: Run to confirm the tests fail**

Run: `cd apps/web && npx playwright test e2e/hurtok-archive.spec.ts --workers=1`
Expected: FAIL — there is no "Архівувати гурток" button yet, and `getMembersBySlug` doesn't return `archivedAt` yet.

- [x] **Step 5: Add the archive UI to the hurtok detail page**

Replace the entire contents of `apps/web/app/[kurinNumber]/hurtky/[slug]/page.tsx`:

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useHurtokBySlug, useArchiveHurtok } from '@/lib/queries/hurtky';
import { useSession } from '@/lib/session-client';
import { ROLE_LABELS, POSITION_LABELS } from '@/lib/role-labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';

export default function HurtokMembersPage({ params }: { params: Promise<{ kurinNumber: string; slug: string }> }) {
  const { slug } = use(params);
  const { data, isLoading, isError, error } = useHurtokBySlug(slug);
  const { data: session } = useSession();
  const archiveHurtok = useArchiveHurtok(data?.hurtok.id ?? '', slug);

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Гурток не знайдено.'}</p>;
  if (!data) return <p>Гурток не знайдено.</p>;

  const canArchive = session?.role === 'ZVYAZKOVYI' && !data.hurtok.archivedAt && data.members.length === 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        {data.hurtok.name}
        {data.hurtok.number ? ` №${data.hurtok.number}` : ''}
      </h1>
      {data.hurtok.archivedAt && (
        <p className="text-sm text-muted-foreground">
          Архівовано {new Date(data.hurtok.archivedAt).toLocaleDateString('uk-UA')}
        </p>
      )}
      {canArchive && (
        <div>
          <Button
            variant="outline"
            disabled={archiveHurtok.isPending}
            onClick={() => {
              if (window.confirm(`Архівувати гурток «${data.hurtok.name}»?`)) {
                archiveHurtok.mutate();
              }
            }}
          >
            Архівувати гурток
          </Button>
          {archiveHurtok.isError && (
            <p className="text-sm text-destructive">
              {accessErrorMessage(archiveHurtok.error) ?? 'Не вдалося архівувати гурток.'}
            </p>
          )}
        </div>
      )}
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

- [x] **Step 6: Run the tests to confirm they pass**

Run: `cd apps/web && npx playwright test e2e/hurtok-archive.spec.ts --workers=1`
Expected: PASS (3/3)

- [x] **Step 7: Run the full existing e2e suite for regressions**

Run: `cd apps/web && npx playwright test --workers=1`
Expected: all pass

- [x] **Step 8: Typecheck both apps**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && cd ../web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [x] **Step 9: Commit**

```bash
git add apps/api/src/hurtky/hurtky.service.ts apps/web/lib/types.ts apps/web/app/\[kurinNumber\]/hurtky/\[slug\]/page.tsx apps/web/e2e/hurtok-archive.spec.ts
git commit -m "feat: add archive UI to the hurtok detail page"
```
