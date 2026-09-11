# Гурток → юнак → проба Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, all-points-on-one-page hurtok board with a people-list → junak-detail → collapsible-proba flow, and give a specific hurtok a human-readable URL (`/[kurinId]/hurtky/[slug]` instead of a raw UUID).

**Architecture:** A new `Hurtok.slug` field (transliterated, collision-suffixed) backs a new `GET /hurtky/by-slug/:slug` endpoint that replaces the old `/hurtky/:id/board`. The frontend gets a new dynamic route for the hurtok people-list, and the junak detail page (`/users/[id]`) gains a "Проба" card with per-category collapsible sections, where confirm/unconfirm now also works for ZVYAZKOVYI (previously VYKHOVNYK-only).

**Tech Stack:** NestJS + Prisma + PostgreSQL (backend, unchanged), Next.js App Router + TanStack Query (frontend, unchanged).

## Global Constraints

- **Additive migration only.** Production has live data (a real kurin, real hurtky). `Hurtok.slug` is added as nullable (`String?`) — existing rows get backfilled by a one-time script, not by the migration itself.
- **The old `GET /hurtky/:id/board` endpoint and its frontend page are deleted, not kept alongside the new one.** This app has no external API consumers; YAGNI applies.
- **Access to `GET /hurtky/by-slug/:slug` stays `@Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)`** — the same restriction the old board endpoint had. A VYKHOVNYK must still be assigned to that specific hurtok (via `VykhovnykHurtok`) or gets 404; ZVYAZKOVYI has no such restriction beyond being in the same kurin.
- **Confirm/unconfirm widens from `@Roles(Role.VYKHOVNYK)` to `@Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)`.** The internal "assigned to this junak's hurtok" check stays required only for VYKHOVNYK; ZVYAZKOVYI is exempt from it (matches the existing read-progress endpoint, which already has no ZVYAZKOVYI-specific restriction).
- **Slug format:** lowercase, Ukrainian-to-Latin transliteration, non-alphanumeric runs collapsed to a single `-`, leading/trailing `-` trimmed. Collisions within the same kurin get a numeric suffix joined with `_` (`vovky`, `vovky_1`, `vovky_2`, ...).
- **`kurinId` in the new frontend route is the raw UUID** — no kurin-level slug in this plan.
- Git hygiene: every commit uses exact file paths in `git add`, never `-A` or `.`.

---

### Task 1: Backend — `Hurtok.slug` schema, generation utility, backfill script

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/hurtky/slug.util.ts`
- Modify: `apps/api/src/hurtky/hurtky.service.ts`
- Create: `apps/api/src/scripts/backfill-hurtok-slugs.ts`
- Test: `apps/api/test/hurtky-slug.e2e-spec.ts`
- Modify: `apps/api/test/hurtky.e2e-spec.ts:37` (assert the create response includes a `slug`)

**Interfaces:**
- Consumes: nothing from other tasks (foundation task).
- Produces: `Hurtok.slug: String | null` (schema field). `slugify(name: string): string` and `generateUniqueSlug(prisma: PrismaClient, kurinId: string, name: string): Promise<string>` from `apps/api/src/hurtky/slug.util.ts` — Task 2 does not need these directly, but the by-slug lookup Task 2 builds depends on this field being populated. `HurtkyService.create()` now includes `slug` in its returned object.

- [ ] **Step 1: Add the schema field**

In `apps/api/prisma/schema.prisma`, add `slug` to the `Hurtok` model, right after the existing `name` line:

```prisma
model Hurtok {
  id      String  @id @default(uuid())
  kurinId String
  kurin   Kurin   @relation(fields: [kurinId], references: [id])
  name    String
  slug    String?
  number  String?

  junaky               User[]            @relation("JunakHurtok")
  vykhovnykAssignments VykhovnykHurtok[]
  positions KurinPosition[]
}
```

- [ ] **Step 2: Generate and apply the migration**

Run (from `apps/api/`, against your local dev database):

```bash
npx prisma migrate dev --name add_hurtok_slug
```

Expected: it prints `Your database is now in sync with your schema`, and the generated `migration.sql` contains only `ALTER TABLE "Hurtok" ADD COLUMN "slug" TEXT` — nullable, no default, no data touched. If you see anything else, stop — Step 1 was applied incorrectly.

- [ ] **Step 3: Write the slug utility**

Create `apps/api/src/hurtky/slug.util.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const TRANSLIT_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ю: 'iu', я: 'ia', "'": '', 'ʼ': '', '’': '',
};

