# Доопрацювання інтерфейсу гуртків — план імплементації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Додати модальне вікно "Налаштування гуртка" (виховник, 4 посади-"діловоди", дата заснування, розформування) і перетворити `/hurtky` з карткового списку на акордеон із тим самим вмістом, що й окрема сторінка гуртка, в розгорнутому рядку.

**Architecture:** Новий nullable `Hurtok.foundedAt` + новий `PATCH /hurtky/:id`. Переважна більшість потрібної бекенд-функціональності (призначення посад, виховника, архівація) вже існує — нові бекенд-зміни мінімальні. На фронтенді вміст поточної сторінки гуртка виноситься у спільний компонент `HurtokDetailPanel`, що рендериться і зі старої сторінки (без змін для прямих посилань), і з розгорнутого рядка нового акордеону на `/hurtky`.

**Tech Stack:** NestJS + Prisma (apps/api), Next.js + React Query (apps/web), Jest e2e (apps/api/test), Playwright e2e (apps/web/e2e). Модальне вікно будується на вже встановленому `@base-ui/react/dialog` (та сама бібліотека, яку вже використовує `components/ui/button.tsx`) — нових npm-залежностей не додається.

## Global Constraints

- Усі нові мутуючі ендпоінти — `@Roles(Role.ZVYAZKOVYI)`, з перевіркою `hurtok.kurinId === actor.kurinId` (інакше `NotFoundException` — 404 для чужого куреня).
- Нова Prisma-міграція застосовується в ОБОХ базах: `cd apps/api && npx prisma migrate dev --name add_hurtok_founded_at` (dev, `plast_dev`), потім `DATABASE_URL="postgresql://plast:plast@localhost:5432/plast_test" npx prisma migrate deploy` (test, `plast_test`) — пропуск другого ламає всі подальші e2e-тести помилкою "column does not exist".
- Усі `cd apps/api && npm run test:e2e` команди в цьому плані ОБОВ'ЯЗКОВО префіксуються `DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" ` — без цього тести мовчки підключаються до `plast_dev` і хибно падають.
- `apps/web/playwright.config.ts` вже налаштований під Chromium цього середовища (`launchOptions.executablePath`, не комітиться) — усі Playwright-команди з `--workers=1`.
- Якщо нативний Postgres не запущено — `service postgresql start`.
- Жодних нових npm-залежностей.
- Аватар/сильветка гуртка — НЕ робимо (відкинуто користувачем).
- Назва (`name`) гуртка лишається нередагованою в цій фічі.
- Один виховник на гурток на рівні інтерфейсу (бекенд технічно дозволяє більше — не змінюємо бекенд).
- `VykhovnykAssignmentsService.assign` НЕ знімає автоматично попереднього виховника — заміна на фронтенді це завжди дві послідовні дії (`DELETE` старого, потім `POST` нового).
- `KurinPositionsService.assign` АВТОМАТИЧНО знімає попереднього утримувача слоту — заміна на фронтенді це один виклик.
- Хуки `useAssignPosition`/`useRemovePosition`/`useAssignVykhovnyk`/`useUnassignVykhovnyk` інвалідують лише `['kurin-positions']`/`['vykhovnyk-assignments']` — НЕ `['hurtky', 'by-slug', slug]`. Після їх успіху в `HurtokSettingsDialog` потрібно вручну інвалідувати `['hurtky', 'by-slug', slug]`, інакше розгорнутий рядок/сторінка гуртка не покаже зміну без ручного оновлення.

---

### Task 1: Prisma-схема — `Hurtok.foundedAt`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: міграція через `npx prisma migrate dev --name add_hurtok_founded_at` (запускати з `apps/api`)

**Interfaces:**
- Produces: `Hurtok.foundedAt: DateTime?` — споживається Task 2 (бекенд) і Task 3 (фронтенд-типи).

- [ ] **Step 1: Додати поле в схему**

У `apps/api/prisma/schema.prisma`, у моделі `Hurtok`, додати `foundedAt` (nullable, без значення за замовчуванням — не бекфілимо старі гуртки):

```prisma
model Hurtok {
  id      String  @id @default(uuid())
  kurinId String
  kurin   Kurin   @relation(fields: [kurinId], references: [id])
  name    String
  slug    String?
  number  String?
  foundedAt    DateTime?
  archivedAt   DateTime?
  archivedById String?
  archivedBy   User?     @relation("HurtokArchivedBy", fields: [archivedById], references: [id])

  junaky               User[]            @relation("JunakHurtok")
  vykhovnykAssignments VykhovnykHurtok[]
  positions KurinPosition[]
}
```

- [ ] **Step 2: Згенерувати і застосувати міграцію в dev-базі**

Run: `cd apps/api && npx prisma migrate dev --name add_hurtok_founded_at`
Expected: нова папка в `apps/api/prisma/migrations/`, вивід закінчується "Your database is now in sync with your schema."

- [ ] **Step 3: Застосувати ту саму міграцію в test-базі**

Run: `cd apps/api && DATABASE_URL="postgresql://plast:plast@localhost:5432/plast_test" npx prisma migrate deploy`
Expected: "1 migration found... Applied." (або "No pending migrations" якщо вже застосовано — не повинно бути помилок).

