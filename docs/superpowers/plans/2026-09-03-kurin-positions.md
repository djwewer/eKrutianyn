# Діловоди Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Role.KURINNYI` (a separate account) with an assignable position layered on top of a regular юнак account, and generalize the mechanism to cover the full set of kurin/hurtok-level positions the zvyazkovyi wants to track.

**Architecture:** A new `KurinPosition` table records who holds which position, at which scope (kurin-wide or per-hurtok), with a full history. A cheap per-request DB lookup (`isKurinniy`) replaces every `role === KURINNYI` check across the backend. The `Role` enum shrinks to three values once nothing references the fourth. Only the `KURINNYI` position type carries real permission consequences (identical to today's); every other position type is a registry entry with no new access-control logic.

**Tech Stack:** NestJS + Prisma + PostgreSQL (backend, unchanged), Next.js App Router + TanStack Query (frontend, unchanged).

## Global Constraints

- **Task ordering is load-bearing, not just narrative.** `Role.KURINNYI` cannot be removed from the Prisma enum until every single TypeScript reference to it is gone — Prisma's generated client type would stop compiling otherwise. Tasks 1–3 must land, in order, with `Role.KURINNYI` still present in the schema (unused by new logic, but not yet deleted) before Task 4 removes it. Do not reorder tasks or attempt to combine the enum removal with earlier tasks.
- **`isKurinniy` is always computed fresh from the database at request time** (`apps/api/src/auth/strategies/jwt.strategy.ts`), never trusted from the JWT payload itself for authorization decisions. The JWT payload also carries a `isKurinniy` field (set once, at login) — that copy exists **only** so the frontend's client-side JWT decode (`apps/web/app/api/session/route.ts`) can show/hide nav links without an extra network call. It is allowed to go stale until the next login; nothing in the backend ever reads it.
- Every place `role === Role.KURINNYI` currently appears must become `actor.isKurinniy` (or, for the *target* of a check, `target.role !== Role.JUNAK` since a kurinniy-holder's `role` is always `JUNAK` after migration) — never re-introduce a role-based check for kurinniy.
- `PROBY_TRACKING_ROLES` (`apps/api/src/common/proby-tracking-roles.ts`) is deleted entirely once its 4 call sites are migrated to a plain `Role.JUNAK` check — after this plan, a kurinniy-holder already *is* `Role.JUNAK`, so the whole "which roles track proby" indirection stops being necessary.
- Production has a real ZVYAZKOVYI account and one test-only KURINNYI account (explicitly safe to convert). The Task 4 migration converts any `role = 'KURINNYI'` row to `role = 'JUNAK'` automatically, in SQL, before the enum value is dropped — no manual pre-migration step required of the user.
- Only `KURINNYI` gets real permission logic. The other 7 position types (`SUDDIA`, `PYSAR`, `SKARBNYK`, `INTENDANT`, `KHORUNZHYI`, `SMM`, `HURTKOVYI`) are assignable and listed in the "Діловоди" UI, but grant no new capability — do not add access-control branches for them.
- Git hygiene: every commit uses exact file paths in `git add`, never `-A` or `.`.

---

### Task 1: Schema foundation — `KurinPosition`, `isKurinniy`, JWT

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/kurin-positions/position-rules.ts`
- Create: `apps/api/src/common/kurinniy.util.ts`
- Modify: `apps/api/src/common/decorators/current-user.decorator.ts`
- Modify: `apps/api/src/auth/strategies/jwt.strategy.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/common/kurinniy.util.spec.ts`

**Interfaces:**
- Consumes: nothing from other tasks (foundation task).
- Produces: `KurinPosition`/`PositionScope`/`PositionType` Prisma models. `KURIN_POSITIONS`/`HURTOK_POSITIONS: PositionType[]` from `position-rules.ts` (Task 2 consumes these). `isKurinniyForUser(prisma: PrismaService, userId: string): Promise<boolean>` from `common/kurinniy.util.ts`. `CurrentUserPayload.isKurinniy: boolean` (every later backend task consumes this). `AuthService.signToken` now takes a 4th `isKurinniy: boolean` argument.

- [ ] **Step 1: Add the schema additions**

Open `apps/api/prisma/schema.prisma`. Add these two new enums anywhere after the existing `enum Role { ... }` block:

```prisma
enum PositionScope {
  KURIN
  HURTOK
}

enum PositionType {
  KURINNYI
  SUDDIA
  PYSAR
  SKARBNYK
  INTENDANT
  KHORUNZHYI
  SMM
  HURTKOVYI
}
```

Add the new model anywhere after the `User` model:

```prisma
model KurinPosition {
  id           String        @id @default(uuid())
  kurinId      String
  kurin        Kurin         @relation(fields: [kurinId], references: [id])
  hurtokId     String?
  hurtok       Hurtok?       @relation(fields: [hurtokId], references: [id])
  scope        PositionScope
  positionType PositionType
  userId       String
  user         User          @relation("PositionHolder", fields: [userId], references: [id])
  assignedAt   DateTime      @default(now())
  assignedById String
  assignedBy   User          @relation("PositionAssignedBy", fields: [assignedById], references: [id])
  removedAt    DateTime?
  removedById  String?
  removedBy    User?         @relation("PositionRemovedBy", fields: [removedById], references: [id])
}
```

In the `User` model, add these three relation fields right after the existing `profileChangeLogs` line:

```prisma
  positionsHeld     KurinPosition[] @relation("PositionHolder")
  positionsAssigned KurinPosition[] @relation("PositionAssignedBy")
  positionsRemoved  KurinPosition[] @relation("PositionRemovedBy")
```

In the `Kurin` model, add this line right after the existing `users User[]` line:

```prisma
  positions KurinPosition[]
```

In the `Hurtok` model, add this line right after the existing `vykhovnykAssignments VykhovnykHurtok[]` line:

```prisma
  positions KurinPosition[]
```

- [ ] **Step 2: Generate and apply the migration**

Run (from `apps/api/`, against your local dev database):

```bash
npx prisma migrate dev --name add_kurin_positions
```

Expected: it prints `Your database is now in sync with your schema`, and the generated `migration.sql` contains only `CREATE TYPE` (for the two new enums) and `CREATE TABLE`/`ADD CONSTRAINT` statements for `KurinPosition` — no `ALTER TABLE` on `User`, `Kurin`, or `Hurtok` (the three new relation fields on those models are virtual — Prisma doesn't add a column for the "many" side of a relation). If you see anything touching the existing `Role` enum or any existing table's columns, stop — Step 1 was applied incorrectly.

- [ ] **Step 3: Write the position-scope rules**

Create `apps/api/src/kurin-positions/position-rules.ts`:

```ts
import { PositionType } from '@prisma/client';

export const KURIN_POSITIONS: PositionType[] = [
  PositionType.KURINNYI,
  PositionType.SUDDIA,
  PositionType.PYSAR,
  PositionType.SKARBNYK,
  PositionType.INTENDANT,
  PositionType.KHORUNZHYI,
  PositionType.SMM,
];

export const HURTOK_POSITIONS: PositionType[] = [
  PositionType.HURTKOVYI,
  PositionType.SUDDIA,
  PositionType.PYSAR,
  PositionType.SKARBNYK,
];
```

- [ ] **Step 4: Write the shared `isKurinniy` helper**

Create `apps/api/src/common/kurinniy.util.ts`:

```ts
import { PrismaService } from '../prisma/prisma.service';
import { PositionType } from '@prisma/client';

export async function isKurinniyForUser(prisma: PrismaService, userId: string): Promise<boolean> {
  const active = await prisma.kurinPosition.findFirst({
    where: { userId, positionType: PositionType.KURINNYI, removedAt: null },
  });
  return !!active;
}
```

- [ ] **Step 5: Write the unit test**

Create `apps/api/src/common/kurinniy.util.spec.ts`:

```ts
import { isKurinniyForUser } from './kurinniy.util';

describe('isKurinniyForUser', () => {
  it('returns true when an active KURINNYI position exists', async () => {
    const prisma = {
      kurinPosition: { findFirst: jest.fn().mockResolvedValue({ id: 'pos-1' }) },
    };
    await expect(isKurinniyForUser(prisma as any, 'user-1')).resolves.toBe(true);
    expect(prisma.kurinPosition.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', positionType: 'KURINNYI', removedAt: null },
    });
  });

  it('returns false when no active KURINNYI position exists', async () => {
    const prisma = {
      kurinPosition: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await expect(isKurinniyForUser(prisma as any, 'user-2')).resolves.toBe(false);
  });
});
```

Run: `cd apps/api && npx jest src/common/kurinniy.util.spec.ts`
Expected: 2 tests pass.

- [ ] **Step 6: Extend `CurrentUserPayload`**

In `apps/api/src/common/decorators/current-user.decorator.ts`, change:

```ts
export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
}
```

to:

```ts
export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
}
```

- [ ] **Step 7: Compute `isKurinniy` fresh in `JwtStrategy`**

Replace the full content of `apps/api/src/auth/strategies/jwt.strategy.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { isKurinniyForUser } from '../../common/kurinniy.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    const isKurinniy = await isKurinniyForUser(this.prisma, payload.sub);
    return { userId: payload.sub, role: payload.role, kurinId: payload.kurinId, isKurinniy };
  }
}
```

(`PrismaService` is provided globally — `PrismaModule` is `@Global()` — so no module wiring is needed for this injection.)

- [ ] **Step 8: Embed `isKurinniy` in the signed JWT (for the frontend's session decode only)**

In `apps/api/src/auth/auth.service.ts`, add this import:

```ts
import { isKurinniyForUser } from '../common/kurinniy.util';
```

Change the `JwtPayload` interface:

```ts
export interface JwtPayload {
  sub: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
}
```

Change `signToken`:

```ts
signToken(userId: string, role: Role, kurinId: string, isKurinniy: boolean): { accessToken: string } {
  const payload: JwtPayload = { sub: userId, role, kurinId, isKurinniy };
  return { accessToken: this.jwtService.sign(payload) };
}
```

Change `loginWithPassword`'s final line — from:

```ts
    return this.signToken(user.id, user.role, user.kurinId);
