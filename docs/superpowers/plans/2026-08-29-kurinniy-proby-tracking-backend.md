# Kurinniy Proby Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a KURINNYI user have their own tracked proby progress (view it, have a viховник confirm/unconfirm their points, have it carried over when the kurin's proby program changes) — the same three code paths that already work for JUNAK.

**Architecture:** One shared constant (`PROBY_TRACKING_ROLES = [Role.JUNAK, Role.KURINNYI]`) replaces three hardcoded `role === Role.JUNAK` checks. No new tables, no Prisma migration, no new modules — this is a targeted widening of existing authorization logic in two existing files.

**Tech Stack:** NestJS, Prisma (PostgreSQL 16), Jest + supertest for e2e — same stack and test infrastructure as the rest of `apps/api`.

## Global Constraints

- **No schema changes.** `User.role` stays a single enum field; no new Prisma model or column. This is a structural property of the KURINNYI role, not a per-user flag (see spec's "Механізм" section for the reasoning).
- **Scope is exactly KURINNYI + JUNAK.** VYKHOVNYK and ZVYAZKOVYI do not track proby progress — do not add them to `PROBY_TRACKING_ROLES`.
- **Tenant isolation and existing 403/404 semantics are unchanged** for every role except the two specific KURINNYI-related checks this plan touches. Every existing test in `proby-progress.e2e-spec.ts`, `proby-progress-confirm.e2e-spec.ts`, `proby-progress-unconfirm.e2e-spec.ts`, and `kurins-proby-program.e2e-spec.ts` must continue to pass unchanged.
- **Test infra:** e2e tests follow the exact existing boilerplate already used throughout `apps/api/test/*.e2e-spec.ts` — `Test.createTestingModule({ imports: [AppModule] })`, a raw `PrismaClient` pointed at `process.env.DATABASE_URL_TEST`, `cleanDatabase()` in `beforeEach`, and the fixtures in `test/utils/fixtures.ts` (`createProbyProgramTree`, `createKurin`, `createUser`, `issueTokenFor`).
- **Run e2e tests with:** `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/<file>.e2e-spec.ts` (run from `apps/api/`).

---

## Task 1: Widen proby-tracking role checks to include KURINNYI

**Files:**
- Create: `apps/api/src/common/proby-tracking-roles.ts`
- Modify: `apps/api/src/proby-progress/proby-progress.service.ts`
- Modify: `apps/api/src/kurins/kurins.service.ts`
- Test: `apps/api/test/proby-progress.e2e-spec.ts` (add 2 tests)
- Test: `apps/api/test/proby-progress-confirm.e2e-spec.ts` (add 2 tests)
- Test: `apps/api/test/kurins-proby-program.e2e-spec.ts` (add 1 test)

**Interfaces:**
- Consumes: `Role` enum (`@prisma/client`), `PrismaService`, `CurrentUserPayload` (`apps/api/src/common/decorators/current-user.decorator.ts`) — all pre-existing.
- Produces: `PROBY_TRACKING_ROLES: Role[]` exported from `apps/api/src/common/proby-tracking-roles.ts` — this is the only task in this plan, nothing downstream depends on it.

- [ ] **Step 1: Create the shared constant**

Create `apps/api/src/common/proby-tracking-roles.ts`:

```ts
import { Role } from '@prisma/client';

export const PROBY_TRACKING_ROLES: Role[] = [Role.JUNAK, Role.KURINNYI];
```

- [ ] **Step 2: Add the failing tests for `GET /junaky/:id/progress`**

In `apps/api/test/proby-progress.e2e-spec.ts`, insert these two tests immediately after the existing `it('forbids kurinnyi from viewing proby progress', ...)` test (which stays unchanged — it already covers a kurinnyi viewing a *junak's* progress, still forbidden) and before `it('returns 404 for a junak in another kurin', ...)`:

```ts
  it('lets a kurinnyi view their own progress', async () => {
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: kurinnyi.id, pointId: points[0].id, status: ProgressStatus.DONE },
    });
    const token = issueTokenFor(jwtService, kurinnyi);

    const response = await request(app.getHttpServer())
      .get(`/junaky/${kurinnyi.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].status).toBe(ProgressStatus.DONE);
  });

  it("forbids a kurinnyi from viewing another kurinnyi's progress", async () => {
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const otherKurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: kurinnyi.id, pointId: points[0].id, status: ProgressStatus.DONE },
    });
    const token = issueTokenFor(jwtService, otherKurinnyi);

    await request(app.getHttpServer())
      .get(`/junaky/${kurinnyi.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
```

- [ ] **Step 3: Add the failing tests for confirming a kurinnyi's point**

In `apps/api/test/proby-progress-confirm.e2e-spec.ts`, insert these two tests immediately after the existing `it('returns 404 when the pointId does not exist', ...)` test, before the closing `});` of the `describe` block:

```ts
  it('lets any vykhovnyk in the kurin confirm a point for a hurtokless kurinnyi', async () => {
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const token = issueTokenFor(jwtService, vykhovnyk);

    const response = await request(app.getHttpServer())
      .post(`/junaky/${kurinnyi.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(response.body.status).toBe(ProgressStatus.DONE);
  });

  it('forbids a vykhovnyk from another kurin from confirming a point for a kurinnyi', async () => {
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const kurinnyiA = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurinA.id });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'B', kurinId: kurinB.id } });
    const vykhovnykB = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurinB.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnykB.id, hurtokId: hurtokB.id } });
    const token = issueTokenFor(jwtService, vykhovnykB);

    await request(app.getHttpServer())
      .post(`/junaky/${kurinnyiA.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
```

- [ ] **Step 4: Add the failing test for proby-program migration**

In `apps/api/test/kurins-proby-program.e2e-spec.ts`, insert this test immediately after the existing `it('carries over a DONE point via the mapping and preserves the old record', ...)` test, before `it('leaves an unmapped DONE point untouched with no new row created', ...)`:

```ts
  it("carries over a kurinnyi's DONE point via the mapping, same as a junak's", async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Вузли (стара)']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Вузли (нова)']);
    await prisma.pointMapping.create({
      data: { oldPointId: oldTree.points[0].id, newPointId: newTree.points[0].id },
    });
    const kurin = await createKurin(prisma, { probyProgramId: oldTree.program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: kurinnyi.id, pointId: oldTree.points[0].id, status: ProgressStatus.DONE },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/proby-program`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newProgramId: newTree.program.id })
      .expect(200);

    const newProgress = await prisma.junakProgress.findUnique({
      where: { junakId_pointId: { junakId: kurinnyi.id, pointId: newTree.points[0].id } },
    });
    expect(newProgress?.status).toBe(ProgressStatus.DONE);
    expect(newProgress?.transferredFromPointId).toBe(oldTree.points[0].id);
  });