export function transliterate(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT_MAP[ch] ?? ch)
    .join('');
}

export function slugify(text: string): string {
  return transliterate(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function generateUniqueSlug(
  prisma: PrismaClient,
  kurinId: string,
  name: string,
): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.hurtok.findFirst({ where: { kurinId, slug: candidate } });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}_${suffix}`;
  }
}
```

- [ ] **Step 4: Wire slug generation into `HurtkyService.create`**

In `apps/api/src/hurtky/hurtky.service.ts`, add the import:

```ts
import { generateUniqueSlug } from './slug.util';
```

Change the `create` method — from:

```ts
  create(dto: CreateHurtokDto, kurinId: string) {
    return this.prisma.hurtok.create({ data: { name: dto.name, number: dto.number, kurinId } });
  }
```

to:

```ts
  async create(dto: CreateHurtokDto, kurinId: string) {
    const slug = await generateUniqueSlug(this.prisma, kurinId, dto.name);
    return this.prisma.hurtok.create({ data: { name: dto.name, number: dto.number, kurinId, slug } });
  }
```

- [ ] **Step 5: Write the e2e test for slug generation**

Create `apps/api/test/hurtky-slug.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Hurtok slug generation (e2e)', () => {
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

  it('generates a transliterated slug for a new hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post('/hurtky')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Вовки' })
      .expect(201);

    expect(response.body.slug).toBe('vovky');
  });

  it('appends a numeric suffix on a slug collision within the same kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const first = await request(app.getHttpServer())
      .post('/hurtky')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Вовки' })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/hurtky')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Вовки' })
      .expect(201);

    expect(first.body.slug).toBe('vovky');
    expect(second.body.slug).toBe('vovky_1');
  });

  it('does not collide with a same-named hurtok in a different kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const zvyazkovyiB = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinB.id });

    const responseA = await request(app.getHttpServer())
      .post('/hurtky')
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, zvyazkovyiA)}`)
      .send({ name: 'Вовки' })
      .expect(201);
    const responseB = await request(app.getHttpServer())
      .post('/hurtky')
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, zvyazkovyiB)}`)
      .send({ name: 'Вовки' })
      .expect(201);

    expect(responseA.body.slug).toBe('vovky');
    expect(responseB.body.slug).toBe('vovky');
  });
});
```

- [ ] **Step 6: Update the existing create test's assertion**

In `apps/api/test/hurtky.e2e-spec.ts`, in the test `'lets zvyazkovyi create a hurtok in their own kurin'`, add this line right after the existing `expect(response.body.number).toBe('3');`:

```ts
    expect(response.body.slug).toBe('orlyky');
```

- [ ] **Step 7: Write the backfill script**