```

to:

```ts
    const isKurinniy = await isKurinniyForUser(this.prisma, user.id);
    return this.signToken(user.id, user.role, user.kurinId, isKurinniy);
```

Change `loginWithGoogle`'s final line the same way — from:

```ts
    return this.signToken(user.id, user.role, user.kurinId);
```

to:

```ts
    const isKurinniy = await isKurinniyForUser(this.prisma, user.id);
    return this.signToken(user.id, user.role, user.kurinId, isKurinniy);
```

- [ ] **Step 9: Verify**

Run: `cd apps/api && npx tsc --noEmit` — expect clean (note: this will show pre-existing errors in files this task doesn't touch if `CurrentUserPayload`'s new required field breaks call sites that construct a `CurrentUserPayload`-shaped object by hand outside of `JwtStrategy` — there should be none; if `tsc` reports any, note them in your report but do not fix files outside this task's list, that's Task 3's job).

Run the full e2e suite to confirm nothing already broke: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`
Expected: all tests that were passing before this task still pass (this task is purely additive — no existing behavior should change yet, since nothing consumes `isKurinniy` or the new models until Task 2/3).

- [ ] **Step 10: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/kurin-positions/position-rules.ts apps/api/src/common/kurinniy.util.ts apps/api/src/common/kurinniy.util.spec.ts apps/api/src/common/decorators/current-user.decorator.ts apps/api/src/auth/strategies/jwt.strategy.ts apps/api/src/auth/auth.service.ts
git commit -m "feat: add KurinPosition data model and isKurinniy computation"
```

---

### Task 2: `kurin-positions` module (assign / list / remove)

**Files:**
- Create: `apps/api/src/kurin-positions/dto/assign-position.dto.ts`
- Create: `apps/api/src/kurin-positions/kurin-positions.service.ts`
- Create: `apps/api/src/kurin-positions/kurin-positions.controller.ts`
- Create: `apps/api/src/kurin-positions/kurin-positions.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/kurin-positions.e2e-spec.ts`

**Interfaces:**
- Consumes: `KURIN_POSITIONS`/`HURTOK_POSITIONS` (Task 1), `KurinPosition` model (Task 1), `USER_SELECT` (`apps/api/src/users/user-select.const.ts`, existing).
- Produces: `GET /kurin-positions` (200 → array of `{ id, scope, positionType, hurtokId, assignedAt, user: UserSummary }`, active positions only). `POST /kurin-positions` (body `{ userId, scope, positionType, hurtokId? }`, 200/201 → the created position with `user` included, 400 on scope/positionType mismatch or missing/extra `hurtokId`, 404 if the target isn't a junak in this kurin/hurtok). `DELETE /kurin-positions/:id` (200/201 → `{ success: true }`). All three: `@Roles(Role.ZVYAZKOVYI)` only. No later backend task in this plan depends on these routes (Task 3 depends only on Task 1's `isKurinniy`), but Task 5 (frontend) consumes all three.

- [ ] **Step 1: Write the DTO**

Create `apps/api/src/kurin-positions/dto/assign-position.dto.ts`:

```ts
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PositionScope, PositionType } from '@prisma/client';

export class AssignPositionDto {
  @IsUUID() userId: string;
  @IsEnum(PositionScope) scope: PositionScope;
  @IsEnum(PositionType) positionType: PositionType;
  @IsOptional() @IsUUID() hurtokId?: string;
}
```

- [ ] **Step 2: Write the service**

Create `apps/api/src/kurin-positions/kurin-positions.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PositionScope, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { USER_SELECT } from '../users/user-select.const';
import { AssignPositionDto } from './dto/assign-position.dto';
import { KURIN_POSITIONS, HURTOK_POSITIONS } from './position-rules';