```

- [ ] **Step 5: Run the three test files to verify the 5 new tests fail**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/proby-progress.e2e-spec.ts test/proby-progress-confirm.e2e-spec.ts test/kurins-proby-program.e2e-spec.ts`
Expected: FAIL — the 5 new tests fail (kurinnyi gets 403/404 instead of the expected 200s and the migration doesn't carry over the kurinnyi's point), the pre-existing tests in these files still pass.

- [ ] **Step 6: Update `proby-progress.service.ts`**

Replace the full contents of `apps/api/src/proby-progress/proby-progress.service.ts` with:

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProgressAction, ProgressStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PROBY_TRACKING_ROLES } from '../common/proby-tracking-roles';

@Injectable()
export class ProbyProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async getProgressFor(junakId: string, actor: CurrentUserPayload) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || !PROBY_TRACKING_ROLES.includes(junak.role) || junak.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found');
    }

    if (actor.role === Role.JUNAK && actor.userId !== junakId) {
      throw new ForbiddenException("Cannot view another junak's progress");
    }

    if (actor.role === Role.KURINNYI && actor.userId !== junakId) {
      throw new ForbiddenException("Kurinnyi cannot view another user's proby progress");
    }

    if (actor.role === Role.VYKHOVNYK) {
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId: junak.hurtokId ?? undefined },
      });
      if (!assigned) {
        throw new ForbiddenException("Not assigned to this junak's hurtok");
      }
    }

    return this.prisma.junakProgress.findMany({
      where: { junakId },
      include: { point: true },
    });
  }

  async confirm(junakId: string, pointId: string, actor: CurrentUserPayload) {
    await this.assertAssignedVykhovnyk(junakId, actor);
    await this.assertPointExists(pointId);
    const progress = await this.prisma.junakProgress.upsert({
      where: { junakId_pointId: { junakId, pointId } },
      update: { status: ProgressStatus.DONE, confirmedById: actor.userId, confirmedAt: new Date() },
      create: {
        junakId,
        pointId,
        status: ProgressStatus.DONE,
        confirmedById: actor.userId,
        confirmedAt: new Date(),
      },
    });
    await this.prisma.progressAuditLog.create({
      data: { junakId, pointId, action: ProgressAction.CONFIRM, actorId: actor.userId },
    });
    return progress;
  }

  async unconfirm(junakId: string, pointId: string, actor: CurrentUserPayload) {
    await this.assertAssignedVykhovnyk(junakId, actor);
    await this.assertPointExists(pointId);
    const progress = await this.prisma.junakProgress.upsert({
      where: { junakId_pointId: { junakId, pointId } },
      update: { status: ProgressStatus.NOT_DONE, confirmedById: null, confirmedAt: null },
      create: { junakId, pointId, status: ProgressStatus.NOT_DONE },
    });
    await this.prisma.progressAuditLog.create({
      data: { junakId, pointId, action: ProgressAction.UNCONFIRM, actorId: actor.userId },
    });
    return progress;
  }

  private async assertPointExists(pointId: string) {
    const point = await this.prisma.probyPoint.findUnique({ where: { id: pointId } });
    if (!point) {
      throw new NotFoundException('Point not found');
    }
  }

  private async assertAssignedVykhovnyk(junakId: string, actor: CurrentUserPayload) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || !PROBY_TRACKING_ROLES.includes(junak.role) || junak.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found');
    }
    const assigned = await this.prisma.vykhovnykHurtok.findFirst({
      where: { vykhovnykId: actor.userId, hurtokId: junak.hurtokId ?? undefined },
    });
    if (!assigned) {
      throw new ForbiddenException("Not assigned to this junak's hurtok");
    }
    return junak;
  }
}
```

The only changes from the original file: the new `PROBY_TRACKING_ROLES` import; both `role !== Role.JUNAK` checks (in `getProgressFor` and `assertAssignedVykhovnyk`) became `!PROBY_TRACKING_ROLES.includes(junak.role)`; and the old unconditional `if (actor.role === Role.KURINNYI) throw ...` block became a self-view carve-out (`actor.userId !== junakId`), mirroring the JUNAK rule directly above it.

- [ ] **Step 7: Update `kurins.service.ts`**

Replace the full contents of `apps/api/src/kurins/kurins.service.ts` with:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ProgressAction, ProgressStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PROBY_TRACKING_ROLES } from '../common/proby-tracking-roles';

@Injectable()
export class KurinsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(kurinId: string) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    return kurin;
  }

  async changeProbyProgram(kurinId: string, newProgramId: string, actorId: string) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) throw new NotFoundException('Kurin not found');

    const newProgram = await this.prisma.probyProgram.findUnique({ where: { id: newProgramId } });
    if (!newProgram) throw new NotFoundException('Proby program not found');

    if (kurin.probyProgramId === newProgramId) {
      return kurin;
    }

    const oldProgramId = kurin.probyProgramId;
    const junaky = await this.prisma.user.findMany({
      where: { kurinId, role: { in: PROBY_TRACKING_ROLES } },
      select: { id: true },
    });

    for (const junak of junaky) {
      const doneOldEntries = await this.prisma.junakProgress.findMany({
        where: {
          junakId: junak.id,
          status: ProgressStatus.DONE,
          point: { category: { stage: { programId: oldProgramId } } },
        },
      });

      for (const entry of doneOldEntries) {
        const mapping = await this.prisma.pointMapping.findFirst({
          where: {
            OR: [{ oldPointId: entry.pointId }, { newPointId: entry.pointId }],
          },
        });
        if (!mapping) continue;

        const targetPointId =
          mapping.oldPointId === entry.pointId ? mapping.newPointId : mapping.oldPointId;

        const existingTarget = await this.prisma.junakProgress.findUnique({
          where: { junakId_pointId: { junakId: junak.id, pointId: targetPointId } },
        });

        await this.prisma.junakProgress.upsert({
          where: { junakId_pointId: { junakId: junak.id, pointId: targetPointId } },
          update: {},
          create: {
            junakId: junak.id,
            pointId: targetPointId,
            status: ProgressStatus.DONE,
            confirmedById: entry.confirmedById,
            confirmedAt: entry.confirmedAt,
            transferredFromPointId: entry.pointId,
          },
        });

        if (!existingTarget) {
          await this.prisma.progressAuditLog.create({
            data: {
              junakId: junak.id,
              pointId: targetPointId,
              action: ProgressAction.CONFIRM,
              actorId,
            },
          });
        }
      }
    }

    return this.prisma.kurin.update({
      where: { id: kurinId },
      data: { probyProgramId: newProgramId },
    });
  }
}
```

