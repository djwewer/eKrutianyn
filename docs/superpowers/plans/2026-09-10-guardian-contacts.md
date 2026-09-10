# Контакти опікунів Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a simple guardian/parent contact list per junak — a new `GuardianContact` model with full CRUD, gated by the same access rule as the existing junak contact-info editing, plus a new "Опікуни" section on the junak detail page.

**Architecture:** One new Prisma model (`GuardianContact`, many-per-junak) and one new NestJS module (`guardian-contacts`) nested under `/users/:junakId/guardian-contacts`, reusing the exact access-control pattern from `UsersService.updateContactInfo`. Frontend adds one new query-hooks file and one new card section on the existing junak detail page.

**Tech Stack:** NestJS + Prisma + PostgreSQL (backend, unchanged), Next.js App Router + TanStack Query (frontend, unchanged).

## Global Constraints

- **Additive migration only.** Production has live data (a real kurin, real users). This plan's migration adds one new table (`GuardianContact`) and one new relation field on `User` — no `ALTER` on any existing column.
- **Access control is exactly this rule, copied from `UsersService.updateContactInfo`** (`apps/api/src/users/users.service.ts:61-68`): `actor.role === Role.ZVYAZKOVYI || actor.isKurinniy` to act at all, AND the target `:junakId` must resolve to a `User` with `role === Role.JUNAK` and `kurinId === actor.kurinId` (otherwise 404, not 403 — matches the existing pattern of hiding cross-kurin resources behind 404).
- **VYKHOVNYK gets no access at all** — not even read. This is an explicit, deliberate decision from the design spec's brainstorming, not an oversight — do not add any VYKHOVNYK branch.
- **All guardian records for one junak are equal-priority.** No "primary contact" flag, no ordering beyond creation order.
- **No phone/email format validation.** Plain strings — `name` and `phone` required, `role` and `email` optional free text. Do not add `@IsEmail()` or a phone-format regex.
- Git hygiene: every commit uses exact file paths in `git add`, never `-A` or `.`.

---

### Task 1: Backend — `GuardianContact` model + CRUD module

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/guardian-contacts/dto/create-guardian-contact.dto.ts`
- Create: `apps/api/src/guardian-contacts/dto/update-guardian-contact.dto.ts`
- Create: `apps/api/src/guardian-contacts/guardian-contacts.service.ts`
- Create: `apps/api/src/guardian-contacts/guardian-contacts.controller.ts`
- Create: `apps/api/src/guardian-contacts/guardian-contacts.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/guardian-contacts.e2e-spec.ts`

**Interfaces:**
- Consumes: `CurrentUserPayload` (`apps/api/src/common/decorators/current-user.decorator.ts`, existing — has `userId`, `role`, `kurinId`, `isKurinniy`), `JwtAuthGuard`/`RolesGuard` (existing, `apps/api/src/common/guards/`).
- Produces: `GET /users/:junakId/guardian-contacts` (200 → `GuardianContact[]`, each `{ id, name, phone, role, email, createdAt, updatedAt }`, ordered by `createdAt` ascending). `POST /users/:junakId/guardian-contacts` (body `{ name, phone, role?, email? }`, 200/201 → the created record). `PATCH /users/:junakId/guardian-contacts/:guardianId` (body any subset of `{ name, phone, role, email }`, 200/201 → the updated record, 404 if `guardianId` doesn't belong to `junakId`). `DELETE /users/:junakId/guardian-contacts/:guardianId` (200/201 → `{ success: true }`). All four: 403 if actor isn't `ZVYAZKOVYI`/`isKurinniy`; 404 if `junakId` isn't a `JUNAK` in actor's kurin. No later task in this plan depends on backend internals beyond these four HTTP routes — Task 2 (frontend) consumes only the HTTP contract above.

- [ ] **Step 1: Add the schema additions**

Open `apps/api/prisma/schema.prisma`. Add this model anywhere after the `KurinPosition` model:

```prisma
model GuardianContact {
  id        String   @id @default(uuid())
  junakId   String
  junak     User     @relation("JunakGuardians", fields: [junakId], references: [id])
  name      String
  phone     String
  role      String?
  email     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

In the `User` model, add this line right after the existing `positionsRemoved  KurinPosition[] @relation("PositionRemovedBy")` line:

```prisma
  guardianContacts  GuardianContact[] @relation("JunakGuardians")
```

- [ ] **Step 2: Generate and apply the migration**

Run (from `apps/api/`, against your local dev database):

```bash
npx prisma migrate dev --name add_guardian_contacts
```

Expected: it prints `Your database is now in sync with your schema`, and the generated `migration.sql` contains only `CREATE TABLE "GuardianContact"` and `ADD CONSTRAINT` (the FK to `User`) — no `ALTER TABLE` on `User`'s existing columns (the new relation field on `User` is virtual — Prisma doesn't add a column for the "many" side of a relation). If you see anything touching an existing column, stop — Step 1 was applied incorrectly.