@Injectable()
export class KurinPositionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(kurinId: string) {
    return this.prisma.kurinPosition.findMany({
      where: { kurinId, removedAt: null },
      select: {
        id: true,
        scope: true,
        positionType: true,
        hurtokId: true,
        assignedAt: true,
        user: { select: USER_SELECT },
      },
      orderBy: [{ scope: 'asc' }, { positionType: 'asc' }],
    });
  }

  async assign(dto: AssignPositionDto, actor: CurrentUserPayload) {
    if (dto.scope === PositionScope.KURIN) {
      if (!KURIN_POSITIONS.includes(dto.positionType)) {
        throw new BadRequestException('This position is not valid at kurin scope');
      }
      if (dto.hurtokId) {
        throw new BadRequestException('hurtokId must not be set for a kurin-scoped position');
      }
    } else {
      if (!HURTOK_POSITIONS.includes(dto.positionType)) {
        throw new BadRequestException('This position is not valid at hurtok scope');
      }
      if (!dto.hurtokId) {
        throw new BadRequestException('hurtokId is required for a hurtok-scoped position');
      }
      const hurtok = await this.prisma.hurtok.findUnique({ where: { id: dto.hurtokId } });
      if (!hurtok || hurtok.kurinId !== actor.kurinId) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }

    const target = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!target || target.role !== Role.JUNAK || target.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found in this kurin');
    }
    if (dto.scope === PositionScope.HURTOK && target.hurtokId !== dto.hurtokId) {
      throw new BadRequestException('This junak does not belong to that hurtok');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.kurinPosition.updateMany({
        where: {
          kurinId: actor.kurinId,
          scope: dto.scope,
          positionType: dto.positionType,
          hurtokId: dto.hurtokId ?? null,
          removedAt: null,
        },
        data: { removedAt: new Date(), removedById: actor.userId },
      });
      return tx.kurinPosition.create({
        data: {
          kurinId: actor.kurinId,
          hurtokId: dto.hurtokId,
          scope: dto.scope,
          positionType: dto.positionType,
          userId: dto.userId,
          assignedById: actor.userId,
        },
        select: {
          id: true,
          scope: true,
          positionType: true,
          hurtokId: true,
          assignedAt: true,
          user: { select: USER_SELECT },
        },
      });
    });
  }

  async remove(id: string, actor: CurrentUserPayload) {
    const position = await this.prisma.kurinPosition.findUnique({ where: { id } });
    if (!position || position.kurinId !== actor.kurinId || position.removedAt) {
      throw new NotFoundException('Position not found');
    }
    await this.prisma.kurinPosition.update({
      where: { id },
      data: { removedAt: new Date(), removedById: actor.userId },
    });
    return { success: true };
  }
}
```

- [ ] **Step 3: Write the controller**

Create `apps/api/src/kurin-positions/kurin-positions.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { KurinPositionsService } from './kurin-positions.service';
import { AssignPositionDto } from './dto/assign-position.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kurin-positions')
export class KurinPositionsController {
  constructor(private readonly service: KurinPositionsService) {}

  @Roles(Role.ZVYAZKOVYI)
  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user.kurinId);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Post()
  assign(@Body() dto: AssignPositionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.assign(dto, user);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }
}
```

- [ ] **Step 4: Write the module**

Create `apps/api/src/kurin-positions/kurin-positions.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KurinPositionsController } from './kurin-positions.controller';
import { KurinPositionsService } from './kurin-positions.service';