Note: `Role` is removed from the `@prisma/client` import — it was only used for the now-replaced `role: Role.JUNAK` filter, and an unused import will fail the TypeScript build. Everything else in the file is unchanged from the original.

- [ ] **Step 8: Run the three test files to verify all tests pass**

Run: `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- test/proby-progress.e2e-spec.ts test/proby-progress-confirm.e2e-spec.ts test/kurins-proby-program.e2e-spec.ts`
Expected: PASS — all tests in all three files pass (the 5 new tests plus every pre-existing test in these files)

- [ ] **Step 9: Run the full e2e and unit suites to check for regressions**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: PASS — every suite in the project green (including `proby-progress-unconfirm.e2e-spec.ts`, which is untouched by this plan but shares `assertAssignedVykhovnyk` with `confirm` and must still pass unchanged)

Run: `cd apps/api && npm test`
Expected: PASS — unit suites unaffected (this plan touches no unit-tested code)

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/common/proby-tracking-roles.ts apps/api/src/proby-progress/proby-progress.service.ts apps/api/src/kurins/kurins.service.ts apps/api/test/proby-progress.e2e-spec.ts apps/api/test/proby-progress-confirm.e2e-spec.ts apps/api/test/kurins-proby-program.e2e-spec.ts
git commit -m "feat: let kurinnyi track their own proby progress"
```