- [ ] **Step 4: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: без помилок

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: add Hurtok.foundedAt column"
```

---

### Task 2: `PATCH /hurtky/:id` — редагування дати заснування

**Files:**
- Create: `apps/api/src/hurtky/dto/update-hurtok.dto.ts`
- Modify: `apps/api/src/hurtky/hurtky.service.ts`
- Modify: `apps/api/src/hurtky/hurtky.controller.ts`
- Test: `apps/api/test/hurtky-update.e2e-spec.ts` (new file)

**Interfaces:**
- Consumes: `Hurtok.foundedAt` з Task 1.
- Produces: `HurtkyService.update(hurtokId: string, dto: UpdateHurtokDto, actor: CurrentUserPayload): Promise<Hurtok>`, `PATCH /hurtky/:id` (ZVYAZKOVYI only) — споживається Task 3's `useUpdateHurtok`. Також додає `foundedAt` у відповідь `getMembersBySlug()` — споживається Task 6 (модалка показує поточну дату) і Task 5 (`HurtokDetailPanel` показує дату в заголовку).

- [ ] **Step 1: Написати падаючі e2e-тести**

Create `apps/api/test/hurtky-update.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Hurtok update (e2e)', () => {
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

  it('lets zvyazkovyi set the founding date of a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: '2020-09-01' })
      .expect(200);

    expect(response.body.id).toBe(hurtok.id);
    const updated = await prisma.hurtok.findUnique({ where: { id: hurtok.id } });
    expect(updated?.foundedAt?.toISOString().slice(0, 10)).toBe('2020-09-01');
  });

  it('lets zvyazkovyi clear the founding date', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({
      data: { name: 'Орлики', kurinId: kurin.id, foundedAt: new Date('2020-09-01') },
    });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: null })
      .expect(200);

    const updated = await prisma.hurtok.findUnique({ where: { id: hurtok.id } });
    expect(updated?.foundedAt).toBeNull();
  });

  it('rejects an invalid date string', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: 'not-a-date' })
      .expect(400);
  });

  it('forbids a non-zvyazkovyi from updating a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: '2020-09-01' })
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
      .patch(`/hurtky/${hurtokB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: '2020-09-01' })
      .expect(404);
  });
});
```

- [ ] **Step 2: Прогнати, впевнитись у падінні**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- hurtky-update.e2e-spec.ts`
Expected: FAIL — `404 Not Found` на кожному тесті (роут не існує).

- [ ] **Step 3: Створити `UpdateHurtokDto`**

Create `apps/api/src/hurtky/dto/update-hurtok.dto.ts`:

```ts
import { IsDateString, IsOptional, ValidateIf } from 'class-validator';

export class UpdateHurtokDto {
  @IsOptional()
  @ValidateIf((o) => o.foundedAt !== null)
  @IsDateString()
  foundedAt?: string | null;
}
```

- [ ] **Step 4: Додати `update()` до `HurtkyService` і `foundedAt` у `getMembersBySlug()`**

У `apps/api/src/hurtky/hurtky.service.ts`, додати імпорт DTO:

```ts
import { UpdateHurtokDto } from './dto/update-hurtok.dto';
```

Додати метод до класу (після `create`):

```ts
  async update(hurtokId: string, dto: UpdateHurtokDto, actor: CurrentUserPayload) {
    const hurtok = await this.prisma.hurtok.findUnique({ where: { id: hurtokId } });
    if (!hurtok || hurtok.kurinId !== actor.kurinId) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }
    return this.prisma.hurtok.update({
      where: { id: hurtokId },
      data: { foundedAt: dto.foundedAt ? new Date(dto.foundedAt) : null },
    });
  }
```

У методі `getMembersBySlug()`, у `return`-виразі, додати `foundedAt` до обʼєкта `hurtok`:

```ts
    return {
      hurtok: {
        id: hurtok.id,
        name: hurtok.name,
        slug: hurtok.slug,
        number: hurtok.number,
        foundedAt: hurtok.foundedAt,
        archivedAt: hurtok.archivedAt,
      },
```

(Замінити існуючий рядок `hurtok: { id: hurtok.id, name: hurtok.name, slug: hurtok.slug, number: hurtok.number, archivedAt: hurtok.archivedAt },` на наведений вище багаторядковий варіант — лише додає поле `foundedAt`, решта полів і логіка `members.map(...)` далі лишаються без змін.)

- [ ] **Step 5: Додати роут у контролер**

У `apps/api/src/hurtky/hurtky.controller.ts`, додати імпорт DTO:

```ts
import { UpdateHurtokDto } from './dto/update-hurtok.dto';
```

Додати метод до класу (після `create`):

```ts
  @Roles(Role.ZVYAZKOVYI)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHurtokDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(id, dto, user);
  }
```

- [ ] **Step 6: Прогнати тести, впевнитись у проходженні**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- hurtky-update.e2e-spec.ts`
Expected: PASS (5/5)

- [ ] **Step 7: Повна регресія e2e-пакету**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: усі проходять

- [ ] **Step 8: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: без помилок

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/hurtky/dto/update-hurtok.dto.ts apps/api/src/hurtky/hurtky.service.ts apps/api/src/hurtky/hurtky.controller.ts apps/api/test/hurtky-update.e2e-spec.ts
git commit -m "feat: add PATCH /hurtky/:id for editing founding date"
```

---

### Task 3: Фронтенд-типи і хук `useUpdateHurtok`

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/queries/hurtky.ts`

**Interfaces:**
- Consumes: `PATCH /hurtky/:id` з Task 2.
- Produces: `Hurtok.foundedAt: string | null`, `HurtokMembers.hurtok.foundedAt: string | null`, `useUpdateHurtok(id: string)` — споживається Task 6.

- [ ] **Step 1: Додати `foundedAt` до типів**

У `apps/web/lib/types.ts`, у `Hurtok`:

```ts
export interface Hurtok {
  id: string;
  kurinId: string;
  name: string;
  slug: string | null;
  number: string | null;
  foundedAt: string | null;
}
```

У `HurtokMembers`:

```ts
export interface HurtokMembers {
  hurtok: { id: string; name: string; slug: string | null; number: string | null; foundedAt: string | null; archivedAt: string | null };
  members: HurtokMember[];
}
```

- [ ] **Step 2: Додати `useUpdateHurtok` до `apps/web/lib/queries/hurtky.ts`**

Додати до файлу (після `useArchiveHurtok`):

```ts
export function useUpdateHurtok(id: string, slug: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { foundedAt: string | null }) =>
      apiFetch<Hurtok>(`/hurtky/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hurtky'] });
      queryClient.invalidateQueries({ queryKey: ['hurtky', 'by-slug', slug] });
    },
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: без помилок

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/queries/hurtky.ts
git commit -m "feat: add frontend types and useUpdateHurtok hook for founding date"
```

---

### Task 4: `/users/new` — попереднє заповнення гуртка через query-параметр

**Files:**
- Modify: `apps/web/app/users/new/page.tsx`
- Test: `apps/web/e2e/users-new-hurtok-prefill.spec.ts` (new file)

**Interfaces:**
- Produces: `/users/new?hurtokId=<id>` попередньо вибирає гурток в обох формах — споживається Task 5 (кнопка "Додати юнака/чку" в `HurtokDetailPanel`).

- [ ] **Step 1: Написати падаючий e2e-тест**

Create `apps/web/e2e/users-new-hurtok-prefill.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, loginForToken } from './helpers/proby-seed';