@Module({
  imports: [AuthModule],
  controllers: [KurinPositionsController],
  providers: [KurinPositionsService],
})
export class KurinPositionsModule {}
```

- [ ] **Step 5: Wire into `AppModule`**

In `apps/api/src/app.module.ts`, add the import:

```ts
import { KurinPositionsModule } from './kurin-positions/kurin-positions.module';
```

Add `KurinPositionsModule` to the `imports` array (anywhere, e.g. right after `ApprovalRequestsModule`).

- [ ] **Step 6: Write the e2e test**

Create `apps/api/test/kurin-positions.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('kurin-positions (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    jwtService = moduleRef.get(JwtService);
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

  it('assigns a kurin-scoped position and it appears in the list', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'KURIN', positionType: 'KURINNYI' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const list = await request(app.getHttpServer())
      .get('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].positionType).toBe('KURINNYI');
    expect(list.body[0].user.id).toBe(junak.id);
  });

  it('automatically retires the previous holder of the same slot', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak1 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const junak2 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak1.id, scope: 'KURIN', positionType: 'KURINNYI' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak2.id, scope: 'KURIN', positionType: 'KURINNYI' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const list = await request(app.getHttpServer())
      .get('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].user.id).toBe(junak2.id);

    const allPositions = await prisma.kurinPosition.findMany({ where: { kurinId: kurin.id } });
    expect(allPositions).toHaveLength(2);
    const retired = allPositions.find((p) => p.userId === junak1.id)!;
    expect(retired.removedAt).not.toBeNull();
  });

  it('rejects a hurtok-only position type at kurin scope', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'KURIN', positionType: 'HURTKOVYI' })
      .expect(400);
  });

  it('assigns a hurtok-scoped position only to a junak of that hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const otherHurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Соколи' } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junakInHurtok = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const junakInOtherHurtok = await createUser(prisma, {
      role: Role.JUNAK,
      kurinId: kurin.id,
      hurtokId: otherHurtok.id,
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junakInOtherHurtok.id, scope: 'HURTOK', positionType: 'HURTKOVYI', hurtokId: hurtok.id })
      .expect(400);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junakInHurtok.id, scope: 'HURTOK', positionType: 'HURTKOVYI', hurtokId: hurtok.id })
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('lets zvyazkovyi remove a position without a replacement', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const created = await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'KURIN', positionType: 'KURINNYI' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .delete(`/kurin-positions/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const list = await request(app.getHttpServer())
      .get('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('forbids a junak from assigning a position', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const target = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.id, scope: 'KURIN', positionType: 'KURINNYI' })
      .expect(403);
  });
});
```

- [ ] **Step 7: Run the tests**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand kurin-positions`
Expected: 6 tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/kurin-positions/dto/assign-position.dto.ts apps/api/src/kurin-positions/kurin-positions.service.ts apps/api/src/kurin-positions/kurin-positions.controller.ts apps/api/src/kurin-positions/kurin-positions.module.ts apps/api/src/app.module.ts apps/api/test/kurin-positions.e2e-spec.ts
git commit -m "feat: add kurin-positions module (assign, list, remove)"
```

---

### Task 3: Migrate every backend `Role.KURINNYI` check to `isKurinniy`

**Files:**
- Modify: `apps/api/src/approval-requests/approval-requests.controller.ts`
- Modify: `apps/api/src/approval-requests/approval-requests.service.ts`
- Modify: `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.controller.ts`
- Modify: `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.service.ts`
- Modify: `apps/api/src/proby-progress/proby-progress.service.ts`
- Modify: `apps/api/src/users/users.controller.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/kurins/kurins.service.ts`
- Modify: `apps/api/src/hurtky/hurtky.service.ts`
- Delete: `apps/api/src/common/proby-tracking-roles.ts`
- Modify: `apps/api/test/utils/fixtures.ts`
- Modify (mechanical swap, see Step 9): 12 test files listed in Step 9
- Modify (rewrite, see Step 10–11): `apps/api/test/users-list.e2e-spec.ts`, `apps/api/test/users.e2e-spec.ts`

**Interfaces:**
- Consumes: `CurrentUserPayload.isKurinniy` (Task 1).
- Produces: `createKurinniyUser(prisma, { kurinId, hurtokId?, email?, password? })` in `apps/api/test/utils/fixtures.ts` — every later test file that needs a kurinniy-holding user uses this instead of `createUser(prisma, { role: Role.KURINNYI, ... })`.

This is a large mechanical-plus-precise task. Do the 9 backend logic files first (Steps 1–8), then the test infrastructure (Step 9 is a uniform mechanical pattern applied at 31 listed locations across 12 files; Steps 10–11 are two files needing a real rewrite, not a mechanical swap — do not apply Step 9's pattern to those two, follow their own instructions exactly).

- [ ] **Step 1: `approval-requests`**

In `apps/api/src/approval-requests/approval-requests.controller.ts`, remove the `@Roles(Role.KURINNYI)` line above the `create` method (leave the method itself, and its `@Post()` decorator, unchanged). The `Role` import may now be unused in this file — check whether `Role` is still referenced elsewhere in the file (it is, in the other methods' `@Roles(Role.ZVYAZKOVYI)` lines) — if so, keep the import as-is.

In `apps/api/src/approval-requests/approval-requests.service.ts`, add this as the first line inside `async create(dto: CreateApprovalRequestDto, actor: CurrentUserPayload) {`:

```ts
    if (!actor.isKurinniy) {
      throw new ForbiddenException('Only kurinniy can create approval requests');
    }
```

`ForbiddenException` is already imported in this file (check the existing `@nestjs/common` import line — it already imports `BadRequestException, ForbiddenException, Injectable, NotFoundException`).

- [ ] **Step 2: `vykhovnyk-assignments`**

In `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.controller.ts`, change:

```ts
  @Roles(Role.ZVYAZKOVYI, Role.VYKHOVNYK, Role.KURINNYI)
  @Get()
  list(@Query('hurtokId') hurtokId: string | undefined, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user, hurtokId);
  }
```

to:

```ts
  @Get()
  list(@Query('hurtokId') hurtokId: string | undefined, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user, hurtokId);
  }
```

(Removing the `@Roles()` decorator entirely from this one method — the other two methods in this controller keep their `@Roles(Role.ZVYAZKOVYI)`.)

In `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.service.ts`, add this as the first line inside `async list(actor: CurrentUserPayload, hurtokId?: string) {`:

```ts
    if (actor.role !== Role.ZVYAZKOVYI && actor.role !== Role.VYKHOVNYK && !actor.isKurinniy) {
      throw new ForbiddenException('Insufficient role');
    }
```

Add `ForbiddenException` to the existing `@nestjs/common` import line in this file (it currently imports `ConflictException, Injectable, NotFoundException` — add `ForbiddenException` to that list).

- [ ] **Step 3: `proby-progress`**

In `apps/api/src/proby-progress/proby-progress.service.ts`, change:

```ts
    if (actor.role === Role.KURINNYI && actor.userId !== junakId) {
      throw new ForbiddenException("Kurinnyi cannot view another user's proby progress");
    }
```

to:

```ts
    if (actor.isKurinniy && actor.userId !== junakId) {
      throw new ForbiddenException("Kurinnyi cannot view another user's proby progress");
    }
```

Later in the same file (in `assertAssignedVykhovnyk`), and earlier in `getProgressFor`, change both occurrences of:

```ts
    if (!junak || !PROBY_TRACKING_ROLES.includes(junak.role) || junak.kurinId !== actor.kurinId) {
```

to:

```ts
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
```

Remove the now-unused import line `import { PROBY_TRACKING_ROLES } from '../common/proby-tracking-roles';` from this file.

- [ ] **Step 4: `users.controller.ts`**

Change:

```ts
  @Roles(Role.KURINNYI, Role.ZVYAZKOVYI)
  @Patch(':id/contact-info')
  updateContactInfo(
    @Param('id') id: string,
    @Body() dto: UpdateContactInfoDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateContactInfo(id, dto, user.kurinId);
  }
```

to:

```ts
  @Patch(':id/contact-info')
  updateContactInfo(
    @Param('id') id: string,
    @Body() dto: UpdateContactInfoDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateContactInfo(id, dto, user);
  }
```

(Note: passing the full `user` object now, not just `user.kurinId` — the service needs `role`/`isKurinniy` too.)

- [ ] **Step 5: `users.service.ts` — `updateContactInfo`**

Change the method signature and its first check — from:

```ts
  async updateContactInfo(junakId: string, dto: UpdateContactInfoDto, actorKurinId: string) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actorKurinId) {
      throw new NotFoundException('Junak not found');
    }
```

to:

```ts
  async updateContactInfo(junakId: string, dto: UpdateContactInfoDto, actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.isKurinniy) {
      throw new ForbiddenException('Insufficient role');
    }
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found');
    }
```

- [ ] **Step 6: `users.service.ts` — `create`**

Change:

```ts
  async create(dto: CreateUserDto, actorKurinId: string) {
    if (dto.role === Role.ZVYAZKOVYI) {
      throw new BadRequestException('Cannot self-service create another zvyazkovyi');
    }
    if (PROBY_TRACKING_ROLES.includes(dto.role) && !dto.hurtokId) {
      throw new BadRequestException('hurtokId is required for this role');
    }
```

to:

```ts
  async create(dto: CreateUserDto, actorKurinId: string) {
    if (dto.role === Role.ZVYAZKOVYI) {
      throw new BadRequestException('Cannot self-service create another zvyazkovyi');
    }
    if (dto.role === Role.KURINNYI) {
      throw new BadRequestException('Kurinniy is assigned via Діловоди, not created directly');
    }
    if (dto.role === Role.JUNAK && !dto.hurtokId) {
      throw new BadRequestException('hurtokId is required for this role');
    }
```

- [ ] **Step 7: `users.service.ts` — `list`, `isVisibleTo`, `updateOwnProfile`**

In `list`, remove this block entirely (it no longer applies — there is at most one active kurinniy per kurin, and it's no longer a `role` filter value):

```ts
    if (actor.role === Role.KURINNYI && filters.role === Role.KURINNYI) {
      throw new ForbiddenException('Kurinnyi cannot list other kurinni');
    }
```

Change the very first check in `list` — from:

```ts
    if (actor.role === Role.JUNAK) {
      throw new ForbiddenException('Junak cannot list users');
    }
```

to:

```ts
    if (actor.role === Role.JUNAK && !actor.isKurinniy) {
      throw new ForbiddenException('Junak cannot list users');
    }
```

Change this block — from:

```ts
    if (actor.role === Role.KURINNYI) {
      return this.prisma.user.findMany({
        where: {
          kurinId: actor.kurinId,
          role: filters.role ?? Role.JUNAK,
          ...(filters.hurtokId ? { hurtokId: filters.hurtokId } : {}),
        },
        select: USER_SELECT,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    }
```

to:

```ts
    if (actor.isKurinniy) {
      return this.prisma.user.findMany({
        where: {
          kurinId: actor.kurinId,
          role: filters.role ?? Role.JUNAK,
          ...(filters.hurtokId ? { hurtokId: filters.hurtokId } : {}),
        },
        select: USER_SELECT,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    }
```

In `isVisibleTo`, change:

```ts
    if (actor.role === Role.KURINNYI) {
      return target.role !== Role.KURINNYI;
    }
```

to:

```ts
    if (actor.isKurinniy) {
      return true;
    }
```

In `updateOwnProfile`, change:

```ts
    if (PROBY_TRACKING_ROLES.includes(user.role)) {
```

to:

```ts
    if (user.role === Role.JUNAK) {
```

Remove the now-unused import line `import { PROBY_TRACKING_ROLES } from '../common/proby-tracking-roles';` from this file.

- [ ] **Step 8: `kurins.service.ts` and `hurtky.service.ts`**

In `apps/api/src/kurins/kurins.service.ts`, change:

```ts
    const junaky = await this.prisma.user.findMany({
      where: { kurinId, role: { in: [...PROBY_TRACKING_ROLES] } },
      select: { id: true },
    });
```

to:

```ts
    const junaky = await this.prisma.user.findMany({
      where: { kurinId, role: Role.JUNAK },
      select: { id: true },
    });
```

Add `Role` to this file's existing `@prisma/client` import (it currently imports `ProgressAction, ProgressStatus` — add `Role` to that list). Remove the now-unused `import { PROBY_TRACKING_ROLES } from '../common/proby-tracking-roles';` line.

In `apps/api/src/hurtky/hurtky.service.ts`, change:

```ts
    const junaky = await this.prisma.user.findMany({
      where: { hurtokId, role: { in: [...PROBY_TRACKING_ROLES] }, kurinId: actor.kurinId },
      select: USER_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
```

to:

```ts
    const junaky = await this.prisma.user.findMany({
      where: { hurtokId, role: Role.JUNAK, kurinId: actor.kurinId },
      select: USER_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
```

Remove the now-unused `import { PROBY_TRACKING_ROLES } from '../common/proby-tracking-roles';` line from this file (`Role` is already imported in this file — check the existing `@prisma/client` import line before adding it again).

Delete the file `apps/api/src/common/proby-tracking-roles.ts` entirely — after Steps 3, 7, and 8, nothing imports it anymore. Verify with `grep -rn "PROBY_TRACKING_ROLES\|proby-tracking-roles" apps/api/src` — it must return nothing before you delete the file.

- [ ] **Step 9: Mechanical fixture swap across 12 test files**

Add this helper to `apps/api/test/utils/fixtures.ts`. First add `PositionScope, PositionType` to the file's existing `@prisma/client` import line (currently `PrismaClient, Role, KurinGender, ProbyProgramVersion`), then add this function anywhere after `createUser`:

```ts
export async function createKurinniyUser(
  prisma: PrismaClient,
  overrides: { kurinId: string; hurtokId?: string; email?: string; password?: string },
) {
  const user = await createUser(prisma, {
    role: Role.JUNAK,
    kurinId: overrides.kurinId,
    hurtokId: overrides.hurtokId,
    email: overrides.email,
    password: overrides.password,
  });
  await prisma.kurinPosition.create({
    data: {
      kurinId: overrides.kurinId,
      scope: PositionScope.KURIN,
      positionType: PositionType.KURINNYI,
      userId: user.id,
      assignedById: user.id,
    },
  });
  return user;
}
```

Then, in each of the 12 files below, replace every line matching the pattern `const <name> = await createUser(prisma, { role: Role.KURINNYI, <rest> });` with `const <name> = await createKurinniyUser(prisma, { <rest> });` — i.e. drop `role: Role.KURINNYI,` and call `createKurinniyUser` instead of `createUser`, keeping every other argument (`kurinId`, `hurtokId`, etc.) exactly as it was. Do this at every location listed (file:line, from the current codebase state — re-grep if line numbers have shifted):

```
approval-requests-decide.e2e-spec.ts:36, 204
hurtky-board.e2e-spec.ts:71, 113
approval-requests-detail.e2e-spec.ts:36, 62, 90, 113
approval-requests-create.e2e-spec.ts:36, 60, 85, 99, 135
proby-progress.e2e-spec.ts:97, 108, 126, 127, 142
proby-progress-confirm.e2e-spec.ts:118, 135, 149
proby-catalog.e2e-spec.ts:58
kurins-proby-program.e2e-spec.ts:89
users-contact-info.e2e-spec.ts:36, 86
vykhovnyk-assignments-list.e2e-spec.ts:93
users-detail.e2e-spec.ts:101, 129, 130, 155
```

(`users-list.e2e-spec.ts` and `users.e2e-spec.ts` also have `Role.KURINNYI` usages — do **not** apply this mechanical pattern to those two, they need the real rewrites in Steps 10–11 instead.)

After applying all of the above, verify: `grep -rn "Role.KURINNYI" apps/api/test/*.e2e-spec.ts` should show matches **only** in `users-list.e2e-spec.ts` and `users.e2e-spec.ts` (which Steps 10–11 handle next) — if any other file still shows a match, you missed a location; fix it before moving on.

- [ ] **Step 10: Rewrite `users-list.e2e-spec.ts`**

This file has two tests using `role: Role.KURINNYI` that also assert on now-obsolete `?role=KURINNYI` filter behavior — a mechanical swap isn't enough here. Read the current file first, find the two tests described below by their `it(...)` title, and replace each one's full body with the version given.

Replace the test titled `'lets a kurinniy list junaky by default and filter by role to see vykhovnyky/zvyazkovyi, but forbids listing other kurinni'` with:

```ts
  it('lets a kurinniy list junaky by default and filter by role to see vykhovnyky/zvyazkovyi', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const junak1 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const junak2 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinniy);

    const defaultList = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(defaultList.body.map((u: any) => u.id).sort()).toEqual([kurinniy.id, junak1.id, junak2.id].sort());

    const vykhovnykyList = await request(app.getHttpServer())
      .get('/users?role=VYKHOVNYK')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(vykhovnykyList.body).toHaveLength(1);
    expect(vykhovnykyList.body[0].id).toBe(vykhovnyk.id);

    const zvyazkovyiList = await request(app.getHttpServer())
      .get('/users?role=ZVYAZKOVYI')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(zvyazkovyiList.body).toHaveLength(1);
    expect(zvyazkovyiList.body[0].id).toBe(zvyazkovyi.id);
  });
```

(Note the default-list assertion now includes `kurinniy.id` — a kurinniy-holder's own `role` is `JUNAK`, so `GET /users` with no filter, defaulting to `role: filters.role ?? Role.JUNAK` for a kurinniy actor, correctly returns all three junaky including themselves.)

In the test titled `'lets a zvyazkovyi list all roles in their kurin with no filter, and filter by role'`, change the fixture line:

```ts
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
```

to:

```ts
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
```

and remove this trailing block from the end of that same test (everything from `const onlyKurinni = ...` to its closing `expect(...)` line):

```ts
    const onlyKurinni = await request(app.getHttpServer())
      .get('/users?role=KURINNYI')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(onlyKurinni.body).toHaveLength(1);
    expect(onlyKurinni.body[0].id).toBe(kurinnyi.id);
```

The rest of that test (the `all.body` assertion and the `onlyVykhovnyky` block) stays exactly as it is — `kurinnyi.id` still appears in the "no filter, all roles" list, since the underlying `User` row still exists in the kurin regardless of its position.

- [ ] **Step 11: Rewrite the obsolete test in `users.e2e-spec.ts`**

Find the test titled `'requires hurtokId for KURINNYI too'` (around line 78) and replace its entire body with:

```ts
    it('forbids creating a KURINNYI directly through this endpoint', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
      const token = issueTokenFor(jwtService, zvyazkovyi);

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Кур', lastName: 'Інний', email: 'no-direct-kurinnyi@example.com', role: 'KURINNYI' })
        .expect(400);
    });
```

- [ ] **Step 12: Run the full backend suite**

Run: `cd apps/api && npx tsc --noEmit` — expect clean.

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`
Expected: every test passes. This is the real correctness gate for this task — if anything fails, read the failure, determine whether it's a leftover `Role.KURINNYI` reference you missed (re-run the grep from Step 9) or a genuine logic gap in Steps 1–8, and fix it before proceeding. Do not skip or `.skip()` a failing test.

Run: `cd apps/api && npx jest` (plain unit tests) — expect all pass, unaffected by this task.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/approval-requests/approval-requests.controller.ts apps/api/src/approval-requests/approval-requests.service.ts apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.controller.ts apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.service.ts apps/api/src/proby-progress/proby-progress.service.ts apps/api/src/users/users.controller.ts apps/api/src/users/users.service.ts apps/api/src/kurins/kurins.service.ts apps/api/src/hurtky/hurtky.service.ts apps/api/test/utils/fixtures.ts apps/api/test/approval-requests-decide.e2e-spec.ts apps/api/test/hurtky-board.e2e-spec.ts apps/api/test/approval-requests-detail.e2e-spec.ts apps/api/test/approval-requests-create.e2e-spec.ts apps/api/test/proby-progress.e2e-spec.ts apps/api/test/proby-progress-confirm.e2e-spec.ts apps/api/test/proby-catalog.e2e-spec.ts apps/api/test/kurins-proby-program.e2e-spec.ts apps/api/test/users-contact-info.e2e-spec.ts apps/api/test/vykhovnyk-assignments-list.e2e-spec.ts apps/api/test/users-detail.e2e-spec.ts apps/api/test/users-list.e2e-spec.ts apps/api/test/users.e2e-spec.ts
git rm apps/api/src/common/proby-tracking-roles.ts
git commit -m "refactor: migrate every Role.KURINNYI check to isKurinniy, delete PROBY_TRACKING_ROLES"
```

---

### Task 4: Remove `Role.KURINNYI` from the schema

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_remove_kurinniy_role/migration.sql` (hand-edited, see Step 2)
- Modify: `apps/api/src/users/users.service.ts` (remove now-dead check)

**Interfaces:**
- Consumes: nothing (Tasks 1–3 must already be fully merged — verify with `grep -rn "Role.KURINNYI\|'KURINNYI'" apps/api/src` returning nothing before starting this task, aside from string values inside `PositionType.KURINNYI`/`'KURINNYI'` position-type literals, which are unrelated and must stay).
- Produces: `Role` enum with exactly 3 values. No later task depends on this beyond "the migration must not break anything."

- [ ] **Step 1: Edit the schema**

In `apps/api/prisma/schema.prisma`, remove the `KURINNYI` line from `enum Role`:

```prisma
enum Role {
  JUNAK
  VYKHOVNYK
  ZVYAZKOVYI
}
```

- [ ] **Step 2: Generate the migration without applying it, then hand-edit it**

Run:

```bash
cd apps/api
npx prisma migrate dev --name remove_kurinniy_role --create-only
```

This creates a new migration folder under `apps/api/prisma/migrations/` and prints its path, but does **not** apply it yet. Open the generated `migration.sql` file. Postgres cannot drop a single value from an enum type directly — Prisma's migration will instead create a new enum type without `KURINNYI`, swap the `User.role` column to it, and drop the old type. This only works if no row still has `role = 'KURINNYI'` at the moment the column is swapped, so you must insert a data-fix statement **before** everything Prisma generated.

Add this line as the very first statement in the file (before any `CREATE TYPE`/`ALTER TABLE` Prisma wrote):

```sql
UPDATE "User" SET "role" = 'JUNAK' WHERE "role" = 'KURINNYI';
```

Read the rest of the generated SQL to confirm it does roughly: create a new `Role` enum type without `KURINNYI`, alter `"User"."role"` to the new type (casting existing values), rename types so the new one is called `Role`, and drop the old type. If it looks like anything else (e.g. it silently drops rows, or errors on an unrelated table), stop and report BLOCKED rather than guessing — this is the one genuinely delicate step in this whole plan.

- [ ] **Step 3: Apply the migration**

Run:

```bash
npx prisma migrate dev
```

(No `--name` needed — this applies the pending migration you just hand-edited.) Expected: it applies cleanly, no data-loss warnings (your Step 2 edit already resolved the only row that would have blocked it).

- [ ] **Step 4: Remove the now-unreachable check**

In `apps/api/src/users/users.service.ts`, `create()` now has a branch that can never trigger — `dto.role` can no longer be `KURINNYI` at the type level, since `@IsEnum(Role)` on `CreateUserDto` rejects it before the service method even runs. Remove this block (added in Task 3, Step 6):

```ts
    if (dto.role === Role.KURINNYI) {
      throw new BadRequestException('Kurinniy is assigned via Діловоди, not created directly');
    }
```

The e2e test added in Task 3 Step 11 (`'forbids creating a KURINNYI directly through this endpoint'`) still passes after this removal — it will now fail via `class-validator`'s enum rejection instead of this explicit check, both routes return 400. Do not change that test.

- [ ] **Step 5: Verify**

Run: `cd apps/api && npx tsc --noEmit` — expect clean.

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`
Expected: every test still passes.

Run: `cd apps/api && npx jest` — expect all pass.

Run: `cd apps/api && npm run start:dev`, confirm it logs `Nest application successfully started`, then stop it.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/users/users.service.ts
git commit -m "feat: remove Role.KURINNYI from the schema"
```

---

### Task 5: Frontend — "Діловоди" page

**Files:**
- Create: `apps/web/lib/queries/positions.ts`
- Create: `apps/web/app/positions/page.tsx`
- Modify: `apps/web/lib/types.ts`
- Test: `apps/web/e2e/positions.spec.ts`

**Interfaces:**
- Consumes: `GET /kurin-positions`, `POST /kurin-positions`, `DELETE /kurin-positions/:id` (Task 2), `apiFetch` (`apps/web/lib/api-client.ts`), `useHurtky` (`apps/web/lib/queries/hurtky.ts`), `useUsers` (`apps/web/lib/queries/users.ts`).
- Produces: `KurinPosition`, `PositionType`, `PositionScope` types (`apps/web/lib/types.ts`) — Task 6 consumes `PositionType` for `POSITION_LABELS`. `useKurinPositions()`, `useAssignPosition()`, `useRemovePosition()` — no later task in this plan depends on these hooks beyond this task's own page.

- [ ] **Step 1: Add the new types**

In `apps/web/lib/types.ts`, add these types anywhere (e.g. right after the existing `Hurtok` interface):

```ts
export type PositionScope = 'KURIN' | 'HURTOK';

export type PositionType =
  | 'KURINNYI'
  | 'SUDDIA'
  | 'PYSAR'
  | 'SKARBNYK'
  | 'INTENDANT'
  | 'KHORUNZHYI'
  | 'SMM'
  | 'HURTKOVYI';

export interface KurinPosition {
  id: string;
  scope: PositionScope;
  positionType: PositionType;
  hurtokId: string | null;
  assignedAt: string;
  user: UserSummary;
}
```

- [ ] **Step 2: Write the query hooks**

Create `apps/web/lib/queries/positions.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { KurinPosition, PositionScope, PositionType } from '@/lib/types';

export function useKurinPositions() {
  return useQuery({
    queryKey: ['kurin-positions'],
    queryFn: () => apiFetch<KurinPosition[]>('/kurin-positions'),
  });
}

export function useAssignPosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { userId: string; scope: PositionScope; positionType: PositionType; hurtokId?: string }) =>
      apiFetch<KurinPosition>('/kurin-positions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kurin-positions'] });
    },
  });
}