Create `apps/api/src/scripts/backfill-hurtok-slugs.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { generateUniqueSlug } from '../hurtky/slug.util';

const prisma = new PrismaClient();

async function main() {
  const hurtky = await prisma.hurtok.findMany({ where: { slug: null } });
  for (const hurtok of hurtky) {
    const slug = await generateUniqueSlug(prisma, hurtok.kurinId, hurtok.name);
    await prisma.hurtok.update({ where: { id: hurtok.id }, data: { slug } });
    console.log(`${hurtok.name} (${hurtok.id}) -> ${slug}`);
  }
  console.log(`Backfilled ${hurtky.length} hurtok slug(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 8: Run the tests**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand hurtky`
Expected: all hurtky-related test files pass (`hurtky.e2e-spec.ts`, `hurtky-slug.e2e-spec.ts`, `hurtky-board.e2e-spec.ts` — the last one is untouched by this task and should still pass; Task 2 will replace it).

Run: `cd apps/api && npx tsc --noEmit` — expect clean.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/hurtky/slug.util.ts apps/api/src/hurtky/hurtky.service.ts apps/api/src/scripts/backfill-hurtok-slugs.ts apps/api/test/hurtky-slug.e2e-spec.ts apps/api/test/hurtky.e2e-spec.ts
git commit -m "feat: add Hurtok.slug with transliterated, collision-safe generation"
```

---

### Task 2: Backend — `GET /hurtky/by-slug/:slug` (replaces the old board endpoint)

**Files:**
- Modify: `apps/api/src/hurtky/hurtky.controller.ts`
- Modify: `apps/api/src/hurtky/hurtky.service.ts`
- Delete: `apps/api/test/hurtky-board.e2e-spec.ts`
- Test: `apps/api/test/hurtky-members.e2e-spec.ts`

**Interfaces:**
- Consumes: `Hurtok.slug` (Task 1), `KurinPosition` model and its `scope`/`positionType`/`hurtokId` fields (existing, from the Діловоди subproject), `USER_SELECT` (existing).
- Produces: `GET /hurtky/by-slug/:slug` (200 → `{ hurtok: { id, name, slug, number }, members: [{ id, firstName, lastName, nickname, email, role, birthDate, kurinId, hurtokId, positions: [{ positionType, scope, hurtokId }] }] }`, ordered by `lastName`/`firstName`; 404 if no hurtok in actor's kurin has that slug, or actor is a VYKHOVNYK not assigned to it). No later task in this plan depends on backend internals beyond this one HTTP route — Task 4 (frontend) consumes only the HTTP contract above.

- [ ] **Step 1: Replace `getBoard` with `getMembersBySlug`**

In `apps/api/src/hurtky/hurtky.service.ts`, remove the `getBoard` method entirely and add this in its place:

```ts
  async getMembersBySlug(slug: string, actor: CurrentUserPayload) {
    const hurtok = await this.prisma.hurtok.findFirst({ where: { kurinId: actor.kurinId, slug } });
    if (!hurtok) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }

    if (actor.role === Role.VYKHOVNYK) {
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId: hurtok.id },
      });
      if (!assigned) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }

    const junaky = await this.prisma.user.findMany({
      where: { hurtokId: hurtok.id, role: Role.JUNAK, kurinId: actor.kurinId },
      select: USER_SELECT,
    });
    const vykhovnykAssignments = await this.prisma.vykhovnykHurtok.findMany({
      where: { hurtokId: hurtok.id },
      include: { vykhovnyk: { select: USER_SELECT } },
    });
    const vykhovnyky = vykhovnykAssignments.map((a) => a.vykhovnyk);

    const members = [...junaky, ...vykhovnyky].sort(
      (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
    );

    const positions = await this.prisma.kurinPosition.findMany({
      where: { kurinId: actor.kurinId, removedAt: null, userId: { in: members.map((m) => m.id) } },
      select: { userId: true, positionType: true, scope: true, hurtokId: true },
    });
    const positionsByUserId = new Map<string, typeof positions>();
    for (const p of positions) {
      const list = positionsByUserId.get(p.userId) ?? [];
      list.push(p);
      positionsByUserId.set(p.userId, list);
    }

    return {
      hurtok: { id: hurtok.id, name: hurtok.name, slug: hurtok.slug, number: hurtok.number },
      members: members.map((m) => ({
        ...m,
        positions: (positionsByUserId.get(m.id) ?? []).map((p) => ({
          positionType: p.positionType,
          scope: p.scope,
          hurtokId: p.hurtokId,
        })),
      })),
    };
  }
```

Add `Role` and `USER_SELECT` imports if not already present at the top of the file (`Role` is already imported from `@prisma/client`; `USER_SELECT` is already imported from `'../users/user-select.const'` — both were already used by the removed `getBoard`, so no new imports needed).

- [ ] **Step 2: Replace the controller route**

In `apps/api/src/hurtky/hurtky.controller.ts`, change:

```ts
  @Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)
  @Get(':id/board')
  board(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getBoard(id, user);
  }
```

to:

```ts
  @Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)
  @Get('by-slug/:slug')
  membersBySlug(@Param('slug') slug: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getMembersBySlug(slug, user);
  }
```

(Note: placing this route ABOVE the existing `@Get()` `list` method in the file doesn't matter for NestJS routing since `by-slug/:slug` and the bare `@Get()` don't overlap — but do NOT place it below a hypothetical `@Get(':id')` if one existed, since `:id` would greedily match `by-slug` as a param value. This controller currently has no `@Get(':id')` route, only `@Get()` and the one being replaced, so ordering is not a concern here — just replace the method in place.)

- [ ] **Step 3: Delete the old test file**

```bash
git rm apps/api/test/hurtky-board.e2e-spec.ts
```

- [ ] **Step 4: Write the new e2e test**

Create `apps/api/test/hurtky-members.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, PositionScope, PositionType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

describe('GET /hurtky/by-slug/:slug (e2e)', () => {
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

  it('lets an assigned vykhovnyk see junaky and vykhovnyky in the hurtok, with their positions', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', slug: 'orlyky', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        hurtokId: hurtok.id,
        scope: PositionScope.HURTOK,
        positionType: PositionType.HURTKOVYI,
        userId: junak.id,
        assignedById: junak.id,
      },
    });

    const token = issueTokenFor(jwtService, vykhovnyk);
    const response = await request(app.getHttpServer())
      .get('/hurtky/by-slug/orlyky')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.hurtok.slug).toBe('orlyky');
    const memberIds = response.body.members.map((m: any) => m.id).sort();
    expect(memberIds).toEqual([junak.id, vykhovnyk.id].sort());
    const junakMember = response.body.members.find((m: any) => m.id === junak.id);
    expect(junakMember.positions).toHaveLength(1);
    expect(junakMember.positions[0].positionType).toBe('HURTKOVYI');
    expect(junakMember.passwordHash).toBeUndefined();
  });

  it('includes a kurinnyi among junaky, alongside regular junaky', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', slug: 'orlyky', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id, hurtokId: hurtok.id });

    const token = issueTokenFor(jwtService, vykhovnyk);
    const response = await request(app.getHttpServer())
      .get('/hurtky/by-slug/orlyky')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const junakIds = response.body.members
      .filter((m: any) => m.role === 'JUNAK')
      .map((m: any) => m.id)
      .sort();
    expect(junakIds).toEqual([junak.id, kurinnyi.id].sort());
  });

  it('returns 404 for a vykhovnyk not assigned to the hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    await prisma.hurtok.create({ data: { name: 'Орлики', slug: 'orlyky', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get('/hurtky/by-slug/orlyky')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('lets a zvyazkovyi view any hurtok in their kurin by slug', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    await prisma.hurtok.create({ data: { name: 'Орлики', slug: 'orlyky', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .get('/hurtky/by-slug/orlyky')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('forbids a kurinniy and a junak from viewing the members list', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    await prisma.hurtok.create({ data: { name: 'Орлики', slug: 'orlyky', kurinId: kurin.id } });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });

    await request(app.getHttpServer())
      .get('/hurtky/by-slug/orlyky')
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, kurinniy)}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/hurtky/by-slug/orlyky')
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
      .expect(403);
  });

  it('returns 404 for a slug that only exists in another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    await prisma.hurtok.create({ data: { name: 'HB', slug: 'hb', kurinId: kurinB.id } });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get('/hurtky/by-slug/hb')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand hurtky`
Expected: `hurtky.e2e-spec.ts`, `hurtky-slug.e2e-spec.ts`, `hurtky-members.e2e-spec.ts` all pass; `hurtky-board.e2e-spec.ts` no longer exists.

Run: `cd apps/api && npx tsc --noEmit` — expect clean.

Run the full e2e suite to confirm nothing else broke: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/hurtky/hurtky.controller.ts apps/api/src/hurtky/hurtky.service.ts apps/api/test/hurtky-members.e2e-spec.ts
git commit -m "refactor: replace GET /hurtky/:id/board with GET /hurtky/by-slug/:slug"
```

---

### Task 3: Backend — widen confirm/unconfirm to include ZVYAZKOVYI

**Files:**
- Modify: `apps/api/src/proby-progress/proby-progress.controller.ts`
- Modify: `apps/api/src/proby-progress/proby-progress.service.ts`
- Modify: `apps/api/test/proby-progress-confirm.e2e-spec.ts`

**Interfaces:**
- Consumes: nothing from other tasks in this plan (independent of Tasks 1-2).
- Produces: `POST /junaky/:junakId/progress/:pointId/confirm` and `.../unconfirm` now also accept `Role.ZVYAZKOVYI`, in addition to the existing `Role.VYKHOVNYK`. No later task in this plan depends on backend internals here beyond these two routes accepting ZVYAZKOVYI — Task 5 (frontend) consumes only this HTTP contract.

- [ ] **Step 1: Widen the `@Roles()` decorators**

In `apps/api/src/proby-progress/proby-progress.controller.ts`, change both occurrences of:

```ts
  @Roles(Role.VYKHOVNYK)
```

to:

```ts
  @Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)
```

(There are two occurrences — one above `confirm`, one above `unconfirm`. Change both.)

- [ ] **Step 2: Exempt ZVYAZKOVYI from the hurtok-assignment check**

In `apps/api/src/proby-progress/proby-progress.service.ts`, the full `assertAssignedVykhovnyk` method (lines 80-93, the last method in the file) currently reads:

```ts
  private async assertAssignedVykhovnyk(junakId: string, actor: CurrentUserPayload) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
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
```

Replace it with:

```ts
  private async assertCanConfirm(junakId: string, actor: CurrentUserPayload) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found');
    }
    if (actor.role === Role.ZVYAZKOVYI) {
      return junak;
    }
    const assigned = await this.prisma.vykhovnykHurtok.findFirst({
      where: { vykhovnykId: actor.userId, hurtokId: junak.hurtokId ?? undefined },
    });
    if (!assigned) {
      throw new ForbiddenException("Not assigned to this junak's hurtok");
    }
    return junak;
  }