test('pre-fills the hurtok select on /users/new when hurtokId is in the query string', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/new?hurtokId=${hurtok.id}`);

  await expect(page.getByLabel('Гурток')).toHaveValue(hurtok.id);
});
```

- [ ] **Step 2: Прогнати, впевнитись у падінні**

Run: `cd apps/web && npx playwright test e2e/users-new-hurtok-prefill.spec.ts --workers=1`
Expected: FAIL — select лишається порожнім (`""`), бо query-параметр зараз ніде не читається.

- [ ] **Step 3: Прочитати query-параметр і прокинути як початкове значення**

У `apps/web/app/users/new/page.tsx`, змінити імпорти (додати `Suspense` і `useSearchParams`):

```ts
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
```

Змінити сигнатуру `ZvyazkovyiDirectCreateForm`, щоб приймати `initialHurtokId`:

```ts
function ZvyazkovyiDirectCreateForm({ initialHurtokId }: { initialHurtokId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: hurtky } = useHurtky();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('JUNAK');
  const [hurtokId, setHurtokId] = useState(initialHurtokId);
  const [password, setPassword] = useState('');
```

(Єдина зміна в цій функції — сигнатура і рядок `const [hurtokId, setHurtokId] = useState(initialHurtokId);` замість `useState('')`; решта функції без змін.)

Аналогічно для `KurinnyiApprovalRequestForm`:

```ts
function KurinnyiApprovalRequestForm({ initialHurtokId }: { initialHurtokId: string }) {
  const router = useRouter();
  const { data: hurtky } = useHurtky();
  const createRequest = useCreateApprovalRequest();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [hurtokId, setHurtokId] = useState(initialHurtokId);
  const [submitted, setSubmitted] = useState(false);
```

Замінити `export default function NewUserPage()` на:

```ts
export default function NewUserPage() {
  return (
    <Suspense fallback={<p>Завантаження...</p>}>
      <NewUserPageContent />
    </Suspense>
  );
}

function NewUserPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const initialHurtokId = searchParams.get('hurtokId') ?? '';

  if (session?.role === 'ZVYAZKOVYI') {
    return <ZvyazkovyiDirectCreateForm initialHurtokId={initialHurtokId} />;
  }
  if (session?.isKurinniy) {
    return <KurinnyiApprovalRequestForm initialHurtokId={initialHurtokId} />;
  }
  return null;
}
```

- [ ] **Step 4: Прогнати тест, впевнитись у проходженні**

Run: `cd apps/web && npx playwright test e2e/users-new-hurtok-prefill.spec.ts --workers=1`
Expected: PASS (1/1)

- [ ] **Step 5: Повна регресія Playwright-пакету**

Run: `cd apps/web && npx playwright test --workers=1`
Expected: усі проходять (існуючі тести на `/users/new`, якщо є, і далі мають проходити — пересвідчитись, що жодна форма не зламалась).

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: без помилок

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/users/new/page.tsx apps/web/e2e/users-new-hurtok-prefill.spec.ts
git commit -m "feat: pre-fill hurtok on /users/new via hurtokId query param"
```

---

### Task 5: Спільний компонент `HurtokDetailPanel`

**Files:**
- Create: `apps/web/components/hurtok-detail-panel.tsx`
- Modify: `apps/web/app/[kurinNumber]/hurtky/[slug]/page.tsx`
- Test: `apps/web/e2e/hurtok-add-junak-link.spec.ts` (new file)

**Interfaces:**
- Consumes: `useHurtokBySlug` (існує), `useSession` (існує), `/users/new?hurtokId=...` з Task 4.
- Produces: `<HurtokDetailPanel slug={string} />` — споживається Task 6 (додає туди кнопку "Налаштування") і Task 7 (рендериться в розгорнутому рядку акордеону).

Цей крок — чистий рефакторинг (винесення існуючого вмісту сторінки в компонент) плюс одна нова кнопка. Поведінка сторінки `/[kurinNumber]/hurtky/[slug]` не повинна змінитись, окрім появи нової кнопки.

- [ ] **Step 1: Написати падаючий e2e-тест на нову кнопку**

Create `apps/web/e2e/hurtok-add-junak-link.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, loginForToken } from './helpers/proby-seed';