export function useRemovePosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/kurin-positions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kurin-positions'] });
    },
  });
}
```

- [ ] **Step 3: Write the page**

Create `apps/web/app/positions/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useKurinPositions, useAssignPosition, useRemovePosition } from '@/lib/queries/positions';
import { useHurtky } from '@/lib/queries/hurtky';
import { useUsers } from '@/lib/queries/users';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { KurinPosition, PositionScope, PositionType } from '@/lib/types';

const KURIN_POSITION_TYPES: { value: PositionType; label: string }[] = [
  { value: 'KURINNYI', label: 'Курінний' },
  { value: 'SUDDIA', label: 'Суддя' },
  { value: 'PYSAR', label: 'Писар' },
  { value: 'SKARBNYK', label: 'Скарбник' },
  { value: 'INTENDANT', label: 'Інтендант' },
  { value: 'KHORUNZHYI', label: 'Хорунжий' },
  { value: 'SMM', label: 'СММник' },
];

const HURTOK_POSITION_TYPES: { value: PositionType; label: string }[] = [
  { value: 'HURTKOVYI', label: 'Гуртковий' },
  { value: 'SUDDIA', label: 'Суддя' },
  { value: 'PYSAR', label: 'Писар' },
  { value: 'SKARBNYK', label: 'Скарбник' },
];