- [ ] **Step 3: Write the DTOs**

Create `apps/api/src/guardian-contacts/dto/create-guardian-contact.dto.ts`:

```ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateGuardianContactDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() email?: string;
}
```

Create `apps/api/src/guardian-contacts/dto/update-guardian-contact.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';

export class UpdateGuardianContactDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() email?: string;
}
```

- [ ] **Step 4: Write the service**

Create `apps/api/src/guardian-contacts/guardian-contacts.service.ts`:

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateGuardianContactDto } from './dto/create-guardian-contact.dto';
import { UpdateGuardianContactDto } from './dto/update-guardian-contact.dto';

@Injectable()
export class GuardianContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertAccess(junakId: string, actor: CurrentUserPayload): Promise<void> {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.isKurinniy) {
      throw new ForbiddenException('Insufficient role');
    }
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found');
    }
  }

  async list(junakId: string, actor: CurrentUserPayload) {
    await this.assertAccess(junakId, actor);
    return this.prisma.guardianContact.findMany({
      where: { junakId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(junakId: string, dto: CreateGuardianContactDto, actor: CurrentUserPayload) {
    await this.assertAccess(junakId, actor);
    return this.prisma.guardianContact.create({
      data: { junakId, name: dto.name, phone: dto.phone, role: dto.role, email: dto.email },
    });
  }

  async update(junakId: string, guardianId: string, dto: UpdateGuardianContactDto, actor: CurrentUserPayload) {
    await this.assertAccess(junakId, actor);
    const contact = await this.prisma.guardianContact.findUnique({ where: { id: guardianId } });
    if (!contact || contact.junakId !== junakId) {
      throw new NotFoundException('Guardian contact not found');
    }
    return this.prisma.guardianContact.update({
      where: { id: guardianId },
      data: { name: dto.name, phone: dto.phone, role: dto.role, email: dto.email },
    });
  }

  async remove(junakId: string, guardianId: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    await this.assertAccess(junakId, actor);
    const contact = await this.prisma.guardianContact.findUnique({ where: { id: guardianId } });
    if (!contact || contact.junakId !== junakId) {
      throw new NotFoundException('Guardian contact not found');
    }
    await this.prisma.guardianContact.delete({ where: { id: guardianId } });
    return { success: true };
  }
}
```

- [ ] **Step 5: Write the controller**

Create `apps/api/src/guardian-contacts/guardian-contacts.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { GuardianContactsService } from './guardian-contacts.service';
import { CreateGuardianContactDto } from './dto/create-guardian-contact.dto';
import { UpdateGuardianContactDto } from './dto/update-guardian-contact.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users/:junakId/guardian-contacts')
export class GuardianContactsController {
  constructor(private readonly service: GuardianContactsService) {}

  @Get()
  list(@Param('junakId') junakId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(junakId, user);
  }

  @Post()
  create(
    @Param('junakId') junakId: string,
    @Body() dto: CreateGuardianContactDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(junakId, dto, user);
  }

  @Patch(':guardianId')
  update(
    @Param('junakId') junakId: string,
    @Param('guardianId') guardianId: string,
    @Body() dto: UpdateGuardianContactDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(junakId, guardianId, dto, user);
  }

  @Delete(':guardianId')
  remove(
    @Param('junakId') junakId: string,
    @Param('guardianId') guardianId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(junakId, guardianId, user);
  }
}
```

(No `@Roles()` decorator on any route — the access rule is `ZVYAZKOVYI OR isKurinniy`, which the simple `@Roles()` allowlist can't express; `RolesGuard` allows any authenticated request through when no `@Roles()` metadata is present, matching the exact pattern already used by `updateContactInfo`'s controller method, and the real check lives in the service's `assertAccess`.)

- [ ] **Step 6: Write the module**

Create `apps/api/src/guardian-contacts/guardian-contacts.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GuardianContactsController } from './guardian-contacts.controller';
import { GuardianContactsService } from './guardian-contacts.service';

@Module({
  imports: [AuthModule],
  controllers: [GuardianContactsController],
  providers: [GuardianContactsService],
})
export class GuardianContactsModule {}
```

- [ ] **Step 7: Wire into `AppModule`**

In `apps/api/src/app.module.ts`, add the import:

```ts
import { GuardianContactsModule } from './guardian-contacts/guardian-contacts.module';
```

Add `GuardianContactsModule` to the `imports` array (anywhere, e.g. right after `KurinPositionsModule`).

- [ ] **Step 8: Write the e2e test**

Create `apps/api/test/guardian-contacts.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

describe('guardian-contacts (e2e)', () => {
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

  it('lets zvyazkovyi add, list, edit, and remove a guardian contact', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const created = await request(app.getHttpServer())
      .post(`/users/${junak.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Марія Петренко', phone: '+380501234567', role: 'Мама' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(created.body.name).toBe('Марія Петренко');
    expect(created.body.email).toBeNull();

    const list = await request(app.getHttpServer())
      .get(`/users/${junak.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);

    const updated = await request(app.getHttpServer())
      .patch(`/users/${junak.id}/guardian-contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+380509999999' })
      .expect(200);
    expect(updated.body.phone).toBe('+380509999999');
    expect(updated.body.name).toBe('Марія Петренко');

    await request(app.getHttpServer())
      .delete(`/users/${junak.id}/guardian-contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const listAfterDelete = await request(app.getHttpServer())
      .get(`/users/${junak.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listAfterDelete.body).toHaveLength(0);
  });

  it('lets a kurinniy holder manage guardian contacts too', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinnyi);

    await request(app.getHttpServer())
      .post(`/users/${junak.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Іван Петренко', phone: '+380501111111' })
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('forbids a vykhovnyk from any access', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get(`/users/${junak.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/users/${junak.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Хтось', phone: '+380500000000' })
      .expect(403);
  });

  it('returns 404 for a junak in another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const junakB = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinB.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get(`/users/${junakB.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 404 when guardianId belongs to a different junak', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak1 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const junak2 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const created = await request(app.getHttpServer())
      .post(`/users/${junak1.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Хтось', phone: '+380500000000' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .patch(`/users/${junak2.id}/guardian-contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+380501111111' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/users/${junak2.id}/guardian-contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
```

- [ ] **Step 9: Run the tests**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand guardian-contacts`
Expected: 5 tests pass.

Run: `cd apps/api && npx tsc --noEmit` — expect clean.

Run the full e2e suite to confirm nothing already broke: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`
Expected: every test still passes.

- [ ] **Step 10: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/guardian-contacts apps/api/src/app.module.ts apps/api/test/guardian-contacts.e2e-spec.ts
git commit -m "feat: add guardian-contacts CRUD module"
```

---

### Task 2: Frontend — "Опікуни" section on the junak detail page

**Files:**
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/queries/guardian-contacts.ts`
- Modify: `apps/web/app/users/[id]/page.tsx`
- Test: `apps/web/e2e/guardian-contacts.spec.ts`

**Interfaces:**
- Consumes: `GET/POST /users/:junakId/guardian-contacts`, `PATCH/DELETE /users/:junakId/guardian-contacts/:guardianId` (Task 1), `apiFetch` (`apps/web/lib/api-client.ts`, existing), `useSession` (`apps/web/lib/session-client.ts`, existing), `useUser` (`apps/web/lib/queries/users.ts`, existing).
- Produces: `GuardianContact` type (`apps/web/lib/types.ts`) — no later task in this plan depends on it beyond this task's own page.

- [ ] **Step 1: Add the type**

In `apps/web/lib/types.ts`, add this type anywhere (e.g. right after `KurinPosition`):

```ts
export interface GuardianContact {
  id: string;
  name: string;
  phone: string;
  role: string | null;
  email: string | null;
}
```

- [ ] **Step 2: Write the query hooks**

Create `apps/web/lib/queries/guardian-contacts.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { GuardianContact } from '@/lib/types';

export function useGuardianContacts(junakId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['guardian-contacts', junakId],
    queryFn: () => apiFetch<GuardianContact[]>(`/users/${junakId}/guardian-contacts`),
    enabled: options?.enabled ?? true,
  });
}

export function useAddGuardianContact(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; phone: string; role?: string; email?: string }) =>
      apiFetch<GuardianContact>(`/users/${junakId}/guardian-contacts`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardian-contacts', junakId] });
    },
  });
}

export function useUpdateGuardianContact(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; phone?: string; role?: string; email?: string }) =>
      apiFetch<GuardianContact>(`/users/${junakId}/guardian-contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardian-contacts', junakId] });
    },
  });
}

export function useRemoveGuardianContact(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/users/${junakId}/guardian-contacts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardian-contacts', junakId] });
    },
  });
}
```

- [ ] **Step 3: Add the "Опікуни" section to the junak detail page**

Open `apps/web/app/users/[id]/page.tsx`. Add these imports at the top, alongside the existing ones:

```tsx
import { useState } from 'react';
import {
  useGuardianContacts,
  useAddGuardianContact,
  useUpdateGuardianContact,
  useRemoveGuardianContact,
} from '@/lib/queries/guardian-contacts';
import type { GuardianContact } from '@/lib/types';
```

(`useState` is likely already imported from `react` alongside `use, useEffect` on the existing `import { use, useState, useEffect } from 'react';` line — merge into that line instead of duplicating the import if so.)

Add these two new components anywhere in the file above the `UserDetailPage` function:

```tsx
function GuardianContactRow({
  contact,
  junakId,
}: {
  contact: GuardianContact;
  junakId: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phone);
  const [role, setRole] = useState(contact.role ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const update = useUpdateGuardianContact(junakId);
  const remove = useRemoveGuardianContact(junakId);

  if (isEditing) {
    return (
      <div className="space-y-2 border-b py-2 last:border-b-0">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ім'я" />
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон" />
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Роль (мама, тато...)" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              update.mutate(
                { id: contact.id, name, phone, role: role || undefined, email: email || undefined },
                { onSuccess: () => setIsEditing(false) },
              )
            }
          >
            Зберегти
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
            Скасувати
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-b-0">
      <div>
        <p className="font-medium">
          {contact.name}
          {contact.role && ` (${contact.role})`}
        </p>
        <p className="text-muted-foreground">
          {contact.phone}
          {contact.email && ` · ${contact.email}`}
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
          Редагувати
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => remove.mutate(contact.id)}
          disabled={remove.isPending}
        >
          Видалити
        </Button>
      </div>
    </div>
  );
}

function AddGuardianContactForm({ junakId }: { junakId: string }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const add = useAddGuardianContact(junakId);

  return (
    <div className="space-y-2 pt-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ім'я" />
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон" />
      <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Роль (мама, тато...)" />
      <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <Button
        size="sm"
        disabled={!name || !phone || add.isPending}
        onClick={() =>
          add.mutate(
            { name, phone, role: role || undefined, email: email || undefined },
            {
              onSuccess: () => {
                setName('');
                setPhone('');
                setRole('');
                setEmail('');
              },
            },
          )
        }
      >
        Додати опікуна
      </Button>
    </div>
  );
}
```

Inside the `UserDetailPage` function, add this hook call right after the existing `const updateContactInfo = useUpdateContactInfo(id);` line:

```tsx
  const canEditContactInfo =
    (session?.role === 'ZVYAZKOVYI' || session?.isKurinniy) && user?.role === 'JUNAK';
  const { data: guardianContacts } = useGuardianContacts(id, { enabled: !!canEditContactInfo });
```

(Note: this moves the `canEditContactInfo` computation earlier than its current location — the existing line `const canEditContactInfo = (session?.role === 'ZVYAZKOVYI' || session?.isKurinniy) && user.role === 'JUNAK';` currently sits after the `if (isLoading) return ...; if (!user) return ...;` early returns, at which point `user` is guaranteed non-null. Since hooks must be called unconditionally before any early return, this new computation uses `user?.role` — the optional-chained version — so it can run before those return statements. Delete the old, later `canEditContactInfo` line entirely; this new one replaces it. `useGuardianContacts` reading `user?.role` this early is safe: if `user` isn't loaded yet, `canEditContactInfo` is falsy, so the query stays disabled until it is.)

Add this new `<Card>` right after the existing "Контакти" `<Card>` block (before the "Змінити ПІБ" card):

```tsx
      {canEditContactInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Опікуни</CardTitle>
          </CardHeader>
          <CardContent>
            {(guardianContacts ?? []).map((contact) => (
              <GuardianContactRow key={contact.id} contact={contact} junakId={id} />
            ))}
            <AddGuardianContactForm junakId={id} />
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 4: Write the e2e test**

Create `apps/web/e2e/guardian-contacts.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi add and remove a guardian contact from the junak detail page', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const junakEmail = `junak-guardian-${Date.now()}@example.com`;
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: junakEmail,
    role: 'JUNAK',
    password: 'password123',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/${junak.id}`);

  await page.getByPlaceholder("Ім'я").fill('Марія Петренко');
  await page.getByPlaceholder('Телефон').fill('+380501234567');
  await page.getByPlaceholder('Роль (мама, тато...)').fill('Мама');
  await page.getByRole('button', { name: 'Додати опікуна' }).click();

  await expect(page.getByText('Марія Петренко (Мама)')).toBeVisible();

  await page.getByRole('button', { name: 'Видалити' }).click();
  await expect(page.getByText('Марія Петренко (Мама)')).not.toBeVisible();
});
```

Check `apps/web/e2e/helpers/proby-seed.ts`'s `createUserAs` return shape before using `junak.id` above — if it doesn't already return the created user's `id`, adjust this test to fetch it another way (e.g. via the zvyazkovyi's `GET /users?role=JUNAK` list) rather than modifying the shared helper.

- [ ] **Step 5: Run the tests**

Run: `cd apps/web && npx tsc --noEmit` — expect clean.

Run: `cd apps/web && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ADMIN_API_KEY="dev-admin-key" JWT_SECRET="dev-jwt-secret" npx playwright test`
Expected: the full suite passes, including the new `guardian-contacts.spec.ts` and every pre-existing spec.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/queries/guardian-contacts.ts apps/web/app/users/[id]/page.tsx apps/web/e2e/guardian-contacts.spec.ts
git commit -m "feat: add Опікуни section to junak detail page"
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

Deploys via the existing `git pull && docker compose up -d --build` flow — the container's start command already runs `prisma migrate deploy`. No new environment variables are needed.