test('shows a link to add a junak directly into this hurtok', async ({ page }) => {
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await (async () => {
    const { program } = await seedProbyProgram();
    const seeded = await seedKurinWithZvyazkovyi(program.id);
    return { kurin: seeded.kurin, zvyazkovyiEmail: seeded.zvyazkovyiEmail, zvyazkovyiPassword: seeded.zvyazkovyiPassword };
  })();
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  const link = page.getByRole('link', { name: 'Додати юнака/чку' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', `/users/new?hurtokId=${hurtok.id}`);
});
```

- [ ] **Step 2: Прогнати, впевнитись у падінні**

Run: `cd apps/web && npx playwright test e2e/hurtok-add-junak-link.spec.ts --workers=1`
Expected: FAIL — такого лінка ще немає.

- [ ] **Step 3: Створити `HurtokDetailPanel`**

Create `apps/web/components/hurtok-detail-panel.tsx` — вміст ідентичний поточній сторінці, плюс нова кнопка "Додати юнака/чку" (видима звʼязковому й курінному, як і `/users/new` сам по собі), плюс порожній `onOpenSettings` проп, який Task 6 заповнить реальною модалкою (тут — просто кнопка "Налаштування", що поки нічого не робить, щоб Task 6 міг додати логіку, не чіпаючи цей компонент повторно зайвий раз):

```tsx
'use client';

import Link from 'next/link';
import { useHurtokBySlug, useArchiveHurtok } from '@/lib/queries/hurtky';
import { useSession } from '@/lib/session-client';
import { ROLE_LABELS, POSITION_LABELS } from '@/lib/role-labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';

export function HurtokDetailPanel({ slug }: { slug: string }) {
  const { data, isLoading, isError, error } = useHurtokBySlug(slug);
  const { data: session } = useSession();
  const archiveHurtok = useArchiveHurtok(data?.hurtok.id ?? '', slug);

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Гурток не знайдено.'}</p>;
  if (!data) return <p>Гурток не знайдено.</p>;

  const canArchive = session?.role === 'ZVYAZKOVYI' && !data.hurtok.archivedAt && data.members.length === 0;
  const canAddJunak = session?.role === 'ZVYAZKOVYI' || session?.isKurinniy;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        {data.hurtok.name}
        {data.hurtok.number ? ` №${data.hurtok.number}` : ''}
      </h1>
      {data.hurtok.foundedAt && (
        <p className="text-sm text-muted-foreground">
          Засновано {new Date(data.hurtok.foundedAt).toLocaleDateString('uk-UA')}
        </p>
      )}
      {data.hurtok.archivedAt && (
        <p className="text-sm text-muted-foreground">
          Архівовано {new Date(data.hurtok.archivedAt).toLocaleDateString('uk-UA')}
        </p>
      )}
      <div className="flex gap-2">
        {canAddJunak && (
          <Link href={`/users/new?hurtokId=${data.hurtok.id}`}>
            <Button size="sm" variant="outline">
              Додати юнака/чку
            </Button>
          </Link>
        )}
        {session?.role === 'ZVYAZKOVYI' && !data.hurtok.archivedAt && (
          <Button size="sm" variant="outline" disabled>
            Налаштування
          </Button>
        )}
      </div>
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

**Важливо:** кнопка "Розформувати гурток" зі старої назви тепер видалена звідси окремим блоком — вона переїде в модалку налаштувань у Task 6 (разом з заміною кнопки-плейсхолдера "Налаштування" на реальну). Поки що в цьому кроці кнопка "Розформувати гурток" ТИМЧАСОВО лишається тут же (блок `canArchive`), щоб не губити функціональність між Task 5 і Task 6 — Task 6 перенесе цей блок усередину модалки і видалить його звідси.

- [ ] **Step 4: Переписати сторінку, щоб використовувати новий компонент**

Replace увесь вміст `apps/web/app/[kurinNumber]/hurtky/[slug]/page.tsx`:

```tsx
'use client';

import { use } from 'react';
import { HurtokDetailPanel } from '@/components/hurtok-detail-panel';

export default function HurtokMembersPage({ params }: { params: Promise<{ kurinNumber: string; slug: string }> }) {
  const { slug } = use(params);
  return <HurtokDetailPanel slug={slug} />;
}
```

- [ ] **Step 5: Прогнати новий тест, впевнитись у проходженні**

Run: `cd apps/web && npx playwright test e2e/hurtok-add-junak-link.spec.ts --workers=1`
Expected: PASS (1/1)

- [ ] **Step 6: Повна регресія Playwright-пакету**

Run: `cd apps/web && npx playwright test --workers=1`
Expected: усі проходять, зокрема `hurtok-archive.spec.ts` і `user-archive.spec.ts` (не повинні зламатись рефакторингом).

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: без помилок

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/hurtok-detail-panel.tsx apps/web/app/[kurinNumber]/hurtky/[slug]/page.tsx apps/web/e2e/hurtok-add-junak-link.spec.ts
git commit -m "refactor: extract HurtokDetailPanel, add link to add a junak into this hurtok"
```

---

### Task 6: Модальне вікно "Налаштування гуртка"

**Files:**
- Create: `apps/web/components/ui/dialog.tsx`
- Create: `apps/web/components/hurtok-settings-dialog.tsx`
- Modify: `apps/web/components/hurtok-detail-panel.tsx`
- Test: `apps/web/e2e/hurtok-settings.spec.ts` (new file)

**Interfaces:**
- Consumes: `useUpdateHurtok` (Task 3), `useKurinPositions`/`useAssignPosition`/`useRemovePosition` (існують), `useUsers`/`useVykhovnykAssignments`/`useAssignVykhovnyk`/`useUnassignVykhovnyk` (існують), `useArchiveHurtok` (існує).
- Produces: `<HurtokSettingsDialog hurtok={...} members={...} open={boolean} onOpenChange={(open) => void} />` — споживається лише `HurtokDetailPanel` у цьому ж завданні (і далі переносно в Task 7 через сам `HurtokDetailPanel`, без змін).

- [ ] **Step 1: Написати падаючі e2e-тести**

Create `apps/web/e2e/hurtok-settings.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('lets zvyazkovyi set the founding date from the settings dialog', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  await page.getByRole('button', { name: 'Налаштування' }).click();
  await page.getByLabel('Дата заснування').fill('2020-09-01');
  await page.getByRole('button', { name: 'Зберегти дату' }).click();

  await expect(page.getByText('Засновано 01.09.2020')).toBeVisible();
});

test('lets zvyazkovyi assign a vykhovnyk from the settings dialog', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Виховник${Date.now()}`,
    email: `vykhovnyk-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  await page.getByRole('button', { name: 'Налаштування' }).click();
  await page.getByLabel('Виховник').selectOption(vykhovnyk.id);

  await expect(page.getByText(`${vykhovnyk.lastName} ${vykhovnyk.firstName}`)).toBeVisible();
});

test('lets zvyazkovyi assign and then remove a hurtok position', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  await page.getByRole('button', { name: 'Налаштування' }).click();
  const hurtkovyiRow = page.getByTestId('position-row-HURTKOVYI');
  await page.getByLabel('Гуртковий').selectOption(junak.id);
  await expect(hurtkovyiRow.getByText(`${junak.lastName} ${junak.firstName}`)).toBeVisible();

  await hurtkovyiRow.getByRole('button', { name: 'Зняти' }).click();
  await expect(hurtkovyiRow.getByText(`${junak.lastName} ${junak.firstName}`)).not.toBeVisible();
});