function PositionSlot({
  label,
  positionType,
  scope,
  hurtokId,
  current,
  candidates,
}: {
  label: string;
  positionType: PositionType;
  scope: PositionScope;
  hurtokId?: string;
  current: KurinPosition | undefined;
  candidates: { id: string; firstName: string; lastName: string }[];
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const assign = useAssignPosition();
  const remove = useRemovePosition();

  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <span className="w-32 shrink-0 font-medium">{label}</span>
      {current ? (
        <>
          <span className="flex-1">
            {current.user.lastName} {current.user.firstName}
          </span>
          <Button variant="outline" size="sm" onClick={() => remove.mutate(current.id)} disabled={remove.isPending}>
            Зняти
          </Button>
        </>
      ) : (
        <>
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
          <Button
            size="sm"
            disabled={!selectedUserId || assign.isPending}
            onClick={() =>
              assign.mutate({ userId: selectedUserId, scope, positionType, hurtokId }, { onSuccess: () => setSelectedUserId('') })
            }
          >
            Призначити
          </Button>
        </>
      )}
    </div>
  );
}

export default function PositionsPage() {
  const { data: positions, isLoading: positionsLoading } = useKurinPositions();
  const { data: hurtky, isLoading: hurtkyLoading } = useHurtky();
  const { data: junaky } = useUsers({ role: 'JUNAK' });

  if (positionsLoading || hurtkyLoading) return <p>Завантаження...</p>;

  const candidates = junaky ?? [];
  const kurinPositions = positions ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Діловоди</h1>

      <Card>
        <CardHeader>
          <CardTitle>Посади куреня</CardTitle>
        </CardHeader>
        <CardContent>
          {KURIN_POSITION_TYPES.map((p) => (
            <PositionSlot
              key={p.value}
              label={p.label}
              positionType={p.value}
              scope="KURIN"
              current={kurinPositions.find((kp) => kp.scope === 'KURIN' && kp.positionType === p.value)}
              candidates={candidates}
            />
          ))}
        </CardContent>
      </Card>

      {(hurtky ?? []).map((h) => (
        <Card key={h.id}>
          <CardHeader>
            <CardTitle>Посади гуртка &laquo;{h.name}&raquo;</CardTitle>
          </CardHeader>
          <CardContent>
            {HURTOK_POSITION_TYPES.map((p) => (
              <PositionSlot
                key={p.value}
                label={p.label}
                positionType={p.value}
                scope="HURTOK"
                hurtokId={h.id}
                current={kurinPositions.find(
                  (kp) => kp.scope === 'HURTOK' && kp.hurtokId === h.id && kp.positionType === p.value,
                )}
                candidates={candidates.filter((c) => c.hurtokId === h.id)}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write the e2e test**

Create `apps/web/e2e/positions.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi assign and remove kurin positions', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junakEmail = `junak-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/positions');

  await page.getByText('Курінний').locator('..').getByRole('combobox').selectOption({ label: 'Петренко Петро' });
  await page.getByText('Курінний').locator('..').getByRole('button', { name: 'Призначити' }).click();

  await expect(page.getByText('Курінний').locator('..').getByText('Петренко Петро')).toBeVisible();

  await page.getByText('Курінний').locator('..').getByRole('button', { name: 'Зняти' }).click();
  await expect(page.getByText('Курінний').locator('..').getByRole('combobox')).toBeVisible();
});
```

- [ ] **Step 5: Run the test**

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test e2e/positions.spec.ts`
Expected: 1 test passes. If the `getByText('Курінний').locator('..')` selector proves too ambiguous in practice (multiple matches, since "Курінний" also appears in role labels elsewhere on the page), that's an acceptable, unambiguous fix to make directly — adjust to a more specific selector (e.g. add a `data-testid` per slot) and note the change in your report; do not change the page's actual behavior to work around a test problem.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/queries/positions.ts apps/web/app/positions apps/web/e2e/positions.spec.ts
git commit -m "feat: add Діловоди positions page"
```

---

### Task 6: Frontend — migrate `role === 'KURINNYI'` to `session.isKurinniy`

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/app/api/session/route.ts`
- Modify: `apps/web/lib/role-labels.ts`
- Modify: `apps/web/components/nav.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/users/page.tsx`
- Modify: `apps/web/app/users/new/page.tsx`
- Modify: `apps/web/app/users/[id]/page.tsx`
- Test: `apps/web/e2e/kurinniy-junak.spec.ts`

**Interfaces:**
- Consumes: `PositionType` (Task 5), backend's JWT payload now including `isKurinniy` (Task 1).
- Produces: `CurrentUserPayload.isKurinniy: boolean` (`apps/web/lib/types.ts`) — final shape of the session object every page in this app reads.

- [ ] **Step 1: Shrink `Role` and extend `CurrentUserPayload`**

In `apps/web/lib/types.ts`, change:

```ts
export type Role = 'JUNAK' | 'VYKHOVNYK' | 'KURINNYI' | 'ZVYAZKOVYI';

export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
}
```

to:

```ts
export type Role = 'JUNAK' | 'VYKHOVNYK' | 'ZVYAZKOVYI';

export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
}
```

- [ ] **Step 2: Decode `isKurinniy` from the JWT**

In `apps/web/app/api/session/route.ts`, change:

```ts
    const session: CurrentUserPayload = {
      userId: decoded.sub,
      role: decoded.role,
      kurinId: decoded.kurinId,
    };
```

to:

```ts
    const session: CurrentUserPayload = {
      userId: decoded.sub,
      role: decoded.role,
      kurinId: decoded.kurinId,
      isKurinniy: !!decoded.isKurinniy,
    };
```

- [ ] **Step 3: Split `KURINNYI` out of `ROLE_LABELS` into `POSITION_LABELS`**

Replace the full content of `apps/web/lib/role-labels.ts`:

```ts
import type { Role, PositionType } from '@/lib/types';

export const ROLE_LABELS: Record<Role, string> = {
  JUNAK: 'Юнак',
  VYKHOVNYK: 'Виховник',
  ZVYAZKOVYI: "Зв'язковий",
};

export const POSITION_LABELS: Record<PositionType, string> = {
  KURINNYI: 'Курінний',
  SUDDIA: 'Суддя',
  PYSAR: 'Писар',
  SKARBNYK: 'Скарбник',
  INTENDANT: 'Інтендант',
  KHORUNZHYI: 'Хорунжий',
  SMM: 'СММник',
  HURTKOVYI: 'Гуртковий',
};
```

- [ ] **Step 4: `nav.tsx`**

Replace the full content of `apps/web/components/nav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/session-client';
import { Button } from '@/components/ui/button';

const LINKS_BY_ROLE: Record<string, { href: string; label: string }[]> = {
  JUNAK: [
    { href: '/proby', label: 'Моя проба' },
    { href: '/settings', label: 'Налаштування' },
  ],
  VYKHOVNYK: [
    { href: '/hurtky', label: 'Мої гуртки' },
    { href: '/settings', label: 'Налаштування' },
  ],
  ZVYAZKOVYI: [
    { href: '/approval-requests', label: 'Запити' },
    { href: '/users', label: 'Люди' },
    { href: '/hurtky', label: 'Гуртки' },
    { href: '/vykhovnyk-assignments', label: 'Призначення' },
    { href: '/kurin', label: 'Курінь' },
    { href: '/positions', label: 'Діловоди' },
    { href: '/settings', label: 'Налаштування' },
  ],
};

export function Nav() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    queryClient.clear();
    router.push('/login');
    router.refresh();
  }

  if (!session) return null;

  const links = [...(LINKS_BY_ROLE[session.role] ?? [])];
  if (session.isKurinniy) {
    links.splice(1, 0, { href: '/users', label: 'Юнаки' }, { href: '/vykhovnyk-assignments', label: 'Виховники' });
  }

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

- [ ] **Step 5: `app/page.tsx`**

Remove the `KURINNYI: '/proby',` line from `HOME_BY_ROLE` (a kurinniy-holder's `role` is `JUNAK`, already covered by the existing `JUNAK: '/proby'` line — no other change needed in this file).

- [ ] **Step 6: `app/users/page.tsx`**

Replace the full content of `apps/web/app/users/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useUsers } from '@/lib/queries/users';
import { ROLE_LABELS } from '@/lib/role-labels';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';
import type { Role } from '@/lib/types';

const ZVYAZKOVYI_FILTERS: { value: Role | undefined; label: string }[] = [
  { value: undefined, label: 'Усі' },
  { value: 'JUNAK', label: 'Юнаки' },
  { value: 'VYKHOVNYK', label: 'Виховники' },
];

const KURINNIY_FILTERS: { value: Role | undefined; label: string }[] = [
  { value: undefined, label: 'Юнаки' },
  { value: 'VYKHOVNYK', label: 'Виховники' },
  { value: 'ZVYAZKOVYI', label: "Зв'язковий" },
];

export default function UsersPage() {
  const { data: session } = useSession();
  const [roleFilter, setRoleFilter] = useState<Role | undefined>(undefined);
  const { data: users, isLoading, isError, error } = useUsers({ role: roleFilter });

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error)}</p>;

  const filters = session?.role === 'ZVYAZKOVYI' ? ZVYAZKOVYI_FILTERS : session?.isKurinniy ? KURINNIY_FILTERS : [];
  const canCreate = session?.role === 'ZVYAZKOVYI' || session?.isKurinniy;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Люди куреня</h1>
      {canCreate && (
        <Link href="/users/new">
          <Button size="sm">Додати людину</Button>
        </Link>
      )}
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
                <span className="text-sm text-muted-foreground">{ROLE_LABELS[u.role]}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: `app/users/new/page.tsx`**

Remove this line from `ZvyazkovyiDirectCreateForm`'s role `<select>`:

```tsx
              <option value="KURINNYI">Курінний</option>
```

Change:

```ts
  const needsHurtok = role === 'JUNAK' || role === 'KURINNYI';
```

to:

```ts
  const needsHurtok = role === 'JUNAK';
```

At the bottom of the file, change:

```tsx
export default function NewUserPage() {
  const { data: session } = useSession();

  if (session?.role === 'ZVYAZKOVYI') {
    return <ZvyazkovyiDirectCreateForm />;
  }
  return <KurinnyiApprovalRequestForm />;
}
```

to:

```tsx
export default function NewUserPage() {
  const { data: session } = useSession();

  if (session?.role === 'ZVYAZKOVYI') {
    return <ZvyazkovyiDirectCreateForm />;
  }
  if (session?.isKurinniy) {
    return <KurinnyiApprovalRequestForm />;
  }
  return null;
}
```

- [ ] **Step 8: `app/users/[id]/page.tsx`**

Change:

```ts
  const canEditContactInfo =
    (session?.role === 'ZVYAZKOVYI' || session?.role === 'KURINNYI') && user.role === 'JUNAK';
```

to:

```ts
  const canEditContactInfo =
    (session?.role === 'ZVYAZKOVYI' || session?.isKurinniy) && user.role === 'JUNAK';
```

Change:

```tsx
      {session?.role === 'KURINNYI' && user.role === 'JUNAK' && (
```

to:

```tsx
      {session?.isKurinniy && user.role === 'JUNAK' && (
```

- [ ] **Step 9: Write the e2e test**

Create `apps/web/e2e/kurinniy-junak.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('a junak with the kurinniy position sees the extended nav and can list users', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junakEmail = `junak-kurinniy-${Date.now()}@example.com`;
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: junak.id, scope: 'KURIN', positionType: 'KURINNYI' },
  });

  await loginAs(page, junakEmail, 'password123');

  await expect(page.getByRole('link', { name: 'Юнаки' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Виховники' })).toBeVisible();

  await page.getByRole('link', { name: 'Юнаки' }).click();
  await expect(page).toHaveURL(/\/users$/);
});
```

Check `apps/web/e2e/helpers/proby-seed.ts`'s `createUserAs` return shape before using `junak.id` above — if it doesn't already return the created user's `id`, adjust this test to fetch it another way (e.g. via the zvyazkovyi's `GET /users?role=JUNAK` list) rather than modifying the shared helper, since other tests depend on its current shape.

- [ ] **Step 10: Run the tests**

Run: `cd apps/web && npx tsc --noEmit` — expect clean.

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test`
Expected: the full suite passes, including the two new files from this plan (`positions.spec.ts` from Task 5, `kurinniy-junak.spec.ts` from this task) and every pre-existing spec.

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/types.ts apps/web/app/api/session/route.ts apps/web/lib/role-labels.ts apps/web/components/nav.tsx apps/web/app/page.tsx apps/web/app/users/page.tsx apps/web/app/users/new/page.tsx apps/web/app/users/[id]/page.tsx apps/web/e2e/kurinniy-junak.spec.ts
git commit -m "refactor: migrate frontend role==='KURINNYI' checks to session.isKurinniy"
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

Then, before deploying: this plan's migrations (Task 1's additive one, Task 4's enum-shrink one) apply automatically via the existing `git pull && docker compose up -d --build` flow on the VPS (the container's start command already runs `prisma migrate deploy`). No new environment variables are needed. The production database's one test-only `role = 'KURINNYI'` account is converted to `JUNAK` automatically by Task 4's migration — it will simply appear as an ordinary junak with no position afterward.