```

Rename its two call sites — at line 40 (inside `confirm`) and line 60 (inside `unconfirm`), change `await this.assertAssignedVykhovnyk(junakId, actor);` to `await this.assertCanConfirm(junakId, actor);` (both call sites already discard the return value, so no other change is needed at either call site).

- [ ] **Step 3: Extend the e2e test**

`apps/api/test/proby-progress-confirm.e2e-spec.ts` already has a local `setup()` helper (defined near the top of the `describe` block) that returns `{ kurin, hurtok, junak, points }` via `createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1'])` + `createKurin` + a manually-created `hurtok` + a `junak` created with that `hurtokId`. Add this new test, using that existing `setup()` helper, as a new `it(...)` block alongside the file's existing tests:

```ts
  it('lets a zvyazkovyi confirm a point without being assigned to the hurtok', async () => {
    const { kurin, junak, points } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.status).toBe('DONE');
  });
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand proby-progress-confirm`
Expected: all tests pass, including the new one.

Run: `cd apps/api && npx tsc --noEmit` — expect clean.

Run the full e2e suite: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/proby-progress/proby-progress.controller.ts apps/api/src/proby-progress/proby-progress.service.ts apps/api/test/proby-progress-confirm.e2e-spec.ts
git commit -m "feat: let zvyazkovyi confirm/unconfirm proby points, not just vykhovnyk"
```

---

### Task 4: Frontend — human-readable hurtok URL and people-list page

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/queries/hurtky.ts`
- Create: `apps/web/app/[kurinId]/hurtky/[slug]/page.tsx`
- Delete: `apps/web/app/hurtky/[id]/page.tsx`
- Modify: `apps/web/app/hurtky/page.tsx`
- Test: `apps/web/e2e/hurtok-members.spec.ts`