test('disables disbanding a hurtok that still has a junak, enables it once empty', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak2-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);
  await page.getByRole('button', { name: 'Налаштування' }).click();

  await expect(page.getByRole('button', { name: 'Розформувати гурток' })).toBeDisabled();

  await fetch(`${API_URL}/users/${junak.id}/hurtok`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ hurtokId: null }),
  });
  await page.reload();
  await page.getByRole('button', { name: 'Налаштування' }).click();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Розформувати гурток' }).click();

  await expect(page.getByText(/Архівовано/)).toBeVisible();
});
```

- [ ] **Step 2: Прогнати, впевнитись у падінні**

Run: `cd apps/web && npx playwright test e2e/hurtok-settings.spec.ts --workers=1`
Expected: FAIL — кнопка "Налаштування" не відкриває нічого (зараз вона `disabled` і без обробника).

- [ ] **Step 3: Створити обгортку `Dialog` над `@base-ui/react/dialog`**

Create `apps/web/components/ui/dialog.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cn } from '@/lib/utils';

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Popup>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-xl bg-card p-6 text-card-foreground shadow-lg ring-1 ring-foreground/10',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-base font-medium', className)} {...props} />;
}

export { Dialog, DialogContent, DialogTitle };
```

**Примітка:** навмисно без обгортки над `DialogPrimitive.Close` — Base UI (на відміну від Radix) не має пропу `asChild`, лише `render` (пропс, що приймає `React.ReactElement`). Щоб не розбиратись із цим API заради єдиної кнопки "Закрити", `HurtokSettingsDialog` керує закриттям напряму через уже контрольований `onOpenChange` проп (див. Step 4) — простіше і без нового незвіреного API.

- [ ] **Step 4: Створити `HurtokSettingsDialog`**

Create `apps/web/components/hurtok-settings-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accessErrorMessage } from '@/lib/error-message';
import { POSITION_LABELS } from '@/lib/role-labels';
import { useUpdateHurtok, useArchiveHurtok } from '@/lib/queries/hurtky';
import { useKurinPositions, useAssignPosition, useRemovePosition } from '@/lib/queries/positions';
import {
  useVykhovnykAssignments,
  useAssignVykhovnyk,
  useUnassignVykhovnyk,
} from '@/lib/queries/vykhovnyk-assignments';
import { useUsers } from '@/lib/queries/users';
import type { HurtokMember, PositionType } from '@/lib/types';

