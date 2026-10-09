# Курінь Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate `/kurin`, `/positions`, `/hurtky`, and `/users` into one accordion-based `/kurin` page, with a real position-aware authorization pass (kurinniy, KURIN-scope suddia) replacing today's `@Roles(ZVYAZKOVYI)`-only gates, and a new request-based hurtok-move flow for kurinniy/suddia.

**Architecture:** Backend tasks (1-5) first widen authorization on `kurin-positions`, `hurtky`, `vykhovnyk-assignments`, `users`, and `approval-requests` so the right roles can reach the right data. Frontend tasks (6-10) then build the single `/kurin` accordion page by absorbing the four existing pages' logic into five sections, section-by-section, reusing existing components (`HurtokDetailPanel`, `HurtokSettingsDialog`, `PositionSlot`-style rows, the `/users` list) rather than rewriting them. Task 11 deletes the now-dead routes. Task 12 is the final integration test and full regression run.

**Tech Stack:** NestJS + Prisma (API), Next.js App Router + React Query (web), Jest supertest e2e (API), Playwright e2e (web).

## Global Constraints

- No Prisma schema or migration changes anywhere in this plan — every change is authorization logic or UI.
- "KURIN-scope suddia" is always expressed as `actor.positions.includes(PositionType.SUDDIA)` (backend) / `session.positions.includes('SUDDIA')` (frontend) — `positions` already only ever contains KURIN-scope positions (`common/positions.util.ts`'s `getActiveKurinPositions` hard-filters `scope: KURIN`), so no new session claim is needed anywhere in this plan.
- Kurinniy (`actor.isKurinniy`) must never be able to assign into, remove, or otherwise touch a `KurinPosition` row where `positionType === 'KURINNYI'` — this applies at the service layer, not just the UI, and is covered by its own backend e2e tests in Task 1.
- Every cross-tenant check in this plan follows the existing codebase pattern exactly: `findUnique` the target, then `if (!x || x.kurinId !== actor.kurinId) throw new NotFoundException(...)`.
- Run `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test"` before every `cd apps/api && npm run test:e2e` invocation.
- Before any Playwright run, confirm `apps/web/playwright.config.ts` has the local-only sandbox addition `use.launchOptions.executablePath: '/opt/pw-browsers/chromium'` — restore it if a prior `git` operation reverted it. Never commit this line.
- Never run the API Jest e2e suite and the Playwright suite concurrently in the background — both spin up their own NestJS server against the shared `plast_test` database; run them sequentially.
- `apps/web/AGENTS.md` / `CLAUDE.md`: this Next.js version differs from training data — check `node_modules/next/dist/docs/` before writing any new Next.js API usage not already demonstrated elsewhere in this plan.
- **Correction found during Task 7's implementation, applies to every e2e snippet below that uses `page.getByRole('heading', { name: '...' })` against an accordion section title or a `CardTitle` (Tasks 8, 9, 10, 12):** `CardTitle` (`apps/web/components/ui/card.tsx`) is typed `React.ComponentProps<"div">` — it renders a plain `<div>`, never an ARIA heading role — so `getByRole('heading', ...)` never matches it, for `.click()`, `.toBeVisible()`, or `.toHaveCount(...)` alike. Worse, on a `.toHaveCount(0)` presence-check this silently gives a false pass (zero heading-role elements always exist, whether the section is rendered or not), not a failure — so this is not a flaky-selector nuisance, it's a test that can't tell true from false. Wherever this plan's e2e code below says `page.getByRole('heading', { name: X })`, use `page.getByText(X)` instead — this is the exact pattern already established and merged in `apps/web/e2e/hurtky-accordion.spec.ts` (`page.getByText('Орлики').click()`). If a given `getByText(X)` turns out to match more than one element on the page (e.g. the same label appears in both a collapsed row and its own expanded content), scope it the same way the existing `positions.spec.ts` tests already do — e.g. `page.locator('[data-slot="card"]').filter({ hasText: X })` — rather than reverting to `getByRole('heading', ...)`.

---

## Task 1: Kurin-positions authorization — kurinniy can manage Провід куреня, except the Курінний slot

**Files:**
- Modify: `apps/api/src/kurin-positions/kurin-positions.controller.ts`
- Modify: `apps/api/src/kurin-positions/kurin-positions.service.ts`
- Modify: `apps/api/test/kurin-positions.e2e-spec.ts`

**Interfaces:**
- Consumes: `CurrentUserPayload` (`userId`, `role`, `kurinId`, `isKurinniy`, `positions: PositionType[]`) from `common/decorators/current-user.decorator.ts`. `AssignPositionDto` (`userId`, `scope`, `positionType`, `hurtokId?`) from `kurin-positions/dto/assign-position.dto.ts`.
- Produces: `KurinPositionsService.assign(dto, actor)` and `.remove(id, actor)` now throw `ForbiddenException` for a kurinniy actor touching a `KURINNYI` slot (assigning positionType `KURINNYI`, or removing/replacing a position record whose `positionType === 'KURINNYI'`), and otherwise allow a kurinniy actor through for any other KURIN-scope position. `list()` is unchanged (already open to any `@Roles`-cleared caller once the decorator below is relaxed).

- [x] **Step 1: Write the failing e2e tests**

Append to `apps/api/test/kurin-positions.e2e-spec.ts` (add the import of `createKurinniyUser` to the existing fixtures import on line 8, then add these tests before the final closing `});`):

```ts
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';
```

```ts
  it('lets kurinniy assign a non-Курінний kurin-scoped position', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinniy);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'KURIN', positionType: 'PYSAR' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const list = await request(app.getHttpServer())
      .get('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.find((p: { positionType: string }) => p.positionType === 'PYSAR').user.id).toBe(junak.id);
  });

  it('forbids kurinniy from assigning the Курінний slot', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinniy);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'KURIN', positionType: 'KURINNYI' })
      .expect(403);
  });

  it('forbids kurinniy from removing his own Курінний position record', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinniy);
    const ownPosition = await prisma.kurinPosition.findFirstOrThrow({
      where: { userId: kurinniy.id, positionType: 'KURINNYI' },
    });

    await request(app.getHttpServer())
      .delete(`/kurin-positions/${ownPosition.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('forbids kurinniy from removing any other Курінний position record', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const otherKurinniyHolder = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const otherKurinniyPosition = await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: 'KURIN',
        positionType: 'SUDDIA',
        userId: otherKurinniyHolder.id,
        assignedById: zvyazkovyi.id,
      },
    });
    const token = issueTokenFor(jwtService, kurinniy);

    // sanity: kurinniy CAN remove a non-Курінний record
    await request(app.getHttpServer())
      .delete(`/kurin-positions/${otherKurinniyPosition.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('still forbids a plain junak (no kurinniy) from assigning any kurin position', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const plainJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const target = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, plainJunak);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.id, scope: 'KURIN', positionType: 'PYSAR' })
      .expect(403);
  });
```

- [x] **Step 2: Run the new tests to verify they fail**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- kurin-positions`
Expected: the 5 new tests FAIL (the first four with 403 where 200/201 is expected or vice versa, because the controller still hard-gates on `@Roles(Role.ZVYAZKOVYI)` and a kurinniy's `role` is `JUNAK`).

- [x] **Step 3: Relax the controller decorator, add position-aware checks in the service**

In `apps/api/src/kurin-positions/kurin-positions.controller.ts`, remove `@Roles(Role.ZVYAZKOVYI)` from `list`, `assign`, and `remove` (delete all three `@Roles(Role.ZVYAZKOVYI)` lines and the now-unused `Role` import if nothing else in the file uses it — check with `grep -n Role apps/api/src/kurin-positions/kurin-positions.controller.ts` after removing). The file becomes:

```ts
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { KurinPositionsService } from './kurin-positions.service';
import { AssignPositionDto } from './dto/assign-position.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kurin-positions')
export class KurinPositionsController {
  constructor(private readonly service: KurinPositionsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user.kurinId);
  }

  @Post()
  assign(@Body() dto: AssignPositionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.assign(dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }
}
```

In `apps/api/src/kurin-positions/kurin-positions.service.ts`, add an authorization check as the first statement of `assign()` (right after the opening `{` on the `async assign(dto: AssignPositionDto, actor: CurrentUserPayload) {` line) and of `remove()`:

```ts
  async assign(dto: AssignPositionDto, actor: CurrentUserPayload) {
    const isKurinScopeKurinniyAssignment = dto.scope === PositionScope.KURIN && dto.positionType === 'KURINNYI';
    if (actor.role !== Role.ZVYAZKOVYI) {
      if (!actor.isKurinniy || isKurinScopeKurinniyAssignment) {
        throw new ForbiddenException('Insufficient permissions to assign this position');
      }
    }
    if (dto.scope === PositionScope.KURIN) {
```

Note: the existing `if (dto.scope === PositionScope.KURIN) {` line that currently follows the opening of the method stays — the new block above is inserted before it, and its closing structure does not change the existing `if`/`else` that validates `KURIN_POSITIONS`/`HURTOK_POSITIONS` membership.

```ts
  async remove(id: string, actor: CurrentUserPayload) {
    const position = await this.prisma.kurinPosition.findUnique({ where: { id } });
    if (!position || position.kurinId !== actor.kurinId || position.removedAt) {
      throw new NotFoundException('Position not found');
    }
    if (actor.role !== Role.ZVYAZKOVYI) {
      if (!actor.isKurinniy || position.positionType === 'KURINNYI') {
        throw new ForbiddenException('Insufficient permissions to remove this position');
      }
    }
    await this.prisma.kurinPosition.update({
      where: { id },
      data: { removedAt: new Date(), removedById: actor.userId },
    });
    return { success: true };
  }
```

Add `ForbiddenException` to the existing `@nestjs/common` import at the top of `kurin-positions.service.ts` (it currently imports `BadRequestException, Injectable, NotFoundException`).

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- kurin-positions`
Expected: all tests in `kurin-positions.e2e-spec.ts` PASS (the 8 pre-existing ones plus the 5 new ones).

- [x] **Step 5: Run the full API e2e suite to check for regressions**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: all suites PASS, no regressions (the pre-existing `'forbids a junak from assigning a position'` test used a plain junak with no position, which still gets 403 from the new logic).

- [x] **Step 6: Commit**

```bash
git add apps/api/src/kurin-positions apps/api/test/kurin-positions.e2e-spec.ts
git commit -m "feat: let kurinniy manage Провід куреня, except the Курінний slot"
```

---

## Task 2: Hurtky authorization — open read access, add suddia edit access

**Files:**
- Modify: `apps/api/src/hurtky/hurtky.controller.ts`
- Modify: `apps/api/src/hurtky/hurtky.service.ts`
- Modify: `apps/api/test/hurtky-slug.e2e-spec.ts`
- Modify: `apps/api/test/hurtky-update.e2e-spec.ts`
- Modify: `apps/api/test/hurtky-archive.e2e-spec.ts`
- Modify: `apps/api/test/utils/fixtures.ts`

**Interfaces:**
- Consumes: `CurrentUserPayload`, `UpdateHurtokDto` (`foundedAt?: string | null`), both from Task 1's unchanged definitions.
- Produces: a new fixture `createKurinSuddiaUser(prisma, { kurinId, hurtokId?, email?, password? })` in `apps/api/test/utils/fixtures.ts`, mirroring `createKurinniyUser` exactly but with `positionType: PositionType.SUDDIA`. `HurtkyController.membersBySlug` is reachable by any authenticated role (no `@Roles` left on it). `HurtkyService.update`/`archiveHurtok` accept a KURIN-scope suddia actor in addition to `ZVYAZKOVYI`. `HurtkyService.getMembersBySlug` no longer restricts a `VYKHOVNYK` actor to only their assigned hurtok.

- [x] **Step 1: Add the `createKurinSuddiaUser` fixture**

In `apps/api/test/utils/fixtures.ts`, add this function right after `createKurinniyUser`:

```ts
export async function createKurinSuddiaUser(
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
      positionType: PositionType.SUDDIA,
      userId: user.id,
      assignedById: user.id,
    },
  });
  return user;
}
```

- [x] **Step 2: Write the failing e2e tests**

In `apps/api/test/hurtky-slug.e2e-spec.ts`, add `createKurinniyUser, createKurinSuddiaUser` to the fixtures import and append these tests (adjust the exact fixture-import list to whatever the file already imports, adding the two new names):

```ts
  it('lets a plain junak read a hurtok by slug (read-only tier)', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики', slug: 'orlyky' } });
    const plainJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, plainJunak);

    await request(app.getHttpServer())
      .get('/hurtky/by-slug/orlyky')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('lets a plain vykhovnyk read a hurtok they are not assigned to', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Соколи', slug: 'sokoly' } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get('/hurtky/by-slug/sokoly')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
```

In `apps/api/test/hurtky-update.e2e-spec.ts`, append (adding `createKurinSuddiaUser` to the fixtures import):

```ts
  it('lets a KURIN-scope suddia update a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const suddia = await createKurinSuddiaUser(prisma, { kurinId: kurin.id });
    const token = issueTokenFor(jwtService, suddia);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: '2020-01-01' })
      .expect(200);
  });

  it('still forbids a plain vykhovnyk from updating a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: '2020-01-01' })
      .expect(403);
  });
```

In `apps/api/test/hurtky-archive.e2e-spec.ts`, append (adding `createKurinSuddiaUser` to the fixtures import):

```ts
  it('lets a KURIN-scope suddia archive an empty hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const suddia = await createKurinSuddiaUser(prisma, { kurinId: kurin.id });
    const token = issueTokenFor(jwtService, suddia);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
```

- [x] **Step 3: Run the new tests to verify they fail**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- hurtky-slug hurtky-update hurtky-archive`
Expected: the plain-junak-reads-by-slug test fails with 403 (JUNAK not in `@Roles(VYKHOVNYK, ZVYAZKOVYI)`); the plain-vykhovnyk-reads-unassigned-hurtok test fails with 404 (the `getMembersBySlug` assignment check); the suddia update/archive tests fail with 403.

- [x] **Step 4: Implement**

In `apps/api/src/hurtky/hurtky.controller.ts`, change the three relevant decorators/routes:

```ts
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHurtokDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.archiveHurtok(id, user);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.listForKurin(user.kurinId);
  }

  @Get('by-slug/:slug')
  membersBySlug(@Param('slug') slug: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getMembersBySlug(slug, user);
  }
```

(Only `create` keeps `@Roles(Role.ZVYAZKOVYI)` — creating a brand-new hurtok is unchanged by this plan.) Remove the now-unused `Role` import only if `create`'s decorator is the sole remaining use — it is, since `create` still needs `import { Role } from '@prisma/client';`, so leave that import in place.

In `apps/api/src/hurtky/hurtky.service.ts`, add the suddia check to `update` and `archiveHurtok` (insert as the first statement inside each method, right after the `async update(...)  {` / `async archiveHurtok(...) {` line):

```ts
  async update(hurtokId: string, dto: UpdateHurtokDto, actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.SUDDIA)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const hurtok = await this.prisma.hurtok.findUnique({ where: { id: hurtokId } });
```

```ts
  async archiveHurtok(hurtokId: string, actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.SUDDIA)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const hurtok = await this.prisma.hurtok.findUnique({ where: { id: hurtokId } });
```

Update the imports at the top of `hurtky.service.ts` from `import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';` to `import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';`, and from `import { Role } from '@prisma/client';` to `import { PositionType, Role } from '@prisma/client';`.

Remove the `VYKHOVNYK`-only-assigned-hurtok restriction in `getMembersBySlug` — delete this block entirely:

```ts
    if (actor.role === Role.VYKHOVNYK) {
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId: hurtok.id },
      });
      if (!assigned) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }
```

(Every caller is already scoped to `kurinId: actor.kurinId` on the `hurtok` lookup two lines above, so dropping this block only removes the extra VYKHOVNYK-specific restriction — it does not open cross-tenant access.)

- [x] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- hurtky-slug hurtky-update hurtky-archive hurtky-members`
Expected: all PASS.

- [x] **Step 6: Run the full API e2e suite**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: all suites PASS.

- [x] **Step 7: Commit**

```bash
git add apps/api/src/hurtky apps/api/test/hurtky-slug.e2e-spec.ts apps/api/test/hurtky-update.e2e-spec.ts apps/api/test/hurtky-archive.e2e-spec.ts apps/api/test/utils/fixtures.ts
git commit -m "feat: open hurtok read access to all members, let suddia edit hurtky"
```

---

## Task 3: Vykhovnyk-assignments authorization — open read access, add suddia edit access

**Files:**
- Modify: `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.controller.ts`
- Modify: `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.service.ts`
- Modify: `apps/api/test/vykhovnyk-assignments.e2e-spec.ts`
- Modify: `apps/api/test/vykhovnyk-assignments-list.e2e-spec.ts`

**Interfaces:**
- Consumes: `CurrentUserPayload`, `AssignVykhovnykDto` (`vykhovnykId`, `hurtokId`).
- Produces: `VykhovnykAssignmentsService.assign(dto, actor)` / `.unassign(id, actor)` (signatures change from `(dto, actorKurinId: string)` / `(id, actorKurinId: string)` to take the full `actor: CurrentUserPayload`, since the authorization check now needs `actor.role`/`actor.positions`, not just `actor.kurinId`) now accept `ZVYAZKOVYI` or KURIN-scope suddia. `list()`'s existing role check is widened so any authenticated kurin member can read assignments (needed for the read-only Гуртки tier to show vykhovnyk names).

- [x] **Step 1: Write the failing e2e tests**

In `apps/api/test/vykhovnyk-assignments.e2e-spec.ts`, add `createKurinSuddiaUser` to the fixtures import and append:

```ts
  it('lets a KURIN-scope suddia assign and unassign a vykhovnyk', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const suddia = await createKurinSuddiaUser(prisma, { kurinId: kurin.id });
    const token = issueTokenFor(jwtService, suddia);

    const created = await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id })
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .delete(`/vykhovnyk-assignments/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('still forbids a plain junak from assigning a vykhovnyk', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const plainJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, plainJunak);

    await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id })
      .expect(403);
  });