**Interfaces:**
- Consumes: `GET /hurtky/by-slug/:slug` (Task 2), `useSession` (existing, for `session.kurinId`), `ROLE_LABELS`/`POSITION_LABELS` (existing, `apps/web/lib/role-labels.ts`).
- Produces: `HurtokMembers` type (`apps/web/lib/types.ts`). `useHurtokBySlug(slug)` hook (`apps/web/lib/queries/hurtky.ts`). No later task in this plan depends on these beyond this task's own page.

- [ ] **Step 1: Update types**

In `apps/web/lib/types.ts`, change:

```ts
export interface Hurtok {
  id: string;
  kurinId: string;
  name: string;
  number: string | null;
}
```

to:

```ts
export interface Hurtok {
  id: string;
  kurinId: string;
  name: string;
  slug: string | null;
  number: string | null;
}
```

Replace the `HurtokBoard` interface entirely with:

```ts
export interface HurtokMember extends UserSummary {
  positions: { positionType: PositionType; scope: PositionScope; hurtokId: string | null }[];
}

export interface HurtokMembers {
  hurtok: { id: string; name: string; slug: string | null; number: string | null };
  members: HurtokMember[];
}
```

- [ ] **Step 2: Update the query hooks**

In `apps/web/lib/queries/hurtky.ts`, replace the full file content:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
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
```

(This removes `useHurtokBoard`, `useConfirmPoint`, and `useUnconfirmPoint` from this file — the confirm/unconfirm mutations move to `apps/web/lib/queries/proby.ts` in Task 5, since they're used from the junak detail page now, not the hurtok page. `useHurtokBoard` is deleted outright, replaced by `useHurtokBySlug`.)

- [ ] **Step 3: Write the new hurtok page**

Create `apps/web/app/[kurinId]/hurtky/[slug]/page.tsx`:

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useHurtokBySlug } from '@/lib/queries/hurtky';
import { ROLE_LABELS, POSITION_LABELS } from '@/lib/role-labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { accessErrorMessage } from '@/lib/error-message';

export default function HurtokMembersPage({ params }: { params: Promise<{ kurinId: string; slug: string }> }) {
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

- [ ] **Step 4: Delete the old page**

```bash
git rm apps/web/app/hurtky/[id]/page.tsx
```

- [ ] **Step 5: Update the hurtky list page's links**

In `apps/web/app/hurtky/page.tsx`, change:

```tsx
        {displayedHurtky.map((h) => (
          <Link key={h.id} href={`/hurtky/${h.id}`}>
```

to:

```tsx
        {displayedHurtky.map((h) => (
          <Link key={h.id} href={`/${session?.kurinId}/hurtky/${h.slug}`}>
```

- [ ] **Step 6: Write the e2e test**

Create `apps/web/e2e/hurtok-members.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi navigate from the hurtok list to a human-readable hurtok URL', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Вовки');
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/hurtky');
  await page.getByText('Вовки').click();

  await expect(page).toHaveURL(/\/hurtky\/vovky$/);
  await expect(page.getByText('Петренко Петро')).toBeVisible();

  await page.getByText('Петренко Петро').click();
  await expect(page).toHaveURL(/\/users\//);
});
```

(`createHurtok` and `createUserAs` in `apps/web/e2e/helpers/proby-seed.ts` both return the raw created-resource JSON from their respective `POST` responses, so `hurtok.id` and the created junak's `.lastName`/`.firstName` above are valid.)

- [ ] **Step 7: Run the tests**

Run: `cd apps/web && npx tsc --noEmit` — expect clean.

`apps/web/e2e/board.spec.ts` navigates directly to the now-deleted `/hurtky/[id]` route and confirms a point there (as a VYKHOVNYK) — it will fail to even load that page once Step 4 removes it. Delete this test file outright:

```bash
git rm apps/web/e2e/board.spec.ts
```

The capability it tested (confirming a point from a page, as a VYKHOVNYK) is not lost: Task 3's backend e2e suite already covers VYKHOVNYK-confirms (pre-existing, unchanged by this plan) and Task 5's `junak-proba-detail.spec.ts` covers the same UI button/flow on the new page (as ZVYAZKOVYI, the actually-new capability this plan adds) — the frontend confirm/unconfirm button is the same component regardless of which of the two allowed roles clicks it, so one frontend e2e test of that button is sufficient; per-role access differences are the backend's responsibility and are already covered there.

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test`
Expected: the full suite passes, including the new `hurtok-members.spec.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/queries/hurtky.ts apps/web/app/[kurinId] apps/web/app/hurtky/page.tsx apps/web/e2e/hurtok-members.spec.ts apps/web/e2e/board.spec.ts
git commit -m "feat: human-readable hurtok URL with a people-list page"
```

---

### Task 5: Frontend — collapsible "Проба" block on the junak detail page

**Files:**
- Modify: `apps/web/lib/queries/proby.ts`
- Modify: `apps/web/app/users/[id]/page.tsx`
- Test: `apps/web/e2e/junak-proba-detail.spec.ts`

**Interfaces:**
- Consumes: `POST /junaky/:id/progress/:pointId/confirm|unconfirm` (Task 3, now also ZVYAZKOVYI-accessible), `useProbyProgram`/`useJunakProgress` (existing, `apps/web/lib/queries/proby.ts`), `ProbyStage`/`ProbyCategory`/`ProbyPoint`/`JunakProgress` types (existing).
- Produces: `useConfirmPoint(junakId)`/`useUnconfirmPoint(junakId)` in `apps/web/lib/queries/proby.ts` — no later task in this plan depends on these.

- [ ] **Step 1: Move confirm/unconfirm hooks to `proby.ts`**

In `apps/web/lib/queries/proby.ts`, add these two exports (keep the existing `useProbyProgram`/`useJunakProgress` as-is, just add to the file):

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
```

(Add `useMutation, useQueryClient` to the existing `import { useQuery } from '@tanstack/react-query';` line — merge into one import statement rather than adding a duplicate.)

```ts
export function useConfirmPoint(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pointId: string) =>
      apiFetch(`/junaky/${junakId}/progress/${pointId}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['junaky', junakId, 'progress'] });
    },
  });
}

export function useUnconfirmPoint(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pointId: string) =>
      apiFetch(`/junaky/${junakId}/progress/${pointId}/unconfirm`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['junaky', junakId, 'progress'] });
    },
  });
}
```

- [ ] **Step 2: Add the collapsible category component and the "Проба" card**

Open `apps/web/app/users/[id]/page.tsx`. Add these imports alongside the existing ones:

```tsx
import { useProbyProgram, useJunakProgress, useConfirmPoint, useUnconfirmPoint } from '@/lib/queries/proby';
import type { ProbyCategory } from '@/lib/types';
```

Add this new component anywhere above `UserDetailPage` (e.g. right after `AddGuardianContactForm`):

```tsx
function ProbyCategorySection({
  category,
  doneByPointId,
  canConfirm,
  onConfirm,
  onUnconfirm,
}: {
  category: ProbyCategory;
  doneByPointId: Set<string>;
  canConfirm: boolean;
  onConfirm: (pointId: string) => void;
  onUnconfirm: (pointId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const doneCount = category.points.filter((p) => doneByPointId.has(p.id)).length;

  return (
    <div className="border-b py-2 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-left font-semibold"
      >
        <span>
          {category.name} ({doneCount}/{category.points.length})
        </span>
        <span aria-hidden>{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && (
        <ul className="mt-2 space-y-1 pl-4">
          {category.points
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((point) => {
              const done = doneByPointId.has(point.id);
              return (
                <li key={point.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <span aria-hidden>{done ? '✅' : '⬜'}</span> {point.description}
                  </span>
                  {canConfirm &&
                    (done ? (
                      <Button variant="outline" size="sm" onClick={() => onUnconfirm(point.id)}>
                        Зняти
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => onConfirm(point.id)}>
                        Підтвердити
                      </Button>
                    ))}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
```

Inside `UserDetailPage`, add these hook calls right after the existing `const { data: guardianContacts, isError, error } = useGuardianContacts(id, { enabled: !!canEditContactInfo });` block:

```tsx
  const isJunak = user?.role === 'JUNAK';
  const { data: probyProgram } = useProbyProgram();
  const { data: junakProgress } = useJunakProgress(isJunak ? id : undefined);
  const confirmPoint = useConfirmPoint(id);
  const unconfirmPoint = useUnconfirmPoint(id);
  const canConfirmProby = session?.role === 'VYKHOVNYK' || session?.role === 'ZVYAZKOVYI';
```

Add this new `<Card>` right after the "Опікуни" `<Card>` block (before the "Змінити ПІБ" card):

```tsx
      {isJunak && probyProgram && (
        <Card>
          <CardHeader>
            <CardTitle>Проба</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const doneByPointId = new Set(
                (junakProgress ?? []).filter((p) => p.status === 'DONE').map((p) => p.pointId),
              );
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
            })()}
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 3: Write the e2e test**

Create `apps/web/e2e/junak-proba-detail.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi expand a proba category and confirm a point from the junak detail page', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: `junak-proba-${Date.now()}@example.com`,
    role: 'JUNAK',
    password: 'password123',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/${junak.id}`);

  await expect(page.getByText('Проба')).toBeVisible();
  await page.getByText('Категорія 1 (0/1)').click();
  await expect(page.getByRole('button', { name: 'Підтвердити' })).toBeVisible();

  await page.getByRole('button', { name: 'Підтвердити' }).click();
  await expect(page.getByRole('button', { name: 'Зняти' })).toBeVisible();
});
```

(`seedProbyProgram()` with no arguments, per `apps/web/e2e/helpers/seed.ts`, seeds exactly one stage named `'Ступінь 1'` containing one category named `'Категорія 1'` with one point described `'Точка 1'` — the assertions above use these exact literal names, not placeholders.)

- [ ] **Step 4: Run the tests**

Run: `cd apps/web && npx tsc --noEmit` — expect clean.

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test`
Expected: the full suite passes, including the new `junak-proba-detail.spec.ts` and every pre-existing spec (including whatever Task 4's Step 7 did with `board.spec.ts`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/proby.ts apps/web/app/users/[id]/page.tsx apps/web/e2e/junak-proba-detail.spec.ts
git commit -m "feat: collapsible Проба block on junak detail page, confirmable by zvyazkovyi too"
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

Then, before deploying: this plan's migration (Task 1's additive `Hurtok.slug` column) applies automatically via the existing `git pull && docker compose up -d --build` flow (the container's start command runs `prisma migrate deploy`). **After that deploy, the backfill script must be run manually once** (mirrors the real-proby-content seed script's pattern):

```bash
docker compose exec api node dist/scripts/backfill-hurtok-slugs.js
```

Only after this runs will existing hurtky (created before this plan shipped) have a working `/[kurinId]/hurtky/[slug]` URL — until then, their `slug` is `null` and `GET /hurtky/by-slug/:slug` won't match anything for them (new hurtky created after this deploy get a slug automatically, no backfill needed for those).