const HURTOK_POSITION_TYPES: PositionType[] = ['HURTKOVYI', 'SUDDIA', 'PYSAR', 'SKARBNYK'];

export function HurtokSettingsDialog({
  hurtok,
  members,
  open,
  onOpenChange,
}: {
  hurtok: { id: string; name: string; slug: string | null; foundedAt: string | null };
  members: HurtokMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [foundedAt, setFoundedAt] = useState(hurtok.foundedAt ? hurtok.foundedAt.slice(0, 10) : '');

  const updateHurtok = useUpdateHurtok(hurtok.id, hurtok.slug ?? undefined);
  const archiveHurtok = useArchiveHurtok(hurtok.id, hurtok.slug ?? undefined);

  const { data: allPositions } = useKurinPositions();
  const assignPosition = useAssignPosition();
  const removePosition = useRemovePosition();

  const { data: vykhovnykAssignments } = useVykhovnykAssignments(hurtok.id);
  const { data: vykhovnykUsers } = useUsers({ role: 'VYKHOVNYK' });
  const assignVykhovnyk = useAssignVykhovnyk();
  const unassignVykhovnyk = useUnassignVykhovnyk();

  const junakMembers = members.filter((m) => m.role === 'JUNAK');
  const hurtokPositions = (allPositions ?? []).filter((p) => p.scope === 'HURTOK' && p.hurtokId === hurtok.id);
  const currentVykhovnykAssignment = (vykhovnykAssignments ?? [])[0];

  function invalidateHurtok() {
    queryClient.invalidateQueries({ queryKey: ['hurtky'] });
    queryClient.invalidateQueries({ queryKey: ['hurtky', 'by-slug', hurtok.slug] });
  }

  async function handleVykhovnykChange(newVykhovnykId: string) {
    if (currentVykhovnykAssignment) {
      await unassignVykhovnyk.mutateAsync(currentVykhovnykAssignment.id);
    }
    if (newVykhovnykId) {
      await assignVykhovnyk.mutateAsync({ vykhovnykId: newVykhovnykId, hurtokId: hurtok.id });
    }
    invalidateHurtok();
  }

  async function handleRemoveVykhovnyk() {
    if (!currentVykhovnykAssignment) return;
    await unassignVykhovnyk.mutateAsync(currentVykhovnykAssignment.id);
    invalidateHurtok();
  }

  async function handlePositionChange(positionType: PositionType, userId: string) {
    if (!userId) return;
    await assignPosition.mutateAsync({ userId, scope: 'HURTOK', positionType, hurtokId: hurtok.id });
    invalidateHurtok();
  }

  async function handleRemovePosition(positionId: string) {
    await removePosition.mutateAsync(positionId);
    invalidateHurtok();
  }

  const canArchive = !members.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Налаштування гуртка</DialogTitle>

        <div className="space-y-2">
          <Label htmlFor="founded-at">Дата заснування</Label>
          <div className="flex gap-2">
            <Input
              id="founded-at"
              type="date"
              value={foundedAt}
              onChange={(e) => setFoundedAt(e.target.value)}
            />
            <Button
              size="sm"
              disabled={updateHurtok.isPending}
              onClick={() => updateHurtok.mutate({ foundedAt: foundedAt || null })}
            >
              Зберегти дату
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="vykhovnyk-select">Виховник</Label>
          <div className="flex gap-2">
            <select
              id="vykhovnyk-select"
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={currentVykhovnykAssignment?.vykhovnykId ?? ''}
              onChange={(e) => handleVykhovnykChange(e.target.value)}
            >
              <option value="">— немає —</option>
              {(vykhovnykUsers ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.lastName} {v.firstName}
                </option>
              ))}
            </select>
            {currentVykhovnykAssignment && (
              <Button size="sm" variant="outline" onClick={handleRemoveVykhovnyk}>
                Зняти
              </Button>
            )}
          </div>
        </div>

        {HURTOK_POSITION_TYPES.map((positionType) => {
          const current = hurtokPositions.find((p) => p.positionType === positionType);
          return (
            <div key={positionType} className="space-y-2" data-testid={`position-row-${positionType}`}>
              <Label htmlFor={`position-${positionType}`}>{POSITION_LABELS[positionType]}</Label>
              <div className="flex items-center gap-2">
                <select
                  id={`position-${positionType}`}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={current?.user.id ?? ''}
                  onChange={(e) => handlePositionChange(positionType, e.target.value)}
                >
                  <option value="">— немає —</option>
                  {junakMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.lastName} {m.firstName}
                    </option>
                  ))}
                </select>
                {current && (
                  <span className="whitespace-nowrap text-sm text-muted-foreground">
                    {current.user.lastName} {current.user.firstName}
                  </span>
                )}
                {current && (
                  <Button size="sm" variant="outline" onClick={() => handleRemovePosition(current.id)}>
                    Зняти
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        <div className="space-y-2 border-t pt-4">
          <Button
            variant="outline"
            disabled={!canArchive || archiveHurtok.isPending}
            onClick={() => {
              if (window.confirm(`Архівувати гурток «${hurtok.name}»?`)) {
                archiveHurtok.mutate();
              }
            }}
          >
            Розформувати гурток
          </Button>
          {!canArchive && (
            <p className="text-sm text-muted-foreground">У гуртку ще є юнаки чи виховник — спершу зніміть їх.</p>
          )}
          {archiveHurtok.isError && (
            <p className="text-sm text-destructive">
              {accessErrorMessage(archiveHurtok.error) ?? 'Не вдалося архівувати гурток.'}
            </p>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Закрити
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Прибрати стару кнопку "Розформувати гурток" з `HurtokDetailPanel`, підключити `HurtokSettingsDialog`**

У `apps/web/components/hurtok-detail-panel.tsx`:

Замінити імпорти:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useHurtokBySlug } from '@/lib/queries/hurtky';
import { useSession } from '@/lib/session-client';
import { ROLE_LABELS, POSITION_LABELS } from '@/lib/role-labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';
import { HurtokSettingsDialog } from '@/components/hurtok-settings-dialog';
```

Замінити тіло компонента (прибрати `archiveHurtok`/`canArchive` — вони тепер усередині діалогу; додати стан відкриття модалки):

```tsx
export function HurtokDetailPanel({ slug }: { slug: string }) {
  const { data, isLoading, isError, error } = useHurtokBySlug(slug);
  const { data: session } = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Гурток не знайдено.'}</p>;
  if (!data) return <p>Гурток не знайдено.</p>;

  const canAddJunak = session?.role === 'ZVYAZKOVYI' || session?.isKurinniy;
  const canConfigure = session?.role === 'ZVYAZKOVYI' && !data.hurtok.archivedAt;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        {data.hurtok.name}
        {data.hurtok.number ? ` №${data.hurtok.number}` : ''}
      </h1>
      {data.hurtok.foundedAt && (
        <p className="text-sm text-muted-foreground">
          Засновано {new Date(data.hurtok.foundedAt).toLocaleDateString('uk-UA')}
        </p>
      )}
      {data.hurtok.archivedAt && (
        <p className="text-sm text-muted-foreground">
          Архівовано {new Date(data.hurtok.archivedAt).toLocaleDateString('uk-UA')}
        </p>
      )}
      <div className="flex gap-2">
        {canAddJunak && (
          <Link href={`/users/new?hurtokId=${data.hurtok.id}`}>
            <Button size="sm" variant="outline">
              Додати юнака/чку
            </Button>
          </Link>
        )}
        {canConfigure && (
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            Налаштування
          </Button>
        )}
      </div>
      {canConfigure && (
        <HurtokSettingsDialog
          hurtok={data.hurtok}
          members={data.members}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
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

- [ ] **Step 6: Прогнати тести, впевнитись у проходженні**

Run: `cd apps/web && npx playwright test e2e/hurtok-settings.spec.ts --workers=1`
Expected: PASS (4/4)

- [ ] **Step 7: Оновити `hurtok-archive.spec.ts` під нову поведінку**

Архівація тепер лише через модалку "Налаштування", кнопка перейменована на
"Розформувати гурток" і тепер завжди видима, але `disabled` замість того,
щоб ховатись (`canArchive` керує `disabled`, не видимістю — див.
`HurtokSettingsDialog` у Step 4). Replace увесь вміст
`apps/web/e2e/hurtok-archive.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('zvyazkovyi disbands an empty hurtok from the settings dialog', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Пусті Орли');

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);
  await page.getByRole('button', { name: 'Налаштування' }).click();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Розформувати гурток' }).click();

  await expect(page.getByText(/Архівовано/)).toBeVisible();
});

test('disband button is disabled while the hurtok still has a junak', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Налаштування' }).click();

  await expect(page.getByRole('button', { name: 'Розформувати гурток' })).toBeDisabled();
});

test('a vykhovnyk does not see the settings button at all', async ({ page }) => {
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

  await expect(page.getByRole('button', { name: 'Налаштування' })).not.toBeVisible();
});
```

- [ ] **Step 8: Повна регресія Playwright-пакету**

Run: `cd apps/web && npx playwright test --workers=1`
Expected: усі проходять.

- [ ] **Step 9: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: без помилок

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/ui/dialog.tsx apps/web/components/hurtok-settings-dialog.tsx apps/web/components/hurtok-detail-panel.tsx apps/web/e2e/hurtok-settings.spec.ts
git add apps/web/e2e/hurtok-archive.spec.ts
git commit -m "feat: add hurtok settings dialog (vykhovnyk, positions, founding date, disband)"
```

---

### Task 7: `/hurtky` — перетворення на акордеон

**Files:**
- Modify: `apps/web/app/hurtky/page.tsx`
- Test: `apps/web/e2e/hurtky-accordion.spec.ts` (new file)

**Interfaces:**
- Consumes: `<HurtokDetailPanel slug={string} />` з Task 5/6, `useHurtky()` (існує).

- [ ] **Step 1: Написати падаючі e2e-тести**

Create `apps/web/e2e/hurtky-accordion.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('expands a hurtok row inline to show its members, without navigating away', async ({ page }) => {
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

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/hurtky');

  await expect(page.getByText(`${junak.lastName} ${junak.firstName}`)).not.toBeVisible();
  await page.getByText('Орлики').click();
  await expect(page).toHaveURL('/hurtky');
  await expect(page.getByText(`${junak.lastName} ${junak.firstName}`)).toBeVisible();
});

test('keeps two rows expanded at the same time', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  await createHurtok(zvyazkovyiToken, 'Орлики');
  await createHurtok(zvyazkovyiToken, 'Соколи');

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/hurtky');

  await page.getByText('Орлики').click();
  await page.getByText('Соколи').click();

  await expect(page.getByRole('button', { name: 'Налаштування' })).toHaveCount(2);
});
```

- [ ] **Step 2: Прогнати, впевнитись у падінні**

Run: `cd apps/web && npx playwright test e2e/hurtky-accordion.spec.ts --workers=1`
Expected: FAIL — клік на назву гуртка зараз веде на окрему сторінку, а не розгортає рядок.

- [ ] **Step 3: Переписати `/hurtky` як акордеон**

Replace увесь вміст `apps/web/app/hurtky/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useHurtky } from '@/lib/queries/hurtky';
import { useVykhovnykAssignments } from '@/lib/queries/vykhovnyk-assignments';
import { useSession } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';
import { HurtokDetailPanel } from '@/components/hurtok-detail-panel';
import type { Hurtok } from '@/lib/types';

export default function HurtkyPage() {
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
      <h1 className="text-2xl font-bold">Гуртки</h1>
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
                </CardTitle>
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

- [ ] **Step 4: Прогнати тести, впевнитись у проходженні**

Run: `cd apps/web && npx playwright test e2e/hurtky-accordion.spec.ts --workers=1`
Expected: PASS (2/2)

- [ ] **Step 5: Оновити `hurtok-members.spec.ts` під нову поведінку**

Цей існуючий тест очікує, що клік на картку гуртка на `/hurtky` змінює URL на
`/hurtky/vovky` — тепер клік лише розгортає рядок, URL лишається `/hurtky`.
Replace увесь вміст `apps/web/e2e/hurtok-members.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi expand a hurtok row and navigate to a member profile', async ({ page }) => {
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

  await expect(page).toHaveURL('/hurtky');
  await expect(page.getByText('Петренко Петро')).toBeVisible();

  await page.getByText('Петренко Петро').click();
  await expect(page).toHaveURL(/\/users\//);
});
```

- [ ] **Step 6: Повна регресія Playwright-пакету**

Run: `cd apps/web && npx playwright test --workers=1`
Expected: усі проходять.

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: без помилок

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/hurtky/page.tsx apps/web/e2e/hurtky-accordion.spec.ts
git add apps/web/e2e/hurtok-members.spec.ts
git commit -m "feat: turn /hurtky into an accordion with inline member tables"
```

---

### Task 8: Інтеграційний тест (налаштування з акордеону) і фінальна регресія

**Files:**
- Test: `apps/web/e2e/hurtky-accordion-settings.spec.ts` (new file)

**Interfaces:**
- Consumes: усе з Tasks 1–7.

- [ ] **Step 1: Написати тест на використання модалки налаштувань прямо з розгорнутого рядка акордеону**

Create `apps/web/e2e/hurtky-accordion-settings.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, loginForToken } from './helpers/proby-seed';

test('opens the settings dialog from an accordion row and saves the founding date', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/hurtky');
  await page.getByText('Орлики').click();

  await page.getByRole('button', { name: 'Налаштування' }).click();
  await page.getByLabel('Дата заснування').fill('2021-05-10');
  await page.getByRole('button', { name: 'Зберегти дату' }).click();

  await expect(page.getByText('Засновано 10.05.2021')).toBeVisible();
  // Рядок лишається розгорнутим — сторінка не перезавантажилась і не згорнулась.
  await expect(page).toHaveURL('/hurtky');
});
```

- [ ] **Step 2: Прогнати, впевнитись у проходженні**

Run: `cd apps/web && npx playwright test e2e/hurtky-accordion-settings.spec.ts --workers=1`
Expected: PASS (1/1) — якщо все з Task 1–7 реалізовано правильно, цей тест має пройти без додаткових змін коду.

- [ ] **Step 3: Повна регресія всього API e2e-пакету**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: усі проходять, без регресій.

- [ ] **Step 4: Повна регресія всього Playwright-пакету**

Run: `cd apps/web && npx playwright test --workers=1`
Expected: усі проходять, без регресій.

- [ ] **Step 5: Typecheck обох застосунків**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && cd ../web && npx tsc --noEmit -p tsconfig.json`
Expected: без помилок

- [ ] **Step 6: Commit**

```bash
git add apps/web/e2e/hurtky-accordion-settings.spec.ts
git commit -m "test: verify settings dialog works from within an accordion row"
```

---