```

In `apps/api/test/vykhovnyk-assignments-list.e2e-spec.ts`, append:

```ts
  it('lets a plain junak (read-only tier) list vykhovnyk assignments', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const plainJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, plainJunak);

    await request(app.getHttpServer())
      .get('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
```

- [x] **Step 2: Run the new tests to verify they fail**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- vykhovnyk-assignments`
Expected: suddia assign/unassign fails with 403 (`@Roles(ZVYAZKOVYI)`); plain junak list fails with 403 (`VykhovnykAssignmentsService.list`'s existing `actor.role !== ZVYAZKOVYI && actor.role !== VYKHOVNYK && !actor.isKurinniy` check).

- [x] **Step 3: Implement**

In `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.controller.ts`, remove both `@Roles(Role.ZVYAZKOVYI)` decorators and change the handlers to pass the full `user`:

```ts
import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { VykhovnykAssignmentsService } from './vykhovnyk-assignments.service';
import { AssignVykhovnykDto } from './dto/assign-vykhovnyk.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vykhovnyk-assignments')
export class VykhovnykAssignmentsController {
  constructor(private readonly service: VykhovnykAssignmentsService) {}

  @Post()
  assign(@Body() dto: AssignVykhovnykDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.assign(dto, user);
  }

  @Delete(':id')
  unassign(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.unassign(id, user);
  }

  @Get()
  list(@Query('hurtokId') hurtokId: string | undefined, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user, hurtokId);
  }
}
```

In `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.service.ts`, change `assign`/`unassign` signatures and add the authorization check, and widen `list`'s check:

```ts
  async assign(dto: AssignVykhovnykDto, actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.SUDDIA)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const [vykhovnyk, hurtok] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.vykhovnykId } }),
      this.prisma.hurtok.findUnique({ where: { id: dto.hurtokId } }),
    ]);
    if (!vykhovnyk || vykhovnyk.role !== Role.VYKHOVNYK || vykhovnyk.kurinId !== actor.kurinId) {
      throw new NotFoundException('Vykhovnyk not found in this kurin');
    }
    if (!hurtok || hurtok.kurinId !== actor.kurinId) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }
    if (vykhovnyk.archivedAt) {
      throw new BadRequestException('Виховник архівований');
    }
    try {
      return await this.prisma.vykhovnykHurtok.create({
        data: { vykhovnykId: dto.vykhovnykId, hurtokId: dto.hurtokId },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('This vykhovnyk is already assigned to this hurtok');
      }
      throw err;
    }
  }

  async unassign(id: string, actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.SUDDIA)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const assignment = await this.prisma.vykhovnykHurtok.findUnique({
      where: { id },
      include: { hurtok: true },
    });
    if (!assignment || assignment.hurtok.kurinId !== actor.kurinId) {
      throw new NotFoundException('Assignment not found');
    }
    await this.prisma.vykhovnykHurtok.delete({ where: { id } });
    return { success: true };
  }

  async list(actor: CurrentUserPayload, hurtokId?: string) {
    if (hurtokId) {
```

(Delete the old `if (actor.role !== Role.ZVYAZKOVYI && actor.role !== Role.VYKHOVNYK && !actor.isKurinniy) { throw new ForbiddenException('Insufficient role'); }` block entirely — every authenticated role may now call `list()`. The `hurtokId` validation block and everything after it in `list()` stays unchanged.)

Change the `assignVykhovnyk`/`unassignVykhovnyk` call sites that previously passed `user.kurinId` — there are none outside this controller/service pair (confirmed by the controller rewrite above already passing `user`), so no other files need updating for this signature change. Add `PositionType` to the `@prisma/client` import in `vykhovnyk-assignments.service.ts` (currently `import { Role } from '@prisma/client';` → `import { PositionType, Role } from '@prisma/client';`) and `ForbiddenException` to the `@nestjs/common` import (currently has `BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException` already — `ForbiddenException` is already imported, no change needed there).

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- vykhovnyk-assignments`
Expected: all PASS.

- [x] **Step 5: Run the full API e2e suite**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: all suites PASS.

- [x] **Step 6: Commit**

```bash
git add apps/api/src/vykhovnyk-assignments apps/api/test/vykhovnyk-assignments.e2e-spec.ts apps/api/test/vykhovnyk-assignments-list.e2e-spec.ts
git commit -m "feat: open vykhovnyk-assignment reads to all members, let suddia edit them"
```

---

## Task 4: Users service authorization — KURIN-scope suddia gets kurinniy-level read access

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/test/users-list.e2e-spec.ts`
- Modify: `apps/api/test/users-detail.e2e-spec.ts`

**Interfaces:**
- Consumes: `CurrentUserPayload`.
- Produces: `UsersService.list()` and `.findScoped()`/`.isVisibleTo()` treat `actor.positions.includes(PositionType.SUDDIA)` the same as `actor.isKurinniy` for read access (list any role, view any user's detail page in-kurin). Write operations (`updateContactInfo`, `updateHurtok`, `archiveUser`) are **not** changed by this task — suddia's write path for archiving/moving a junak goes through the `CHANGE_HURTOK`/`ARCHIVE_JUNAK` approval-request flow (Task 5 and existing code), not direct writes, matching the approved design.

- [x] **Step 1: Write the failing e2e tests**

In `apps/api/test/users-list.e2e-spec.ts`, add `createKurinSuddiaUser` to the fixtures import and append:

```ts
  it('lets a KURIN-scope suddia list junaky and vykhovnyky', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const suddia = await createKurinSuddiaUser(prisma, { kurinId: kurin.id });
    await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, suddia);

    const junaky = await request(app.getHttpServer())
      .get('/users?role=JUNAK')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(junaky.body.length).toBeGreaterThanOrEqual(1);

    const vykhovnyky = await request(app.getHttpServer())
      .get('/users?role=VYKHOVNYK')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(vykhovnyky.body.length).toBeGreaterThanOrEqual(1);
  });
```

In `apps/api/test/users-detail.e2e-spec.ts`, add `createKurinSuddiaUser` to the fixtures import and append:

```ts
  it('lets a KURIN-scope suddia view another junak’s detail page', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const suddia = await createKurinSuddiaUser(prisma, { kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, suddia);

    await request(app.getHttpServer())
      .get(`/users/${junak.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
```

- [x] **Step 2: Run the new tests to verify they fail**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- users-list users-detail`
Expected: both FAIL — `list()` throws 403 (`actor.role === Role.JUNAK && !actor.isKurinniy`), `findScoped()` returns 404 (the early-return branch only allows a non-kurinniy JUNAK to see themselves).

- [x] **Step 3: Implement**

In `apps/api/src/users/users.service.ts`, update the three relevant methods. `list()`'s opening check and `isKurinniy` branch:

```ts
  async list(actor: CurrentUserPayload, filters: { role?: Role; hurtokId?: string }) {
    const isKurinScopeSuddia = actor.positions.includes(PositionType.SUDDIA);
    if (actor.role === Role.JUNAK && !actor.isKurinniy && !isKurinScopeSuddia) {
      throw new ForbiddenException('Junak cannot list users');
    }
    if (actor.role === Role.VYKHOVNYK && filters.role && filters.role !== Role.JUNAK) {
      throw new ForbiddenException('Vykhovnyk can only list junaky');
    }
    if (filters.hurtokId) {
      const hurtok = await this.prisma.hurtok.findUnique({ where: { id: filters.hurtokId } });
      if (!hurtok || hurtok.kurinId !== actor.kurinId) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }

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
          where: {
            kurinId: actor.kurinId,
            role: Role.JUNAK,
            hurtokId: filters.hurtokId,
            archivedAt: null,
          },
          select: USER_SELECT,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });
      }

      return this.prisma.user.findMany({
        where: {
          kurinId: actor.kurinId,
          role: Role.JUNAK,
          archivedAt: null,
          OR: [{ hurtokId: { in: assignedHurtokIds } }, { hurtokId: null }],
        },
        select: USER_SELECT,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    }

    if (actor.isKurinniy || isKurinScopeSuddia) {
      return this.prisma.user.findMany({
        where: {
          kurinId: actor.kurinId,
          role: filters.role ?? Role.JUNAK,
          archivedAt: null,
          ...(filters.hurtokId ? { hurtokId: filters.hurtokId } : {}),
        },
        select: USER_SELECT,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    }

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
  }
```

`findScoped` and `isVisibleTo`:

```ts
  async findScoped(id: string, actor: CurrentUserPayload) {
    const isKurinScopeSuddia = actor.positions.includes(PositionType.SUDDIA);
    if (actor.role === Role.JUNAK && !actor.isKurinniy && !isKurinScopeSuddia) {
      if (actor.userId !== id) {
        throw new NotFoundException('User not found');
      }
      return this.findById(id);
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { ...USER_SELECT, notes: true, phone: true },
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
      return true;
    }
    if (actor.isKurinniy || actor.positions.includes(PositionType.SUDDIA)) {
      return true;
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

Add `PositionType` to the `@prisma/client` import at the top of `users.service.ts` (currently `import { Role } from '@prisma/client';` → `import { PositionType, Role } from '@prisma/client';`).

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- users-list users-detail`
Expected: all PASS.

- [x] **Step 5: Run the full API e2e suite**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: all suites PASS.

- [x] **Step 6: Commit**

```bash
git add apps/api/src/users apps/api/test/users-list.e2e-spec.ts apps/api/test/users-detail.e2e-spec.ts
git commit -m "feat: give KURIN-scope suddia kurinniy-level read access to users"
```

---

## Task 5: Approval-requests — let suddia create a CHANGE_HURTOK request

**Files:**
- Modify: `apps/api/src/approval-requests/approval-requests.service.ts`
- Modify: `apps/api/test/approval-requests-create.e2e-spec.ts`

**Interfaces:**
- Consumes: `CreateApprovalRequestDto` (`actionType`, `junakId?`, `newData`), `CurrentUserPayload`.
- Produces: `ApprovalRequestsService.create()` now also accepts a KURIN-scope suddia actor submitting `actionType: 'CHANGE_HURTOK'`. Kurinniy's existing ability to submit `CHANGE_HURTOK` (already covered by the blanket `actor.isKurinniy` branch) is untouched.

- [x] **Step 1: Write the failing e2e test**

In `apps/api/test/approval-requests-create.e2e-spec.ts`, add `createKurinSuddiaUser` to the fixtures import (check the file's existing import line and add the name) and append:

```ts
  it('lets a KURIN-scope suddia create a CHANGE_HURTOK request', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const suddia = await createKurinSuddiaUser(prisma, { kurinId: kurin.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, suddia);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: 'CHANGE_HURTOK', junakId: junak.id, newData: { hurtokId: hurtok.id } })
      .expect(201);
  });

  it('still forbids a plain junak from creating a CHANGE_HURTOK request', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const plainJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const target = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, plainJunak);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: 'CHANGE_HURTOK', junakId: target.id, newData: { hurtokId: hurtok.id } })
      .expect(403);
  });
```

- [x] **Step 2: Run the new test to verify it fails**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- approval-requests-create`
Expected: the suddia test FAILS with 403 (`create()`'s `canInitiateBulkImport`/`canInitiateArchive`/`isKurinniy` checks don't cover suddia + `CHANGE_HURTOK`).

- [x] **Step 3: Implement**

In `apps/api/src/approval-requests/approval-requests.service.ts`, change the top of `create()`:

```ts
  async create(dto: CreateApprovalRequestDto, actor: CurrentUserPayload) {
    const canInitiateBulkImport =
      dto.actionType === ApprovalActionType.BULK_IMPORT_JUNAKY && actor.positions.includes(PositionType.SUDDIA);
    const canInitiateArchive =
      dto.actionType === ApprovalActionType.ARCHIVE_JUNAK && actor.positions.includes(PositionType.SUDDIA);
    const canInitiateChangeHurtok =
      dto.actionType === ApprovalActionType.CHANGE_HURTOK && actor.positions.includes(PositionType.SUDDIA);
    if (!actor.isKurinniy && !canInitiateBulkImport && !canInitiateArchive && !canInitiateChangeHurtok) {
      throw new ForbiddenException('Only kurinniy can create approval requests');
    }
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- approval-requests-create`
Expected: all PASS.

- [x] **Step 5: Run the full API e2e suite**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: all suites PASS. This is the last backend task — confirm the full suite is green before moving to frontend work.

- [x] **Step 6: Commit**

```bash
git add apps/api/src/approval-requests apps/api/test/approval-requests-create.e2e-spec.ts
git commit -m "feat: let KURIN-scope suddia create a CHANGE_HURTOK approval request"
```

---

## Task 6: Nav simplification — one Курінь link for everyone

**Files:**
- Modify: `apps/web/components/nav.tsx`
- Modify: `apps/web/e2e/kurinniy-junak.spec.ts`
- Modify: `apps/web/e2e/users-role-filter.spec.ts`

**Interfaces:**
- Consumes: `useSession()` → `CurrentUserPayload` (`role`, `isKurinniy`, `positions`).
- Produces: every authenticated session now has exactly one `{ href: '/kurin', label: 'Курінь' }` link (in addition to whatever role-specific links already exist: `Запити`/`Налаштування` for ZVYAZKOVYI, `Моя проба`/`Налаштування` for JUNAK, `Налаштування` for VYKHOVNYK, plus the existing `Облік реманенту`/`Суддівство` pushes and the `Діловодство` dropdown for ZVYAZKOVYI). `/users`, `/hurtky`, and `/positions` nav links are removed.

- [x] **Step 1: Implement**

Replace `apps/web/components/nav.tsx`'s `LINKS_BY_ROLE` and the body of `Nav()` up to the `links` construction:

```tsx
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
```

```tsx
  const links = [...(LINKS_BY_ROLE[session.role] ?? [])];
  if (session.role !== 'ZVYAZKOVYI' && (session.positions.includes('INTENDANT') || session.isKurinniy)) {
    links.push({ href: '/inventory', label: 'Облік реманенту' });
  }
  if (session.role !== 'ZVYAZKOVYI' && (session.positions.includes('SUDDIA') || session.isKurinniy)) {
    links.push({ href: '/suddivstvo', label: 'Суддівство' });
  }
```

(This deletes the old `links.splice(1, 0, { href: '/users', label: 'Юнаки' }, { href: '/hurtky', label: 'Гуртки' });` block entirely — kurinniy already gets `Курінь` from the base `JUNAK` list above, it needs no separate splice anymore. The `Облік реманенту`/`Суддівство` push logic is otherwise unchanged.)

- [x] **Step 2: Update the two e2e specs that assert on removed nav links**

In `apps/web/e2e/kurinniy-junak.spec.ts`, the test currently clicks a `Юнаки` link and asserts `/users`. Replace lines 29-32:

```ts
  await expect(page.getByRole('link', { name: 'Курінь' })).toBeVisible();

  await page.getByRole('link', { name: 'Курінь' }).click();
  await expect(page).toHaveURL(/\/kurin$/);
```

In `apps/web/e2e/users-role-filter.spec.ts`, line 34 currently does `await page.goto('/users');` — this test is fully rewritten in Task 9 (it depends on the new Кадра виховників section), so for this task only change the navigation target so the test doesn't crash early; leave the rest of the test as-is (it will still fail until Task 9, which is expected — this task's own verification step below only checks nav rendering, not this test):

```ts
  await page.goto('/kurin');
```

- [x] **Step 3: Verify nav renders correctly for each role**

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx playwright test e2e/kurinniy-junak.spec.ts`
Expected: PASS.

Note: `users-role-filter.spec.ts` is expected to still fail after this task (it exercises `/kurin`'s Кадра виховників section, built in Task 9) — do not try to make it pass yet.

- [x] **Step 4: Commit**

```bash
git add apps/web/components/nav.tsx apps/web/e2e/kurinniy-junak.spec.ts apps/web/e2e/users-role-filter.spec.ts
git commit -m "feat: collapse nav to a single Курінь link for every role"
```

---

## Task 7: `/kurin` accordion shell + Інформація по куреню + Провід куреня sections

**Files:**
- Create: `apps/web/components/kurin-info-section.tsx`
- Create: `apps/web/components/kurin-provid-section.tsx`
- Modify: `apps/web/app/kurin/page.tsx`
- Modify: `apps/web/e2e/kurin-number.spec.ts`
- Modify: `apps/web/e2e/kurin-settings.spec.ts`
- Modify: `apps/web/e2e/positions.spec.ts`

**Interfaces:**
- Consumes: `useKurin`, `useChangeProbyProgram`, `useChangeKurinNumber` (`lib/queries/kurin.ts`, unchanged), `useKurinPositions`, `useAssignPosition`, `useRemovePosition` (`lib/queries/positions.ts`, unchanged), `useUsers`, `useSession`.
- Produces: `KurinInfoSection` — a self-contained component with no props, rendering exactly what `KurinPageContent` renders today (kurin data, program, Google Drive), gated the same way (`canChangeProgram = session?.role === 'ZVYAZKOVYI'`). `KurinProvidSection` — a self-contained component with no props, rendering the KURIN-scope position list, where each slot's edit controls are gated by a new `canEditSlot(positionType)` helper: `session?.role === 'ZVYAZKOVYI' || (session?.isKurinniy && positionType !== 'KURINNYI')`. `/kurin/page.tsx` becomes the 3-or-5-section accordion shell (this task wires the first two sections; Gurtky/Кадра/Список are wired in Tasks 8-9).

- [x] **Step 1: Extract `KurinInfoSection` from the current `/kurin/page.tsx`**

Create `apps/web/components/kurin-info-section.tsx` with exactly the body of today's `KurinPageContent` (everything from `const { data: kurin, isLoading } = useKurin();` through the closing `</div>` before the final `);`), renamed and exported as a named export instead of the page's default export, and with the `<Suspense>` wrapper's inner-component split no longer needed here — the `<Suspense>` boundary moves to the outer `/kurin/page.tsx` in Step 3, so `KurinInfoSection` keeps its `useSearchParams()` call (for Google Drive query params) but is itself already always rendered inside the page's single top-level `<Suspense>`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useKurin, useChangeProbyProgram, useChangeKurinNumber } from '@/lib/queries/kurin';
import { useSession } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accessErrorMessage } from '@/lib/error-message';
import { ApiError } from '@/lib/api-client';
import { useGoogleDriveStatus, useConnectGoogleDrive, useSetGoogleDriveFolder, fetchGoogleDrivePickerToken } from '@/lib/queries/google-drive';
import { openGoogleDriveFolderPicker } from '@/lib/google-picker';

export function KurinInfoSection() {
  const { data: kurin, isLoading } = useKurin();
  const { data: session } = useSession();
  const changeProgram = useChangeProbyProgram(kurin?.id ?? '');
  const changeKurinNumber = useChangeKurinNumber(kurin?.id ?? '');
  const [newKurinNumber, setNewKurinNumber] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<'OLD' | 'NEW'>('OLD');
  const canChangeProgram = session?.role === 'ZVYAZKOVYI';
  const driveStatus = useGoogleDriveStatus(kurin?.id);
  const connectDrive = useConnectGoogleDrive(kurin?.id ?? '');
  const setDriveFolder = useSetGoogleDriveFolder(kurin?.id ?? '');
  const searchParams = useSearchParams();
  const driveConnected = searchParams.get('driveConnected') === '1';
  const driveError = searchParams.get('driveError') === '1';
  const [pickerError, setPickerError] = useState<string | null>(null);

  async function handlePickFolder() {
    if (!kurin) return;
    setPickerError(null);
    try {
      const accessToken = await fetchGoogleDrivePickerToken(kurin.id);
      await openGoogleDriveFolderPicker(accessToken, (folderId, folderName) => {
        setDriveFolder.mutate({ folderId, folderName });
      });
    } catch {
      setPickerError('Не вдалося відкрити вибір папки. Спробуйте підключити Google Drive повторно.');
    }
  }

  useEffect(() => {
    if (kurin) {
      setSelectedVersion(kurin.probyProgram.version);
    }
  }, [kurin]);

  if (isLoading) return <p>Завантаження...</p>;
  if (!kurin) return <p>Не знайдено.</p>;

  return (
    <div className="space-y-4">
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
                  {changeKurinNumber.error instanceof ApiError && changeKurinNumber.error.status === 409
                    ? 'Цей номер уже зайнятий.'
                    : accessErrorMessage(changeKurinNumber.error)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Програма проб</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Поточна програма: {kurin.probyProgram.version === 'OLD' ? 'Стара' : 'Нова'}
          </p>
          {canChangeProgram && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="programOld"
                  name="probyProgramVersion"
                  value="OLD"
                  checked={selectedVersion === 'OLD'}
                  onChange={() => setSelectedVersion('OLD')}
                />
                <Label htmlFor="programOld">Стара програма</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="programNew"
                  name="probyProgramVersion"
                  value="NEW"
                  checked={selectedVersion === 'NEW'}
                  onChange={() => setSelectedVersion('NEW')}
                />
                <Label htmlFor="programNew">Нова програма</Label>
              </div>
              <Button
                disabled={selectedVersion === kurin.probyProgram.version || changeProgram.isPending}
                onClick={() => {
                  const label = selectedVersion === 'OLD' ? 'СТАРУ' : 'НОВУ';
                  if (window.confirm(`Змінити програму проби куреня на ${label}? Це вплине на прогрес усіх юнаків.`)) {
                    changeProgram.mutate(selectedVersion);
                  }
                }}
              >
                Змінити програму
              </Button>
              {changeProgram.isError && (
                <p className="text-sm text-destructive">{accessErrorMessage(changeProgram.error)}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {canChangeProgram && (
        <Card>
          <CardHeader>
            <CardTitle>Google Drive</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {driveConnected && <p className="text-sm text-green-600">Google Drive підключено.</p>}
            {driveError && (
              <p className="text-sm text-destructive">Не вдалося підключити Google Drive. Спробуйте ще раз.</p>
            )}
            {driveStatus.data?.connected ? (
              <>
                <p>Підключено як: {driveStatus.data.email}</p>
                <p>
                  Папка для реманенту:{' '}
                  {driveStatus.data.folderName ?? <span className="text-muted-foreground">не обрана</span>}
                </p>
                <Button size="sm" variant="outline" onClick={handlePickFolder}>
                  {driveStatus.data.folderName ? 'Змінити папку' : 'Обрати папку для реманенту'}
                </Button>
                {pickerError && <p className="text-sm text-destructive">{pickerError}</p>}
              </>
            ) : (
              <>
                <p className="text-muted-foreground">Google Drive не підключено.</p>
                <Button size="sm" disabled={connectDrive.isPending} onClick={() => connectDrive.mutate()}>
                  Підключити Google Drive
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

(This drops the old page's `<h1>{kurin.name}</h1>` — the accordion row header in the outer shell already shows which section this is, so a repeated title inside the section body is redundant. The one behavioral change from the original is that the `<h1>` is gone; nothing else differs.)

- [x] **Step 2: Create `KurinProvidSection`**

Create `apps/web/components/kurin-provid-section.tsx`, adapted from the current `/positions/page.tsx`'s `PositionSlot` + `PositionsPage`, with the KURINNYI-lock added:

```tsx
'use client';

import { useState } from 'react';
import { useKurinPositions, useAssignPosition, useRemovePosition } from '@/lib/queries/positions';
import { useUsers } from '@/lib/queries/users';
import { useSession } from '@/lib/session-client';
import { accessErrorMessage } from '@/lib/error-message';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { KurinPosition, PositionType } from '@/lib/types';

const KURIN_POSITION_TYPES: { value: PositionType; label: string }[] = [
  { value: 'KURINNYI', label: 'Курінний' },
  { value: 'SUDDIA', label: 'Суддя' },
  { value: 'PYSAR', label: 'Писар' },
  { value: 'SKARBNYK', label: 'Скарбник' },
  { value: 'INTENDANT', label: 'Інтендант' },
  { value: 'KHORUNZHYI', label: 'Хорунжий' },
  { value: 'SMM', label: 'СММник' },
];

const POSITION_TYPE_LABELS: Record<PositionType, string> = {
  KURINNYI: 'Курінний',
  SUDDIA: 'Суддя',
  PYSAR: 'Писар',
  SKARBNYK: 'Скарбник',
  INTENDANT: 'Інтендант',
  KHORUNZHYI: 'Хорунжий',
  SMM: 'СММник',
  HURTKOVYI: 'Гуртковий',
};

function ProvidSlot({
  label,
  positionType,
  current,
  candidates,
  positionsInScope,
  canEdit,
}: {
  label: string;
  positionType: PositionType;
  current: KurinPosition | undefined;
  candidates: { id: string; firstName: string; lastName: string }[];
  positionsInScope: KurinPosition[];
  canEdit: boolean;
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const assign = useAssignPosition();
  const remove = useRemovePosition();

  const assignErrorMsg = assign.isError ? (accessErrorMessage(assign.error) ?? 'Помилка при призначенні.') : null;
  const removeErrorMsg = remove.isError ? (accessErrorMessage(remove.error) ?? 'Помилка при зняттю.') : null;

  return (
    <div className="border-b py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="w-32 shrink-0 font-medium">{label}</span>
        {current ? (
          <>
            <span className="flex-1">
              {current.user.lastName} {current.user.firstName}
            </span>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => remove.mutate(current.id)} disabled={remove.isPending}>
                Зняти
              </Button>
            )}
          </>
        ) : canEdit ? (
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
              onClick={() => {
                const conflicting = positionsInScope.find((kp) => kp.user.id === selectedUserId);
                if (conflicting) {
                  const candidate = candidates.find((c) => c.id === selectedUserId);
                  const candidateName = candidate ? `${candidate.lastName} ${candidate.firstName}` : 'Цей юнак';
                  const conflictingLabel = POSITION_TYPE_LABELS[conflicting.positionType];
                  const confirmed = window.confirm(
                    `${candidateName} вже займає посаду «${conflictingLabel}». ` +
                      `Призначення на «${label}» автоматично зніме поточну посаду. Продовжити?`,
                  );
                  if (!confirmed) return;
                }
                assign.mutate({ userId: selectedUserId, scope: 'KURIN', positionType }, { onSuccess: () => setSelectedUserId('') });
              }}
            >
              Призначити
            </Button>
          </>
        ) : (
          <span className="flex-1 text-muted-foreground">— немає —</span>
        )}
      </div>
      {assignErrorMsg && <p className="mt-1 text-xs text-destructive">{assignErrorMsg}</p>}
      {removeErrorMsg && <p className="mt-1 text-xs text-destructive">{removeErrorMsg}</p>}
    </div>
  );
}

export function KurinProvidSection() {
  const { data: session } = useSession();
  const { data: positions, isLoading: positionsLoading, isError: positionsError, error: positionsErrorObj } = useKurinPositions();
  const { data: junaky, isLoading: junakyLoading } = useUsers({ role: 'JUNAK' });

  if (positionsLoading || junakyLoading) return <p>Завантаження...</p>;
  if (positionsError) return <p className="text-sm text-destructive">{accessErrorMessage(positionsErrorObj) ?? 'Помилка завантаження посад куреня.'}</p>;

  const candidates = junaky ?? [];
  const kurinPositions = (positions ?? []).filter((p) => p.scope === 'KURIN');

  function canEditSlot(positionType: PositionType) {
    if (session?.role === 'ZVYAZKOVYI') return true;
    if (session?.isKurinniy) return positionType !== 'KURINNYI';
    return false;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Провід куреня</CardTitle>
      </CardHeader>
      <CardContent>
        {KURIN_POSITION_TYPES.map((p) => (
          <ProvidSlot
            key={p.value}
            label={p.label}
            positionType={p.value}
            current={kurinPositions.find((kp) => kp.positionType === p.value)}
            candidates={candidates}
            positionsInScope={kurinPositions}
            canEdit={canEditSlot(p.value)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
```

Note: `useKurinPositions()` currently requires no special role on the frontend (the hook itself has no gating), and Task 1 already opened the backend `list()` to any authenticated caller by removing `@Roles(ZVYAZKOVYI)` — so a plain member can call this hook too; this component works unmodified for the read-only tier (every `canEditSlot` call returns `false` for a plain member, so every slot renders filled-or-empty read-only).

- [x] **Step 3: Build the accordion shell in `/kurin/page.tsx`**

Replace the full contents of `apps/web/app/kurin/page.tsx`:

```tsx
'use client';

import { Suspense, useState } from 'react';
import { useSession } from '@/lib/session-client';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KurinInfoSection } from '@/components/kurin-info-section';
import { KurinProvidSection } from '@/components/kurin-provid-section';

type SectionKey = 'info' | 'provid' | 'hurtky' | 'vykhovnyky' | 'junatstvo';

export default function KurinPage() {
  return (
    <Suspense fallback={<p>Завантаження...</p>}>
      <KurinPageContent />
    </Suspense>
  );
}

function KurinPageContent() {
  const { data: session } = useSession();
  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set());

  function toggle(key: SectionKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const hasFullAccess =
    session?.role === 'ZVYAZKOVYI' || session?.isKurinniy || (session?.positions ?? []).includes('SUDDIA');

  const sections: { key: SectionKey; title: string; render: () => React.ReactNode }[] = [
    { key: 'info', title: 'Інформація по куреню', render: () => <KurinInfoSection /> },
    { key: 'provid', title: 'Провід куреня', render: () => <KurinProvidSection /> },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Курінь</h1>
      <div className="space-y-2">
        {sections.map((section) => {
          const isExpanded = expanded.has(section.key);
          return (
            <Card key={section.key}>
              <CardHeader className="cursor-pointer" onClick={() => toggle(section.key)}>
                <CardTitle>{section.title}</CardTitle>
                <CardAction className="text-muted-foreground">{isExpanded ? '▾' : '▸'}</CardAction>
              </CardHeader>
              {isExpanded && <CardContent>{section.render()}</CardContent>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

This builds with only 2 sections for now; Tasks 8 and 9 each add one more `{ key, title, render }` entry to the `sections` array (Гуртки is always shown; Кадра виховників/Список юнацтва only when `hasFullAccess` — wired in Task 9).

- [x] **Step 4: Rewrite `kurin-number.spec.ts` and `kurin-settings.spec.ts` to expand the Інформація section first**

In `apps/web/e2e/kurin-number.spec.ts`, after `await page.goto('/kurin');` add:

```ts
  await page.getByRole('heading', { name: 'Інформація по куреню' }).click();
```

In `apps/web/e2e/kurin-settings.spec.ts`, find its `await page.goto('/kurin');` (or equivalent) line and add the same expand click immediately after it.

- [x] **Step 5: Rewrite `positions.spec.ts` to target the new section**

Replace `apps/web/e2e/positions.spec.ts` in full:

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
  await page.goto('/kurin');
  await page.getByRole('heading', { name: 'Провід куреня' }).click();

  await page.getByText('Курінний').locator('..').getByRole('combobox').selectOption({ label: 'Петренко Петро' });
  await page.getByText('Курінний').locator('..').getByRole('button', { name: 'Призначити' }).click();

  await expect(page.getByText('Курінний').locator('..').getByText('Петренко Петро')).toBeVisible();

  await page.getByText('Курінний').locator('..').getByRole('button', { name: 'Зняти' }).click();
  await expect(page.getByText('Курінний').locator('..').getByRole('combobox')).toBeVisible();
});

test('warns before reassigning a junak who already holds another position in the same scope', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Соколи');
  const junakEmail = `junak-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Іван',
    lastName: 'Іваненко',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');
  await page.getByRole('heading', { name: 'Провід куреня' }).click();

  await page.getByText('Курінний').locator('..').getByRole('combobox').selectOption({ label: 'Іваненко Іван' });
  await page.getByText('Курінний').locator('..').getByRole('button', { name: 'Призначити' }).click();
  await expect(page.getByText('Курінний').locator('..').getByText('Іваненко Іван')).toBeVisible();

  await page.getByText('Суддя').locator('..').getByRole('combobox').selectOption({ label: 'Іваненко Іван' });

  let dialogMessage = '';
  page.once('dialog', (dialog) => {
    dialogMessage = dialog.message();
    void dialog.dismiss();
  });
  await page.getByText('Суддя').locator('..').getByRole('button', { name: 'Призначити' }).click();
  await expect.poll(() => dialogMessage).toContain('Курінний');

  await expect(page.getByText('Курінний').locator('..').getByText('Іваненко Іван')).toBeVisible();
  await expect(page.getByText('Суддя').locator('..').getByRole('combobox')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByText('Суддя').locator('..').getByRole('button', { name: 'Призначити' }).click();

  await expect(page.getByText('Суддя').locator('..').getByText('Іваненко Іван')).toBeVisible();
  await expect(page.getByText('Курінний').locator('..').getByRole('combobox')).toBeVisible();
});

test('lets kurinniy edit a non-Курінний slot but not the Курінний slot itself', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const kurinniyEmail = `kurinniy-${Date.now()}@example.com`;
  const kurinniy = await createUserAs(zvyazkovyiToken, {
    firstName: 'Кур',
    lastName: 'Інний',
    email: kurinniyEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: kurinniy.id, scope: 'KURIN', positionType: 'KURINNYI' },
  });
  const otherJunakEmail = `other-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: otherJunakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, kurinniyEmail, 'password123');
  await page.goto('/kurin');
  await page.getByRole('heading', { name: 'Провід куреня' }).click();

  // Курінний slot: no select, no button — just the current holder's name.
  await expect(page.getByText('Курінний').locator('..').getByRole('combobox')).toHaveCount(0);
  await expect(page.getByText('Курінний').locator('..').getByRole('button', { name: 'Зняти' })).toHaveCount(0);

  // Писар slot: kurinniy can assign it.
  await page.getByText('Писар').locator('..').getByRole('combobox').selectOption({ label: 'Петренко Петро' });
  await page.getByText('Писар').locator('..').getByRole('button', { name: 'Призначити' }).click();
  await expect(page.getByText('Писар').locator('..').getByText('Петренко Петро')).toBeVisible();
});
```

- [x] **Step 6: Run the affected specs**

Restore the local `playwright.config.ts` `executablePath` tweak if needed, then run:
`cd apps/web && npx playwright test e2e/kurin-number.spec.ts e2e/kurin-settings.spec.ts e2e/positions.spec.ts`
Expected: all PASS.

- [x] **Step 7: Typecheck both apps**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [x] **Step 8: Commit**

```bash
git add apps/web/components/kurin-info-section.tsx apps/web/components/kurin-provid-section.tsx apps/web/app/kurin/page.tsx apps/web/e2e/kurin-number.spec.ts apps/web/e2e/kurin-settings.spec.ts apps/web/e2e/positions.spec.ts
git commit -m "feat: build /kurin accordion shell with Інформація and Провід куреня sections"
```

---

## Task 8: Гуртки section — absorb the old `/hurtky` page, extend suddia/read-only access

**Files:**
- Create: `apps/web/components/kurin-hurtky-section.tsx`
- Modify: `apps/web/components/hurtok-detail-panel.tsx`
- Modify: `apps/web/app/kurin/page.tsx`
- Modify: `apps/web/e2e/hurtky-accordion.spec.ts`
- Modify: `apps/web/e2e/hurtky-accordion-settings.spec.ts`
- Modify: `apps/web/e2e/hurtok-members.spec.ts`
- Modify: `apps/web/e2e/hurtok-add-junak-link.spec.ts`
- Modify: `apps/web/e2e/hurtok-archive.spec.ts`
- Modify: `apps/web/e2e/hurtok-settings.spec.ts`

**Interfaces:**
- Consumes: `useHurtky`, `useVykhovnykAssignments`, `useUsers`, `useSession`, `HurtokDetailPanel`.
- Produces: `KurinHurtkySection` — a self-contained component, moving today's `/hurtky/page.tsx` body here unchanged except the page `<h1>` (redundant under the accordion row, same reasoning as Task 7) and the "Новий гурток" create link staying ZVYAZKOVYI-only. `HurtokDetailPanel`'s `canConfigure` now also admits KURIN-scope suddia: `(session?.role === 'ZVYAZKOVYI' || session?.positions.includes('SUDDIA')) && !data.hurtok.archivedAt`.

- [x] **Step 1: Extend `HurtokDetailPanel`'s `canConfigure`**

In `apps/web/components/hurtok-detail-panel.tsx`, change:

```tsx
  const canAddJunak = (session?.role === 'ZVYAZKOVYI' || session?.isKurinniy) && !data.hurtok.archivedAt;
  const canConfigure =
    (session?.role === 'ZVYAZKOVYI' || (session?.positions ?? []).includes('SUDDIA')) && !data.hurtok.archivedAt;
```

(`canAddJunak` is unchanged — suddia is not in the "add junak" permission set per the approved design, only zvyazkovyi and kurinniy.)

- [x] **Step 2: Create `KurinHurtkySection`**

Create `apps/web/components/kurin-hurtky-section.tsx` as today's `/hurtky/page.tsx` body minus the `<h1>Гуртки</h1>` line and the outer `<div className="space-y-4">` wrapper collapsing into this component's own root (the accordion shell in Task 7 already provides section framing via `CardContent`):

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useHurtky } from '@/lib/queries/hurtky';
import { useVykhovnykAssignments } from '@/lib/queries/vykhovnyk-assignments';
import { useUsers } from '@/lib/queries/users';
import { useSession } from '@/lib/session-client';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';
import { HurtokDetailPanel } from '@/components/hurtok-detail-panel';
import type { Hurtok } from '@/lib/types';

export function KurinHurtkySection() {
  const { data: session } = useSession();
  const isVykhovnyk = session?.role === 'VYKHOVNYK';
  const {
    data: hurtky,
    isLoading: hurtkyLoading,
    isError: hurtkyIsError,
    error: hurtkyError,
  } = useHurtky();
  const {
    data: assignments,
    isLoading: assignmentsLoading,
    isError: assignmentsIsError,
    error: assignmentsError,
  } = useVykhovnykAssignments(undefined, { enabled: isVykhovnyk });
  const { data: allVykhovnykAssignments } = useVykhovnykAssignments();
  const { data: vykhovnykUsers } = useUsers({ role: 'VYKHOVNYK' });
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(new Set());

  const isLoading = isVykhovnyk ? hurtkyLoading || assignmentsLoading : hurtkyLoading;
  const isError = isVykhovnyk ? hurtkyIsError || assignmentsIsError : hurtkyIsError;

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) {
    return (
      <p className="text-sm text-destructive">
        {accessErrorMessage(isVykhovnyk ? (hurtkyError ?? assignmentsError) : hurtkyError)}
      </p>
    );
  }

  const hurtokById = new Map((hurtky ?? []).map((h) => [h.id, h]));
  const displayedHurtky: Hurtok[] = isVykhovnyk
    ? (assignments ?? [])
        .map((a) => hurtokById.get(a.hurtokId))
        .filter((h): h is Hurtok => !!h)
    : (hurtky ?? []);

  const vykhovnykNameByHurtokId = Object.fromEntries(
    (allVykhovnykAssignments ?? []).map((a) => {
      const v = (vykhovnykUsers ?? []).find((u) => u.id === a.vykhovnykId);
      return [a.hurtokId, v ? `${v.lastName} ${v.firstName}` : null];
    }),
  );

  function toggle(slug: string) {
    setExpandedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {session?.role === 'ZVYAZKOVYI' && (
        <Link href="/hurtky/new">
          <Button size="sm">Новий гурток</Button>
        </Link>
      )}
      <div className="space-y-2">
        {displayedHurtky.map((h) => {
          const isExpanded = !!h.slug && expandedSlugs.has(h.slug);
          return (
            <Card key={h.id}>
              <CardHeader
                className="cursor-pointer"
                onClick={() => h.slug && toggle(h.slug)}
              >
                <CardTitle>
                  {h.name}
                  {h.number ? ` №${h.number}` : ''}
                  {vykhovnykNameByHurtokId[h.id] && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      · {vykhovnykNameByHurtokId[h.id]}
                    </span>
                  )}
                </CardTitle>
                <CardAction className="text-muted-foreground">{isExpanded ? '▾' : '▸'}</CardAction>
              </CardHeader>
              {isExpanded && h.slug && (
                <CardContent>
                  <HurtokDetailPanel slug={h.slug} />
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

(Note `isVykhovnyk` still restricts which hurtky are *listed* to a plain VYKHOVNYK's own assignments — this is a deliberate deferral, not an oversight: re-check against the approved design before changing it. The design explicitly calls for "all hurtky, read-only" for the read-only tier, which the plain-`VYKHOVNYK` branch above does not yet satisfy. Fix it now: replace the `isLoading`/`isError`/`displayedHurtky` derivation to stop branching on `isVykhovnyk` for the *list*, keeping the vykhovnyk's own-assignments data only as a fallback no longer needed:)

```tsx
  if (hurtkyLoading) return <p>Завантаження...</p>;
  if (hurtkyIsError) {
    return <p className="text-sm text-destructive">{accessErrorMessage(hurtkyError)}</p>;
  }

  const displayedHurtky: Hurtok[] = hurtky ?? [];
```

(Delete the `useVykhovnykAssignments(undefined, { enabled: isVykhovnyk })` call, the `isVykhovnyk` constant, and the old `isLoading`/`isError`/`hurtokById` lines entirely — every role now sees the full `listForKurin` result, matching "all hurtky, read-only" for a plain `VYKHOVNYK` and "all hurtky" for everyone else too, which was already true. The final component is the version with this block applied, not the first draft above — use this corrected version when creating the file.)

- [x] **Step 3: Wire the section into `/kurin/page.tsx`**

In `apps/web/app/kurin/page.tsx`, add the import and the section entry:

```tsx
import { KurinHurtkySection } from '@/components/kurin-hurtky-section';
```

```tsx
  const sections: { key: SectionKey; title: string; render: () => React.ReactNode }[] = [
    { key: 'info', title: 'Інформація по куреню', render: () => <KurinInfoSection /> },
    { key: 'provid', title: 'Провід куреня', render: () => <KurinProvidSection /> },
    { key: 'hurtky', title: 'Гуртки', render: () => <KurinHurtkySection /> },
  ];
```

- [x] **Step 4: Update the e2e specs that navigated to `/hurtky`**

For each of `hurtky-accordion.spec.ts`, `hurtky-accordion-settings.spec.ts`, `hurtok-members.spec.ts`, `hurtok-add-junak-link.spec.ts`, `hurtok-archive.spec.ts`, `hurtok-settings.spec.ts`: replace every `await page.goto('/hurtky');` with:

```ts
  await page.goto('/kurin');
  await page.getByRole('heading', { name: 'Гуртки' }).click();
```

and change every `await expect(page).toHaveURL('/hurtky');` (or equivalent URL assertion checking the row stayed expanded without navigating) to `await expect(page).toHaveURL('/kurin');`. Read each file first to confirm the exact lines before editing — the navigation and URL-assertion lines are the only ones that change; all Playwright locator/assertion logic inside each test (selecting hurtok rows, opening settings, filling the founding-date input, etc.) stays exactly as-is, since `KurinHurtkySection`'s rendered markup for the Гуртки content is byte-for-byte identical to the old `/hurtky` page's markup.

- [x] **Step 5: Add a suddia-can-configure test and a read-only-tier test to `hurtok-settings.spec.ts`**

Append to `apps/web/e2e/hurtok-settings.spec.ts`:

```ts
test('lets a KURIN-scope suddia open and use the hurtok settings dialog', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const suddiaEmail = `suddia-${Date.now()}@example.com`;
  const suddia = await createUserAs(zvyazkovyiToken, {
    firstName: 'Суд',
    lastName: 'Дя',
    email: suddiaEmail,
    role: 'JUNAK',
    password: 'password123',
  });
  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: suddia.id, scope: 'KURIN', positionType: 'SUDDIA' },
  });

  await loginAs(page, suddiaEmail, 'password123');
  await page.goto('/kurin');
  await page.getByRole('heading', { name: 'Гуртки' }).click();
  await page.getByText('Орлики').click();
  await page.getByRole('button', { name: 'Налаштування' }).click();
  await page.getByLabel('Дата заснування').fill('2020-05-01');
  await page.getByRole('button', { name: 'Зберегти дату' }).click();
  await expect(page.getByText('Засновано')).toBeVisible();
});

test('a plain member sees hurtok info read-only, with no settings button', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Соколи');
  const plainJunakEmail = `plain-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Прост',
    lastName: 'Юнак',
    email: plainJunakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, plainJunakEmail, 'password123');
  await page.goto('/kurin');
  await page.getByRole('heading', { name: 'Гуртки' }).click();
  await page.getByText('Соколи').click();
  await expect(page.getByRole('button', { name: 'Налаштування' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Додати юнака/чку' })).toHaveCount(0);
});
```

- [x] **Step 6: Run the affected specs**

Run: `cd apps/web && npx playwright test e2e/hurtky-accordion.spec.ts e2e/hurtky-accordion-settings.spec.ts e2e/hurtok-members.spec.ts e2e/hurtok-add-junak-link.spec.ts e2e/hurtok-archive.spec.ts e2e/hurtok-settings.spec.ts`
Expected: all PASS.

- [x] **Step 7: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [x] **Step 8: Commit**

```bash
git add apps/web/components/kurin-hurtky-section.tsx apps/web/components/hurtok-detail-panel.tsx apps/web/app/kurin/page.tsx apps/web/e2e/hurtky-accordion.spec.ts apps/web/e2e/hurtky-accordion-settings.spec.ts apps/web/e2e/hurtok-members.spec.ts apps/web/e2e/hurtok-add-junak-link.spec.ts apps/web/e2e/hurtok-archive.spec.ts apps/web/e2e/hurtok-settings.spec.ts
git commit -m "feat: absorb /hurtky into the Курінь accordion, extend suddia/read-only access"
```

---

## Task 9: Кадра виховників + Список юнацтва sections — absorb `/users`

**Files:**
- Create: `apps/web/components/kurin-roster-section.tsx`
- Modify: `apps/web/app/kurin/page.tsx`
- Modify: `apps/web/app/users/new/page.tsx`
- Modify: `apps/web/e2e/users-role-filter.spec.ts`
- Modify: `apps/web/e2e/users-new-direct.spec.ts`
- Modify: `apps/web/e2e/users-new-hurtok-prefill.spec.ts`
- Modify: `apps/web/e2e/users-hurtok.spec.ts`
- Modify: `apps/web/e2e/users-detail.spec.ts`
- Modify: `apps/web/e2e/user-archive.spec.ts`

**Interfaces:**
- Consumes: `useUsers`, `useSession`, `ROLE_LABELS`.
- Produces: `KurinRosterSection({ role }: { role: 'VYKHOVNYK' | 'JUNAK' })` — a single reusable component (no filter buttons, the fixed `role` prop replaces them) rendering the list and an optional "Додати людину" link, used twice: once for Кадра виховників (`role="VYKHOVNYK"`), once for Список юнацтва (`role="JUNAK"`). Both new sections are only added to `/kurin`'s `sections` array when `hasFullAccess` is true (computed in Task 7).

- [x] **Step 1: Create `KurinRosterSection`**

Create `apps/web/components/kurin-roster-section.tsx`, adapted from today's `/users/page.tsx` with the filter buttons removed (the `role` prop replaces them) and the create-link condition narrowed per role:

```tsx
'use client';

import Link from 'next/link';
import { useSession } from '@/lib/session-client';
import { useUsers } from '@/lib/queries/users';
import { ROLE_LABELS } from '@/lib/role-labels';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';
import type { Role } from '@/lib/types';

export function KurinRosterSection({ role }: { role: Extract<Role, 'VYKHOVNYK' | 'JUNAK'> }) {
  const { data: session } = useSession();
  const { data: users, isLoading, isError, error } = useUsers({ role });

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error)}</p>;

  const canCreate =
    role === 'VYKHOVNYK'
      ? session?.role === 'ZVYAZKOVYI'
      : session?.role === 'ZVYAZKOVYI' || session?.isKurinniy;

  return (
    <div className="space-y-4">
      {canCreate && (
        <Link href={`/users/new?role=${role}`}>
          <Button size="sm">Додати людину</Button>
        </Link>
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

- [x] **Step 2: Make `/users/new` honor a `role` query param**

In `apps/web/app/users/new/page.tsx`, the ZVYAZKOVYI direct-create form (`ZvyazkovyiDirectCreateForm`) currently defaults `role` state to `'JUNAK'`. Read the `role` search param in `NewUserPageContent` and pass it down as an initial value, mirroring the existing `initialHurtokId` pattern exactly:

```tsx
function NewUserPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const initialHurtokId = searchParams.get('hurtokId') ?? '';
  const initialRole = (searchParams.get('role') as Role) ?? 'JUNAK';

  if (session?.role === 'ZVYAZKOVYI') {
    return <ZvyazkovyiDirectCreateForm initialHurtokId={initialHurtokId} initialRole={initialRole} />;
  }
  return <KurinnyiApprovalRequestForm initialHurtokId={initialHurtokId} />;
}
```

In `ZvyazkovyiDirectCreateForm`, change its props type and the `role` state initializer:

```tsx
function ZvyazkovyiDirectCreateForm({ initialHurtokId, initialRole }: { initialHurtokId: string; initialRole: Role }) {
  const [role, setRole] = useState<Role>(initialRole);
```

(`KurinnyiApprovalRequestForm` is unchanged — it only ever creates a JUNAK, matching the Список юнацтва section's kurinniy-create path; the `role` query param is only meaningful for the ZVYAZKOVYI form.) Add `Role` to the existing `@/lib/types` import in `users/new/page.tsx` if it is not already imported.

- [x] **Step 3: Wire both sections into `/kurin/page.tsx`**

In `apps/web/app/kurin/page.tsx`:

```tsx
import { KurinRosterSection } from '@/components/kurin-roster-section';
```

```tsx
  const sections: { key: SectionKey; title: string; render: () => React.ReactNode }[] = [
    { key: 'info', title: 'Інформація по куреню', render: () => <KurinInfoSection /> },
    { key: 'provid', title: 'Провід куреня', render: () => <KurinProvidSection /> },
    { key: 'hurtky', title: 'Гуртки', render: () => <KurinHurtkySection /> },
    ...(hasFullAccess
      ? [
          { key: 'vykhovnyky' as const, title: 'Кадра виховників', render: () => <KurinRosterSection role="VYKHOVNYK" /> },
          { key: 'junatstvo' as const, title: 'Список юнацтва', render: () => <KurinRosterSection role="JUNAK" /> },
        ]
      : []),
  ];
```

- [x] **Step 4: Rewrite the e2e specs that navigated to `/users`**

Replace `apps/web/e2e/users-role-filter.spec.ts` in full (this is the test Task 6 left half-broken, pointing at `/kurin`):

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets kurinniy view vykhovnyk contacts read-only', async ({ page, request }) => {
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
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Кур',
    lastName: 'Інний',
    email: kurinnyiEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: junak.id, scope: 'KURIN', positionType: 'KURINNYI' },
  });

  await loginAs(page, kurinnyiEmail, 'password123');
  await page.goto('/kurin');
  await page.getByRole('heading', { name: 'Кадра виховників' }).click();

  await expect(page.getByText(`${vykhovnyk.lastName} ${vykhovnyk.firstName}`)).toBeVisible();

  await page.getByText(`${vykhovnyk.lastName} ${vykhovnyk.firstName}`).click();
  await expect(page.getByLabel('Телефон')).toBeDisabled();
});

test('a plain member does not see Кадра виховників or Список юнацтва at all', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Соколи');
  const plainJunakEmail = `plain-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Прост',
    lastName: 'Юнак',
    email: plainJunakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, plainJunakEmail, 'password123');
  await page.goto('/kurin');
  for (const title of ['Інформація по куреню', 'Провід куреня', 'Гуртки']) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Кадра виховників' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Список юнацтва' })).toHaveCount(0);
});
```

For `apps/web/e2e/users-new-direct.spec.ts`, `apps/web/e2e/users-new-hurtok-prefill.spec.ts`, `apps/web/e2e/users-hurtok.spec.ts`, `apps/web/e2e/users-detail.spec.ts`, and `apps/web/e2e/user-archive.spec.ts`: read each file first, then replace any `await page.goto('/users');` navigation with:

```ts
  await page.goto('/kurin');
  await page.getByRole('heading', { name: 'Список юнацтва' }).click();
```

(or `'Кадра виховників'` for a test whose target user is a VYKHOVNYK — check which role the test's target user has before choosing), and any direct `await page.goto('/users/new');` stays as-is (that route is unchanged). Any assertion on the old filter buttons (`getByRole('button', { name: 'Юнаки' })`, etc.) is deleted — the new sections have no filter buttons, the section itself is the filter.

- [x] **Step 5: Run the affected specs**

Run: `cd apps/web && npx playwright test e2e/users-role-filter.spec.ts e2e/users-new-direct.spec.ts e2e/users-new-hurtok-prefill.spec.ts e2e/users-hurtok.spec.ts e2e/users-detail.spec.ts e2e/user-archive.spec.ts`
Expected: all PASS.

- [x] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [x] **Step 7: Commit**

```bash
git add apps/web/components/kurin-roster-section.tsx apps/web/app/kurin/page.tsx apps/web/app/users/new/page.tsx apps/web/e2e/users-role-filter.spec.ts apps/web/e2e/users-new-direct.spec.ts apps/web/e2e/users-new-hurtok-prefill.spec.ts apps/web/e2e/users-hurtok.spec.ts apps/web/e2e/users-detail.spec.ts apps/web/e2e/user-archive.spec.ts
git commit -m "feat: absorb /users into Кадра виховників and Список юнацтва sections"
```

---

## Task 10: Junak detail page — request-based hurtok move for kurinniy and suddia

**Files:**
- Modify: `apps/web/app/users/[id]/page.tsx`
- Create: `apps/web/e2e/change-hurtok-request.spec.ts`

**Interfaces:**
- Consumes: `useCreateApprovalRequest` (`lib/queries/approval-requests.ts`, unchanged).
- Produces: a user with `isKurinniy` or `positions.includes('SUDDIA')` (but not `ZVYAZKOVYI`) now sees the same hurtok `<select>` as `canMoveHurtok` renders for ZVYAZKOVYI, but submitting calls `useCreateApprovalRequest().mutate({ actionType: 'CHANGE_HURTOK', junakId, newData: { hurtokId } })` instead of the direct `useUpdateHurtok` mutation, and shows a "запит надіслано" confirmation instead of navigating/refreshing in place — mirroring the existing `ArchiveUserCard`'s `isZvyazkovyi ? direct : request` branch exactly.

- [x] **Step 1: Write the failing e2e test**

Create `apps/web/e2e/change-hurtok-request.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets kurinniy request a hurtok change, zvyazkovyi approves it', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtokA = await createHurtok(zvyazkovyiToken, 'Орлики');
  const hurtokB = await createHurtok(zvyazkovyiToken, 'Соколи');
  const kurinniyEmail = `kurinniy-${Date.now()}@example.com`;
  const kurinniy = await createUserAs(zvyazkovyiToken, {
    firstName: 'Кур',
    lastName: 'Інний',
    email: kurinniyEmail,
    role: 'JUNAK',
    hurtokId: hurtokA.id,
    password: 'password123',
  });
  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: kurinniy.id, scope: 'KURIN', positionType: 'KURINNYI' },
  });
  const targetEmail = `target-${Date.now()}@example.com`;
  const target = await createUserAs(zvyazkovyiToken, {
    firstName: 'Ціль',
    lastName: 'Юнак',
    email: targetEmail,
    role: 'JUNAK',
    hurtokId: hurtokA.id,
    password: 'password123',
  });

  await loginAs(page, kurinniyEmail, 'password123');
  await page.goto(`/users/${target.id}`);
  await page.getByLabel('Гурток').selectOption({ label: 'Соколи' });
  await page.getByRole('button', { name: 'Перевести' }).click();
  await expect(page.getByText(/запит.*надіслано/i)).toBeVisible();

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/approval-requests');
  await page.getByText('Переведення в інший гурток').first().click();
  await page.getByRole('button', { name: 'Затвердити' }).click();

  await page.goto(`/users/${target.id}`);
  await expect(page.getByLabel('Гурток')).toHaveValue(hurtokB.id);
});

test('lets a KURIN-scope suddia request a hurtok change too', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtokA = await createHurtok(zvyazkovyiToken, 'Орлики');
  const hurtokB = await createHurtok(zvyazkovyiToken, 'Соколи');
  const suddiaEmail = `suddia-${Date.now()}@example.com`;
  const suddia = await createUserAs(zvyazkovyiToken, {
    firstName: 'Суд',
    lastName: 'Дя',
    email: suddiaEmail,
    role: 'JUNAK',
    password: 'password123',
  });
  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: suddia.id, scope: 'KURIN', positionType: 'SUDDIA' },
  });
  const targetEmail = `target-${Date.now()}@example.com`;
  const target = await createUserAs(zvyazkovyiToken, {
    firstName: 'Ціль',
    lastName: 'Юнак',
    email: targetEmail,
    role: 'JUNAK',
    hurtokId: hurtokA.id,
    password: 'password123',
  });

  await loginAs(page, suddiaEmail, 'password123');
  await page.goto(`/users/${target.id}`);
  await page.getByLabel('Гурток').selectOption({ label: 'Соколи' });
  await page.getByRole('button', { name: 'Перевести' }).click();
  await expect(page.getByText(/запит.*надіслано/i)).toBeVisible();

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/approval-requests');
  await page.getByText('Переведення в інший гурток').first().click();
  await page.getByRole('button', { name: 'Затвердити' }).click();

  await page.goto(`/users/${target.id}`);
  await expect(page.getByLabel('Гурток')).toHaveValue(hurtokB.id);
});
```

- [x] **Step 2: Run the test to verify it fails**

Restore the local Playwright `executablePath` tweak if needed, then run: `cd apps/web && npx playwright test e2e/change-hurtok-request.spec.ts`
Expected: FAILS — `canMoveHurtok` is `ZVYAZKOVYI`-only, so kurinniy sees the plain read-only `<p>{hurtky?.find(...).name}</p>` fallback with no `<select>`/`Перевести` button at all.

- [x] **Step 3: Implement**

In `apps/web/app/users/[id]/page.tsx`, change the `canMoveHurtok` derivation and the render branch. Replace:

```tsx
  const canMoveHurtok = session?.role === 'ZVYAZKOVYI' && isJunak && !user?.archivedAt;
```

with:

```tsx
  const canDirectlyMoveHurtok = session?.role === 'ZVYAZKOVYI' && isJunak && !user?.archivedAt;
  const canRequestMoveHurtok =
    isJunak && !user?.archivedAt && (session?.isKurinniy || (session?.positions ?? []).includes('SUDDIA'));
  const canMoveHurtok = canDirectlyMoveHurtok || canRequestMoveHurtok;
  const [hurtokRequestSent, setHurtokRequestSent] = useState(false);
```

(Add this `useState` next to the file's other `useState` calls near the top of `UserDetailPage`, not inline where `canMoveHurtok` is computed — React hooks must be called unconditionally at the top level; move the `useState(false)` declaration up alongside `const [selectedHurtokId, setSelectedHurtokId] = useState('');`.)

Replace the `canMoveHurtok ? (...) : (...)` JSX block:

```tsx
              {canMoveHurtok ? (
                hurtokRequestSent ? (
                  <p className="text-sm text-muted-foreground">
                    Запит на переведення надіслано, очікує затвердження зв&apos;язковим.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <select
                      id="hurtok"
                      value={selectedHurtokId}
                      onChange={(e) => setSelectedHurtokId(e.target.value)}
                      className="flex-1 rounded-md border px-2 py-1 text-sm"
                    >
                      <option value="">Без гуртка</option>
                      {(hurtky ?? []).map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={selectedHurtokId === (user.hurtokId ?? '') || updateHurtok.isPending || createRequest.isPending}
                      onClick={async () => {
                        if (canDirectlyMoveHurtok) {
                          updateHurtok.mutate(selectedHurtokId || null);
                          return;
                        }
                        try {
                          await createRequest.mutateAsync({
                            actionType: 'CHANGE_HURTOK',
                            junakId: user.id,
                            newData: { hurtokId: selectedHurtokId || null },
                          });
                          setHurtokRequestSent(true);
                        } catch {
                          /* handled by MutationCache.onError for 401; other errors just stop-and-not-navigate */
                        }
                      }}
                    >
                      Перевести
                    </Button>
                  </div>
                )
              ) : (
                <p>{hurtky?.find((h) => h.id === user.hurtokId)?.name ?? 'Без гуртка'}</p>
              )}
```

`createRequest` is already declared at the top of `UserDetailPage` (`const createRequest = useCreateApprovalRequest();`, used by the existing `CHANGE_FULL_NAME` request below) — reuse it, do not create a second instance.

- [x] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx playwright test e2e/change-hurtok-request.spec.ts`
Expected: PASS.

- [x] **Step 5: Run the full Playwright suite**

Run: `cd apps/web && npx playwright test`
Expected: all PASS, no regressions (in particular `users-hurtok.spec.ts`, which exercises the ZVYAZKOVYI direct-move path through `canDirectlyMoveHurtok`).

- [x] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [x] **Step 7: Commit**

```bash
git add apps/web/app/users/\[id\]/page.tsx apps/web/e2e/change-hurtok-request.spec.ts
git commit -m "feat: let kurinniy and suddia request a hurtok change via approval"
```

---

## Task 11: Delete the now-dead routes

**Files:**
- Delete: `apps/web/app/positions/page.tsx`
- Delete: `apps/web/app/users/page.tsx`
- Delete: `apps/web/app/hurtky/page.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task only removes files that no longer have any route, link, or test pointing at them after Tasks 6-10.

- [x] **Step 1: Confirm nothing still references the three routes**

Run: `cd apps/web && grep -rn "'/positions'\|\"/positions\"\|'/users'\]\|\"/users\"\]\|goto('/users')\|goto(\"/users\")\|href=\"/hurtky\"\|href='/hurtky'" app components e2e --include="*.tsx" --include="*.ts" | grep -v "/users/new\|/users/\[id\]\|/users/\${"`

Expected: no output (every remaining reference to `/users` in the codebase is to `/users/new` or `/users/[id]`/`/users/${id}`, which stay). If this prints anything, stop and fix that reference before deleting — it means an earlier task's e2e-spec migration was incomplete.

- [x] **Step 2: Delete the three page files**

```bash
git rm apps/web/app/positions/page.tsx apps/web/app/users/page.tsx apps/web/app/hurtky/page.tsx
```

- [x] **Step 3: Run the full typecheck and full Playwright suite**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors (confirms no remaining import references the deleted files).

Restore the local Playwright `executablePath` tweak if needed, then run: `cd apps/web && npx playwright test`
Expected: all PASS.

- [x] **Step 4: Commit**

```bash
git commit -m "chore: delete /positions, /users, and the old top-level /hurtky page"
```

---

## Task 12: Final integration test and full regression

**Files:**
- Create: `apps/web/e2e/kurin-accordion-full-tier.spec.ts`

**Interfaces:**
- Consumes: everything built in Tasks 1-11.
- Produces: one end-to-end test exercising the full-access tier's 5-section view in a single flow, plus a final confirmation that both the API and web suites are fully green.

- [x] **Step 1: Write the integration test**

Create `apps/web/e2e/kurin-accordion-full-tier.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('zvyazkovyi sees and can use all 5 sections of the Курінь accordion', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Вих',
    lastName: 'Овник',
    email: `vykhovnyk-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');

  for (const title of ['Інформація по куреню', 'Провід куреня', 'Гуртки', 'Кадра виховників', 'Список юнацтва']) {
    await expect(page.getByText(title)).toBeVisible();
  }

  await page.getByText('Інформація по куреню').click();
  await expect(page.getByText(/Номер:/)).toBeVisible();

  await page.getByText('Гуртки').click();
  await page.getByText('Орлики').click();
  await expect(page.getByText('Петренко Петро')).toBeVisible();

  await page.getByText('Кадра виховників').click();
  await expect(page.getByText('Овник Вих')).toBeVisible();

  await page.getByText('Список юнацтва').click();
  await expect(page.getByText('Петренко Петро')).toBeVisible();
});
```

- [x] **Step 2: Run the new test**

Restore the local Playwright `executablePath` tweak if needed, then run: `cd apps/web && npx playwright test e2e/kurin-accordion-full-tier.spec.ts`
Expected: PASS.

- [x] **Step 3: Run the full API e2e suite in isolation**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: all suites PASS.

- [x] **Step 4: Run the full Playwright suite in isolation (never concurrently with Step 3)**

Run: `cd apps/web && npx playwright test`
Expected: all tests PASS.

- [x] **Step 5: Typecheck both apps**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors in either.

- [x] **Step 6: Commit**

```bash
git add apps/web/e2e/kurin-accordion-full-tier.spec.ts
git commit -m "test: verify all 5 Курінь accordion sections work together for zvyazkovyi"
```

This is the last task in the plan. After it lands clean, proceed to a final whole-branch review (dispatch on the most capable available model, covering `git merge-base main HEAD`..`HEAD`) exactly as done for the two prior features on this branch, fix any Critical/Important findings in one combined dispatch, confirm, then fast-forward `main`.
