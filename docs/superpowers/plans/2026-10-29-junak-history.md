# Історія юнака (v1): вмілості, ВФВ, табори, відзначення, архів діловодства — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Зберігати й показувати історію юнака в Пласті — здобуті вмілості (з каталогом вимог «Вмілості УПЮ» 2003 р. + власні вмілості куреня), ВФВ, відбуті табори, відзначення та перестороги, архів діловодства, дати вступу до УПЮ та пластової присяги — з редагуванням звʼязковим і виховником гуртка юнака.

**Architecture:** Два нові NestJS-модулі: `skills` (каталог `GET /skills` + CRUD власних вмілостей куреня) і `junak-history` (усі записи історії під `users/:junakId/...` + агрегат `GET /users/:junakId/history`). Права запису — одна функція `canWriteJunakHistory` (звʼязковий куреня або виховник, прикріплений до гуртка юнака; архівовані — лише читання), права читання — `UsersService.findScoped`. Кожна зміна пише подію в наявний «Журнал дій» (`AuditService.record`) без тексту пересторог. Фронтенд: сторінка `/skills`, плитка «Вмілості» в хабі, компонент `components/junak-history.tsx` (+ секції в `components/junak-history/`) на `/me` (перегляд) і `/users/[id]` (редагування, коли бекенд повертає `canEdit: true`).

**Tech Stack:** NestJS 10 + Prisma 5 (PostgreSQL), class-validator, Jest + supertest (e2e на `plast_test`); Next.js 16 (App Router, нестандартний — див. `apps/web/AGENTS.md`), React, TanStack Query, Tailwind-токени, Base UI (`components/ui/*`), `lucide-react`, Playwright.

Spec: `docs/superpowers/specs/2026-10-29-junak-history-design.md` (прочитати повністю перед початком). Джерело каталогу: `/Users/user/Downloads/Vmilosti-UPYU.pdf` (у репозиторій **не** додається).

## Global Constraints

- **Скоуп — дві хвилі.** Хвиля A (задачі 1–7: каталог, сид, `skills`, здобуті вмілості, `/skills`, плитка, секція «Вмілості») має бути готова до випуску до початку хвилі B (задачі 8–12). Поза скоупом v1 (spec): відстеження окремих вимог вмілості, редагування глобального каталогу з інтерфейсу, відзнаки-значки, звʼязок вмілостей із пробами, посвідка/запит документа, імпорт із Книги судді, експорт.
- **Гілка:** окрема гілка (або worktree, `superpowers:using-git-worktrees`) від актуального `main`, напр. `feat/junak-history`. **Не** `feat/mobile-nav`. Не змінювати файли навігації (`apps/web/lib/nav-model.ts`, `apps/web/components/bottom-nav.tsx`, `sidebar-nav.tsx`, `app-shell.tsx`, `mobile-header.tsx`) — `/skills` відкривається з плитки хабу та з посилання «Каталог» у картці «Вмілості».
- **Права (spec, таблиця):** читати історію — той самий набір, що бачить профіль юнака (`UsersService.findScoped`: сам юнак, звʼязковий, курінний/суддя, виховник гуртка юнака; виховник бачить і юнаків без гуртка); писати (створювати/змінювати/видаляти записи історії та дати) — `ZVYAZKOVYI` куреня або `VYKHOVNYK`, прикріплений до гуртка юнака (`VykhovnykHurtok`); юнак без гуртка — лише звʼязковий; архівований юнак — читати можна, писати ні (`400 'Юнак архівований'`, як у `junak-degrees.service.ts`); інший курінь — `404`. Каталог читає будь-який авторизований користувач (глобальні + власні свого куреня); власні вмілості створює/змінює/видаляє лише звʼязковий; видалення власної вмілості заблоковане (`409`), якщо є здобуті рівні; глобальні (`kurinId = null`) з інтерфейсу не змінюються (`403`). Усі перевірки — на бекенді.
- **Пересторога (`WARNING`):** поля `text` («за що») і `howToFix` («як виправити») обовʼязкові й непорожні; для `AWARD` `howToFix` не приймається. Юнак бачить свої перестороги повністю (дата, «за що», «як виправити»).
- **«Журнал дій»:** `audit.record()` — **після** успішної дії; кожна нова дія додається одночасно в Prisma-enum `AuditAction` (→ міграція), `AUDIT_GROUPS.PEOPLE` (`apps/api/src/audit/audit.constants.ts`; тест `audit.constants.spec.ts` це перевіряє) і `describeAuditEvent` (`apps/web/lib/audit.ts`). `details` — лише читабельні назви, тип і дата: **ніколи** `text`/`howToFix` пересторог і відзначень (і не примітка ВФВ).
- **Міграції:** лише додавання (нові таблиці/enum/колонки, `ADD VALUE`), без змін наявних таблиць; одна міграція на хвилю. Генерувати з `apps/api`: `npx prisma migrate dev --create-only --name <name>`, переглянути SQL руками, застосувати до dev (`npx prisma migrate dev`) і до тестової бази: `set -a; . ./.env; set +a; DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy`. `.env` **ніколи** не редагувати.
- **Дати й роки:** API приймає дати як `YYYY-MM-DD`, зберігає як `@db.Date` (UTC-північ), повертає як `YYYY-MM-DD`. Дата не в майбутньому (з запасом в 1 день, як `parseNotFutureDate`) і не раніше 1990 року. Роки — цілі 1990…поточний (UTC), `yearTo ≥ yearFrom`.
- **Тексти для користувача — українською, без росіянізмів** (memory: «беклог», не «бэклог»). Тексти вимог із правильника переносяться дослівно, окрім виправлень, перелічених у задачі 2.
- **Кольори — лише токени** з `apps/web/app/globals.css`: `bg-background`, `bg-card`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-accent-soft`, `text-accent-text`, `bg-warning-soft`/`text-warning-foreground` (через `Badge variant="warning"`), `text-destructive`, `bg-primary`/`text-primary-foreground` (через `Button`). Без літеральних hex.
- **Іконки** — `lucide-react` (`Award`, `Plus`, `Pencil`, `Trash2`).
- **Next.js нестандартний:** перед написанням сторінок прочитати `apps/web/AGENTS.md` і гайди `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` та `05-server-and-client-components.md` (пакет `next` лежить у кореневому `node_modules` монорепо). Сторінки — клієнтські компоненти (`'use client'`) за зразком `apps/web/app/me/page.tsx`.
- **Бекенд-перевірки** (з `apps/api`): типи `npx tsc --noEmit -p tsconfig.json`; unit `npx jest src --runInBand --forceExit`; e2e одного файлу — у **тій самій** команді оболонки:
  ```bash
  eval "$(node -e "const k=require('web-push').generateVAPIDKeys();console.log('export VAPID_PUBLIC_KEY='+k.publicKey+' VAPID_PRIVATE_KEY='+k.privateKey)")"; export ADMIN_USERNAME=admin ADMIN_PASSWORD=dev-admin-password-change-me; NODE_OPTIONS=--max-old-space-size=8192 npx jest --config ./test/jest-e2e.json --runInBand test/<file>.e2e-spec.ts
  ```
  (VAPID-ключі генеруються щоразу, у `.env` не пишуться.) Postgres на `localhost:5432`, міграції накочені на `plast_test`.
- **Фронтенд-перевірки** (з `apps/web`): `npx tsc --noEmit` (ігнорувати лише помилки із застарілих файлів `.next/`); Playwright — у тій самій команді з тими самими змінними:
  ```bash
  eval "$(node -e "const k=require('web-push').generateVAPIDKeys();console.log('export VAPID_PUBLIC_KEY='+k.publicKey+' VAPID_PRIVATE_KEY='+k.privateKey)")"; export ADMIN_USERNAME=admin ADMIN_PASSWORD=dev-admin-password-change-me; npx playwright test e2e/<file>.spec.ts
  ```
  Відомі **давні** падіння на `main` (не наші, не виправляти): `e2e/treasury.spec.ts:40`, `e2e/approval-request-create.spec.ts`, `e2e/approval-request-decide.spec.ts`, `e2e/change-hurtok-request.spec.ts` (×2) — причина: користувачі, створені `createUserAs` з паролем, ловлять редирект `mustChangePassword`. Тому в нових Playwright-спеках юнаків/виховників створювати **лише** через `createOnboardedUserAs` (`e2e/helpers/proby-seed.ts`).
- **Комміти:** по задачі (задача 2 — кілька комітів, див. її); стейджити лише свої файли (`git add <paths>`); ніколи не додавати untracked `logo.png`, `ПРОБИ  старі/`, `Проби НОВІ/`, PDF правильника. Якщо `docs/superpowers/specs/2026-10-29-junak-history-design.md` і цей план ще untracked — додати їх у коміт задачі 1.

## Рішення, уточнені під час планування

- **`canEdit` повертає бекенд** (`GET /users/:junakId/skills` у хвилі A, `GET /users/:junakId/history` у хвилі B): фронтенд не дублює правило «виховник саме цього гуртка».
- **Хвиля A має власне читання вмілостей** `GET /users/:junakId/skills → { canEdit, items }` (агрегату ще немає); у хвилі B агрегат включає ті самі `skills[]`, ендпоінт хвилі A лишається.
- **Нові дії журналу понад spec:** `SKILL_UPDATED`, `VFV_UPDATED` — spec передбачає `PATCH` для вмілостей і ВФВ, а журнал має фіксувати кожну зміну.
- **Унікальність назв:** `@@unique([kurinId, name])` (власні в межах куреня) + частковий `UNIQUE (name) WHERE kurinId IS NULL` (глобальні). Сервіс додатково не дає створити власну вмілість з назвою, що вже є серед глобальних або власних куреня (без урахування регістру) — `409`. `@@index([kurinId])` зі spec не потрібен: його покриває `@@unique([kurinId, name])`.
- **`Skill.kurin` — `onDelete: Restrict`** (а не типовий для опціонального звʼязку `SetNull`, який перетворив би власні вмілості видаленого куреня на «глобальні»).
- **Сид:** ключ — назва глобальної вмілості (вона унікальна); якщо в даних змінилася група — оновлюється на місці. Нічого не видаляє, власних вмілостей куренів не чіпає.
- **Каталог після вичитування:** 70 вмілостей, 108 записів «вмілість × рівень» (у spec «≈74/≈106» — підрахунок до розділення злитого лещетарства й без урахування того, що «Скульптура (третя)» з текстом різьбярства стає «Різьбярство (третя)»).
- **«Скульптура (друга/третя)»:** перший заголовок «Скульптура (третя проба)» (текст різьбярства) → «Різьбярство (третя проба)»; наступні два («Скульптура (друга)» — світова скульптура, «Скульптура (третя)» — українська) лишаються як надруковано.
- **Додаткові очевидні опечатки джерела:** «Альпіністка» → «Альпіністика» (так її називає вимога «Скелелазіння»), «Водне лещатарство» → «Водне лещетарство», «Розворот на 1800» → «Розворот на 180°» (втрачений знак градуса), змішані латинські/кириличні римські цифри → латинські.
- **«нова вмілість»:** у тексті PDF такого підзаголовка під жодною вмілістю немає; `note: 'нова вмілість'` ставиться лише якщо його видно на сторінці PDF (перевірити візуально сторінки «Скелелазіння», «Альпіністика»).
- **Діловодство в історії:** записи `KurinPosition` (поточні й зняті) показуються лише для читання (керуються в налаштуваннях посад); редагуються тільки «старі» записи `JunakPastPosition`. На `/me` для юнака наявна картка «Діловодство» ховається — її замінює секція історії (для виховника/звʼязкового картка лишається).
- **Порожні тексти:** необовʼязкові текстові поля (`examiner`, `certificateNumber`, `note`) обрізаються, `''` → `null`.

## File Structure

| Файл | Відповідальність |
|---|---|
| `apps/api/prisma/schema.prisma` | `SkillGroup`, `Skill`, `SkillLevel`, `JunakSkill` (A); `JunakVfv`, `JunakCamp`, `JunakRemarkKind`, `JunakRemark`, `JunakPastPosition`, `User.upyJoinedAt/plastOathAt` (B); нові значення `AuditAction`; зворотні звʼязки на `User`/`Kurin` |
| `apps/api/prisma/migrations/<ts>_junak_skills/migration.sql` | міграція хвилі A + ручний частковий унікальний індекс |
| `apps/api/prisma/migrations/<ts>_junak_history/migration.sql` | міграція хвилі B |
| `apps/api/src/audit/audit.constants.ts` | нові дії в групі `PEOPLE` |
| `apps/api/src/skills/skill.types.ts` | `SkillRequirement` (форма елемента `requirements`) |
| `apps/api/src/scripts/skills-catalog.data.ts` | дані каталогу (70 вмілостей, 108 рівнів) |
| `apps/api/src/scripts/skills-catalog.data.spec.ts` | валідація даних |
| `apps/api/src/scripts/seed-skills-catalog.ts` | ідемпотентний сид (`seedSkillsCatalog` + CLI) |
| `apps/api/src/skills/{skills.module,skills.controller,skills.service}.ts`, `dto/{create-skill,update-skill}.dto.ts` | каталог і власні вмілості |
| `apps/api/src/junak-history/history-input.util.ts` (+ `.spec.ts`) | парсинг дат/років, обрізання текстів |
| `apps/api/src/junak-history/junak-history-access.ts` (+ `.spec.ts`) | `canWriteJunakHistory`, `loadJunakForRead`, `loadJunakForWrite` |
| `apps/api/src/junak-history/junak-history.views.ts` | відповіді API (`JunakSkillView`, …, `JunakHistoryView`) і мапери |
| `apps/api/src/junak-history/junak-skills.{controller,service}.ts`, `dto/*-junak-skill.dto.ts` | здобуті вмілості |
| `apps/api/src/junak-history/junak-vfv.*`, `junak-camps.*`, `junak-remarks.*`, `junak-past-positions.*` (+ DTO) | записи хвилі B |
| `apps/api/src/junak-history/junak-history.{controller,service}.ts`, `dto/update-history-dates.dto.ts` | агрегат і дати |
| `apps/api/src/junak-history/junak-history.module.ts` | модуль |
| `apps/api/src/app.module.ts` | реєстрація `SkillsModule`, `JunakHistoryModule` |
| `apps/api/test/utils/{clean-db,fixtures}.ts`, `test/utils/history-fixtures.ts` | очищення нових таблиць, `createSkill`, `createHistoryWorld` |
| `apps/api/test/skills-schema.e2e-spec.ts`, `skills-catalog-seed.e2e-spec.ts`, `skills.e2e-spec.ts`, `junak-skills.e2e-spec.ts`, `junak-vfv-camps.e2e-spec.ts`, `junak-remarks-positions.e2e-spec.ts`, `junak-history.e2e-spec.ts` | API e2e |
| `apps/web/lib/types.ts` | типи каталогу та історії |
| `apps/web/lib/history-labels.ts` | підписи груп, рівнів, ролей, типів |
| `apps/web/lib/error-message.ts` | `mutationErrorText` |
| `apps/web/lib/audit.ts` | тексти нових подій журналу |
| `apps/web/lib/queries/skills.ts`, `lib/queries/junak-history.ts` | react-query хуки |
| `apps/web/app/skills/page.tsx` | сторінка «Вмілості» |
| `apps/web/components/custom-skill-dialog.tsx`, `components/skill-requirement-list.tsx` | діалог власної вмілості, список вимог |
| `apps/web/app/plastuvannia/page.tsx` | плитка «Вмілості» |
| `apps/web/components/junak-history.tsx` | контейнер секції «Історія» |
| `apps/web/components/junak-history/{shared,skills-section,vfv-section,camps-section,remarks-section,dilovodstvo-section,dates-section}.tsx` | підсекції з діалогами |
| `apps/web/app/me/page.tsx`, `apps/web/app/users/[id]/page.tsx` | монтування історії |
| `apps/web/e2e/helpers/history-seed.ts` | сид каталогу в e2e-базу, `postAs` |
| `apps/web/e2e/skills-catalog.spec.ts`, `junak-history-skills.spec.ts`, `junak-history.spec.ts`, `plastuvannia.spec.ts` | Playwright |
| `docs/backlog.md` | статуси пунктів «Історія юнака» |

---

# Хвиля A — каталог і вмілості

### Task 1: Схема каталогу вмілостей, міграція з частковим унікальним індексом, нові дії журналу

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`Kurin` — блок звʼязків рядки ~89–98; `User` — блок звʼязків ~166–189; нові моделі після `JunakActivityEntry` ~275–287; enum `AuditAction` ~584–628)
- Create: `apps/api/prisma/migrations/<timestamp>_junak_skills/migration.sql`
- Modify: `apps/api/src/audit/audit.constants.ts`
- Modify: `apps/api/test/utils/clean-db.ts`
- Modify: `apps/api/test/utils/fixtures.ts`
- Test: `apps/api/test/skills-schema.e2e-spec.ts`

**Interfaces:**
- Consumes: —
- Produces: Prisma-моделі `Skill { id, kurinId: string|null, name, group: SkillGroup, createdAt, levels }`, `SkillLevel { id, skillId, level: number, requirements: Json, note: string|null }` (`@@unique([skillId, level])` → `skillId_level`), `JunakSkill { id, junakId, levelId, achievedAt: Date, examiner, certificateNumber, createdById, createdAt }` (`@@unique([junakId, levelId])`); enum `SkillGroup` (`PRACTICAL | FIRST_AID | NATURE | SPORT | HOME | SPECIAL | ARTS | AVIATION | SEA`); `AuditAction.{SKILL_ACHIEVED, SKILL_UPDATED, SKILL_REMOVED, CUSTOM_SKILL_CREATED, CUSTOM_SKILL_UPDATED, CUSTOM_SKILL_DELETED}` у `AUDIT_GROUPS.PEOPLE`; фікстура `createSkill(prisma, { name: string; group?: SkillGroup; kurinId?: string | null; levels?: number[] })` → `Skill & { levels: SkillLevel[] }` (рівні за зростанням, вимоги `[{ text: '1. Вимога рівня N' }]`).

- [ ] **Step 1: Написати фікстуру й падаючий e2e-тест обмежень БД**

У `apps/api/test/utils/fixtures.ts` додати до імпорту `SkillGroup` і в кінець файлу:

```ts
export async function createSkill(
  prisma: PrismaClient,
  overrides: { name: string; group?: SkillGroup; kurinId?: string | null; levels?: number[] },
) {
  return prisma.skill.create({
    data: {
      name: overrides.name,
      group: overrides.group ?? SkillGroup.PRACTICAL,
      kurinId: overrides.kurinId ?? null,
      levels: {
        create: (overrides.levels ?? [1]).map((level) => ({
          level,
          requirements: [{ text: `1. Вимога рівня ${level}` }],
        })),
      },
    },
    include: { levels: { orderBy: { level: 'asc' } } },
  });
}
```

(рядок імпорту стає `import { PrismaClient, Role, KurinGender, ProbyProgramVersion, PositionScope, PositionType, SkillGroup } from '@prisma/client';`)

Створити `apps/api/test/skills-schema.e2e-spec.ts`:

```ts
import { PrismaClient, ProbyProgramVersion, Role } from '@prisma/client';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createProbyProgramTree, createSkill, createUser } from './utils/fixtures';

describe('Skill catalog — database constraints (e2e)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  async function twoKurins() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Точка']);
    const a = await createKurin(prisma, { probyProgramId: program.id });
    const b = await createKurin(prisma, { probyProgramId: program.id });
    return [a, b];
  }

  it('keeps global skill names unique (partial unique index on kurinId IS NULL)', async () => {
    await createSkill(prisma, { name: 'Картографія' });
    await expect(createSkill(prisma, { name: 'Картографія' })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows one custom name per kurin, in several kurins and next to a global skill', async () => {
    const [a, b] = await twoKurins();
    await createSkill(prisma, { name: 'Знавець компʼютерів' });
    await createSkill(prisma, { name: 'Знавець компʼютерів', kurinId: a.id });
    await createSkill(prisma, { name: 'Знавець компʼютерів', kurinId: b.id });
    await expect(createSkill(prisma, { name: 'Знавець компʼютерів', kurinId: a.id })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('records a skill level once per junak as a calendar date, and cascades levels with their skill', async () => {
    const [kurin] = await twoKurins();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const skill = await createSkill(prisma, { name: 'Куховарення', levels: [1, 2] });
    const data = {
      junakId: junak.id,
      levelId: skill.levels[0].id,
      achievedAt: new Date('2025-05-01T00:00:00.000Z'),
      createdById: junak.id,
    };
    const first = await prisma.junakSkill.create({ data });
    expect(first.achievedAt.toISOString()).toBe('2025-05-01T00:00:00.000Z');
    await expect(prisma.junakSkill.create({ data })).rejects.toMatchObject({ code: 'P2002' });

    const unused = await createSkill(prisma, { name: 'Сигналізація', levels: [3] });
    await prisma.skill.delete({ where: { id: unused.id } });
    expect(await prisma.skillLevel.count({ where: { skillId: unused.id } })).toBe(0);
  });
});
```

- [ ] **Step 2: Запустити — очікувано FAIL**

З `apps/api` (команда e2e з Global Constraints) для `test/skills-schema.e2e-spec.ts`.
Expected: FAIL — помилка компіляції TypeScript `Property 'skill' does not exist on type 'PrismaClient'` / `Module '"@prisma/client"' has no exported member 'SkillGroup'`.

- [ ] **Step 3: Додати моделі в `schema.prisma`**

Після моделі `JunakActivityEntry` (рядок ~287) вставити:

```prisma
enum SkillGroup {
  PRACTICAL // Вмілості практичного пластування
  FIRST_AID // Вмілості першої допомоги і рятівництва
  NATURE    // Природничі вмілості
  SPORT     // Спортивні вмілості
  HOME      // Вмілості домашньої зарадності
  SPECIAL   // Вмілості спеціального зацікавлення
  ARTS      // Мистецькі вмілості
  AVIATION  // Вмілості літунського пластування
  SEA       // Вмілості морського пластування
}

model Skill {
  id        String       @id @default(uuid())
  // null = глобальний каталог («Вмілості УПЮ», 2003, сид); не null = власна вмілість куреня.
  kurinId   String?
  // Restrict: SetNull (типовий для опціонального звʼязку) зробив би власні
  // вмілості видаленого куреня «глобальними».
  kurin     Kurin?       @relation(fields: [kurinId], references: [id], onDelete: Restrict)
  name      String
  group     SkillGroup
  createdAt DateTime     @default(now())
  levels    SkillLevel[]

  // Унікальність власних назв у межах куреня. Для глобальних (kurinId IS NULL)
  // Postgres вважає NULL різними, тож унікальність їхніх назв забезпечує
  // частковий індекс "Skill_global_name_key" з міграції *_junak_skills —
  // Prisma не вміє описати його в схемі. Якщо `prisma migrate dev` колись
  // згенерує `DROP INDEX "Skill_global_name_key"`, приберіть цей рядок з міграції.
  @@unique([kurinId, name])
}

model SkillLevel {
  id           String       @id @default(uuid())
  skillId      String
  skill        Skill        @relation(fields: [skillId], references: [id], onDelete: Cascade)
  // 1, 2, 3 = перша / друга / третя проба, до якої призначена вмілість.
  level        Int
  // Упорядковані вимоги: [{ text: string, items?: string[] }] — SkillRequirement
  // у src/skills/skill.types.ts (items — підпункти а/б/в).
  requirements Json
  // Примітка рівня: «Виконати вимоги А або Б.», «нова вмілість».
  note         String?
  achievements JunakSkill[]

  @@unique([skillId, level])
}

model JunakSkill {
  id                String     @id @default(uuid())
  junakId           String
  junak             User       @relation("JunakSkills", fields: [junakId], references: [id])
  levelId           String
  // Restrict (типово для обовʼязкового звʼязку): рівень зі здобуттями не видаляється.
  level             SkillLevel @relation(fields: [levelId], references: [id])
  achievedAt        DateTime   @db.Date
  // Імʼя екзаменатора вільним текстом (може бути непластун).
  examiner          String?
  certificateNumber String?
  createdById       String
  createdBy         User       @relation("JunakSkillCreatedBy", fields: [createdById], references: [id])
  createdAt         DateTime   @default(now())

  @@unique([junakId, levelId])
  @@index([junakId])
}
```

У `model Kurin` після `auditLogs            AuditLog[]` додати:

```prisma
  skills               Skill[]
```

У `model User` після `pushSubscriptions          PushSubscription[]` додати:

```prisma
  junakSkills                JunakSkill[]           @relation("JunakSkills")
  createdJunakSkills         JunakSkill[]           @relation("JunakSkillCreatedBy")
```

У `enum AuditAction` після `ANNOUNCEMENT_DELETED` додати:

```prisma
  // Історія юнака
  SKILL_ACHIEVED
  SKILL_UPDATED
  SKILL_REMOVED
  CUSTOM_SKILL_CREATED
  CUSTOM_SKILL_UPDATED
  CUSTOM_SKILL_DELETED
```

- [ ] **Step 4: Згенерувати міграцію, дописати частковий індекс, застосувати**

З `apps/api`: `npx prisma migrate dev --create-only --name junak_skills`.

Відкрити `prisma/migrations/<timestamp>_junak_skills/migration.sql` і звірити зі зразком нижче (порядок блоків Prisma може відрізнятися — важливий зміст). У файлі **не повинно** бути `DROP`, `ALTER TABLE ... DROP/ALTER COLUMN` для наявних таблиць. Дописати в кінець ручний блок з частковим індексом:

```sql
-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SKILL_ACHIEVED';
ALTER TYPE "AuditAction" ADD VALUE 'SKILL_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SKILL_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'CUSTOM_SKILL_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CUSTOM_SKILL_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CUSTOM_SKILL_DELETED';

-- CreateEnum
CREATE TYPE "SkillGroup" AS ENUM ('PRACTICAL', 'FIRST_AID', 'NATURE', 'SPORT', 'HOME', 'SPECIAL', 'ARTS', 'AVIATION', 'SEA');

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "kurinId" TEXT,
    "name" TEXT NOT NULL,
    "group" "SkillGroup" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillLevel" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "requirements" JSONB NOT NULL,
    "note" TEXT,

    CONSTRAINT "SkillLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JunakSkill" (
    "id" TEXT NOT NULL,
    "junakId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "achievedAt" DATE NOT NULL,
    "examiner" TEXT,
    "certificateNumber" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JunakSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Skill_kurinId_name_key" ON "Skill"("kurinId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SkillLevel_skillId_level_key" ON "SkillLevel"("skillId", "level");

-- CreateIndex
CREATE INDEX "JunakSkill_junakId_idx" ON "JunakSkill"("junakId");

-- CreateIndex
CREATE UNIQUE INDEX "JunakSkill_junakId_levelId_key" ON "JunakSkill"("junakId", "levelId");

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_kurinId_fkey" FOREIGN KEY ("kurinId") REFERENCES "Kurin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillLevel" ADD CONSTRAINT "SkillLevel_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakSkill" ADD CONSTRAINT "JunakSkill_junakId_fkey" FOREIGN KEY ("junakId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakSkill" ADD CONSTRAINT "JunakSkill_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "SkillLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakSkill" ADD CONSTRAINT "JunakSkill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-added: Prisma cannot express a partial unique index. Global catalog
-- skills (kurinId IS NULL) must have unique names; the composite unique above
-- treats NULL kurinIds as distinct, so it does not cover them.
CREATE UNIQUE INDEX "Skill_global_name_key" ON "Skill"("name") WHERE "kurinId" IS NULL;
```

Застосувати й перевірити:

```bash
npx prisma migrate dev                      # dev-база + prisma generate
set -a; . ./.env; set +a; DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy
npx prisma migrate dev --create-only --name drift_check
```

Остання команда має відповісти «Already in sync…» і нічого не створити. Якщо вона створила теку `*_drift_check` з `DROP INDEX "Skill_global_name_key"` — Prisma не ігнорує частковий індекс: видалити цю теку (`rm -r prisma/migrations/*_drift_check`) і памʼятати про коментар у `model Skill` (у задачі 8 той самий рядок треба буде прибрати з міграції хвилі B). Будь-який інший вміст `drift_check` — помилка в схемі, виправити.

- [ ] **Step 5: Додати нові таблиці в `cleanDatabase`**

У `apps/api/test/utils/clean-db.ts` одразу після `prisma.junakActivityEntry.deleteMany(),` вставити (порядок FK-безпечний: здобуття → рівні → вмілості, усе до `user`/`kurin`):

```ts
    prisma.junakSkill.deleteMany(),
    prisma.skillLevel.deleteMany(),
    prisma.skill.deleteMany(),
```

- [ ] **Step 6: Запустити e2e — очікувано PASS**

`test/skills-schema.e2e-spec.ts` (команда з Global Constraints). Expected: 3 passed.

- [ ] **Step 7: Запустити guard-тест журналу — очікувано FAIL**

З `apps/api`: `npx jest src/audit --runInBand --forceExit`.
Expected: FAIL у `audit.constants.spec.ts` «covers every AuditAction exactly once» — у групах бракує `CUSTOM_SKILL_*`, `SKILL_*`.

- [ ] **Step 8: Додати дії в групу `PEOPLE`**

У `apps/api/src/audit/audit.constants.ts` у масиві `PEOPLE` після `AuditAction.APPROVAL_REJECTED,` додати:

```ts
    AuditAction.SKILL_ACHIEVED,
    AuditAction.SKILL_UPDATED,
    AuditAction.SKILL_REMOVED,
    AuditAction.CUSTOM_SKILL_CREATED,
    AuditAction.CUSTOM_SKILL_UPDATED,
    AuditAction.CUSTOM_SKILL_DELETED,
```

- [ ] **Step 9: Запустити — PASS**

`npx jest src --runInBand --forceExit` і `npx tsc --noEmit -p tsconfig.json`. Expected: усі unit-тести зелені, tsc без помилок.

- [ ] **Step 10: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/*_junak_skills apps/api/src/audit/audit.constants.ts apps/api/test/utils/clean-db.ts apps/api/test/utils/fixtures.ts apps/api/test/skills-schema.e2e-spec.ts docs/superpowers/specs/2026-10-29-junak-history-design.md docs/superpowers/plans/2026-10-29-junak-history.md
git commit -m "feat(api): skill catalog schema with partial unique index for global names"
```

---

### Task 2: Дані каталогу `skills-catalog.data.ts` з правильника (кілька комітів)

> **Велика механічна задача — реалізувати в 5 комітах** (по 1–3 групи): 1) типи + спека + PRACTICAL, FIRST_AID, NATURE; 2) SPORT, HOME; 3) SPECIAL; 4) ARTS; 5) AVIATION, SEA + перевірка повноти. Кожен коміт — зелена спека. Не вигадувати вимог, не «покращувати» стиль джерела.

**Files:**
- Create: `apps/api/src/skills/skill.types.ts`
- Create: `apps/api/src/scripts/skills-catalog.data.ts`
- Test: `apps/api/src/scripts/skills-catalog.data.spec.ts`

**Interfaces:**
- Consumes: enum `SkillGroup` з `@prisma/client` (задача 1).
- Produces:
  - `skill.types.ts`: `export interface SkillRequirement { text: string; items?: string[] }`.
  - `skills-catalog.data.ts`: `export interface SkillLevelData { level: 1 | 2 | 3; note?: string; requirements: SkillRequirement[] }`, `export interface SkillData { name: string; group: SkillGroup; levels: SkillLevelData[] }`, `export const SKILLS_CATALOG: SkillData[]` — 70 вмілостей, 108 рівнів.

**Джерело тексту.** Текстовий шар PDF: `/private/tmp/claude-501/-Users-user-Documents-Cowork-Playground-eKrutianyn/7d8f7f6d-a659-4b24-903c-f9dbfd184c91/scratchpad/vm.txt`. Якщо файлу немає — згенерувати у своїй scratchpad-теці: `pdftotext -layout /Users/user/Downloads/Vmilosti-UPYU.pdf <scratchpad>/vm.txt` (вивід ідентичний; номери рядків нижче — для цього файлу, 1553 рядки). Діапазони груп:

| Група | `SkillGroup` | Рядки `vm.txt` | Вмілостей / рівнів (після вичитування) |
|---|---|---|---|
| Вмілості практичного пластування | `PRACTICAL` | 91–247 | 9 / 9 |
| Вмілості першої допомоги і рятівництва | `FIRST_AID` | 248–288 | 2 / 3 |
| Природничі вмілості | `NATURE` | 289–371 | 5 / 7 |
| Спортивні вмілості | `SPORT` | 372–670 | 12 / 14 |
| Вмілості домашньої зарадності | `HOME` | 671–838 | 4 / 10 |
| Вмілості спеціального зацікавлення | `SPECIAL` | 839–1069 | 12 / 24 |
| Мистецькі вмілості | `ARTS` | 1080–1347 | 13 / 28 |
| Вмілості літунського пластування | `AVIATION` | 1348–1389 | 3 / 3 |
| Вмілості морського пластування | `SEA` | 1390–1553 | 10 / 10 |

**Процедура вилучення (однакова для кожної групи):**

1. Прочитати діапазон рядків групи (Read з `offset`/`limit`). Прибрати символи `\f` (розрив сторінки) і крайові пробіли кожного рядка.
2. Кожен заголовок `Назва (перша|друга|третя) проба` — рівень 1/2/3 вмілості `Назва`. Вмілість з кількома заголовками (навіть рознесеними, як «Скелелазіння (третя)» перед «(друга)») — **один** обʼєкт `SkillData`, рівні в `levels` за зростанням. Порядок вмілостей у файлі — порядок першої появи в джерелі, групи — порядок таблиці.
3. Класифікація рядків тексту рівня:
   - **початок вимоги**: `^\d+\.\s` (`1. …`), `^[IVX]+\.\s` (римські — див. п. 5), `^[АБ]\.\s` (варіант «А або Б» — див. п. 6);
   - **початок підпункту** (`items`): `^[а-яґєії]\)\s` (`а) …`) або `^–\s` (тире-рядки, як у «Піонірство» п. 5);
   - **усе інше** — продовження перенесеного рядка: дописати до попереднього тексту (вимоги або підпункту) через один пробіл.
4. Тексти зберігати **разом із нумерацією джерела** (`'1. …'`, `'а) …'`) і пунктуацією джерела (`;`, `.`, `:`); пропуски нумерації не виправляти (у «Піонірство (друга)» після `5.` іде `7.` — так і лишити). Апострофи — як у джерелі (`'` або `’`), рядки з `'` писати в подвійних лапках (як `real-proby-content.data.ts`). Кілька пробілів поспіль → один.
5. **Римські розділи** («Лещетарство», обидва рівні): кожен `I.`…`V.` — вимога; нумеровані рядки всередині розділу — її `items`; їхні підпункти `а)/б)` дописуються в текст відповідного item через пробіл. Кириличні/змішані римські цифри (`І.`, `ІІ.`, `IIІ.`) записати латиницею (`I.`, `II.`, `III.`).
6. **«А або Б»** («Перша допомога (перша)»): рядок «Виконати вимоги А або Б.» → `note`; `А.` і `Б.` — дві вимоги; нумеровані пункти після `Б.` — `items` вимоги `Б.`.
7. Ненумерований єдиний абзац рівня («Перша допомога (друга)», «Природознавство (третя)») — одна вимога з цим текстом.
8. Передумови («Здобути вмілість «Табірництво».») — звичайний текст вимоги, без окремих полів.
9. Застосувати виправлення зі списку нижче, записати дані, запустити спеку.

**Обовʼязкові виправлення (ручне вичитування):**

| Де (`vm.txt`) | Дефект | Як у даних |
|---|---|---|
| 182 | `Табріництво (перша проба)` | назва `Табірництво` |
| 373 | `Альпіністка (третя проба)` | назва `Альпіністика` (текст вимог «Скелелазіння (третя)» з «Альпіністика І» — без змін) |
| 469 | `Водне лещатарство` | назва `Водне лещетарство` |
| 543, 576 | `Розворот на 1800` | `Розворот на 180°` |
| 556–622 | «Лещетарство (третя)» злите з іншим рівнем: у рядку 587 `…по непідготовленій трасі.третя` + рядок `проба` | «Лещетарство» рівень 3 закінчується вимогою `V. … 7-10 км по непідготовленій трасі.`; решта (рядки 589–622, від `1. Здобути пластові вмілості «Лещетарство альпійського стилю»…` до `12. … відеофільм.`) — нова вмілість **`Мандрівне лещетарство`**, `SPORT`, рівень 3 |
| 692 | `Домашня парадність (друга проба)` | рівень 2 вмілості `Домашня зарадність` |
| 1081 | `Актороство (перша проба)` | рівень 1 вмілості `Акторство` |
| 1237 | `Скульптура (третя проба)` з вимогами різьблення (мотиви, оздоблення, «Оздобити одну річ») | рівень 3 вмілості `Різьбярство` |
| 1241, 1250 | `Скульптура (друга)` і `Скульптура (третя)` | без змін: рівні 2 і 3 вмілості `Скульптура` |
| 146–166 | «Піонірство (друга)» без п. 6 | як є (без вигадування п. 6) |

**Зразки записів (по одному на кожен варіант форми; ці записи — справжні дані, вставити як є):**

Простий список (`NATURE`, рядки 306–312):

```ts
  {
    name: 'Приятель/-ка тварин',
    group: SkillGroup.NATURE,
    levels: [
      {
        level: 1,
        requirements: [
          { text: '1. Знати в загальному анатомію домашніх і свійських тварин.' },
          {
            text: '2. Описати, які є види ран, переломів, вивихів, виснаження, вдавлення та кульгання. Знати способи надання першої допомоги у легких випадках.',
          },
          { text: '3. Знати закони охорони своєї тварини.' },
          { text: '4. Піклуватися хоча б півроку однією домашньою твариною.' },
          { text: '5. Довести знання (в загальному) дієти, звичок і потреб своєї тварини.' },
        ],
      },
    ],
  },
```

Список із підпунктами а/б/в (`NATURE`, рядки 313–325):

```ts
  {
    name: 'Рибальство',
    group: SkillGroup.NATURE,
    levels: [
      {
        level: 2,
        requirements: [
          { text: '1. Мати дозвіл на риболовлення у своїй околиці.' },
          { text: '2. Показати, як вживати головні прилади для рибальства.' },
          { text: "3. Показати, як прив'язати гачок до нитки трьома різними вузлами." },
          { text: '4. Розпізнати різні роди рибальських сітей та розповісти, як ловити рибу з їх допомогою.' },
          { text: '5. Розпізнати та назвати 10 родів риб, знати їхні ознаки та розповісти про спосіб життя.' },
          { text: '6. Зловити хоча б три риби, почистити їх та зварити двома різними способами.' },
          {
            text: '7. Знати, коли є дозволений рибальський сезон на 5 видів різних риб. Пояснити, чому деякі риби охороняються законом в різні пори року.',
          },
          {
            text: '8. Виконати хоча б одне з наступних завдань:',
            items: [
              'а) сплести рибальську сітку;',
              'б) збудувати власну штучну «мушку» при гачку для ловлення риби;',
              'в) відвідати рибальський порт або корабель.',
            ],
          },
        ],
      },
    ],
  },
```

«А або Б» + ненумерований рівень (`FIRST_AID`, рядки 249–274):

```ts
  {
    name: 'Перша допомога',
    group: SkillGroup.FIRST_AID,
    levels: [
      {
        level: 1,
        note: 'Виконати вимоги А або Б.',
        requirements: [
          {
            text: 'А. Здобути відзначку першої допомоги від Червоного Хреста або іншої урядом контрольованої інституції, яка спеціалізується у такому навчанні.',
          },
          {
            text: 'Б. Відповісти поданим нижче вимогам.',
            items: [
              '1. Пояснити закони про надання першої допомоги потребуючим.',
              "2. Пояснити, як запобігти дальшому пошкодженню людини в нещасному випадку, коли ступінь покалічення не з'ясовано.",
              '3. Пояснити, як розпізнати чотири види ран. Пояснити небезпеку інфекції. Показати і пояснити чотири способи зупинки кровотечі.',
              '4. Зробити список речей, потрібних у польовій аптечці; показати та пояснити їх вживання. Продемонструвати, як стерилізувати матеріал на бинти та правильно його використовувати.',
              '5. Показати й пояснити рятування людини, пораненої внаслідок дії електричного струму, та як чинити, якщо людина перебуває в контакті з електричним дротом.',
              '6. Пояснити і показати ознаки вивихів і переломів рук чи ніг, показати, що робити в таких випадках.',
              '7. Зробити ноші та продемонструвати, як переносити людину із складним переломом або важким пораненням.',
              '8. Пояснити два види штучного дихання та практично продемонструвати їх.',
              '9. Пояснити види отруєння, способи попередження та допомогу у випадках отруєння.',
              '10. Пояснити ознаки та показати, що робити в таких випадках: зомління, шок, опік, сонячний удар, запаморочення та серцевий напад.',
              '11. Розрізнити найважливіші інфекційні хвороби, пояснити їхні ознаки та спосіб запобігання захворенню.',
              "12. Користуватися аптечкою та успішно виконувати обов'язки гурткового, курінного або таборового санітара впродовж двох діб під час мандрівки або на таборі.",
              '13. Знати, що робити у випадку укушення отруйної гадюки, бджіл і скаженого звіра.',
            ],
          },
        ],
      },
      {
        level: 2,
        requirements: [{ text: 'Мати довідку про закінчені курси з першої допомоги.' }],
      },
    ],
  },
```

Передумова в тексті вимоги (`PRACTICAL`, рядки 236–247):

```ts
  {
    name: 'Три пера',
    group: SkillGroup.PRACTICAL,
    levels: [
      {
        level: 3,
        requirements: [
          { text: '1. Здобути вмілості «Одне перо», «Два пера» та «Перша допомога».' },
          { text: '2. Подати дозвіл від батьків на письмі.' },
          {
            text: '3. Після основної підготовки та виконання вищенаведених вимог відбути одинцем триденну прогульку на підставі затвердженого інструктором плану. Прогульку виконати за такими вказівками:',
            items: [
              'а) дозволений виряд: пластовий однострій, куртка, один коц, дощовик або пластикова церата, ніж, олівець, записник, шнурок, миска, три сірники та їжа на два дні (не більше, ніж 2500 калорій для дівчат та 3000 для хлопців);',
              'б) протягом першої доби дотримуватись цілковитої мовчанки; збудувати шалаш та варити для себе. Записувати всю діяльність і враження до записника;',
              'в) протягом другої доби замаскувати місце, варити для себе та поводитися так, щоб не бути поміченим. Продовжувати вести записи.',
            ],
          },
          { text: '4. Подати інструкторові точний звіт зі своїх спостережень разом із записником.' },
        ],
      },
    ],
  },
```

Як виглядають римські розділи (останні дві вимоги рівня 3 «Лещетарство», рядки 573–587 — справжній фрагмент масиву `requirements`):

```ts
          {
            text: 'IV. На біговій трасі середньої складності виконати такі технічні елементи:',
            items: [
              "1. Піднімання вгору: а) прямо; б) драбинкою; в) ялинкою; г) пів'ялинкою.",
              '2. Розворот на 180° на місці в обидві сторони.',
              '3. Правильне падіння у критичній ситуації.',
              '4. Правильне вставання після падіння.',
              '5. Спуск в основній стійці: а) прямий спуск з подальшим переходом до ковзаючого плуга та гальмуючого плуга; б) спуск з подальшим поворотом переступанням і зупинкою.',
              '6. Змінний лещетарський хід.',
              '7. Перемінний двокроковий хід.',
              '8. Одночасний безкроковий хід.',
              '9. Ковзанярський хід.',
            ],
          },
          {
            text: 'V. При достатньому рівні підготовки і володіння лещетарською технікою нордійського стилю провести мандрівку на лещетах протяжністю 10-15 км по підготовленій біговій трасі або 7-10 км по непідготовленій трасі.',
          },
```

- [ ] **Step 1: Типи, порожні дані, спека з першою групою — FAIL**

`apps/api/src/skills/skill.types.ts`:

```ts
/** One requirement of a skill level, numbered as in the source; `items` are its sub-points (а), б)… or «–» lines). */
export interface SkillRequirement {
  text: string;
  items?: string[];
}
```

`apps/api/src/scripts/skills-catalog.data.ts` (початковий стан):

```ts
import { SkillGroup } from '@prisma/client';
import type { SkillRequirement } from '../skills/skill.types';

// Каталог «Вмілості Уладу Пластунів Юнаків та Пластунок Юначок» (КПС, Львів, 2003),
// вичитаний вручну (виправлення — docs/superpowers/plans/2026-10-29-junak-history.md, задача 2).
// PDF у репозиторій не додається. Тексти вимог — дослівно, з нумерацією джерела.

export interface SkillLevelData {
  level: 1 | 2 | 3;
  /** Примітка під заголовком рівня: «Виконати вимоги А або Б.», «нова вмілість». */
  note?: string;
  requirements: SkillRequirement[];
}

export interface SkillData {
  name: string;
  group: SkillGroup;
  levels: SkillLevelData[];
}

export const SKILLS_CATALOG: SkillData[] = [];
```

`apps/api/src/scripts/skills-catalog.data.spec.ts`:

```ts
import { SkillGroup } from '@prisma/client';
import { SKILLS_CATALOG, SkillData } from './skills-catalog.data';

/** [skills, skill×level entries] per group after the manual clean-up; a row is added with each group. */
const EXPECTED_COUNTS: Partial<Record<SkillGroup, [number, number]>> = {
  PRACTICAL: [9, 9],
};

const ALLOWED_NOTES = ['Виконати вимоги А або Б.', 'нова вмілість'];

function skill(name: string): SkillData {
  const found = SKILLS_CATALOG.find((s) => s.name === name);
  if (!found) throw new Error(`Вмілості «${name}» немає в каталозі`);
  return found;
}
const levelsOf = (name: string) => skill(name).levels.map((l) => l.level);
const requirementsOf = (name: string, level: number) => skill(name).levels.find((l) => l.level === level)!.requirements;
const allTexts = () =>
  SKILLS_CATALOG.flatMap((s) => [
    s.name,
    ...s.levels.flatMap((l) => [...(l.note ? [l.note] : []), ...l.requirements.flatMap((r) => [r.text, ...(r.items ?? [])])]),
  ]);

describe('SKILLS_CATALOG — structure', () => {
  it('has unique skill names across all groups', () => {
    const names = SKILLS_CATALOG.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses only levels 1–3, each at most once per skill, in ascending order', () => {
    for (const s of SKILLS_CATALOG) {
      const levels = s.levels.map((l) => l.level);
      expect(levels.length).toBeGreaterThan(0);
      expect(levels.every((l) => [1, 2, 3].includes(l))).toBe(true);
      expect(levels).toEqual([...new Set(levels)].sort());
    }
  });

  it('has at least one requirement per level and no empty texts or items', () => {
    for (const s of SKILLS_CATALOG) {
      for (const l of s.levels) {
        expect(l.requirements.length).toBeGreaterThan(0);
        for (const r of l.requirements) {
          expect(r.text.trim()).not.toBe('');
          if (r.items) {
            expect(r.items.length).toBeGreaterThan(0);
            r.items.forEach((item) => expect(item.trim()).not.toBe(''));
          }
        }
      }
    }
  });

  it('has clean text: trimmed, no form feeds, no double spaces, no lost degree sign', () => {
    for (const text of allTexts()) {
      expect(text).toBe(text.trim());
      expect(text).not.toMatch(/\f|\s{2,}/);
      expect(text).not.toContain('1800');
    }
  });

  it('uses only the known level notes', () => {
    for (const s of SKILLS_CATALOG) {
      for (const l of s.levels) {
        if (l.note !== undefined) expect(ALLOWED_NOTES).toContain(l.note);
      }
    }
  });
});

describe('SKILLS_CATALOG — per-group counts', () => {
  it.each(Object.entries(EXPECTED_COUNTS))('group %s has the expected skills and levels', (group, counts) => {
    const inGroup = SKILLS_CATALOG.filter((s) => s.group === group);
    expect([inGroup.length, inGroup.reduce((sum, s) => sum + s.levels.length, 0)]).toEqual(counts);
  });
});

describe('PRACTICAL clean-up', () => {
  it('fixes «Табріництво» and keeps the numbering gap in «Піонірство»', () => {
    expect(levelsOf('Табірництво')).toEqual([1]);
    expect(allTexts().join('\n')).not.toContain('Табріництво');
    expect(requirementsOf('Піонірство', 2).map((r) => r.text.split('.')[0])).toEqual(['1', '2', '3', '4', '5', '7', '8', '9']);
  });

  it('keeps sub-points and prerequisites as text', () => {
    const kartografia = requirementsOf('Картографія', 2);
    expect(kartografia).toHaveLength(5);
    expect(kartografia[0].items).toHaveLength(5);
    expect(requirementsOf('Три пера', 3)[0].text).toBe('1. Здобути вмілості «Одне перо», «Два пера» та «Перша допомога».');
  });
});
```

Run: `npx jest src/scripts/skills-catalog.data.spec.ts`. Expected: FAIL — «group PRACTICAL…» (`[0, 0]` ≠ `[9, 9]`) і «Вмілості «Табірництво» немає в каталозі».

- [ ] **Step 2: Вилучити PRACTICAL (рядки 91–247) — PASS**

За процедурою: Картографія (2), Куховарення (1), Мандрівництво (2), Піонірство (2), Сигналізація (3), Табірництво (1), Одне перо (1), Два пера (2), Три пера (3 — зразок вище). Run: `npx jest src/scripts/skills-catalog.data.spec.ts` → PASS.

- [ ] **Step 3: FIRST_AID (рядки 248–288) — спершу FAIL, потім PASS**

Додати в спеку рядок `FIRST_AID: [2, 3],` до `EXPECTED_COUNTS` і блок:

```ts
describe('FIRST_AID clean-up', () => {
  it('keeps «А або Б» as a note with two requirements, the numbered list belonging to Б', () => {
    expect(levelsOf('Перша допомога')).toEqual([1, 2]);
    const level1 = skill('Перша допомога').levels[0];
    expect(level1.note).toBe('Виконати вимоги А або Б.');
    expect(level1.requirements.map((r) => r.text.slice(0, 2))).toEqual(['А.', 'Б.']);
    expect(level1.requirements[1].items).toHaveLength(13);
    expect(requirementsOf('Водне рятівництво', 3)[0].text).toBe('1. Здобути вмілість з плавання.');
  });
});
```

Run → FAIL. Вилучити: Перша допомога (1, 2 — зразок вище), Водне рятівництво (3). Run → PASS.

- [ ] **Step 4: NATURE (рядки 289–371) — FAIL → PASS**

Додати `NATURE: [5, 7],` і:

```ts
describe('NATURE clean-up', () => {
  it('has three levels of «Природознавство», the third a single paragraph', () => {
    expect(levelsOf('Природознавство')).toEqual([1, 2, 3]);
    expect(requirementsOf('Природознавство', 3)).toHaveLength(1);
    expect(requirementsOf('Рибальство', 2)[7].items).toHaveLength(3);
  });
});
```

Run → FAIL. Вилучити: Погодознавство (1), Приятель/-ка тварин (1 — зразок), Рибальство (2 — зразок), Огородництво (2), Природознавство (1, 2, 3). Run → PASS.

- [ ] **Step 5: Commit 1/5**

```bash
git add apps/api/src/skills/skill.types.ts apps/api/src/scripts/skills-catalog.data.ts apps/api/src/scripts/skills-catalog.data.spec.ts
git commit -m "feat(api): skills catalog data — practical, first aid, nature groups"
```

- [ ] **Step 6: SPORT (рядки 372–670) — FAIL → PASS**

Додати `SPORT: [12, 14],` і:

```ts
describe('SPORT clean-up', () => {
  it('fixes skill names and splits the merged ski-touring level into its own skill', () => {
    const names = SKILLS_CATALOG.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['Альпіністика', 'Водне лещетарство', 'Мандрівне лещетарство']));
    expect(names).not.toEqual(expect.arrayContaining(['Альпіністка']));
    expect(allTexts().join('\n')).not.toMatch(/лещатарство|трасі\.третя/);
    expect(levelsOf('Скелелазіння')).toEqual([2, 3]);
    expect(levelsOf('Лещетарство')).toEqual([2, 3]);
    const skiing3 = requirementsOf('Лещетарство', 3);
    expect(skiing3.map((r) => r.text.split('.')[0])).toEqual(['I', 'II', 'III', 'IV', 'V']);
    expect(JSON.stringify(skiing3)).not.toContain('Лещетарство альпійського стилю');
    expect(skiing3[3].items).toContain('2. Розворот на 180° на місці в обидві сторони.');
    expect(levelsOf('Мандрівне лещетарство')).toEqual([3]);
    expect(requirementsOf('Мандрівне лещетарство', 3)[0].text).toContain('«Лещетарство альпійського стилю»');
    expect(requirementsOf('Мандрівне лещетарство', 3)).toHaveLength(12);
  });
});
```

Run → FAIL. Вилучити: Альпіністика (3), Скелелазіння (2, 3), Водне лещетарство (3), Їзда верхи (2), Їзда на велосипеді (1), Легка атлетика (1), Лещетарство (2, 3 — римські розділи), Мандрівне лещетарство (3 — з рядків 589–622), Плавання (2), Спортивні ігри (1), Стрільба з лука (2), Стрільба з рушниці (3). Run → PASS.

- [ ] **Step 7: HOME (рядки 671–838) — FAIL → PASS**

Додати `HOME: [4, 9],` і:

```ts
describe('HOME clean-up', () => {
  it('merges «Домашня парадність» into «Домашня зарадність» level 2', () => {
    expect(levelsOf('Домашня зарадність')).toEqual([1, 2]);
    expect(allTexts().join('\n')).not.toContain('парадність');
    expect(levelsOf('Плетіння')).toEqual([1, 2, 3]);
    expect(levelsOf('Шиття')).toEqual([1, 2, 3]);
  });
});
```

Run → FAIL. Вилучити: Домашня зарадність (1, 2), Піклування дітьми (3), Плетіння (1, 2, 3), Шиття (1, 2, 3). Run → PASS.

- [ ] **Step 8: Commit 2/5**

```bash
git add apps/api/src/scripts/skills-catalog.data.ts apps/api/src/scripts/skills-catalog.data.spec.ts
git commit -m "feat(api): skills catalog data — sport and home groups"
```

- [ ] **Step 9: SPECIAL (рядки 839–1069) — FAIL → PASS, Commit 3/5**

Додати `SPECIAL: [12, 24],` і:

```ts
describe('SPECIAL clean-up', () => {
  it('has three levels for the six multi-level special-interest skills', () => {
    for (const name of ['Автознавство', 'Астрономія', 'Військовик', 'Провідництво туристів', 'Український амбасадор', 'Фотографування']) {
      expect(levelsOf(name)).toEqual([1, 2, 3]);
    }
  });
});
```

Run → FAIL. Вилучити: Бібліотекарство (2), Журналістика (1), Моделювання (2), Скаутське побратимство (1), Філателія (1), Фільмування (2), Автознавство (1–3), Астрономія (1–3), Військовик (1–3), Провідництво туристів (1–3), Український амбасадор (1–3), Фотографування (1–3). Run → PASS.

```bash
git add apps/api/src/scripts/skills-catalog.data.ts apps/api/src/scripts/skills-catalog.data.spec.ts
git commit -m "feat(api): skills catalog data — special interest group"
```

- [ ] **Step 10: ARTS (рядки 1080–1347) — FAIL → PASS, Commit 4/5**

Додати `ARTS: [13, 28],` і:

```ts
describe('ARTS clean-up', () => {
  it('fixes «Актороство» and moves the mislabelled woodcarving level from «Скульптура» to «Різьбярство»', () => {
    expect(levelsOf('Акторство')).toEqual([1, 2, 3]);
    expect(allTexts().join('\n')).not.toContain('Актороство');
    expect(levelsOf('Різьбярство')).toEqual([1, 2, 3]);
    expect(requirementsOf('Різьбярство', 3)[0].text).toBe('1. Знати назви мотивів орнаментального різьблення по дереву.');
    expect(levelsOf('Скульптура')).toEqual([2, 3]);
    expect(requirementsOf('Скульптура', 2)[0].text).toContain('історію світової скульптури');
    expect(requirementsOf('Скульптура', 3)[0].text).toContain('історію української скульптури');
  });
});
```

Run → FAIL. Вилучити: Акторство (1–3), Вишивання (1–3), Графіка (3), Кераміка (1, 2), Любитель/-ка мистецтва (1–3), Музика (1–3), Писанкарство (2), Різьбярство (1, 2, 3 — третій з рядка 1237), Скульптура (2 — рядок 1241, 3 — рядок 1250), Спів (2), Танки (1–3), Хороводи-гагілки (3), Образотворче мистецтво (2, 3). Run → PASS.

```bash
git add apps/api/src/scripts/skills-catalog.data.ts apps/api/src/scripts/skills-catalog.data.spec.ts
git commit -m "feat(api): skills catalog data — arts group"
```

- [ ] **Step 11: AVIATION, SEA (рядки 1348–1553) + повнота — FAIL → PASS**

Додати `AVIATION: [3, 3], SEA: [10, 10],` і:

```ts
describe('SKILLS_CATALOG — completeness', () => {
  it('covers all 9 groups', () => {
    expect(new Set(SKILLS_CATALOG.map((s) => s.group))).toEqual(new Set(Object.values(SkillGroup)));
  });

  it('has 70 skills and 108 skill×level entries', () => {
    expect(SKILLS_CATALOG).toHaveLength(70);
    expect(SKILLS_CATALOG.reduce((sum, s) => sum + s.levels.length, 0)).toBe(108);
  });
});
```

Run → FAIL. Вилучити: Будівництво літаків, Літунство, Літунська навігація (усі 3); Бортова механіка (3), Будівництво суден (3), Вітрильництво (3), Водолаження (3), Канойкарство (2), Морська навігація (3), Пілотаж (3), Скіперство (3), Суднознавство (2), Якірництво (2). Переглянути PDF на сторінках «Скелелазіння» та «Альпіністика»: якщо під заголовком надруковано «нова вмілість» — додати `note: 'нова вмілість'` відповідному рівню. Run: `npx jest src/scripts/skills-catalog.data.spec.ts` і `npx tsc --noEmit -p tsconfig.json` → PASS.

- [ ] **Step 12: Commit 5/5**

```bash
git add apps/api/src/scripts/skills-catalog.data.ts apps/api/src/scripts/skills-catalog.data.spec.ts
git commit -m "feat(api): skills catalog data — aviation and sea groups, completeness check"
```

---

### Task 3: Ідемпотентний сид каталогу `seed-skills-catalog.ts`

**Files:**
- Create: `apps/api/src/scripts/seed-skills-catalog.ts`
- Test: `apps/api/test/skills-catalog-seed.e2e-spec.ts`

**Interfaces:**
- Consumes: `SKILLS_CATALOG`, `SkillData` (задача 2); моделі задачі 1; `createSkill`, `createKurin`, `createProbyProgramTree` з `test/utils/fixtures.ts`.
- Produces: `export async function seedSkillsCatalog(prisma: PrismaClient, catalog?: SkillData[]): Promise<SeedSkillsResult>`, `export interface SeedSkillsResult { skillsCreated: number; skillsUpdated: number; levelsCreated: number; levelsUpdated: number }`; CLI: `npx ts-node src/scripts/seed-skills-catalog.ts` (з `DATABASE_URL`), на проді `node dist/scripts/seed-skills-catalog.js`. Використовується Playwright-хелпером у задачі 6.

- [ ] **Step 1: Написати падаючий e2e**

`apps/api/test/skills-catalog-seed.e2e-spec.ts`:

```ts
import { PrismaClient, ProbyProgramVersion, SkillGroup } from '@prisma/client';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createProbyProgramTree, createSkill } from './utils/fixtures';
import { seedSkillsCatalog } from '../src/scripts/seed-skills-catalog';
import { SkillData } from '../src/scripts/skills-catalog.data';

describe('seedSkillsCatalog (e2e)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  const small = (text: string): SkillData[] => [
    { name: 'Картографія', group: SkillGroup.PRACTICAL, levels: [{ level: 2, requirements: [{ text }] }] },
  ];

  it('loads the full catalog: 70 global skills with 108 levels in 9 groups', async () => {
    const result = await seedSkillsCatalog(prisma);
    expect(result).toEqual({ skillsCreated: 70, skillsUpdated: 0, levelsCreated: 108, levelsUpdated: 0 });
    expect(await prisma.skill.count({ where: { kurinId: null } })).toBe(70);
    expect(await prisma.skillLevel.count()).toBe(108);
    expect(await prisma.skill.findMany({ distinct: ['group'], select: { group: true } })).toHaveLength(9);
    const firstAid = await prisma.skill.findFirstOrThrow({
      where: { kurinId: null, name: 'Перша допомога' },
      include: { levels: { orderBy: { level: 'asc' } } },
    });
    expect(firstAid.levels.map((l) => l.note)).toEqual(['Виконати вимоги А або Б.', null]);
  });

  it('is idempotent and updates requirements in place', async () => {
    await seedSkillsCatalog(prisma, small('1. Стара вимога'));
    const again = await seedSkillsCatalog(prisma, small('1. Нова вимога'));
    expect(again).toEqual({ skillsCreated: 0, skillsUpdated: 0, levelsCreated: 0, levelsUpdated: 1 });
    const levels = await prisma.skillLevel.findMany();
    expect(levels).toHaveLength(1);
    expect(levels[0].requirements).toEqual([{ text: '1. Нова вимога' }]);
  });

  it('moves a skill to its new group instead of duplicating it', async () => {
    await seedSkillsCatalog(prisma, small('1. Вимога'));
    const moved = await seedSkillsCatalog(prisma, [{ ...small('1. Вимога')[0], group: SkillGroup.SPECIAL }]);
    expect(moved.skillsUpdated).toBe(1);
    const all = await prisma.skill.findMany();
    expect(all).toHaveLength(1);
    expect(all[0].group).toBe(SkillGroup.SPECIAL);
  });

  it('never deletes levels missing from the data and never touches kurin custom skills', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Точка']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const custom = await createSkill(prisma, { name: 'Картографія', kurinId: kurin.id, levels: [1] });
    await createSkill(prisma, { name: 'Картографія', levels: [3] });

    await seedSkillsCatalog(prisma, small('1. Вимога'));

    const global = await prisma.skill.findFirstOrThrow({
      where: { kurinId: null, name: 'Картографія' },
      include: { levels: { orderBy: { level: 'asc' } } },
    });
    expect(global.levels.map((l) => l.level)).toEqual([2, 3]);
    const customAfter = await prisma.skill.findUniqueOrThrow({ where: { id: custom.id }, include: { levels: true } });
    expect(customAfter.levels.map((l) => l.level)).toEqual([1]);
    expect(customAfter.levels[0].requirements).toEqual(custom.levels[0].requirements);
  });
});
```

- [ ] **Step 2: Запустити — FAIL**

`test/skills-catalog-seed.e2e-spec.ts`. Expected: FAIL — `Cannot find module '../src/scripts/seed-skills-catalog'`.

- [ ] **Step 3: Реалізувати сид**

`apps/api/src/scripts/seed-skills-catalog.ts`:

```ts
import { Prisma, PrismaClient } from '@prisma/client';
import { SKILLS_CATALOG, SkillData } from './skills-catalog.data';

export interface SeedSkillsResult {
  skillsCreated: number;
  skillsUpdated: number;
  levelsCreated: number;
  levelsUpdated: number;
}

/**
 * Upserts the global «Вмілості УПЮ» catalog (kurinId = null), keyed by skill
 * name (unique among global skills) and level. Updates group, requirements and
 * notes in place; never deletes anything and never touches kurin custom skills.
 */
export async function seedSkillsCatalog(
  prisma: PrismaClient,
  catalog: SkillData[] = SKILLS_CATALOG,
): Promise<SeedSkillsResult> {
  const result: SeedSkillsResult = { skillsCreated: 0, skillsUpdated: 0, levelsCreated: 0, levelsUpdated: 0 };
  for (const data of catalog) {
    let skill = await prisma.skill.findFirst({ where: { kurinId: null, name: data.name } });
    if (!skill) {
      skill = await prisma.skill.create({ data: { name: data.name, group: data.group } });
      result.skillsCreated++;
    } else if (skill.group !== data.group) {
      skill = await prisma.skill.update({ where: { id: skill.id }, data: { group: data.group } });
      result.skillsUpdated++;
    }
    for (const level of data.levels) {
      const requirements = level.requirements as unknown as Prisma.InputJsonValue;
      const note = level.note ?? null;
      const existing = await prisma.skillLevel.findUnique({
        where: { skillId_level: { skillId: skill.id, level: level.level } },
      });
      if (existing) {
        await prisma.skillLevel.update({ where: { id: existing.id }, data: { requirements, note } });
        result.levelsUpdated++;
      } else {
        await prisma.skillLevel.create({ data: { skillId: skill.id, level: level.level, requirements, note } });
        result.levelsCreated++;
      }
    }
  }
  return result;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await seedSkillsCatalog(prisma);
    const skills = await prisma.skill.count({ where: { kurinId: null } });
    const levels = await prisma.skillLevel.count({ where: { skill: { kurinId: null } } });
    console.log(
      `Skills catalog: +${result.skillsCreated} skills (${result.skillsUpdated} regrouped), ` +
        `+${result.levelsCreated} levels (${result.levelsUpdated} updated). Global now: ${skills} skills, ${levels} levels.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Запустити — PASS; прогнати сид на dev двічі**

`test/skills-catalog-seed.e2e-spec.ts` → 4 passed. Потім з `apps/api`: `npx ts-node src/scripts/seed-skills-catalog.ts` двічі. Expected: перший раз `+70 skills (0 regrouped), +108 levels (0 updated). Global now: 70 skills, 108 levels.`, другий — `+0 skills (0 regrouped), +0 levels (108 updated). Global now: 70 skills, 108 levels.` `npx tsc --noEmit -p tsconfig.json` — чисто.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/seed-skills-catalog.ts apps/api/test/skills-catalog-seed.e2e-spec.ts
git commit -m "feat(api): idempotent seed for the skills catalog"
```

**На проді (ручна дія після деплою хвилі A, не частина задачі):** `cd /opt/plast-api/repo && git pull`, `cd /opt/plast-api && docker compose up -d --build`, `docker compose exec api node dist/scripts/seed-skills-catalog.js` — очікувано `Global now: 70 skills, 108 levels.`

---

### Task 4: Модуль `skills` — каталог куреня і власні вмілості

**Files:**
- Create: `apps/api/src/skills/dto/create-skill.dto.ts`, `apps/api/src/skills/dto/update-skill.dto.ts`
- Create: `apps/api/src/skills/skills.service.ts`, `skills.controller.ts`, `skills.module.ts`
- Modify: `apps/api/src/app.module.ts` (імпорт + масив `imports`)
- Test: `apps/api/test/skills.e2e-spec.ts`

**Interfaces:**
- Consumes: моделі й `AuditAction.CUSTOM_SKILL_*` (задача 1), `SkillRequirement` (задача 2), `createSkill` (задача 1), `AuditService` (глобальний модуль), `CurrentUserPayload`, `JwtAuthGuard`.
- Produces (HTTP):
  - `GET /skills` → `SkillCatalogGroupView[]` — усі 9 груп у фіксованому порядку `SKILL_GROUP_ORDER`, у кожній `skills` за назвою (`localeCompare(…, 'uk')`): глобальні + власні куреня актора.
  - `POST /skills` (лише `ZVYAZKOVYI`) body `CreateSkillDto` → `201 SkillView`; `PATCH /skills/:id` body `UpdateSkillDto` → `SkillView`; `DELETE /skills/:id` → `{ success: true }`.
  - Коди: не звʼязковий — `403`; глобальна вмілість — `403`; чужого куреня / немає — `404`; дубль назви (глобальні + власні куреня, без регістру) — `409`; прибрати рівень зі здобуттями / видалити вмілість зі здобуттями — `409`.
- Produces (TS, `skills.service.ts`): `SKILL_GROUP_ORDER: SkillGroup[]`; `interface SkillLevelView { id: string; level: number; note: string | null; requirements: SkillRequirement[] }`; `interface SkillView { id: string; name: string; group: SkillGroup; isCustom: boolean; levels: SkillLevelView[] }`; `interface SkillCatalogGroupView { group: SkillGroup; skills: SkillView[] }`.

- [ ] **Step 1: Написати падаючий e2e**

`apps/api/test/skills.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, PrismaClient, ProbyProgramVersion, Role, SkillGroup } from '@prisma/client';
import { bootApp } from './utils/boot-app';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createProbyProgramTree, createSkill, createUser, issueTokenFor } from './utils/fixtures';

describe('Skills catalog and kurin custom skills (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    ({ app, jwtService } = await bootApp());
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
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Точка']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const otherKurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const otherZvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });
    return {
      kurin,
      otherKurin,
      zvyazkovyi,
      junak,
      tokens: {
        zvyazkovyi: issueTokenFor(jwtService, zvyazkovyi),
        vykhovnyk: issueTokenFor(jwtService, vykhovnyk),
        junak: issueTokenFor(jwtService, junak),
        other: issueTokenFor(jwtService, otherZvyazkovyi),
      },
    };
  }

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const customBody = {
    name: 'Знавець компʼютерів',
    group: 'SPECIAL',
    levels: [{ level: 1, requirements: ['Знати будову компʼютера', '   ', 'Встановити операційну систему'] }],
  };
  const auditOf = (kurinId: string, action: AuditAction) => prisma.auditLog.findMany({ where: { kurinId, action } });

  describe('GET /skills', () => {
    it('returns 9 groups in fixed order with global skills and only own custom skills', async () => {
      const { kurin, otherKurin, tokens } = await setup();
      await createSkill(prisma, { name: 'Картографія', group: SkillGroup.PRACTICAL, levels: [2] });
      await createSkill(prisma, { name: 'Астрономія', group: SkillGroup.SPECIAL, levels: [3, 1, 2] });
      await createSkill(prisma, { name: 'Знавець компʼютерів', group: SkillGroup.SPECIAL, kurinId: kurin.id });
      await createSkill(prisma, { name: 'Чужа вмілість', group: SkillGroup.SPECIAL, kurinId: otherKurin.id });

      for (const token of [tokens.junak, tokens.vykhovnyk, tokens.zvyazkovyi]) {
        const res = await http().get('/skills').set(auth(token)).expect(200);
        expect(res.body.map((g: { group: string }) => g.group)).toEqual([
          'PRACTICAL', 'FIRST_AID', 'NATURE', 'SPORT', 'HOME', 'SPECIAL', 'ARTS', 'AVIATION', 'SEA',
        ]);
        const special = res.body.find((g: { group: string }) => g.group === 'SPECIAL');
        expect(special.skills.map((s: { name: string; isCustom: boolean }) => [s.name, s.isCustom])).toEqual([
          ['Астрономія', false],
          ['Знавець компʼютерів', true],
        ]);
        expect(special.skills[0].levels.map((l: { level: number }) => l.level)).toEqual([1, 2, 3]);
        expect(special.skills[0].levels[0]).toEqual({
          id: expect.any(String),
          level: 1,
          note: null,
          requirements: [{ text: '1. Вимога рівня 1' }],
        });
      }
    });

    it('requires authentication', async () => {
      await http().get('/skills').expect(401);
    });
  });

  describe('POST /skills', () => {
    it('lets the zvyazkovyi create a custom skill without blank requirement lines, and logs it', async () => {
      const { kurin, zvyazkovyi, tokens } = await setup();
      const res = await http().post('/skills').set(auth(tokens.zvyazkovyi)).send(customBody).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        name: 'Знавець компʼютерів',
        group: 'SPECIAL',
        isCustom: true,
        levels: [
          {
            id: expect.any(String),
            level: 1,
            note: null,
            requirements: [{ text: 'Знати будову компʼютера' }, { text: 'Встановити операційну систему' }],
          },
        ],
      });
      expect((await prisma.skill.findUniqueOrThrow({ where: { id: res.body.id } })).kurinId).toBe(kurin.id);
      const entries = await auditOf(kurin.id, AuditAction.CUSTOM_SKILL_CREATED);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: res.body.id });
      expect(entries[0].details).toEqual({ skillName: 'Знавець компʼютерів', group: 'SPECIAL' });
    });

    it('forbids the vykhovnyk and the junak', async () => {
      const { tokens } = await setup();
      await http().post('/skills').set(auth(tokens.vykhovnyk)).send(customBody).expect(403);
      await http().post('/skills').set(auth(tokens.junak)).send(customBody).expect(403);
    });

    it('rejects a taken name (global or own, any case), repeated or unknown levels and empty requirements', async () => {
      const { tokens } = await setup();
      await createSkill(prisma, { name: 'Картографія' });
      const post = (body: object) => http().post('/skills').set(auth(tokens.zvyazkovyi)).send(body);
      await post({ ...customBody, name: 'картографія' }).expect(409);
      await post(customBody).expect(201);
      await post(customBody).expect(409);
      await post({ ...customBody, name: 'Нова', levels: [{ level: 1, requirements: ['а'] }, { level: 1, requirements: ['б'] }] }).expect(400);
      await post({ ...customBody, name: 'Нова', levels: [{ level: 4, requirements: ['а'] }] }).expect(400);
      await post({ ...customBody, name: 'Нова', levels: [{ level: 1, requirements: ['  '] }] }).expect(400);
      await post({ ...customBody, name: 'Нова', levels: [] }).expect(400);
    });

    it('lets another kurin use the same custom name', async () => {
      const { tokens } = await setup();
      await http().post('/skills').set(auth(tokens.zvyazkovyi)).send(customBody).expect(201);
      await http().post('/skills').set(auth(tokens.other)).send(customBody).expect(201);
    });
  });

  describe('PATCH /skills/:id', () => {
    it('renames, regroups and replaces the levels of an own custom skill, and logs it', async () => {
      const { kurin, tokens } = await setup();
      const created = await http().post('/skills').set(auth(tokens.zvyazkovyi)).send(customBody).expect(201);
      const res = await http()
        .patch(`/skills/${created.body.id}`)
        .set(auth(tokens.zvyazkovyi))
        .send({ name: 'Компʼютерна грамотність', group: 'ARTS', levels: [{ level: 2, requirements: ['Нова вимога'], note: 'нова вмілість' }] })
        .expect(200);
      expect(res.body).toMatchObject({
        name: 'Компʼютерна грамотність',
        group: 'ARTS',
        levels: [{ level: 2, note: 'нова вмілість', requirements: [{ text: 'Нова вимога' }] }],
      });
      expect(res.body.levels).toHaveLength(1);
      const entries = await auditOf(kurin.id, AuditAction.CUSTOM_SKILL_UPDATED);
      expect(entries[0].details).toEqual({ skillName: 'Компʼютерна грамотність', group: 'ARTS' });
    });

    it('refuses to drop a level a junak has already achieved', async () => {
      const { junak, zvyazkovyi, tokens } = await setup();
      const created = await http().post('/skills').set(auth(tokens.zvyazkovyi)).send(customBody).expect(201);
      await prisma.junakSkill.create({
        data: { junakId: junak.id, levelId: created.body.levels[0].id, achievedAt: new Date('2025-01-10T00:00:00.000Z'), createdById: zvyazkovyi.id },
      });
      await http()
        .patch(`/skills/${created.body.id}`)
        .set(auth(tokens.zvyazkovyi))
        .send({ levels: [{ level: 2, requirements: ['Інша'] }] })
        .expect(409);
      expect(await prisma.skillLevel.count({ where: { skillId: created.body.id, level: 1 } })).toBe(1);
    });

    it('keeps the global catalog read-only and hides other kurins custom skills', async () => {
      const { otherKurin, tokens } = await setup();
      const global = await createSkill(prisma, { name: 'Картографія' });
      const foreign = await createSkill(prisma, { name: 'Чужа', kurinId: otherKurin.id });
      await http().patch(`/skills/${global.id}`).set(auth(tokens.zvyazkovyi)).send({ name: 'Х' }).expect(403);
      await http().delete(`/skills/${global.id}`).set(auth(tokens.zvyazkovyi)).expect(403);
      await http().patch(`/skills/${foreign.id}`).set(auth(tokens.zvyazkovyi)).send({ name: 'Х' }).expect(404);
      await http().delete(`/skills/${foreign.id}`).set(auth(tokens.zvyazkovyi)).expect(404);
    });
  });

  describe('DELETE /skills/:id', () => {
    it('deletes an unused custom skill with its levels, and logs it', async () => {
      const { kurin, tokens } = await setup();
      const created = await http().post('/skills').set(auth(tokens.zvyazkovyi)).send(customBody).expect(201);
      await http().delete(`/skills/${created.body.id}`).set(auth(tokens.zvyazkovyi)).expect(200, { success: true });
      expect(await prisma.skill.count({ where: { id: created.body.id } })).toBe(0);
      expect(await prisma.skillLevel.count({ where: { skillId: created.body.id } })).toBe(0);
      const entries = await auditOf(kurin.id, AuditAction.CUSTOM_SKILL_DELETED);
      expect(entries[0].details).toEqual({ skillName: 'Знавець компʼютерів', group: 'SPECIAL' });
    });

    it('blocks deleting a custom skill a junak has achieved', async () => {
      const { junak, zvyazkovyi, tokens } = await setup();
      const created = await http().post('/skills').set(auth(tokens.zvyazkovyi)).send(customBody).expect(201);
      await prisma.junakSkill.create({
        data: { junakId: junak.id, levelId: created.body.levels[0].id, achievedAt: new Date('2025-01-10T00:00:00.000Z'), createdById: zvyazkovyi.id },
      });
      await http().delete(`/skills/${created.body.id}`).set(auth(tokens.zvyazkovyi)).expect(409);
    });
  });
});
```

- [ ] **Step 2: Запустити — FAIL**

`test/skills.e2e-spec.ts`. Expected: FAIL — `GET /skills` повертає 404 (маршруту немає).

- [ ] **Step 3: DTO**

`apps/api/src/skills/dto/create-skill.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SkillGroup } from '@prisma/client';

export class SkillLevelInputDto {
  @IsIn([1, 2, 3]) level: number;
  /** One requirement per entry; blank entries are dropped by the service. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(1000, { each: true })
  requirements: string[];
  @IsOptional() @IsString() @MaxLength(200) note?: string | null;
}

export class CreateSkillDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsEnum(SkillGroup) group: SkillGroup;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => SkillLevelInputDto)
  levels: SkillLevelInputDto[];
}
```

`apps/api/src/skills/dto/update-skill.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { SkillGroup } from '@prisma/client';
import { SkillLevelInputDto } from './create-skill.dto';

export class UpdateSkillDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsEnum(SkillGroup) group?: SkillGroup;
  /** When present, replaces the whole set of levels (missing levels are removed unless achieved). */
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => SkillLevelInputDto)
  levels?: SkillLevelInputDto[];
}
```

- [ ] **Step 4: Сервіс**

`apps/api/src/skills/skills.service.ts`:

```ts
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma, Role, Skill, SkillGroup, SkillLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { SkillRequirement } from './skill.types';
import { CreateSkillDto, SkillLevelInputDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

export const SKILL_GROUP_ORDER: SkillGroup[] = [
  SkillGroup.PRACTICAL,
  SkillGroup.FIRST_AID,
  SkillGroup.NATURE,
  SkillGroup.SPORT,
  SkillGroup.HOME,
  SkillGroup.SPECIAL,
  SkillGroup.ARTS,
  SkillGroup.AVIATION,
  SkillGroup.SEA,
];

export interface SkillLevelView {
  id: string;
  level: number;
  note: string | null;
  requirements: SkillRequirement[];
}

export interface SkillView {
  id: string;
  name: string;
  group: SkillGroup;
  isCustom: boolean;
  levels: SkillLevelView[];
}

export interface SkillCatalogGroupView {
  group: SkillGroup;
  skills: SkillView[];
}

const WITH_LEVELS = { levels: { orderBy: { level: 'asc' as const } } };

function toSkillView(skill: Skill & { levels: SkillLevel[] }): SkillView {
  return {
    id: skill.id,
    name: skill.name,
    group: skill.group,
    isCustom: skill.kurinId !== null,
    levels: skill.levels.map((l) => ({
      id: l.id,
      level: l.level,
      note: l.note,
      requirements: l.requirements as unknown as SkillRequirement[],
    })),
  };
}

@Injectable()
export class SkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async catalog(actor: CurrentUserPayload): Promise<SkillCatalogGroupView[]> {
    const skills = await this.prisma.skill.findMany({
      where: { OR: [{ kurinId: null }, { kurinId: actor.kurinId }] },
      include: WITH_LEVELS,
    });
    const views = skills.map(toSkillView).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    return SKILL_GROUP_ORDER.map((group) => ({ group, skills: views.filter((s) => s.group === group) }));
  }

  async create(dto: CreateSkillDto, actor: CurrentUserPayload): Promise<SkillView> {
    this.assertZvyazkovyi(actor);
    const name = dto.name.trim();
    const levels = this.normalizeLevels(dto.levels);
    await this.assertNameFree(name, actor.kurinId);
    const skill = await this.prisma.skill.create({
      data: { kurinId: actor.kurinId, name, group: dto.group, levels: { create: levels } },
      include: WITH_LEVELS,
    });
    await this.record(AuditAction.CUSTOM_SKILL_CREATED, skill, actor);
    return toSkillView(skill);
  }

  async update(id: string, dto: UpdateSkillDto, actor: CurrentUserPayload): Promise<SkillView> {
    this.assertZvyazkovyi(actor);
    const skill = await this.findOwnCustomOrThrow(id, actor);
    const name = dto.name?.trim();
    if (name && name.toLowerCase() !== skill.name.toLowerCase()) {
      await this.assertNameFree(name, actor.kurinId, id);
    }
    if (dto.levels) {
      const levels = this.normalizeLevels(dto.levels);
      const keep = new Set(levels.map((l) => l.level));
      const removedIds = skill.levels.filter((l) => !keep.has(l.level)).map((l) => l.id);
      if (removedIds.length > 0) {
        const achieved = await this.prisma.junakSkill.count({ where: { levelId: { in: removedIds } } });
        if (achieved > 0) {
          throw new ConflictException('Цей рівень уже здобули юнаки — його не можна прибрати');
        }
      }
      await this.prisma.$transaction([
        this.prisma.skillLevel.deleteMany({ where: { id: { in: removedIds } } }),
        ...levels.map((l) =>
          this.prisma.skillLevel.upsert({
            where: { skillId_level: { skillId: id, level: l.level } },
            update: { requirements: l.requirements, note: l.note },
            create: { skillId: id, ...l },
          }),
        ),
      ]);
    }
    const updated = await this.prisma.skill.update({
      where: { id },
      data: { name, group: dto.group },
      include: WITH_LEVELS,
    });
    await this.record(AuditAction.CUSTOM_SKILL_UPDATED, updated, actor);
    return toSkillView(updated);
  }

  async remove(id: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    this.assertZvyazkovyi(actor);
    const skill = await this.findOwnCustomOrThrow(id, actor);
    const achieved = await this.prisma.junakSkill.count({ where: { level: { skillId: id } } });
    if (achieved > 0) {
      throw new ConflictException('Цю вмілість уже здобули юнаки — видалити її не можна');
    }
    await this.prisma.skill.delete({ where: { id } });
    await this.record(AuditAction.CUSTOM_SKILL_DELETED, skill, actor);
    return { success: true };
  }

  private assertZvyazkovyi(actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private async findOwnCustomOrThrow(id: string, actor: CurrentUserPayload) {
    const skill = await this.prisma.skill.findUnique({ where: { id }, include: WITH_LEVELS });
    if (!skill || (skill.kurinId !== null && skill.kurinId !== actor.kurinId)) {
      throw new NotFoundException('Вмілість не знайдено');
    }
    if (skill.kurinId === null) {
      throw new ForbiddenException('Вмілості з каталогу УПЮ змінювати не можна');
    }
    return skill;
  }

  private async assertNameFree(name: string, kurinId: string, exceptId?: string) {
    const clash = await this.prisma.skill.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        OR: [{ kurinId: null }, { kurinId }],
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
    });
    if (clash) {
      throw new ConflictException('Вмілість з такою назвою вже є в каталозі');
    }
  }

  private normalizeLevels(levels: SkillLevelInputDto[]) {
    const seen = new Set<number>();
    return levels.map((l) => {
      if (seen.has(l.level)) {
        throw new BadRequestException('Рівні вмілості не можуть повторюватися');
      }
      seen.add(l.level);
      const requirements: SkillRequirement[] = l.requirements
        .map((text) => text.trim())
        .filter((text) => text !== '')
        .map((text) => ({ text }));
      if (requirements.length === 0) {
        throw new BadRequestException('Кожен рівень має містити хоча б одну вимогу');
      }
      return {
        level: l.level,
        requirements: requirements as unknown as Prisma.InputJsonValue,
        note: l.note?.trim() || null,
      };
    });
  }

  private record(action: AuditAction, skill: Skill, actor: CurrentUserPayload) {
    return this.audit.record({
      kurinId: actor.kurinId,
      actorId: actor.userId,
      action,
      entityId: skill.id,
      details: { skillName: skill.name, group: skill.group },
    });
  }
}
```

- [ ] **Step 5: Контролер, модуль, реєстрація**

`apps/api/src/skills/skills.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { SkillsService } from './skills.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

@UseGuards(JwtAuthGuard)
@Controller('skills')
export class SkillsController {
  constructor(private readonly service: SkillsService) {}

  @Get()
  catalog(@CurrentUser() user: CurrentUserPayload) {
    return this.service.catalog(user);
  }

  @Post()
  create(@Body() dto: CreateSkillDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSkillDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }
}
```

`apps/api/src/skills/skills.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Module({
  controllers: [SkillsController],
  providers: [SkillsService],
})
export class SkillsModule {}
```

У `apps/api/src/app.module.ts`: `import { SkillsModule } from './skills/skills.module';` і `SkillsModule,` в кінець масиву `imports` (після `AnnouncementsModule,`).

- [ ] **Step 6: Запустити — PASS**

`test/skills.e2e-spec.ts` → усі зелені; `npx tsc --noEmit -p tsconfig.json` — чисто.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/skills apps/api/src/app.module.ts apps/api/test/skills.e2e-spec.ts
git commit -m "feat(api): skills catalog endpoint and kurin custom skills"
```

---

### Task 5: Здобуті вмілості юнака — права, валідація, журнал (модуль `junak-history`)

**Files:**
- Create: `apps/api/src/junak-history/history-input.util.ts`, `history-input.util.spec.ts`
- Create: `apps/api/src/junak-history/junak-history-access.ts`, `junak-history-access.spec.ts`
- Create: `apps/api/src/junak-history/junak-history.views.ts`
- Create: `apps/api/src/junak-history/dto/create-junak-skill.dto.ts`, `dto/update-junak-skill.dto.ts`
- Create: `apps/api/src/junak-history/junak-skills.service.ts`, `junak-skills.controller.ts`, `junak-history.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/utils/history-fixtures.ts`
- Test: `apps/api/test/junak-skills.e2e-spec.ts`

**Interfaces:**
- Consumes: моделі й `AuditAction.SKILL_*` (задача 1), `UsersService.findScoped` (`apps/api/src/users/users.service.ts:301`, експортується `UsersModule`), `parseNotFutureDate` (`common/date.util.ts`), `personLabel` (`audit/audit.util.ts`), `createSkill`, `createKurinniyUser`, `issueTokenFor` (fixtures).
- Produces (TS — використовують задачі 8–10):
  - `history-input.util.ts`: `HISTORY_MIN_YEAR = 1990`; `parseHistoryDate(value: string): Date`; `patchHistoryDate(value: string | null | undefined): Date | null | undefined`; `blankToNull(value: string | null | undefined): string | null | undefined`.
  - `junak-history-access.ts`: `interface HistoryJunak { id; firstName; lastName; nickname: string | null; kurinId; hurtokId: string | null; archivedAt: Date | null }`; `canWriteJunakHistory(prisma, junak: Pick<HistoryJunak, 'kurinId' | 'hurtokId' | 'archivedAt'>, actor): Promise<boolean>`; `loadJunakForRead(usersService, junakId, actor): Promise<HistoryJunak>` (404 як `findScoped`, не юнак — 404); `loadJunakForWrite(prisma, junakId, actor): Promise<HistoryJunak>` (404 / 400 архівований / 403).
  - `junak-history.views.ts`: `isoDate(date: Date): string` / `isoDate(date: Date | null): string | null`; `JUNAK_SKILL_INCLUDE`; `interface JunakSkillView { id; levelId; skillId; skillName; group: SkillGroup; level: number; isCustom: boolean; achievedAt: string; examiner: string | null; certificateNumber: string | null }`; `toJunakSkillView(row)`; `interface JunakSkillsView { canEdit: boolean; items: JunakSkillView[] }`.
  - `JunakHistoryModule` (імпортує `UsersModule`), до якого задачі 8–10 додають контролери/сервіси.
  - `test/utils/history-fixtures.ts`: `createHistoryWorld(prisma)` → `{ program, kurin, hurtokA, hurtokB, zvyazkovyi, vykhovnykA (гурток A), vykhovnykB (гурток B), junak (гурток A), junakNoHurtok, otherKurin, otherZvyazkovyi }`.
- Produces (HTTP): `GET /users/:junakId/skills` → `JunakSkillsView` (за датою здобуття, новіші першими); `POST /users/:junakId/skills` `{ levelId, achievedAt, examiner?, certificateNumber? }` → `201 JunakSkillView`; `PATCH /users/:junakId/skills/:id` `{ achievedAt?, examiner?, certificateNumber? }` → `JunakSkillView`; `DELETE /users/:junakId/skills/:id` → `{ success: true }`. Дубль (юнак, рівень) — `409`; рівень чужого куреня — `404`. Журнал: `SKILL_ACHIEVED | SKILL_UPDATED | SKILL_REMOVED`, `details = { subjectName, skillName, level, achievedAt }`.

- [ ] **Step 1: Unit-тести утиліт — FAIL**

`apps/api/src/junak-history/history-input.util.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { blankToNull, parseHistoryDate, patchHistoryDate } from './history-input.util';

describe('history input utils', () => {
  it('parses a past calendar date as UTC midnight', () => {
    expect(parseHistoryDate('2020-09-01').toISOString()).toBe('2020-09-01T00:00:00.000Z');
  });

  it('rejects dates before 1990 and in the future', () => {
    expect(() => parseHistoryDate('1989-12-31')).toThrow(BadRequestException);
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(() => parseHistoryDate(inThreeDays)).toThrow(BadRequestException);
  });

  it('treats undefined as "no change" and null as "clear" for PATCH dates', () => {
    expect(patchHistoryDate(undefined)).toBeUndefined();
    expect(patchHistoryDate(null)).toBeNull();
    expect(patchHistoryDate('2021-03-04')?.toISOString()).toBe('2021-03-04T00:00:00.000Z');
  });

  it('trims optional text and turns blank into null', () => {
    expect(blankToNull(undefined)).toBeUndefined();
    expect(blankToNull(null)).toBeNull();
    expect(blankToNull('   ')).toBeNull();
    expect(blankToNull('  Остап ')).toBe('Остап');
  });
});
```

`apps/api/src/junak-history/junak-history-access.spec.ts`:

```ts
import { Role } from '@prisma/client';
import { canWriteJunakHistory } from './junak-history-access';

const actor = (role: Role) => ({ userId: 'actor-1', role, kurinId: 'kurin-1', isKurinniy: false, positions: [] });
const junak = { kurinId: 'kurin-1', hurtokId: 'hurtok-a', archivedAt: null };

describe('canWriteJunakHistory', () => {
  const prisma = (assigned: boolean) =>
    ({ vykhovnykHurtok: { findFirst: jest.fn().mockResolvedValue(assigned ? { id: 'a' } : null) } }) as any;

  it('lets the zvyazkovyi of the same kurin write', async () => {
    expect(await canWriteJunakHistory(prisma(false), junak, actor(Role.ZVYAZKOVYI))).toBe(true);
  });

  it('lets only a vykhovnyk assigned to the junak hurtok write', async () => {
    const assigned = prisma(true);
    expect(await canWriteJunakHistory(assigned, junak, actor(Role.VYKHOVNYK))).toBe(true);
    expect(assigned.vykhovnykHurtok.findFirst).toHaveBeenCalledWith({
      where: { vykhovnykId: 'actor-1', hurtokId: 'hurtok-a' },
    });
    expect(await canWriteJunakHistory(prisma(false), junak, actor(Role.VYKHOVNYK))).toBe(false);
  });

  it('refuses a vykhovnyk for a junak without hurtok, any junak, another kurin and archived junaks', async () => {
    expect(await canWriteJunakHistory(prisma(true), { ...junak, hurtokId: null }, actor(Role.VYKHOVNYK))).toBe(false);
    expect(await canWriteJunakHistory(prisma(true), junak, actor(Role.JUNAK))).toBe(false);
    expect(await canWriteJunakHistory(prisma(true), { ...junak, kurinId: 'kurin-2' }, actor(Role.ZVYAZKOVYI))).toBe(false);
    expect(await canWriteJunakHistory(prisma(true), { ...junak, archivedAt: new Date() }, actor(Role.ZVYAZKOVYI))).toBe(false);
  });
});
```

Run: `npx jest src/junak-history --runInBand`. Expected: FAIL — `Cannot find module './history-input.util'`.

- [ ] **Step 2: Утиліти й доступ — PASS**

`apps/api/src/junak-history/history-input.util.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { parseNotFutureDate } from '../common/date.util';

export const HISTORY_MIN_YEAR = 1990;

/** YYYY-MM-DD → UTC-midnight Date; not in the future and not before 1990. */
export function parseHistoryDate(value: string): Date {
  const date = parseNotFutureDate(value);
  if (date.getUTCFullYear() < HISTORY_MIN_YEAR) {
    throw new BadRequestException(`Дата має бути не раніше ${HISTORY_MIN_YEAR} року`);
  }
  return date;
}

/** PATCH semantics: undefined = leave as is, null = clear, string = set. */
export function patchHistoryDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parseHistoryDate(value);
}

/** Optional free text: trimmed; blank → null; undefined passes through (PATCH "no change"). */
export function blankToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
```

`apps/api/src/junak-history/junak-history-access.ts`:

```ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

export interface HistoryJunak {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  kurinId: string;
  hurtokId: string | null;
  archivedAt: Date | null;
}

/**
 * Who may change a junak's history: the kurin's zvyazkovyi, or a vykhovnyk
 * assigned to the junak's hurtok. A junak without a hurtok — only the
 * zvyazkovyi. Archived junaks are read-only for everyone.
 */
export async function canWriteJunakHistory(
  prisma: PrismaService,
  junak: Pick<HistoryJunak, 'kurinId' | 'hurtokId' | 'archivedAt'>,
  actor: CurrentUserPayload,
): Promise<boolean> {
  if (junak.archivedAt || junak.kurinId !== actor.kurinId) return false;
  if (actor.role === Role.ZVYAZKOVYI) return true;
  if (actor.role !== Role.VYKHOVNYK || !junak.hurtokId) return false;
  const assigned = await prisma.vykhovnykHurtok.findFirst({
    where: { vykhovnykId: actor.userId, hurtokId: junak.hurtokId },
  });
  return !!assigned;
}

/** Same visibility as the junak's profile page (findScoped); 404 for anyone else or a non-junak. */
export async function loadJunakForRead(
  usersService: UsersService,
  junakId: string,
  actor: CurrentUserPayload,
): Promise<HistoryJunak> {
  const user = await usersService.findScoped(junakId, actor);
  if (user.role !== Role.JUNAK) {
    throw new NotFoundException('Junak not found');
  }
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    nickname: user.nickname,
    kurinId: user.kurinId,
    hurtokId: user.hurtokId,
    archivedAt: user.archivedAt,
  };
}

/** 404 outside the kurin or not a junak, 400 archived, 403 not allowed to write. */
export async function loadJunakForWrite(
  prisma: PrismaService,
  junakId: string,
  actor: CurrentUserPayload,
): Promise<HistoryJunak> {
  const user = await prisma.user.findUnique({
    where: { id: junakId },
    select: { id: true, role: true, firstName: true, lastName: true, nickname: true, kurinId: true, hurtokId: true, archivedAt: true },
  });
  if (!user || user.role !== Role.JUNAK || user.kurinId !== actor.kurinId) {
    throw new NotFoundException('Junak not found');
  }
  if (user.archivedAt) {
    throw new BadRequestException('Юнак архівований');
  }
  if (!(await canWriteJunakHistory(prisma, user, actor))) {
    throw new ForbiddenException('Insufficient role');
  }
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    nickname: user.nickname,
    kurinId: user.kurinId,
    hurtokId: user.hurtokId,
    archivedAt: user.archivedAt,
  };
}
```

Run: `npx jest src/junak-history --runInBand` → PASS.

- [ ] **Step 3: Фікстура світу й падаючий e2e**

`apps/api/test/utils/history-fixtures.ts`:

```ts
import { PrismaClient, ProbyProgramVersion, Role } from '@prisma/client';
import { createKurin, createProbyProgramTree, createUser } from './fixtures';

/**
 * A kurin with hurtky A and B, a vykhovnyk assigned to each, a junak in hurtok A,
 * a junak without a hurtok, and a second kurin with its own zvyazkovyi.
 */
export async function createHistoryWorld(prisma: PrismaClient) {
  const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Точка']);
  const kurin = await createKurin(prisma, { probyProgramId: program.id });
  const hurtokA = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
  const hurtokB = await prisma.hurtok.create({ data: { name: 'Соколи', kurinId: kurin.id } });
  const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
  const vykhovnykA = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
  const vykhovnykB = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
  await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnykA.id, hurtokId: hurtokA.id } });
  await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnykB.id, hurtokId: hurtokB.id } });
  const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtokA.id });
  const junakNoHurtok = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
  const otherKurin = await createKurin(prisma, { probyProgramId: program.id });
  const otherZvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });
  return { program, kurin, hurtokA, hurtokB, zvyazkovyi, vykhovnykA, vykhovnykB, junak, junakNoHurtok, otherKurin, otherZvyazkovyi };
}
```

`apps/api/test/junak-skills.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, PrismaClient, Role } from '@prisma/client';
import { bootApp } from './utils/boot-app';
import { cleanDatabase } from './utils/clean-db';
import { createKurinniyUser, createSkill, issueTokenFor } from './utils/fixtures';
import { createHistoryWorld } from './utils/history-fixtures';

describe('Junak skills — achieved skill levels (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    ({ app, jwtService } = await bootApp());
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
    const world = await createHistoryWorld(prisma);
    const skill = await createSkill(prisma, { name: 'Картографія', levels: [1, 2] });
    const foreign = await createSkill(prisma, { name: 'Чужа', kurinId: world.otherKurin.id });
    const token = (user: { id: string; role: Role; kurinId: string }) => issueTokenFor(jwtService, user);
    return { ...world, skill, level1: skill.levels[0], level2: skill.levels[1], foreignLevel: foreign.levels[0], token };
  }

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const add = (junakId: string, token: string, body: Record<string, unknown>) =>
    http().post(`/users/${junakId}/skills`).set(auth(token)).send(body);
  const list = (junakId: string, token: string) => http().get(`/users/${junakId}/skills`).set(auth(token));
  const auditOf = (kurinId: string, action: AuditAction) => prisma.auditLog.findMany({ where: { kurinId, action } });

  describe('POST /users/:junakId/skills', () => {
    it('lets the zvyazkovyi record an achieved level and logs it without free text', async () => {
      const w = await setup();
      const res = await add(w.junak.id, w.token(w.zvyazkovyi), {
        levelId: w.level2.id,
        achievedAt: '2025-05-01',
        examiner: '  Остап Вишня ',
        certificateNumber: '',
      }).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        levelId: w.level2.id,
        skillId: w.skill.id,
        skillName: 'Картографія',
        group: 'PRACTICAL',
        level: 2,
        isCustom: false,
        achievedAt: '2025-05-01',
        examiner: 'Остап Вишня',
        certificateNumber: null,
      });
      const entries = await auditOf(w.kurin.id, AuditAction.SKILL_ACHIEVED);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorId: w.zvyazkovyi.id, subjectUserId: w.junak.id, entityId: res.body.id });
      expect(entries[0].details).toEqual({ subjectName: 'Test User', skillName: 'Картографія', level: 2, achievedAt: '2025-05-01' });
    });

    it('lets the vykhovnyk of the junak hurtok write; not another vykhovnyk, the junak or the kurinniy', async () => {
      const w = await setup();
      await add(w.junak.id, w.token(w.vykhovnykA), { levelId: w.level2.id, achievedAt: '2025-05-01' }).expect(201);
      await add(w.junak.id, w.token(w.vykhovnykB), { levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(403);
      await add(w.junak.id, w.token(w.junak), { levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(403);
      const kurinniy = await createKurinniyUser(prisma, { kurinId: w.kurin.id });
      await add(w.junak.id, w.token(kurinniy), { levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(403);
    });

    it('lets only the zvyazkovyi write for a junak without a hurtok', async () => {
      const w = await setup();
      await add(w.junakNoHurtok.id, w.token(w.vykhovnykA), { levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(403);
      await add(w.junakNoHurtok.id, w.token(w.zvyazkovyi), { levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(201);
    });

    it('isolates kurins: another kurin zvyazkovyi gets 404, another kurin custom level is not found', async () => {
      const w = await setup();
      await add(w.junak.id, w.token(w.otherZvyazkovyi), { levelId: w.level2.id, achievedAt: '2025-05-01' }).expect(404);
      await add(w.junak.id, w.token(w.zvyazkovyi), { levelId: w.foreignLevel.id, achievedAt: '2025-05-01' }).expect(404);
    });

    it('rejects a duplicate level, bad dates and an archived junak', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      await add(w.junak.id, zv, { levelId: w.level2.id, achievedAt: '2025-05-01' }).expect(201);
      await add(w.junak.id, zv, { levelId: w.level2.id, achievedAt: '2025-06-01' }).expect(409);
      const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await add(w.junak.id, zv, { levelId: w.level1.id, achievedAt: inThreeDays }).expect(400);
      await add(w.junak.id, zv, { levelId: w.level1.id, achievedAt: '1989-12-31' }).expect(400);
      await add(w.junak.id, zv, { levelId: w.level1.id, achievedAt: 'вчора' }).expect(400);
      await prisma.user.update({ where: { id: w.junakNoHurtok.id }, data: { archivedAt: new Date() } });
      await add(w.junakNoHurtok.id, zv, { levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(400);
    });
  });

  describe('GET /users/:junakId/skills', () => {
    it('returns canEdit for the zvyazkovyi and own vykhovnyk; read-only for the junak and the kurinniy', async () => {
      const w = await setup();
      await add(w.junak.id, w.token(w.zvyazkovyi), { levelId: w.level2.id, achievedAt: '2025-05-01' }).expect(201);
      await add(w.junak.id, w.token(w.zvyazkovyi), { levelId: w.level1.id, achievedAt: '2024-04-01' }).expect(201);

      const asZvyazkovyi = await list(w.junak.id, w.token(w.zvyazkovyi)).expect(200);
      expect(asZvyazkovyi.body.canEdit).toBe(true);
      expect(asZvyazkovyi.body.items.map((i: { level: number }) => i.level)).toEqual([2, 1]);
      expect((await list(w.junak.id, w.token(w.vykhovnykA)).expect(200)).body.canEdit).toBe(true);
      const own = await list(w.junak.id, w.token(w.junak)).expect(200);
      expect(own.body.canEdit).toBe(false);
      expect(own.body.items).toHaveLength(2);
      const kurinniy = await createKurinniyUser(prisma, { kurinId: w.kurin.id });
      expect((await list(w.junak.id, w.token(kurinniy)).expect(200)).body.canEdit).toBe(false);
    });

    it('hides the junak from another hurtok vykhovnyk, another junak and another kurin', async () => {
      const w = await setup();
      await list(w.junak.id, w.token(w.vykhovnykB)).expect(404);
      await list(w.junak.id, w.token(w.junakNoHurtok)).expect(404);
      await list(w.junak.id, w.token(w.otherZvyazkovyi)).expect(404);
    });

    it('shows a junak without hurtok to a vykhovnyk read-only, and an archived junak to the zvyazkovyi read-only', async () => {
      const w = await setup();
      expect((await list(w.junakNoHurtok.id, w.token(w.vykhovnykA)).expect(200)).body.canEdit).toBe(false);
      await prisma.user.update({ where: { id: w.junakNoHurtok.id }, data: { archivedAt: new Date() } });
      expect((await list(w.junakNoHurtok.id, w.token(w.zvyazkovyi)).expect(200)).body.canEdit).toBe(false);
    });
  });

  describe('PATCH and DELETE /users/:junakId/skills/:id', () => {
    it('updates the date, examiner and certificate number, and logs SKILL_UPDATED', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const created = await add(w.junak.id, zv, { levelId: w.level2.id, achievedAt: '2025-05-01', examiner: 'Остап' }).expect(201);
      const res = await http()
        .patch(`/users/${w.junak.id}/skills/${created.body.id}`)
        .set(auth(w.token(w.vykhovnykA)))
        .send({ achievedAt: '2025-04-20', examiner: '', certificateNumber: '17/2025' })
        .expect(200);
      expect(res.body).toMatchObject({ achievedAt: '2025-04-20', examiner: null, certificateNumber: '17/2025' });
      const entries = await auditOf(w.kurin.id, AuditAction.SKILL_UPDATED);
      expect(entries[0].details).toEqual({ subjectName: 'Test User', skillName: 'Картографія', level: 2, achievedAt: '2025-04-20' });
    });

    it('removes the record and logs SKILL_REMOVED; a record reached through another junak path is 404', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const created = await add(w.junak.id, zv, { levelId: w.level2.id, achievedAt: '2025-05-01' }).expect(201);
      await http().delete(`/users/${w.junakNoHurtok.id}/skills/${created.body.id}`).set(auth(zv)).expect(404);
      await http().delete(`/users/${w.junak.id}/skills/${created.body.id}`).set(auth(zv)).expect(200, { success: true });
      expect((await list(w.junak.id, zv).expect(200)).body.items).toEqual([]);
      const entries = await auditOf(w.kurin.id, AuditAction.SKILL_REMOVED);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ subjectUserId: w.junak.id, entityId: created.body.id });
    });
  });
});
```

Run: `test/junak-skills.e2e-spec.ts`. Expected: FAIL — 404 на `POST /users/:id/skills` (маршруту немає).

- [ ] **Step 4: Відповіді API, DTO, сервіс, контролер, модуль**

`apps/api/src/junak-history/junak-history.views.ts`:

```ts
import { JunakSkill, Skill, SkillGroup, SkillLevel } from '@prisma/client';

export function isoDate(date: Date): string;
export function isoDate(date: Date | null): string | null;
export function isoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export const JUNAK_SKILL_INCLUDE = { level: { include: { skill: true } } } as const;
type JunakSkillRow = JunakSkill & { level: SkillLevel & { skill: Skill } };

export interface JunakSkillView {
  id: string;
  levelId: string;
  skillId: string;
  skillName: string;
  group: SkillGroup;
  level: number;
  isCustom: boolean;
  achievedAt: string;
  examiner: string | null;
  certificateNumber: string | null;
}

export function toJunakSkillView(row: JunakSkillRow): JunakSkillView {
  return {
    id: row.id,
    levelId: row.levelId,
    skillId: row.level.skillId,
    skillName: row.level.skill.name,
    group: row.level.skill.group,
    level: row.level.level,
    isCustom: row.level.skill.kurinId !== null,
    achievedAt: isoDate(row.achievedAt),
    examiner: row.examiner,
    certificateNumber: row.certificateNumber,
  };
}

export interface JunakSkillsView {
  canEdit: boolean;
  items: JunakSkillView[];
}
```

`apps/api/src/junak-history/dto/create-junak-skill.dto.ts`:

```ts
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateJunakSkillDto {
  @IsUUID() levelId: string;
  /** YYYY-MM-DD */
  @IsDateString({ strict: true }) achievedAt: string;
  @IsOptional() @IsString() @MaxLength(120) examiner?: string | null;
  @IsOptional() @IsString() @MaxLength(50) certificateNumber?: string | null;
}
```

`apps/api/src/junak-history/dto/update-junak-skill.dto.ts`:

```ts
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** The level itself is not changeable — remove the record and add another one. */
export class UpdateJunakSkillDto {
  @IsOptional() @IsDateString({ strict: true }) achievedAt?: string;
  @IsOptional() @IsString() @MaxLength(120) examiner?: string | null;
  @IsOptional() @IsString() @MaxLength(50) certificateNumber?: string | null;
}
```

`apps/api/src/junak-history/junak-skills.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { UsersService } from '../users/users.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HistoryJunak, canWriteJunakHistory, loadJunakForRead, loadJunakForWrite } from './junak-history-access';
import { blankToNull, parseHistoryDate } from './history-input.util';
import { JUNAK_SKILL_INCLUDE, JunakSkillView, JunakSkillsView, toJunakSkillView } from './junak-history.views';
import { CreateJunakSkillDto } from './dto/create-junak-skill.dto';
import { UpdateJunakSkillDto } from './dto/update-junak-skill.dto';

@Injectable()
export class JunakSkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
  ) {}

  async list(junakId: string, actor: CurrentUserPayload): Promise<JunakSkillsView> {
    const junak = await loadJunakForRead(this.usersService, junakId, actor);
    const rows = await this.prisma.junakSkill.findMany({
      where: { junakId },
      include: JUNAK_SKILL_INCLUDE,
      orderBy: [{ achievedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return { canEdit: await canWriteJunakHistory(this.prisma, junak, actor), items: rows.map(toJunakSkillView) };
  }

  async create(junakId: string, dto: CreateJunakSkillDto, actor: CurrentUserPayload): Promise<JunakSkillView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const level = await this.prisma.skillLevel.findUnique({ where: { id: dto.levelId }, include: { skill: true } });
    if (!level || (level.skill.kurinId !== null && level.skill.kurinId !== actor.kurinId)) {
      throw new NotFoundException('Вмілість не знайдено');
    }
    const achievedAt = parseHistoryDate(dto.achievedAt);
    let row;
    try {
      row = await this.prisma.junakSkill.create({
        data: {
          junakId,
          levelId: level.id,
          achievedAt,
          examiner: blankToNull(dto.examiner) ?? null,
          certificateNumber: blankToNull(dto.certificateNumber) ?? null,
          createdById: actor.userId,
        },
        include: JUNAK_SKILL_INCLUDE,
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('Цей рівень вмілості юнакові вже зараховано');
      }
      throw err;
    }
    const view = toJunakSkillView(row);
    await this.record(AuditAction.SKILL_ACHIEVED, junak, view, actor);
    return view;
  }

  async update(junakId: string, id: string, dto: UpdateJunakSkillDto, actor: CurrentUserPayload): Promise<JunakSkillView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    await this.findOwnedOrThrow(junakId, id);
    const row = await this.prisma.junakSkill.update({
      where: { id },
      data: {
        achievedAt: dto.achievedAt ? parseHistoryDate(dto.achievedAt) : undefined,
        examiner: blankToNull(dto.examiner),
        certificateNumber: blankToNull(dto.certificateNumber),
      },
      include: JUNAK_SKILL_INCLUDE,
    });
    const view = toJunakSkillView(row);
    await this.record(AuditAction.SKILL_UPDATED, junak, view, actor);
    return view;
  }

  async remove(junakId: string, id: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    await this.prisma.junakSkill.delete({ where: { id } });
    await this.record(AuditAction.SKILL_REMOVED, junak, toJunakSkillView(row), actor);
    return { success: true };
  }

  private async findOwnedOrThrow(junakId: string, id: string) {
    const row = await this.prisma.junakSkill.findUnique({ where: { id }, include: JUNAK_SKILL_INCLUDE });
    if (!row || row.junakId !== junakId) {
      throw new NotFoundException('Запис не знайдено');
    }
    return row;
  }

  private record(action: AuditAction, junak: HistoryJunak, view: JunakSkillView, actor: CurrentUserPayload) {
    return this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action,
      subjectUserId: junak.id,
      entityId: view.id,
      details: { subjectName: personLabel(junak), skillName: view.skillName, level: view.level, achievedAt: view.achievedAt },
    });
  }
}
```

`apps/api/src/junak-history/junak-skills.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JunakSkillsService } from './junak-skills.service';
import { CreateJunakSkillDto } from './dto/create-junak-skill.dto';
import { UpdateJunakSkillDto } from './dto/update-junak-skill.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/:junakId/skills')
export class JunakSkillsController {
  constructor(private readonly service: JunakSkillsService) {}

  @Get()
  list(@Param('junakId') junakId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(junakId, user);
  }

  @Post()
  create(@Param('junakId') junakId: string, @Body() dto: CreateJunakSkillDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(junakId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('junakId') junakId: string,
    @Param('id') id: string,
    @Body() dto: UpdateJunakSkillDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(junakId, id, dto, user);
  }

  @Delete(':id')
  remove(@Param('junakId') junakId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(junakId, id, user);
  }
}
```

`apps/api/src/junak-history/junak-history.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { JunakSkillsController } from './junak-skills.controller';
import { JunakSkillsService } from './junak-skills.service';

@Module({
  imports: [UsersModule],
  controllers: [JunakSkillsController],
  providers: [JunakSkillsService],
})
export class JunakHistoryModule {}
```

У `apps/api/src/app.module.ts`: `import { JunakHistoryModule } from './junak-history/junak-history.module';` і `JunakHistoryModule,` після `SkillsModule,`.

- [ ] **Step 5: Запустити — PASS**

`test/junak-skills.e2e-spec.ts` → усі зелені; `npx jest src --runInBand --forceExit` і `npx tsc --noEmit -p tsconfig.json` — чисто. Регресія: `test/junak-degrees.e2e-spec.ts`, `test/users-detail.e2e-spec.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/junak-history apps/api/src/app.module.ts apps/api/test/utils/history-fixtures.ts apps/api/test/junak-skills.e2e-spec.ts
git commit -m "feat(api): achieved skills of a junak with zvyazkovyi/vykhovnyk permissions and audit"
```

---

### Task 6: Сторінка `/skills` «Вмілості», діалог власної вмілості, плитка в хабі

**Files:**
- Modify: `apps/web/lib/types.ts` (додати в кінець)
- Create: `apps/web/lib/history-labels.ts`
- Modify: `apps/web/lib/error-message.ts` (додати `mutationErrorText`)
- Modify: `apps/web/lib/audit.ts` (`describeAuditEvent`: `CUSTOM_SKILL_*`)
- Create: `apps/web/lib/queries/skills.ts`
- Create: `apps/web/components/skill-requirement-list.tsx`, `apps/web/components/custom-skill-dialog.tsx`
- Create: `apps/web/app/skills/page.tsx`
- Modify: `apps/web/app/plastuvannia/page.tsx` (масив `TILES`, імпорт іконки)
- Create: `apps/web/e2e/helpers/history-seed.ts`
- Test: `apps/web/e2e/skills-catalog.spec.ts`; Modify: `apps/web/e2e/plastuvannia.spec.ts` (`expectTiles`)

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /skills` (задача 4), CLI сиду (задача 3), `useSession` (`lib/session-client.ts`), `apiFetch`/`ApiError` (`lib/api-client.ts`), `accessErrorMessage`, UI: `AccordionRoot/AccordionItem/AccordionTrigger/AccordionContent` (`components/ui/accordion.tsx`, `multiple`), `Dialog/DialogContent/DialogTitle`, `Button`, `Input`, `Label`, `Badge` (`variant: accent | warning | neutral`).
- Produces (TS):
  - `lib/types.ts`: `type SkillGroup`, `interface SkillRequirement { text: string; items?: string[] }`, `interface SkillLevel { id; level: number; note: string | null; requirements: SkillRequirement[] }`, `interface Skill { id; name; group: SkillGroup; isCustom: boolean; levels: SkillLevel[] }`, `interface SkillCatalogGroup { group: SkillGroup; skills: Skill[] }`, `interface CustomSkillInput { name: string; group: SkillGroup; levels: { level: number; requirements: string[]; note?: string }[] }`.
  - `lib/history-labels.ts`: `SKILL_GROUP_ORDER: SkillGroup[]`, `SKILL_GROUP_LABELS: Record<SkillGroup, string>`, `SKILL_LEVEL_LABELS: Record<number, string>` (`'Перша проба' | 'Друга проба' | 'Третя проба'`).
  - `lib/error-message.ts`: `mutationErrorText(error: unknown, fallback: string): string`.
  - `lib/queries/skills.ts`: `useSkillsCatalog()` (key `['skills']`), `useCreateSkill()`, `useUpdateSkill()` (vars `CustomSkillInput & { id: string }`), `useDeleteSkill()` (vars `id`).
  - `components/skill-requirement-list.tsx`: `SkillRequirementList({ requirements })`.
  - `e2e/helpers/history-seed.ts`: `seedSkillsCatalog(): void` (запускає сид задачі 3 на `plast_test`), `postAs<T>(token, path, body): Promise<T>`.

- [ ] **Step 1: Хелпер e2e і падаючі Playwright-тести**

`apps/web/e2e/helpers/history-seed.ts`:

```ts
import { execSync } from 'node:child_process';
import path from 'node:path';

const API_URL = 'http://localhost:3001';
const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST ?? 'postgresql://plast:plast@localhost:5432/plast_test';

/** Loads the global «Вмілості УПЮ» catalog into the e2e database (idempotent seed from apps/api). */
export function seedSkillsCatalog() {
  execSync('npx ts-node src/scripts/seed-skills-catalog.ts', {
    cwd: path.resolve(__dirname, '..', '..', '..', 'api'),
    env: { ...process.env, DATABASE_URL: DATABASE_URL_TEST },
    stdio: 'pipe',
  });
}

export async function postAs<T = unknown>(token: string, apiPath: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${apiPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${apiPath} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}
```

`apps/web/e2e/skills-catalog.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';
import { seedSkillsCatalog } from './helpers/history-seed';

const GROUP_LABELS = [
  'Вмілості практичного пластування',
  'Вмілості першої допомоги і рятівництва',
  'Природничі вмілості',
  'Спортивні вмілості',
  'Вмілості домашньої зарадності',
  'Вмілості спеціального зацікавлення',
  'Мистецькі вмілості',
  'Вмілості літунського пластування',
  'Вмілості морського пластування',
];

test.beforeAll(() => {
  seedSkillsCatalog();
});

async function seed() {
  const { program } = await seedProbyProgram();
  const seeded = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  return { ...seeded, token };
}

test('junak opens «Вмілості» from the hub and reads requirements by group and level', async ({ page }) => {
  const { token } = await seed();
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const { email, password } = await createOnboardedUserAs(token, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-skills-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  await loginAs(page, email, password);
  await page.goto('/plastuvannia');
  await page.getByRole('main').getByRole('link', { name: /Вмілості/ }).click();
  await expect(page).toHaveURL(/\/skills$/);

  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Вмілості', exact: true })).toBeVisible();
  for (const label of GROUP_LABELS) {
    await expect(main.getByRole('button', { name: new RegExp(`^${label}`) })).toBeVisible();
  }
  await expect(main.getByRole('button', { name: 'Додати власну вмілість' })).toHaveCount(0);

  await main.getByRole('button', { name: /^Природничі вмілості/ }).click();
  const nature = main.getByTestId('skill-card').filter({ has: page.getByRole('heading', { name: 'Природознавство' }) });
  await expect(nature.getByRole('tab')).toHaveText(['Перша проба', 'Друга проба', 'Третя проба']);
  await nature.getByRole('tab', { name: 'Третя проба' }).click();
  await expect(nature.getByRole('tabpanel')).toContainText('Зібрати, підготувати та оформити матеріали для інструктажу');

  await main.getByRole('button', { name: /^Вмілості першої допомоги і рятівництва/ }).click();
  const firstAid = main.getByTestId('skill-card').filter({ has: page.getByRole('heading', { name: 'Перша допомога' }) });
  await expect(firstAid.getByRole('tabpanel')).toContainText('Виконати вимоги А або Б.');
  await expect(firstAid.getByRole('tabpanel')).toContainText('13. Знати, що робити у випадку укушення');

  await page.screenshot({ path: 'test-results/skills-catalog.png', fullPage: true });
});

test('zvyazkovyi adds, edits and deletes a custom skill, and the journal records it', async ({ page }) => {
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seed();
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/skills');

  await page.getByRole('button', { name: 'Додати власну вмілість' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill('Знавець компʼютерів');
  await dialog.getByLabel('Група').selectOption('SPECIAL');
  await dialog.getByLabel('Вимоги — Перша проба').fill('1. Знати будову компʼютера.\n2. Встановити операційну систему.');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: /^Вмілості спеціального зацікавлення/ }).click();
  const card = page.getByTestId('skill-card').filter({ has: page.getByRole('heading', { name: 'Знавець компʼютерів' }) });
  await expect(card.getByText('Власна')).toBeVisible();
  await expect(card.getByRole('tabpanel')).toContainText('2. Встановити операційну систему.');

  await card.getByRole('button', { name: 'Змінити' }).click();
  await dialog.getByLabel('Назва').fill('Компʼютерна грамотність');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  const renamed = page.getByTestId('skill-card').filter({ has: page.getByRole('heading', { name: 'Компʼютерна грамотність' }) });
  await expect(renamed).toBeVisible();

  page.once('dialog', (confirmDialog) => confirmDialog.accept());
  await renamed.getByRole('button', { name: 'Видалити' }).click();
  await expect(renamed).toHaveCount(0);

  await page.goto('/audit-log');
  await expect(page.getByText('Додав власну вмілість «Знавець компʼютерів»')).toBeVisible();
  await expect(page.getByText('Видалив власну вмілість «Компʼютерна грамотність»')).toBeVisible();
});
```

У `apps/web/e2e/plastuvannia.spec.ts` в `expectTiles` після рядка з `/my-activity` додати:

```ts
  await expect(main.getByRole('link', { name: /Вмілості/ })).toHaveAttribute('href', '/skills');
```

- [ ] **Step 2: Запустити — FAIL**

З `apps/web` (команда Playwright з Global Constraints): `npx playwright test e2e/skills-catalog.spec.ts e2e/plastuvannia.spec.ts`. Expected: FAIL — немає посилання «Вмілості» в хабі, `/skills` — 404.

- [ ] **Step 3: Типи, підписи, текст помилки, журнал**

В кінець `apps/web/lib/types.ts`:

```ts
export type SkillGroup = 'PRACTICAL' | 'FIRST_AID' | 'NATURE' | 'SPORT' | 'HOME' | 'SPECIAL' | 'ARTS' | 'AVIATION' | 'SEA';

export interface SkillRequirement {
  text: string;
  items?: string[];
}

export interface SkillLevel {
  id: string;
  level: number;
  note: string | null;
  requirements: SkillRequirement[];
}

export interface Skill {
  id: string;
  name: string;
  group: SkillGroup;
  isCustom: boolean;
  levels: SkillLevel[];
}

export interface SkillCatalogGroup {
  group: SkillGroup;
  skills: Skill[];
}

export interface CustomSkillInput {
  name: string;
  group: SkillGroup;
  levels: { level: number; requirements: string[]; note?: string }[];
}
```

`apps/web/lib/history-labels.ts`:

```ts
import type { SkillGroup } from '@/lib/types';

export const SKILL_GROUP_ORDER: SkillGroup[] = [
  'PRACTICAL',
  'FIRST_AID',
  'NATURE',
  'SPORT',
  'HOME',
  'SPECIAL',
  'ARTS',
  'AVIATION',
  'SEA',
];

export const SKILL_GROUP_LABELS: Record<SkillGroup, string> = {
  PRACTICAL: 'Вмілості практичного пластування',
  FIRST_AID: 'Вмілості першої допомоги і рятівництва',
  NATURE: 'Природничі вмілості',
  SPORT: 'Спортивні вмілості',
  HOME: 'Вмілості домашньої зарадності',
  SPECIAL: 'Вмілості спеціального зацікавлення',
  ARTS: 'Мистецькі вмілості',
  AVIATION: 'Вмілості літунського пластування',
  SEA: 'Вмілості морського пластування',
};

/** Рівень вмілості = проба, до якої вона призначена. */
export const SKILL_LEVEL_LABELS: Record<number, string> = {
  1: 'Перша проба',
  2: 'Друга проба',
  3: 'Третя проба',
};
```

У кінець `apps/web/lib/error-message.ts`:

```ts
/** Server message for a failed change (400/409 carry a readable reason), else the generic access text, else the fallback. */
export function mutationErrorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status !== 403) {
    const message = (error.body as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return accessErrorMessage(error) ?? fallback;
}
```

У `apps/web/lib/audit.ts` у `switch` перед `default:` додати:

```ts
    case 'CUSTOM_SKILL_CREATED':
      return `Додав власну вмілість «${s(d, 'skillName')}»`;
    case 'CUSTOM_SKILL_UPDATED':
      return `Змінив власну вмілість «${s(d, 'skillName')}»`;
    case 'CUSTOM_SKILL_DELETED':
      return `Видалив власну вмілість «${s(d, 'skillName')}»`;
```

- [ ] **Step 4: Хуки react-query**

`apps/web/lib/queries/skills.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { CustomSkillInput, Skill, SkillCatalogGroup } from '@/lib/types';

export function useSkillsCatalog() {
  return useQuery({
    queryKey: ['skills'],
    queryFn: () => apiFetch<SkillCatalogGroup[]>('/skills'),
  });
}

function useInvalidateSkills() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['skills'] });
}

export function useCreateSkill() {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: (dto: CustomSkillInput) => apiFetch<Skill>('/skills', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: invalidate,
  });
}

export function useUpdateSkill() {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: ({ id, ...dto }: CustomSkillInput & { id: string }) =>
      apiFetch<Skill>(`/skills/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
    onSuccess: invalidate,
  });
}

export function useDeleteSkill() {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ success: true }>(`/skills/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 5: Компоненти — список вимог і діалог власної вмілості**

Перед кодом прочитати гайди Next.js із Global Constraints.

`apps/web/components/skill-requirement-list.tsx`:

```tsx
import type { SkillRequirement } from '@/lib/types';

/** Requirements keep the source numbering in their text, so the list itself has no markers. */
export function SkillRequirementList({ requirements }: { requirements: SkillRequirement[] }) {
  return (
    <ul className="space-y-1.5">
      {requirements.map((requirement, index) => (
        <li key={index}>
          <p>{requirement.text}</p>
          {requirement.items && requirement.items.length > 0 && (
            <ul className="mt-1 space-y-0.5 pl-4 text-muted-foreground">
              {requirement.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
```

`apps/web/components/custom-skill-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateSkill, useUpdateSkill } from '@/lib/queries/skills';
import { mutationErrorText } from '@/lib/error-message';
import { SKILL_GROUP_LABELS, SKILL_GROUP_ORDER, SKILL_LEVEL_LABELS } from '@/lib/history-labels';
import type { Skill, SkillGroup } from '@/lib/types';

const LEVELS = [1, 2, 3];

interface LevelDraft {
  enabled: boolean;
  requirements: string;
  note: string;
}

function initialLevels(skill: Skill | null): Record<number, LevelDraft> {
  return Object.fromEntries(
    LEVELS.map((level) => {
      const existing = skill?.levels.find((l) => l.level === level);
      return [
        level,
        {
          enabled: !!existing || (!skill && level === 1),
          requirements: existing ? existing.requirements.map((r) => r.text).join('\n') : '',
          note: existing?.note ?? '',
        },
      ];
    }),
  );
}

/** Create (skill = null) or edit a kurin custom skill. Only the zvyazkovyi opens it. */
export function CustomSkillDialog({ skill, onClose }: { skill: Skill | null; onClose: () => void }) {
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const mutation = skill ? update : create;
  const [name, setName] = useState(skill?.name ?? '');
  const [group, setGroup] = useState<SkillGroup>(skill?.group ?? 'SPECIAL');
  const [levels, setLevels] = useState(() => initialLevels(skill));

  const payloadLevels = LEVELS.filter((level) => levels[level].enabled).map((level) => ({
    level,
    requirements: levels[level].requirements
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    note: levels[level].note.trim() || undefined,
  }));
  const isValid =
    name.trim() !== '' && payloadLevels.length > 0 && payloadLevels.every((level) => level.requirements.length > 0);

  function setLevel(level: number, patch: Partial<LevelDraft>) {
    setLevels((prev) => ({ ...prev, [level]: { ...prev[level], ...patch } }));
  }

  function submit() {
    const dto = { name: name.trim(), group, levels: payloadLevels };
    if (skill) {
      update.mutate({ id: skill.id, ...dto }, { onSuccess: onClose });
    } else {
      create.mutate(dto, { onSuccess: onClose });
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>{skill ? 'Змінити власну вмілість' : 'Додати власну вмілість'}</DialogTitle>
        <div className="space-y-2">
          <Label htmlFor="custom-skill-name">Назва</Label>
          <Input id="custom-skill-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="custom-skill-group">Група</Label>
          <select
            id="custom-skill-group"
            value={group}
            onChange={(e) => setGroup(e.target.value as SkillGroup)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {SKILL_GROUP_ORDER.map((g) => (
              <option key={g} value={g}>
                {SKILL_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </div>
        {LEVELS.map((level) => (
          <fieldset key={level} className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={levels[level].enabled}
                onChange={(e) => setLevel(level, { enabled: e.target.checked })}
              />
              {SKILL_LEVEL_LABELS[level]}
            </label>
            {levels[level].enabled && (
              <>
                <textarea
                  aria-label={`Вимоги — ${SKILL_LEVEL_LABELS[level]}`}
                  placeholder="Кожна вимога з нового рядка"
                  rows={4}
                  value={levels[level].requirements}
                  onChange={(e) => setLevel(level, { requirements: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <Input
                  aria-label={`Примітка — ${SKILL_LEVEL_LABELS[level]}`}
                  placeholder="Примітка (необовʼязково)"
                  value={levels[level].note}
                  maxLength={200}
                  onChange={(e) => setLevel(level, { note: e.target.value })}
                />
              </>
            )}
          </fieldset>
        ))}
        {mutation.isError && (
          <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти вмілість.')}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Скасувати
          </Button>
          <Button disabled={!isValid || mutation.isPending} onClick={submit}>
            Зберегти
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Сторінка `/skills`**

`apps/web/app/skills/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useSession } from '@/lib/session-client';
import { useDeleteSkill, useSkillsCatalog } from '@/lib/queries/skills';
import { accessErrorMessage, mutationErrorText } from '@/lib/error-message';
import { SKILL_GROUP_LABELS, SKILL_LEVEL_LABELS } from '@/lib/history-labels';
import { AccordionContent, AccordionItem, AccordionRoot, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CustomSkillDialog } from '@/components/custom-skill-dialog';
import { SkillRequirementList } from '@/components/skill-requirement-list';
import type { Skill } from '@/lib/types';

function SkillCard({ skill, canManage, onEdit }: { skill: Skill; canManage: boolean; onEdit: (skill: Skill) => void }) {
  const [selected, setSelected] = useState(skill.levels[0]?.level);
  const remove = useDeleteSkill();
  const level = skill.levels.find((l) => l.level === selected) ?? skill.levels[0];

  return (
    <li className="space-y-3 rounded-lg border border-border bg-background p-3" data-testid="skill-card">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{skill.name}</h3>
        {skill.isCustom && <Badge variant="neutral">Власна</Badge>}
      </div>
      <div role="tablist" aria-label={`Рівні вмілості «${skill.name}»`} className="flex flex-wrap gap-1">
        {skill.levels.map((l) => {
          const active = l.level === level?.level;
          return (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(l.level)}
              className={
                active
                  ? 'rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-text'
                  : 'rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted'
              }
            >
              {SKILL_LEVEL_LABELS[l.level]}
            </button>
          );
        })}
      </div>
      {level && (
        <div role="tabpanel" aria-label={SKILL_LEVEL_LABELS[level.level]} className="space-y-2 text-sm">
          {level.note && <p className="font-medium text-accent-text">{level.note}</p>}
          <SkillRequirementList requirements={level.requirements} />
        </div>
      )}
      {canManage && skill.isCustom && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onEdit(skill)}>
            Змінити
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Видалити вмілість «${skill.name}»?`)) remove.mutate(skill.id);
            }}
          >
            Видалити
          </Button>
        </div>
      )}
      {remove.isError && (
        <p className="text-sm text-destructive">{mutationErrorText(remove.error, 'Не вдалося видалити вмілість.')}</p>
      )}
    </li>
  );
}

export default function SkillsPage() {
  const { data: session } = useSession();
  const { data: catalog, isError, error } = useSkillsCatalog();
  const [dialog, setDialog] = useState<{ skill: Skill | null } | null>(null);

  if (!session) return null;
  const canManage = session.role === 'ZVYAZKOVYI';

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Вмілості</h1>
        {canManage && (
          <Button onClick={() => setDialog({ skill: null })}>
            <Plus aria-hidden />
            Додати власну вмілість
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Каталог «Вмілості УПЮ» (Львів, 2003) і власні вмілості куреня. Рівень вмілості — це проба, до якої вона
        призначена.
      </p>
      {isError && (
        <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Не вдалося завантажити каталог.'}</p>
      )}
      {catalog && (
        <AccordionRoot multiple>
          {catalog.map(({ group, skills }) => (
            <AccordionItem key={group} value={group}>
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  {SKILL_GROUP_LABELS[group]}
                  <Badge variant="neutral">{skills.length}</Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {skills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">У цій групі ще немає вмілостей.</p>
                ) : (
                  <ul className="space-y-3">
                    {skills.map((skill) => (
                      <SkillCard key={skill.id} skill={skill} canManage={canManage} onEdit={(s) => setDialog({ skill: s })} />
                    ))}
                  </ul>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </AccordionRoot>
      )}
      {dialog && <CustomSkillDialog skill={dialog.skill} onClose={() => setDialog(null)} />}
    </div>
  );
}
```

- [ ] **Step 7: Плитка «Вмілості» в хабі**

У `apps/web/app/plastuvannia/page.tsx`: імпорт іконок — `import { Award, Flag, Sparkles, CirclePlus, FileText } from 'lucide-react';`; у масив `TILES` останнім елементом:

```ts
  { href: '/skills', title: 'Вмілості', text: 'Каталог вмілостей і вимоги', icon: Award },
```

- [ ] **Step 8: Запустити — PASS**

`npx playwright test e2e/skills-catalog.spec.ts e2e/plastuvannia.spec.ts` → зелені; `npx tsc --noEmit`. Переглянути `test-results/skills-catalog.png` (не коміттити): групи, вкладки рівнів, підпункти з відступом, бейдж «Власна» — без обрізань на ширині 375 px (за потреби — `page.setViewportSize({ width: 375, height: 812 })` у тимчасовому прогоні).

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/history-labels.ts apps/web/lib/error-message.ts apps/web/lib/audit.ts apps/web/lib/queries/skills.ts apps/web/components/skill-requirement-list.tsx apps/web/components/custom-skill-dialog.tsx apps/web/app/skills/page.tsx apps/web/app/plastuvannia/page.tsx apps/web/e2e/helpers/history-seed.ts apps/web/e2e/skills-catalog.spec.ts apps/web/e2e/plastuvannia.spec.ts
git commit -m "feat(web): skills catalog page with custom skills and a hub tile"
```

---

### Task 7: Секція «Історія» → «Вмілості» на `/users/[id]` і `/me`

**Files:**
- Modify: `apps/web/lib/types.ts` (додати `JunakSkill`, `JunakSkills`)
- Modify: `apps/web/lib/audit.ts` (`SKILL_*`)
- Create: `apps/web/lib/queries/junak-history.ts`
- Create: `apps/web/components/junak-history/shared.tsx`, `apps/web/components/junak-history/skills-section.tsx`
- Create: `apps/web/components/junak-history.tsx`
- Modify: `apps/web/app/users/[id]/page.tsx` (імпорт + блок після `JunakDegreesCard`, рядки ~566–571)
- Modify: `apps/web/app/me/page.tsx` (коментар над `MePage`, блок після `JunakDegreesCard`)
- Modify: `docs/backlog.md` (пункт «Вмілості та іспити (ВФВ)»)
- Test: `apps/web/e2e/junak-history-skills.spec.ts`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /users/:junakId/skills` (задача 5), `useSkillsCatalog`, `SKILL_GROUP_ORDER`, `SKILL_GROUP_LABELS`, `SKILL_LEVEL_LABELS`, `mutationErrorText`, `seedSkillsCatalog` (задача 6), `createOnboardedUserAs`, `assignVykhovnyk`, `createHurtok`, `loginForToken` (`e2e/helpers/proby-seed.ts`).
- Produces (використовують задачі 11–12):
  - `lib/types.ts`: `interface JunakSkill { id; levelId; skillId; skillName; group: SkillGroup; level: number; isCustom: boolean; achievedAt: string; examiner: string | null; certificateNumber: string | null }`, `interface JunakSkills { canEdit: boolean; items: JunakSkill[] }`.
  - `lib/queries/junak-history.ts`: `junakHistoryKey(junakId)` = `['junak-history', junakId]`; `useJunakSkills(junakId)` (key `['junak-history', junakId, 'skills']`); локальний `useHistoryMutation(junakId, mutationFn)` — після успіху інвалідовує все під `['junak-history', junakId]`; `useAddJunakSkill`, `useUpdateJunakSkill`, `useRemoveJunakSkill`; типи `JunakSkillInput`, `JunakSkillPatch`.
  - `components/junak-history/shared.tsx`: `today()`, `formatDate(iso)`, `HistoryCard({ title, testId, addLabel?, onAdd?, extra?, children })`, `EmptyText`, `RowActions({ label, onEdit, onDelete, disabled? })` (іконки з `aria-label` «Змінити: …» / «Видалити: …», видалення через `window.confirm`), `DialogActions({ onCancel, onSubmit, disabled })`.
  - `components/junak-history/skills-section.tsx`: `SkillsSection({ junakId, skills: JunakSkill[], canEdit })` (картка `data-testid="history-skills"`, рядки `data-testid="junak-skill"`, бейдж `«{назва} {рівень}»`).
  - `components/junak-history.tsx`: `JunakHistory({ junakId, readOnly? })` — заголовок «Історія» + секції.

- [ ] **Step 1: Падаючий Playwright**

`apps/web/e2e/junak-history-skills.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { assignVykhovnyk, createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';
import { seedSkillsCatalog } from './helpers/history-seed';

test.beforeAll(() => {
  seedSkillsCatalog();
});

async function seedJunak() {
  const { program } = await seedProbyProgram();
  const seeded = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const junak = await createOnboardedUserAs(token, {
    firstName: 'Іван',
    lastName: `Петренко${Date.now()}`,
    email: `junak-history-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  return { ...seeded, token, hurtok, junak };
}

test('zvyazkovyi adds a skill on the junak page; the junak sees it read-only on /me; the journal describes it', async ({ page }) => {
  const s = await seedJunak();
  await loginAs(page, s.zvyazkovyiEmail, s.zvyazkovyiPassword);
  await page.goto(`/users/${s.junak.user.id}`);

  const card = page.getByTestId('history-skills');
  await expect(card).toContainText('Вмілостей ще немає.');
  await card.getByRole('button', { name: 'Додати вмілість' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Вмілість').fill('Картог');
  await dialog.getByRole('button', { name: /^Картографія/ }).click();
  await expect(dialog.getByLabel('Рівень')).not.toHaveValue('');
  await dialog.getByLabel('Дата здобуття').fill('2025-05-01');
  await dialog.getByLabel('Екзаменатор (необовʼязково)').fill('Остап Вишня');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toHaveCount(0);

  await expect(card.getByTestId('junak-skill')).toContainText('Картографія 2');
  await expect(card).toContainText('01.05.2025');
  await expect(card).toContainText('Вмілості практичного пластування');

  await page.goto('/audit-log');
  await expect(page.getByText(/Зарахував вмілість «Картографія» \(друга проба\)/)).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, s.junak.email, s.junak.password);
  await page.goto('/me');
  const own = page.getByTestId('history-skills');
  await expect(own.getByTestId('junak-skill')).toContainText('Картографія 2');
  await expect(own.getByRole('button', { name: 'Додати вмілість' })).toHaveCount(0);
  await expect(own.getByRole('button', { name: /Змінити:|Видалити:/ })).toHaveCount(0);
});

test('vykhovnyk sees skill edit buttons only for junaks of own hurtok', async ({ page }) => {
  const s = await seedJunak();
  const vykhovnyk = await createOnboardedUserAs(s.token, {
    firstName: 'Марія',
    lastName: `Мельник${Date.now()}`,
    email: `vykhovnyk-history-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });
  await assignVykhovnyk(s.token, vykhovnyk.user.id, s.hurtok.id);
  const loner = await createOnboardedUserAs(s.token, {
    firstName: 'Петро',
    lastName: `Безгуртковий${Date.now()}`,
    email: `junak-loner-${Date.now()}@example.com`,
    role: 'JUNAK',
  });

  await loginAs(page, vykhovnyk.email, vykhovnyk.password);
  await page.goto(`/users/${s.junak.user.id}`);
  await expect(page.getByTestId('history-skills').getByRole('button', { name: 'Додати вмілість' })).toBeVisible();

  await page.goto(`/users/${loner.user.id}`);
  await expect(page.getByTestId('history-skills')).toBeVisible();
  await expect(page.getByTestId('history-skills').getByRole('button', { name: 'Додати вмілість' })).toHaveCount(0);
});
```

- [ ] **Step 2: Запустити — FAIL**

`npx playwright test e2e/junak-history-skills.spec.ts`. Expected: FAIL — немає `data-testid="history-skills"`.

- [ ] **Step 3: Типи, журнал, хуки**

В кінець `apps/web/lib/types.ts`:

```ts
export interface JunakSkill {
  id: string;
  levelId: string;
  skillId: string;
  skillName: string;
  group: SkillGroup;
  level: number;
  isCustom: boolean;
  achievedAt: string;
  examiner: string | null;
  certificateNumber: string | null;
}

export interface JunakSkills {
  canEdit: boolean;
  items: JunakSkill[];
}
```

У `apps/web/lib/audit.ts` після `PROGRAM_LABELS` додати мапу і в `switch` перед `default:` — кейси:

```ts
const SKILL_LEVEL_LABELS: Record<string, string> = { '1': 'перша проба', '2': 'друга проба', '3': 'третя проба' };
```

```ts
    case 'SKILL_ACHIEVED':
      return `Зарахував вмілість «${s(d, 'skillName')}» (${lookup(SKILL_LEVEL_LABELS, s(d, 'level'))}) для ${s(d, 'subjectName')}`;
    case 'SKILL_UPDATED':
      return `Змінив дані вмілості «${s(d, 'skillName')}» (${lookup(SKILL_LEVEL_LABELS, s(d, 'level'))}) для ${s(d, 'subjectName')}`;
    case 'SKILL_REMOVED':
      return `Скасував зарахування вмілості «${s(d, 'skillName')}» (${lookup(SKILL_LEVEL_LABELS, s(d, 'level'))}) для ${s(d, 'subjectName')}`;
```

`apps/web/lib/queries/junak-history.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { JunakSkill, JunakSkills } from '@/lib/types';

export const junakHistoryKey = (junakId: string) => ['junak-history', junakId] as const;

export function useJunakSkills(junakId: string | undefined) {
  return useQuery({
    queryKey: ['junak-history', junakId, 'skills'],
    queryFn: () => apiFetch<JunakSkills>(`/users/${junakId}/skills`),
    enabled: !!junakId,
  });
}

/** Every history change refreshes everything cached under ['junak-history', junakId]. */
function useHistoryMutation<TVars, TResult>(junakId: string, mutationFn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: junakHistoryKey(junakId) }),
  });
}

export interface JunakSkillInput {
  levelId: string;
  achievedAt: string;
  examiner?: string;
  certificateNumber?: string;
}

export interface JunakSkillPatch {
  id: string;
  achievedAt?: string;
  examiner?: string | null;
  certificateNumber?: string | null;
}

export function useAddJunakSkill(junakId: string) {
  return useHistoryMutation(junakId, (dto: JunakSkillInput) =>
    apiFetch<JunakSkill>(`/users/${junakId}/skills`, { method: 'POST', body: JSON.stringify(dto) }),
  );
}

export function useUpdateJunakSkill(junakId: string) {
  return useHistoryMutation(junakId, ({ id, ...dto }: JunakSkillPatch) =>
    apiFetch<JunakSkill>(`/users/${junakId}/skills/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  );
}

export function useRemoveJunakSkill(junakId: string) {
  return useHistoryMutation(junakId, (id: string) =>
    apiFetch<{ success: true }>(`/users/${junakId}/skills/${id}`, { method: 'DELETE' }),
  );
}
```

- [ ] **Step 4: Спільні елементи секцій**

`apps/web/components/junak-history/shared.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** YYYY-MM-DD → DD.MM.YYYY */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

export function HistoryCard({
  title,
  testId,
  addLabel,
  onAdd,
  extra,
  children,
}: {
  title: string;
  testId: string;
  addLabel?: string;
  /** Omitted when the viewer can't edit — then there is no add button. */
  onAdd?: () => void;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <span className="flex items-center gap-2">
          {extra}
          {onAdd && addLabel && (
            <Button size="sm" variant="outline" onClick={onAdd}>
              <Plus aria-hidden />
              {addLabel}
            </Button>
          )}
        </span>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}

export function EmptyText({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}

export function RowActions({
  label,
  onEdit,
  onDelete,
  disabled,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="flex shrink-0 gap-1">
      <Button size="icon-sm" variant="ghost" aria-label={`Змінити: ${label}`} onClick={onEdit}>
        <Pencil aria-hidden />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Видалити: ${label}`}
        disabled={disabled}
        onClick={() => {
          if (window.confirm(`Видалити «${label}»?`)) onDelete();
        }}
      >
        <Trash2 aria-hidden />
      </Button>
    </span>
  );
}

export function DialogActions({
  onCancel,
  onSubmit,
  disabled,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={onCancel}>
        Скасувати
      </Button>
      <Button disabled={disabled} onClick={onSubmit}>
        Зберегти
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Секція «Вмілості» з діалогом пошуку**

`apps/web/components/junak-history/skills-section.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSkillsCatalog } from '@/lib/queries/skills';
import { useAddJunakSkill, useRemoveJunakSkill, useUpdateJunakSkill } from '@/lib/queries/junak-history';
import { mutationErrorText } from '@/lib/error-message';
import { SKILL_GROUP_LABELS, SKILL_GROUP_ORDER, SKILL_LEVEL_LABELS } from '@/lib/history-labels';
import type { JunakSkill } from '@/lib/types';
import { DialogActions, EmptyText, HistoryCard, RowActions, formatDate, today } from './shared';

export function SkillsSection({ junakId, skills, canEdit }: { junakId: string; skills: JunakSkill[]; canEdit: boolean }) {
  const [dialog, setDialog] = useState<{ entry: JunakSkill | null } | null>(null);
  const remove = useRemoveJunakSkill(junakId);
  const byGroup = SKILL_GROUP_ORDER.map((group) => ({ group, items: skills.filter((s) => s.group === group) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <HistoryCard
      title="Вмілості"
      testId="history-skills"
      addLabel="Додати вмілість"
      onAdd={canEdit ? () => setDialog({ entry: null }) : undefined}
      extra={
        <Link href="/skills" className="text-xs text-accent-text hover:underline">
          Каталог
        </Link>
      }
    >
      {byGroup.length === 0 ? (
        <EmptyText>Вмілостей ще немає.</EmptyText>
      ) : (
        byGroup.map(({ group, items }) => (
          <div key={group} className="space-y-1">
            <p className="text-xs font-semibold uppercase text-muted-foreground">{SKILL_GROUP_LABELS[group]}</p>
            <ul className="space-y-1">
              {items.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2" data-testid="junak-skill">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge>
                      {s.skillName} {s.level}
                    </Badge>
                    <span className="text-muted-foreground">{formatDate(s.achievedAt)}</span>
                    {s.examiner && <span className="text-xs text-muted-foreground">екзаменатор: {s.examiner}</span>}
                    {s.certificateNumber && (
                      <span className="text-xs text-muted-foreground">посвідка № {s.certificateNumber}</span>
                    )}
                  </span>
                  {canEdit && (
                    <RowActions
                      label={`${s.skillName} (${SKILL_LEVEL_LABELS[s.level]})`}
                      onEdit={() => setDialog({ entry: s })}
                      onDelete={() => remove.mutate(s.id)}
                      disabled={remove.isPending}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {remove.isError && <p className="text-destructive">{mutationErrorText(remove.error, 'Не вдалося видалити запис.')}</p>}
      {dialog && <JunakSkillDialog junakId={junakId} entry={dialog.entry} onClose={() => setDialog(null)} />}
    </HistoryCard>
  );
}

function JunakSkillDialog({ junakId, entry, onClose }: { junakId: string; entry: JunakSkill | null; onClose: () => void }) {
  const { data: catalog } = useSkillsCatalog();
  const add = useAddJunakSkill(junakId);
  const update = useUpdateJunakSkill(junakId);
  const mutation = entry ? update : add;
  const [query, setQuery] = useState('');
  const [skillId, setSkillId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState('');
  const [achievedAt, setAchievedAt] = useState(entry?.achievedAt ?? today());
  const [examiner, setExaminer] = useState(entry?.examiner ?? '');
  const [certificateNumber, setCertificateNumber] = useState(entry?.certificateNumber ?? '');

  const allSkills = (catalog ?? []).flatMap((g) => g.skills);
  const selected = allSkills.find((s) => s.id === skillId) ?? null;
  const needle = query.trim().toLocaleLowerCase('uk');
  const matches = needle ? allSkills.filter((s) => s.name.toLocaleLowerCase('uk').includes(needle)).slice(0, 20) : [];

  function submit() {
    if (entry) {
      update.mutate(
        { id: entry.id, achievedAt, examiner: examiner.trim() || null, certificateNumber: certificateNumber.trim() || null },
        { onSuccess: onClose },
      );
    } else {
      add.mutate(
        {
          levelId,
          achievedAt,
          examiner: examiner.trim() || undefined,
          certificateNumber: certificateNumber.trim() || undefined,
        },
        { onSuccess: onClose },
      );
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{entry ? 'Змінити вмілість' : 'Додати вмілість'}</DialogTitle>
        {entry ? (
          <p className="text-sm font-medium">
            {entry.skillName} — {SKILL_LEVEL_LABELS[entry.level]}
          </p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="skill-search">Вмілість</Label>
            {selected ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span>{selected.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSkillId(null);
                    setLevelId('');
                  }}
                >
                  Інша
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="skill-search"
                  placeholder="Почніть вводити назву"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {matches.length > 0 && (
                  <ul className="max-h-48 space-y-0.5 overflow-auto rounded-md border border-border p-1" aria-label="Знайдені вмілості">
                    {matches.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent-soft"
                          onClick={() => {
                            setSkillId(s.id);
                            setLevelId(s.levels.length === 1 ? s.levels[0].id : '');
                          }}
                        >
                          {s.name} <span className="text-xs text-muted-foreground">· {SKILL_GROUP_LABELS[s.group]}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {needle && matches.length === 0 && <p className="text-xs text-muted-foreground">Нічого не знайдено.</p>}
              </>
            )}
            {selected && (
              <div className="space-y-2">
                <Label htmlFor="skill-level">Рівень</Label>
                <select
                  id="skill-level"
                  value={levelId}
                  onChange={(e) => setLevelId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Оберіть рівень</option>
                  {selected.levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {SKILL_LEVEL_LABELS[l.level]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="skill-date">Дата здобуття</Label>
          <Input id="skill-date" type="date" max={today()} value={achievedAt} onChange={(e) => setAchievedAt(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="skill-examiner">Екзаменатор (необовʼязково)</Label>
          <Input id="skill-examiner" value={examiner} maxLength={120} onChange={(e) => setExaminer(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="skill-certificate">Номер посвідки (необовʼязково)</Label>
          <Input
            id="skill-certificate"
            value={certificateNumber}
            maxLength={50}
            onChange={(e) => setCertificateNumber(e.target.value)}
          />
        </div>
        {mutation.isError && (
          <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти вмілість.')}</p>
        )}
        <DialogActions
          onCancel={onClose}
          onSubmit={submit}
          disabled={!achievedAt || (!entry && !levelId) || mutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Контейнер «Історія» і монтування**

`apps/web/components/junak-history.tsx`:

```tsx
'use client';

import { useJunakSkills } from '@/lib/queries/junak-history';
import { accessErrorMessage } from '@/lib/error-message';
import { SkillsSection } from '@/components/junak-history/skills-section';

/**
 * «Історія» юнака. Хто може редагувати, вирішує бекенд (`canEdit`): звʼязковий
 * або виховник гуртка юнака. `readOnly` примусово вимикає редагування (/me).
 */
export function JunakHistory({ junakId, readOnly = false }: { junakId: string; readOnly?: boolean }) {
  const { data, isError, error } = useJunakSkills(junakId);
  return (
    <section className="space-y-3" aria-labelledby="junak-history-title">
      <h2 id="junak-history-title" className="text-lg font-semibold">
        Історія
      </h2>
      {isError && <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження історії.'}</p>}
      {data && <SkillsSection junakId={junakId} skills={data.items} canEdit={data.canEdit && !readOnly} />}
    </section>
  );
}
```

`apps/web/app/users/[id]/page.tsx`: додати імпорт `import { JunakHistory } from '@/components/junak-history';` поруч з імпортом `JunakDegreesCard`, а одразу після блоку

```tsx
      {isJunak && !user.archivedAt && (
        <JunakDegreesCard
          junakId={id}
          canEdit={!!canEditContactInfo || session?.role === 'VYKHOVNYK'}
        />
      )}
```

вставити:

```tsx
      {isJunak && <JunakHistory junakId={id} />}
```

`apps/web/app/me/page.tsx`: імпорт `import { JunakHistory } from '@/components/junak-history';`; коментар над `export default function MePage()` замінити на:

```tsx
// Історія юнака (components/junak-history.tsx) — лише перегляд; редагують звʼязковий
// і виховник на сторінці юнака /users/[id].
```

а після `{session.role === 'JUNAK' && <JunakDegreesCard junakId={session.userId} canEdit={false} />}` вставити:

```tsx
      {session.role === 'JUNAK' && <JunakHistory junakId={session.userId} readOnly />}
```

- [ ] **Step 7: Запустити — PASS + регресія**

`npx playwright test e2e/junak-history-skills.spec.ts e2e/me-page.spec.ts e2e/users-detail.spec.ts e2e/guardian-contacts.spec.ts e2e/junak-degrees-and-contacts.spec.ts` → зелені; `npx tsc --noEmit`.

- [ ] **Step 8: Беклог і коміт**

У `docs/backlog.md` заголовок `## 🔴 Вмілості та іспити (ВФВ)` → `## 🟡 Вмілості та іспити (ВФВ)`, а під абзацом «**Опис:** …» додати:

```markdown
**Що зроблено (хвиля A, spec `docs/superpowers/specs/2026-10-29-junak-history-design.md`):**
каталог «Вмілості УПЮ» 2003 р. (70 вмілостей, 108 рівнів; сид `seed-skills-catalog.ts`) +
власні вмілості куреня (звʼязковий), сторінка «Вмілості» (`/skills`, плитка в хабі),
здобуті вмілості юнака в секції «Історія» на `/users/[id]` (звʼязковий і виховник гуртка)
та на `/me` (перегляд), події в «Журналі дій». ВФВ — хвиля B.
```

```bash
git add apps/web/lib/types.ts apps/web/lib/audit.ts apps/web/lib/queries/junak-history.ts apps/web/components/junak-history.tsx apps/web/components/junak-history/shared.tsx apps/web/components/junak-history/skills-section.tsx "apps/web/app/users/[id]/page.tsx" apps/web/app/me/page.tsx apps/web/e2e/junak-history-skills.spec.ts docs/backlog.md
git commit -m "feat(web): skills section of the junak history on the junak page and /me"
```

**Кінець хвилі A** — можна випускати (деплой + ручний запуск сиду на проді, див. задачу 3).

---

# Хвиля B — ВФВ, табори, відзначення й перестороги, архів діловодства, дати, агрегат

### Task 8: Схема хвилі B + API ВФВ і таборів

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`User` — поля після `skobDate` і блок звʼязків; нові моделі після `JunakSkill`; enum `AuditAction`)
- Create: `apps/api/prisma/migrations/<timestamp>_junak_history/migration.sql`
- Modify: `apps/api/src/audit/audit.constants.ts`
- Modify: `apps/api/test/utils/clean-db.ts`
- Modify: `apps/api/src/junak-history/history-input.util.ts` (+ `.spec.ts`) — `assertYearRange`, `requireText`
- Modify: `apps/api/src/junak-history/junak-history.views.ts` — `JunakVfvView`, `JunakCampView`
- Create: `apps/api/src/junak-history/dto/{create-vfv,update-vfv,create-camp,update-camp}.dto.ts`
- Create: `apps/api/src/junak-history/junak-vfv.{service,controller}.ts`, `junak-camps.{service,controller}.ts`
- Modify: `apps/api/src/junak-history/junak-history.module.ts`
- Test: `apps/api/test/junak-vfv-camps.e2e-spec.ts`

**Interfaces:**
- Consumes: `loadJunakForWrite`, `HistoryJunak`, `patchHistoryDate`, `blankToNull`, `HISTORY_MIN_YEAR`, `isoDate` (задача 5), `createHistoryWorld` (задача 5), `personLabel`, `AuditService`.
- Produces:
  - Prisma: `JunakVfv`, `JunakCamp`, `JunakRemark` (+ enum `JunakRemarkKind { AWARD, WARNING }`), `JunakPastPosition`, `User.upyJoinedAt`, `User.plastOathAt` (`DateTime? @db.Date`); `AuditAction.{VFV_ADDED, VFV_UPDATED, VFV_REMOVED, CAMP_ADDED, CAMP_UPDATED, CAMP_REMOVED, REMARK_ADDED, REMARK_UPDATED, REMARK_REMOVED, PAST_POSITION_ADDED, PAST_POSITION_UPDATED, PAST_POSITION_REMOVED, HISTORY_DATES_CHANGED}` у `PEOPLE`.
  - `history-input.util.ts`: `assertYearRange(yearFrom: number, yearTo: number | null): void`; `requireText(value: string | null | undefined, message: string): string`.
  - views: `interface JunakVfvView { id; achievedAt: string | null; note: string | null }`, `toVfvView(row: JunakVfv)`; `interface JunakCampView { id; name; yearFrom: number; yearTo: number | null; role: JunakActivityRole }`, `toCampView(row: JunakCamp)`.
  - HTTP: `POST /users/:junakId/vfv` `{ achievedAt?: string | null, note?: string | null }` → `201 JunakVfvView`; `PATCH /users/:junakId/vfv/:id` (ті ж поля) → `JunakVfvView`; `DELETE …/vfv/:id` → `{ success: true }`. `POST /users/:junakId/camps` `{ name, yearFrom, yearTo?: number | null, role: 'PARTICIPANT' | 'PROVID' }` → `201 JunakCampView`; `PATCH …/camps/:id` (усі поля необовʼязкові) → `JunakCampView`; `DELETE …/camps/:id` → `{ success: true }`. Журнал: ВФВ `details = { subjectName, achievedAt }`; табір `details = { subjectName, campName, yearFrom, yearTo, role }`.

- [ ] **Step 1: Unit-тести нових утиліт — FAIL**

У `apps/api/src/junak-history/history-input.util.spec.ts` розширити імпорт (`assertYearRange, blankToNull, parseHistoryDate, patchHistoryDate, requireText`) і додати:

```ts
describe('assertYearRange', () => {
  const current = new Date().getUTCFullYear();

  it('accepts 1990…current with yearTo ≥ yearFrom or no yearTo', () => {
    expect(() => assertYearRange(1990, null)).not.toThrow();
    expect(() => assertYearRange(2021, 2024)).not.toThrow();
    expect(() => assertYearRange(current, current)).not.toThrow();
  });

  it('rejects years outside the range and yearTo before yearFrom', () => {
    expect(() => assertYearRange(1989, null)).toThrow(BadRequestException);
    expect(() => assertYearRange(current + 1, null)).toThrow(BadRequestException);
    expect(() => assertYearRange(2024, 2023)).toThrow(BadRequestException);
    expect(() => assertYearRange(2024, current + 1)).toThrow(BadRequestException);
  });
});

describe('requireText', () => {
  it('trims and rejects blank text with the given message', () => {
    expect(requireText('  Табір ', 'msg')).toBe('Табір');
    expect(() => requireText('   ', 'Вкажіть назву')).toThrow('Вкажіть назву');
    expect(() => requireText(undefined, 'Вкажіть назву')).toThrow(BadRequestException);
    expect(() => requireText(null, 'Вкажіть назву')).toThrow(BadRequestException);
  });
});
```

Run: `npx jest src/junak-history --runInBand`. Expected: FAIL — `assertYearRange is not a function` (TS: немає експорту).

- [ ] **Step 2: Утиліти — PASS**

В кінець `apps/api/src/junak-history/history-input.util.ts`:

```ts
/** Years of camps and past positions: 1990…current (UTC), yearTo (if any) between yearFrom and current. */
export function assertYearRange(yearFrom: number, yearTo: number | null): void {
  const current = new Date().getUTCFullYear();
  if (yearFrom < HISTORY_MIN_YEAR || yearFrom > current) {
    throw new BadRequestException(`Рік початку має бути між ${HISTORY_MIN_YEAR} і ${current}`);
  }
  if (yearTo !== null && (yearTo < yearFrom || yearTo > current)) {
    throw new BadRequestException(`Рік завершення має бути між роком початку і ${current}`);
  }
}

/** Required free text: trimmed, must not be blank. */
export function requireText(value: string | null | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new BadRequestException(message);
  }
  return trimmed;
}
```

Run → PASS.

- [ ] **Step 3: Падаючий e2e ВФВ і таборів**

`apps/api/test/junak-vfv-camps.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, PrismaClient, Role } from '@prisma/client';
import { bootApp } from './utils/boot-app';
import { cleanDatabase } from './utils/clean-db';
import { issueTokenFor } from './utils/fixtures';
import { createHistoryWorld } from './utils/history-fixtures';

describe('Junak history — VFV and camps (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    ({ app, jwtService } = await bootApp());
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
    const world = await createHistoryWorld(prisma);
    const token = (user: { id: string; role: Role; kurinId: string }) => issueTokenFor(jwtService, user);
    return { ...world, token };
  }

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const auditOf = (kurinId: string, action: AuditAction) =>
    prisma.auditLog.findMany({ where: { kurinId, action }, orderBy: { createdAt: 'asc' } });
  const currentYear = new Date().getUTCFullYear();

  describe('VFV', () => {
    it('adds, updates and removes a VFV record, logging each step without the note', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const created = await http()
        .post(`/users/${w.junak.id}/vfv`)
        .set(auth(zv))
        .send({ achievedAt: '2024-06-01', note: '  Склав усі норми ' })
        .expect(201);
      expect(created.body).toEqual({ id: expect.any(String), achievedAt: '2024-06-01', note: 'Склав усі норми' });

      const updated = await http()
        .patch(`/users/${w.junak.id}/vfv/${created.body.id}`)
        .set(auth(w.token(w.vykhovnykA)))
        .send({ achievedAt: null, note: '' })
        .expect(200);
      expect(updated.body).toEqual({ id: created.body.id, achievedAt: null, note: null });

      await http().delete(`/users/${w.junak.id}/vfv/${created.body.id}`).set(auth(zv)).expect(200, { success: true });
      expect(await prisma.junakVfv.count()).toBe(0);

      const added = await auditOf(w.kurin.id, AuditAction.VFV_ADDED);
      expect(added[0]).toMatchObject({ actorId: w.zvyazkovyi.id, subjectUserId: w.junak.id, entityId: created.body.id });
      expect(added[0].details).toEqual({ subjectName: 'Test User', achievedAt: '2024-06-01' });
      expect((await auditOf(w.kurin.id, AuditAction.VFV_UPDATED))[0].details).toEqual({ subjectName: 'Test User', achievedAt: null });
      expect(await auditOf(w.kurin.id, AuditAction.VFV_REMOVED)).toHaveLength(1);
    });

    it('accepts a VFV record without a date, rejects a future date', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      await http().post(`/users/${w.junak.id}/vfv`).set(auth(zv)).send({}).expect(201);
      const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await http().post(`/users/${w.junak.id}/vfv`).set(auth(zv)).send({ achievedAt: inThreeDays }).expect(400);
    });

    it('applies the write rules: other vykhovnyk 403, junak 403, other kurin 404, foreign record 404', async () => {
      const w = await setup();
      await http().post(`/users/${w.junak.id}/vfv`).set(auth(w.token(w.vykhovnykB))).send({}).expect(403);
      await http().post(`/users/${w.junak.id}/vfv`).set(auth(w.token(w.junak))).send({}).expect(403);
      await http().post(`/users/${w.junak.id}/vfv`).set(auth(w.token(w.otherZvyazkovyi))).send({}).expect(404);
      const created = await http().post(`/users/${w.junak.id}/vfv`).set(auth(w.token(w.zvyazkovyi))).send({}).expect(201);
      await http()
        .patch(`/users/${w.junakNoHurtok.id}/vfv/${created.body.id}`)
        .set(auth(w.token(w.zvyazkovyi)))
        .send({ note: 'x' })
        .expect(404);
    });
  });

  describe('Camps', () => {
    it('adds, updates and removes a camp, logging name, years and role', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const created = await http()
        .post(`/users/${w.junak.id}/camps`)
        .set(auth(zv))
        .send({ name: ' Вовча тропа ', yearFrom: 2021, yearTo: 2024, role: 'PROVID' })
        .expect(201);
      expect(created.body).toEqual({ id: expect.any(String), name: 'Вовча тропа', yearFrom: 2021, yearTo: 2024, role: 'PROVID' });

      const updated = await http()
        .patch(`/users/${w.junak.id}/camps/${created.body.id}`)
        .set(auth(zv))
        .send({ yearTo: null, role: 'PARTICIPANT' })
        .expect(200);
      expect(updated.body).toMatchObject({ yearFrom: 2021, yearTo: null, role: 'PARTICIPANT' });

      await http().delete(`/users/${w.junak.id}/camps/${created.body.id}`).set(auth(zv)).expect(200, { success: true });

      expect((await auditOf(w.kurin.id, AuditAction.CAMP_ADDED))[0].details).toEqual({
        subjectName: 'Test User',
        campName: 'Вовча тропа',
        yearFrom: 2021,
        yearTo: 2024,
        role: 'PROVID',
      });
      expect((await auditOf(w.kurin.id, AuditAction.CAMP_UPDATED))[0].details).toMatchObject({ yearTo: null, role: 'PARTICIPANT' });
      expect(await auditOf(w.kurin.id, AuditAction.CAMP_REMOVED)).toHaveLength(1);
    });

    it('validates name and years, including a PATCH that would put yearTo before yearFrom', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const post = (body: object) => http().post(`/users/${w.junak.id}/camps`).set(auth(zv)).send(body);
      await post({ name: '   ', yearFrom: 2021, role: 'PARTICIPANT' }).expect(400);
      await post({ name: 'Табір', yearFrom: 1989, role: 'PARTICIPANT' }).expect(400);
      await post({ name: 'Табір', yearFrom: currentYear + 1, role: 'PARTICIPANT' }).expect(400);
      await post({ name: 'Табір', yearFrom: 2023, yearTo: 2022, role: 'PARTICIPANT' }).expect(400);
      await post({ name: 'Табір', yearFrom: 2023, role: 'GUEST' }).expect(400);
      const created = await post({ name: 'Табір', yearFrom: 2023, role: 'PARTICIPANT' }).expect(201);
      await http()
        .patch(`/users/${w.junak.id}/camps/${created.body.id}`)
        .set(auth(zv))
        .send({ yearFrom: 2025, yearTo: 2024 })
        .expect(400);
    });

    it('lets only the zvyazkovyi write for a junak without hurtok and nobody for an archived junak', async () => {
      const w = await setup();
      const body = { name: 'Табір', yearFrom: 2023, role: 'PARTICIPANT' };
      await http().post(`/users/${w.junakNoHurtok.id}/camps`).set(auth(w.token(w.vykhovnykA))).send(body).expect(403);
      await http().post(`/users/${w.junakNoHurtok.id}/camps`).set(auth(w.token(w.zvyazkovyi))).send(body).expect(201);
      await prisma.user.update({ where: { id: w.junakNoHurtok.id }, data: { archivedAt: new Date() } });
      await http().post(`/users/${w.junakNoHurtok.id}/camps`).set(auth(w.token(w.zvyazkovyi))).send(body).expect(400);
    });
  });
});
```

Run: `test/junak-vfv-camps.e2e-spec.ts`. Expected: FAIL — компіляція (`prisma.junakVfv` не існує).

- [ ] **Step 4: Схема хвилі B**

У `model User` після `skobDate           DateTime?` додати:

```prisma
  // Історія юнака: дата вступу до УПЮ і дата пластової присяги (вносить звʼязковий / виховник гуртка).
  upyJoinedAt        DateTime? @db.Date
  plastOathAt        DateTime? @db.Date
```

У блоці звʼязків `User` після `createdJunakSkills …` додати:

```prisma
  vfvEntries                 JunakVfv[]             @relation("JunakVfvEntries")
  createdVfvEntries          JunakVfv[]             @relation("JunakVfvCreatedBy")
  camps                      JunakCamp[]            @relation("JunakCamps")
  createdCamps               JunakCamp[]            @relation("JunakCampCreatedBy")
  remarks                    JunakRemark[]          @relation("JunakRemarks")
  createdRemarks             JunakRemark[]          @relation("JunakRemarkCreatedBy")
  pastPositions              JunakPastPosition[]    @relation("JunakPastPositions")
  createdPastPositions       JunakPastPosition[]    @relation("JunakPastPositionCreatedBy")
```

Після `model JunakSkill` додати:

```prisma
model JunakVfv {
  id          String    @id @default(uuid())
  junakId     String
  junak       User      @relation("JunakVfvEntries", fields: [junakId], references: [id])
  achievedAt  DateTime? @db.Date
  note        String?
  createdById String
  createdBy   User      @relation("JunakVfvCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime  @default(now())

  @@index([junakId])
}

model JunakCamp {
  id          String            @id @default(uuid())
  junakId     String
  junak       User              @relation("JunakCamps", fields: [junakId], references: [id])
  name        String
  yearFrom    Int
  yearTo      Int?
  // Наявний enum активності: PARTICIPANT (учасник) | PROVID (провід).
  role        JunakActivityRole
  createdById String
  createdBy   User              @relation("JunakCampCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime          @default(now())

  @@index([junakId])
}

enum JunakRemarkKind {
  AWARD   // відзначення
  WARNING // пересторога
}

model JunakRemark {
  id          String          @id @default(uuid())
  junakId     String
  junak       User            @relation("JunakRemarks", fields: [junakId], references: [id])
  kind        JunakRemarkKind
  // За що відзначення / за що пересторога.
  text        String
  // Лише для WARNING (обовʼязково): що юнак має зробити, щоб виправити.
  howToFix    String?
  date        DateTime        @db.Date
  createdById String
  createdBy   User            @relation("JunakRemarkCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime        @default(now())

  @@index([junakId, date])
}

model JunakPastPosition {
  id          String        @id @default(uuid())
  junakId     String
  junak       User          @relation("JunakPastPositions", fields: [junakId], references: [id])
  // «Гуртковий», «Курінний суддя» — вільний текст (посади до застосунку).
  title       String
  scope       PositionScope
  yearFrom    Int
  yearTo      Int?
  createdById String
  createdBy   User          @relation("JunakPastPositionCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime      @default(now())

  @@index([junakId])
}
```

У `enum AuditAction` після `CUSTOM_SKILL_DELETED` додати:

```prisma
  VFV_ADDED
  VFV_UPDATED
  VFV_REMOVED
  CAMP_ADDED
  CAMP_UPDATED
  CAMP_REMOVED
  REMARK_ADDED
  REMARK_UPDATED
  REMARK_REMOVED
  PAST_POSITION_ADDED
  PAST_POSITION_UPDATED
  PAST_POSITION_REMOVED
  HISTORY_DATES_CHANGED
```

- [ ] **Step 5: Міграція — створити, перевірити, застосувати**

З `apps/api`: `npx prisma migrate dev --create-only --name junak_history`. Переглянути SQL. Має містити **лише**: 13 × `ALTER TYPE "AuditAction" ADD VALUE '…'`; `CREATE TYPE "JunakRemarkKind" AS ENUM ('AWARD', 'WARNING')`; `ALTER TABLE "User" ADD COLUMN "upyJoinedAt" DATE, ADD COLUMN "plastOathAt" DATE` (одним або двома операторами); `CREATE TABLE` для `JunakVfv` (`"achievedAt" DATE`), `JunakCamp` (`"role" "JunakActivityRole" NOT NULL`), `JunakRemark` (`"date" DATE NOT NULL`), `JunakPastPosition` (`"scope" "PositionScope" NOT NULL`); індекси `JunakVfv_junakId_idx`, `JunakCamp_junakId_idx`, `JunakRemark_junakId_date_idx`, `JunakPastPosition_junakId_idx`; 8 зовнішніх ключів на `"User"("id")` з `ON DELETE RESTRICT ON UPDATE CASCADE`. **Якщо** у файлі є `DROP INDEX "Skill_global_name_key";` — видалити цей рядок (див. коментар у `model Skill`). Жодних інших `DROP`/`ALTER COLUMN`.

```bash
npx prisma migrate dev
set -a; . ./.env; set +a; DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy
```

- [ ] **Step 6: `cleanDatabase` і група журналу**

У `apps/api/test/utils/clean-db.ts` одразу після `prisma.junakActivityEntry.deleteMany(),` (перед `prisma.junakSkill.deleteMany(),`) вставити:

```ts
    prisma.junakVfv.deleteMany(),
    prisma.junakCamp.deleteMany(),
    prisma.junakRemark.deleteMany(),
    prisma.junakPastPosition.deleteMany(),
```

У `apps/api/src/audit/audit.constants.ts` у `PEOPLE` після `AuditAction.CUSTOM_SKILL_DELETED,` додати:

```ts
    AuditAction.VFV_ADDED,
    AuditAction.VFV_UPDATED,
    AuditAction.VFV_REMOVED,
    AuditAction.CAMP_ADDED,
    AuditAction.CAMP_UPDATED,
    AuditAction.CAMP_REMOVED,
    AuditAction.REMARK_ADDED,
    AuditAction.REMARK_UPDATED,
    AuditAction.REMARK_REMOVED,
    AuditAction.PAST_POSITION_ADDED,
    AuditAction.PAST_POSITION_UPDATED,
    AuditAction.PAST_POSITION_REMOVED,
    AuditAction.HISTORY_DATES_CHANGED,
```

- [ ] **Step 7: Views, DTO, сервіси, контролери**

В `apps/api/src/junak-history/junak-history.views.ts` розширити імпорт з `@prisma/client` (`JunakActivityRole, JunakCamp, JunakSkill, JunakVfv, Skill, SkillGroup, SkillLevel`) і додати в кінець:

```ts
export interface JunakVfvView {
  id: string;
  achievedAt: string | null;
  note: string | null;
}

export function toVfvView(row: JunakVfv): JunakVfvView {
  return { id: row.id, achievedAt: isoDate(row.achievedAt), note: row.note };
}

export interface JunakCampView {
  id: string;
  name: string;
  yearFrom: number;
  yearTo: number | null;
  role: JunakActivityRole;
}

export function toCampView(row: JunakCamp): JunakCampView {
  return { id: row.id, name: row.name, yearFrom: row.yearFrom, yearTo: row.yearTo, role: row.role };
}
```

`apps/api/src/junak-history/dto/create-vfv.dto.ts`:

```ts
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVfvDto {
  /** YYYY-MM-DD, optional (the date of a VFV is not always known). */
  @IsOptional() @IsDateString({ strict: true }) achievedAt?: string | null;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}
```

`apps/api/src/junak-history/dto/update-vfv.dto.ts`:

```ts
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** undefined = no change, null = clear. */
export class UpdateVfvDto {
  @IsOptional() @IsDateString({ strict: true }) achievedAt?: string | null;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}
```

`apps/api/src/junak-history/dto/create-camp.dto.ts`:

```ts
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { JunakActivityRole } from '@prisma/client';

export class CreateCampDto {
  @IsString() @MaxLength(120) name: string;
  @IsInt() yearFrom: number;
  @IsOptional() @IsInt() yearTo?: number | null;
  @IsEnum(JunakActivityRole) role: JunakActivityRole;
}
```

`apps/api/src/junak-history/dto/update-camp.dto.ts`:

```ts
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { JunakActivityRole } from '@prisma/client';

export class UpdateCampDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsInt() yearFrom?: number;
  /** null = the camp has no separate end year. */
  @IsOptional() @IsInt() yearTo?: number | null;
  @IsOptional() @IsEnum(JunakActivityRole) role?: JunakActivityRole;
}
```

`apps/api/src/junak-history/junak-vfv.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, JunakVfv } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HistoryJunak, loadJunakForWrite } from './junak-history-access';
import { blankToNull, patchHistoryDate } from './history-input.util';
import { JunakVfvView, isoDate, toVfvView } from './junak-history.views';
import { CreateVfvDto } from './dto/create-vfv.dto';
import { UpdateVfvDto } from './dto/update-vfv.dto';

@Injectable()
export class JunakVfvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(junakId: string, dto: CreateVfvDto, actor: CurrentUserPayload): Promise<JunakVfvView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.prisma.junakVfv.create({
      data: {
        junakId,
        achievedAt: patchHistoryDate(dto.achievedAt) ?? null,
        note: blankToNull(dto.note) ?? null,
        createdById: actor.userId,
      },
    });
    await this.record(AuditAction.VFV_ADDED, junak, row, actor);
    return toVfvView(row);
  }

  async update(junakId: string, id: string, dto: UpdateVfvDto, actor: CurrentUserPayload): Promise<JunakVfvView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    await this.findOwnedOrThrow(junakId, id);
    const row = await this.prisma.junakVfv.update({
      where: { id },
      data: { achievedAt: patchHistoryDate(dto.achievedAt), note: blankToNull(dto.note) },
    });
    await this.record(AuditAction.VFV_UPDATED, junak, row, actor);
    return toVfvView(row);
  }

  async remove(junakId: string, id: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    await this.prisma.junakVfv.delete({ where: { id } });
    await this.record(AuditAction.VFV_REMOVED, junak, row, actor);
    return { success: true };
  }

  private async findOwnedOrThrow(junakId: string, id: string) {
    const row = await this.prisma.junakVfv.findUnique({ where: { id } });
    if (!row || row.junakId !== junakId) {
      throw new NotFoundException('Запис не знайдено');
    }
    return row;
  }

  /** The note is free text — it stays out of the journal. */
  private record(action: AuditAction, junak: HistoryJunak, row: JunakVfv, actor: CurrentUserPayload) {
    return this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action,
      subjectUserId: junak.id,
      entityId: row.id,
      details: { subjectName: personLabel(junak), achievedAt: isoDate(row.achievedAt) },
    });
  }
}
```

`apps/api/src/junak-history/junak-camps.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, JunakCamp } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HistoryJunak, loadJunakForWrite } from './junak-history-access';
import { assertYearRange, requireText } from './history-input.util';
import { JunakCampView, toCampView } from './junak-history.views';
import { CreateCampDto } from './dto/create-camp.dto';
import { UpdateCampDto } from './dto/update-camp.dto';

@Injectable()
export class JunakCampsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(junakId: string, dto: CreateCampDto, actor: CurrentUserPayload): Promise<JunakCampView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const name = requireText(dto.name, 'Вкажіть назву табору');
    const yearTo = dto.yearTo ?? null;
    assertYearRange(dto.yearFrom, yearTo);
    const row = await this.prisma.junakCamp.create({
      data: { junakId, name, yearFrom: dto.yearFrom, yearTo, role: dto.role, createdById: actor.userId },
    });
    await this.record(AuditAction.CAMP_ADDED, junak, row, actor);
    return toCampView(row);
  }

  async update(junakId: string, id: string, dto: UpdateCampDto, actor: CurrentUserPayload): Promise<JunakCampView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const existing = await this.findOwnedOrThrow(junakId, id);
    const yearFrom = dto.yearFrom ?? existing.yearFrom;
    const yearTo = dto.yearTo === undefined ? existing.yearTo : dto.yearTo;
    assertYearRange(yearFrom, yearTo);
    const row = await this.prisma.junakCamp.update({
      where: { id },
      data: {
        name: dto.name === undefined ? undefined : requireText(dto.name, 'Вкажіть назву табору'),
        yearFrom,
        yearTo,
        role: dto.role,
      },
    });
    await this.record(AuditAction.CAMP_UPDATED, junak, row, actor);
    return toCampView(row);
  }

  async remove(junakId: string, id: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    await this.prisma.junakCamp.delete({ where: { id } });
    await this.record(AuditAction.CAMP_REMOVED, junak, row, actor);
    return { success: true };
  }

  private async findOwnedOrThrow(junakId: string, id: string) {
    const row = await this.prisma.junakCamp.findUnique({ where: { id } });
    if (!row || row.junakId !== junakId) {
      throw new NotFoundException('Запис не знайдено');
    }
    return row;
  }

  private record(action: AuditAction, junak: HistoryJunak, row: JunakCamp, actor: CurrentUserPayload) {
    return this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action,
      subjectUserId: junak.id,
      entityId: row.id,
      details: { subjectName: personLabel(junak), campName: row.name, yearFrom: row.yearFrom, yearTo: row.yearTo, role: row.role },
    });
  }
}
```

`apps/api/src/junak-history/junak-vfv.controller.ts`:

```ts
import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JunakVfvService } from './junak-vfv.service';
import { CreateVfvDto } from './dto/create-vfv.dto';
import { UpdateVfvDto } from './dto/update-vfv.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/:junakId/vfv')
export class JunakVfvController {
  constructor(private readonly service: JunakVfvService) {}

  @Post()
  create(@Param('junakId') junakId: string, @Body() dto: CreateVfvDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(junakId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('junakId') junakId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVfvDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(junakId, id, dto, user);
  }

  @Delete(':id')
  remove(@Param('junakId') junakId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(junakId, id, user);
  }
}
```

`apps/api/src/junak-history/junak-camps.controller.ts`:

```ts
import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JunakCampsService } from './junak-camps.service';
import { CreateCampDto } from './dto/create-camp.dto';
import { UpdateCampDto } from './dto/update-camp.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/:junakId/camps')
export class JunakCampsController {
  constructor(private readonly service: JunakCampsService) {}

  @Post()
  create(@Param('junakId') junakId: string, @Body() dto: CreateCampDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(junakId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('junakId') junakId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCampDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(junakId, id, dto, user);
  }

  @Delete(':id')
  remove(@Param('junakId') junakId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(junakId, id, user);
  }
}
```

`apps/api/src/junak-history/junak-history.module.ts` — повний вміст:

```ts
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { JunakSkillsController } from './junak-skills.controller';
import { JunakSkillsService } from './junak-skills.service';
import { JunakVfvController } from './junak-vfv.controller';
import { JunakVfvService } from './junak-vfv.service';
import { JunakCampsController } from './junak-camps.controller';
import { JunakCampsService } from './junak-camps.service';

@Module({
  imports: [UsersModule],
  controllers: [JunakSkillsController, JunakVfvController, JunakCampsController],
  providers: [JunakSkillsService, JunakVfvService, JunakCampsService],
})
export class JunakHistoryModule {}
```

- [ ] **Step 8: Запустити — PASS**

`test/junak-vfv-camps.e2e-spec.ts` і `test/junak-skills.e2e-spec.ts` → зелені; `npx jest src --runInBand --forceExit` (у т.ч. `audit.constants.spec.ts`), `npx tsc --noEmit -p tsconfig.json` — чисто.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/*_junak_history apps/api/src/audit/audit.constants.ts apps/api/src/junak-history apps/api/test/utils/clean-db.ts apps/api/test/junak-vfv-camps.e2e-spec.ts
git commit -m "feat(api): junak history schema (wave B), VFV and camps endpoints"
```

---

### Task 9: API відзначень і пересторог, архіву діловодства, дат вступу й присяги

**Files:**
- Modify: `apps/api/src/junak-history/junak-history.views.ts` — `JunakRemarkView`, `JunakPastPositionView`, `HistoryDatesView`
- Create: `apps/api/src/junak-history/dto/{create-remark,update-remark,create-past-position,update-past-position,update-history-dates}.dto.ts`
- Create: `apps/api/src/junak-history/junak-remarks.{service,controller}.ts`, `junak-past-positions.{service,controller}.ts`, `junak-history.{service,controller}.ts`
- Modify: `apps/api/src/junak-history/junak-history.module.ts`
- Test: `apps/api/test/junak-remarks-positions.e2e-spec.ts`

**Interfaces:**
- Consumes: схема й утиліти задачі 8 (`requireText`, `assertYearRange`, `blankToNull`, `parseHistoryDate`, `patchHistoryDate`, `loadJunakForWrite`, `isoDate`), `createHistoryWorld`.
- Produces:
  - views: `interface JunakRemarkView { id; kind: JunakRemarkKind; text: string; howToFix: string | null; date: string }`, `toRemarkView(row)`; `interface JunakPastPositionView { id; title; scope: PositionScope; yearFrom: number; yearTo: number | null }`, `toPastPositionView(row)`; `interface HistoryDatesView { upyJoinedAt: string | null; plastOathAt: string | null }`.
  - `JunakHistoryService.updateDates(junakId, dto, actor): Promise<HistoryDatesView>` (задача 10 додає `get` у той самий сервіс).
  - HTTP: `POST /users/:junakId/remarks` `{ kind: 'AWARD' | 'WARNING', text, howToFix?, date }` → `201 JunakRemarkView`; `PATCH …/remarks/:id` `{ text?, howToFix?, date? }` (тип не змінюється); `DELETE …/remarks/:id`. `POST /users/:junakId/past-positions` `{ title, scope: 'KURIN' | 'HURTOK', yearFrom, yearTo? }`; `PATCH`/`DELETE …/past-positions/:id`. `PATCH /users/:junakId/history/dates` `{ upyJoinedAt?: string | null, plastOathAt?: string | null }` → `HistoryDatesView`. Журнал: перестороги/відзначення — `details = { subjectName, kind, date }` (**без** `text`/`howToFix`); архів — `{ subjectName, title, scope, yearFrom, yearTo }`; дати — `{ subjectName, upyJoinedAt?, plastOathAt? }` (лише передані поля).

- [ ] **Step 1: Падаючий e2e**

`apps/api/test/junak-remarks-positions.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, PrismaClient, Role } from '@prisma/client';
import { bootApp } from './utils/boot-app';
import { cleanDatabase } from './utils/clean-db';
import { issueTokenFor } from './utils/fixtures';
import { createHistoryWorld } from './utils/history-fixtures';

describe('Junak history — remarks, past positions, dates (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    ({ app, jwtService } = await bootApp());
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
    const world = await createHistoryWorld(prisma);
    const token = (user: { id: string; role: Role; kurinId: string }) => issueTokenFor(jwtService, user);
    return { ...world, token };
  }

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const auditOf = (kurinId: string, action: AuditAction) =>
    prisma.auditLog.findMany({ where: { kurinId, action }, orderBy: { createdAt: 'asc' } });
  const warning = { kind: 'WARNING', text: 'Запізнився на три сходини поспіль', howToFix: 'Відвідати наступні чотири сходини вчасно', date: '2025-03-10' };

  describe('Remarks', () => {
    it('records a warning with both fields and logs only kind and date', async () => {
      const w = await setup();
      const res = await http().post(`/users/${w.junak.id}/remarks`).set(auth(w.token(w.vykhovnykA))).send(warning).expect(201);
      expect(res.body).toEqual({ id: expect.any(String), ...warning });
      const entries = await auditOf(w.kurin.id, AuditAction.REMARK_ADDED);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorId: w.vykhovnykA.id, subjectUserId: w.junak.id, entityId: res.body.id });
      expect(entries[0].details).toEqual({ subjectName: 'Test User', kind: 'WARNING', date: '2025-03-10' });
      expect(JSON.stringify(entries[0].details)).not.toMatch(/Запізнився|сходини/);
    });

    it('requires both «за що» and «як виправити» for a warning; refuses howToFix for an award', async () => {
      const w = await setup();
      const post = (body: object) => http().post(`/users/${w.junak.id}/remarks`).set(auth(w.token(w.zvyazkovyi))).send(body);
      await post({ ...warning, howToFix: undefined }).expect(400);
      await post({ ...warning, howToFix: '   ' }).expect(400);
      await post({ ...warning, text: '  ' }).expect(400);
      await post({ kind: 'AWARD', text: 'Найкращий табірник', howToFix: 'Нічого', date: '2025-08-01' }).expect(400);
      const award = await post({ kind: 'AWARD', text: 'Найкращий табірник', date: '2025-08-01' }).expect(201);
      expect(award.body).toMatchObject({ kind: 'AWARD', howToFix: null });
      const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await post({ ...warning, date: inThreeDays }).expect(400);
    });

    it('updates and removes a remark; a warning keeps its howToFix required, kind cannot change', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const created = await http().post(`/users/${w.junak.id}/remarks`).set(auth(zv)).send(warning).expect(201);
      const patch = (body: object) => http().patch(`/users/${w.junak.id}/remarks/${created.body.id}`).set(auth(zv)).send(body);
      await patch({ howToFix: '' }).expect(400);
      const updated = await patch({ kind: 'AWARD', howToFix: 'Прийти на дві сходини раніше', date: '2025-03-12' }).expect(200);
      expect(updated.body).toMatchObject({ kind: 'WARNING', howToFix: 'Прийти на дві сходини раніше', date: '2025-03-12' });
      await http().delete(`/users/${w.junak.id}/remarks/${created.body.id}`).set(auth(zv)).expect(200, { success: true });
      expect((await auditOf(w.kurin.id, AuditAction.REMARK_UPDATED))[0].details).toEqual({ subjectName: 'Test User', kind: 'WARNING', date: '2025-03-12' });
      expect((await auditOf(w.kurin.id, AuditAction.REMARK_REMOVED))[0].details).toEqual({ subjectName: 'Test User', kind: 'WARNING', date: '2025-03-12' });
    });

    it('does not let the junak, another hurtok vykhovnyk or another kurin write remarks', async () => {
      const w = await setup();
      await http().post(`/users/${w.junak.id}/remarks`).set(auth(w.token(w.junak))).send(warning).expect(403);
      await http().post(`/users/${w.junak.id}/remarks`).set(auth(w.token(w.vykhovnykB))).send(warning).expect(403);
      await http().post(`/users/${w.junak.id}/remarks`).set(auth(w.token(w.otherZvyazkovyi))).send(warning).expect(404);
    });
  });

  describe('Past positions', () => {
    it('adds, updates and removes an archive position with year validation, and logs it', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const post = (body: object) => http().post(`/users/${w.junak.id}/past-positions`).set(auth(zv)).send(body);
      await post({ title: ' ', scope: 'HURTOK', yearFrom: 2019 }).expect(400);
      await post({ title: 'Гуртковий', scope: 'TABIR', yearFrom: 2019 }).expect(400);
      await post({ title: 'Гуртковий', scope: 'HURTOK', yearFrom: 2020, yearTo: 2019 }).expect(400);
      const created = await post({ title: ' Гуртковий ', scope: 'HURTOK', yearFrom: 2019, yearTo: 2021 }).expect(201);
      expect(created.body).toEqual({ id: expect.any(String), title: 'Гуртковий', scope: 'HURTOK', yearFrom: 2019, yearTo: 2021 });
      const updated = await http()
        .patch(`/users/${w.junak.id}/past-positions/${created.body.id}`)
        .set(auth(zv))
        .send({ title: 'Курінний суддя', scope: 'KURIN' })
        .expect(200);
      expect(updated.body).toMatchObject({ title: 'Курінний суддя', scope: 'KURIN', yearFrom: 2019, yearTo: 2021 });
      await http().delete(`/users/${w.junak.id}/past-positions/${created.body.id}`).set(auth(zv)).expect(200, { success: true });
      expect((await auditOf(w.kurin.id, AuditAction.PAST_POSITION_ADDED))[0].details).toEqual({
        subjectName: 'Test User',
        title: 'Гуртковий',
        scope: 'HURTOK',
        yearFrom: 2019,
        yearTo: 2021,
      });
      expect(await auditOf(w.kurin.id, AuditAction.PAST_POSITION_UPDATED)).toHaveLength(1);
      expect(await auditOf(w.kurin.id, AuditAction.PAST_POSITION_REMOVED)).toHaveLength(1);
    });
  });

  describe('PATCH /users/:junakId/history/dates', () => {
    it('sets and clears the UPYU join and oath dates, logging only the fields that were sent', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const patch = (body: object) => http().patch(`/users/${w.junak.id}/history/dates`).set(auth(zv)).send(body);
      expect((await patch({ upyJoinedAt: '2019-09-01', plastOathAt: '2020-02-22' }).expect(200)).body).toEqual({
        upyJoinedAt: '2019-09-01',
        plastOathAt: '2020-02-22',
      });
      expect((await patch({ plastOathAt: null }).expect(200)).body).toEqual({ upyJoinedAt: '2019-09-01', plastOathAt: null });
      await patch({}).expect(400);
      await patch({ upyJoinedAt: '1989-01-01' }).expect(400);
      const entries = await auditOf(w.kurin.id, AuditAction.HISTORY_DATES_CHANGED);
      expect(entries.map((e) => e.details)).toEqual([
        { subjectName: 'Test User', upyJoinedAt: '2019-09-01', plastOathAt: '2020-02-22' },
        { subjectName: 'Test User', plastOathAt: null },
      ]);
    });

    it('applies the write rules to dates', async () => {
      const w = await setup();
      const body = { upyJoinedAt: '2019-09-01' };
      await http().patch(`/users/${w.junak.id}/history/dates`).set(auth(w.token(w.vykhovnykA))).send(body).expect(200);
      await http().patch(`/users/${w.junak.id}/history/dates`).set(auth(w.token(w.vykhovnykB))).send(body).expect(403);
      await http().patch(`/users/${w.junak.id}/history/dates`).set(auth(w.token(w.junak))).send(body).expect(403);
      await http().patch(`/users/${w.junakNoHurtok.id}/history/dates`).set(auth(w.token(w.vykhovnykA))).send(body).expect(403);
    });
  });
});
```

Run: `test/junak-remarks-positions.e2e-spec.ts`. Expected: FAIL — 404 на `POST /users/:id/remarks`.

- [ ] **Step 2: Views і DTO**

В `apps/api/src/junak-history/junak-history.views.ts` розширити імпорт (`JunakPastPosition, JunakRemark, JunakRemarkKind, PositionScope`) і додати:

```ts
export interface JunakRemarkView {
  id: string;
  kind: JunakRemarkKind;
  text: string;
  howToFix: string | null;
  date: string;
}

export function toRemarkView(row: JunakRemark): JunakRemarkView {
  return { id: row.id, kind: row.kind, text: row.text, howToFix: row.howToFix, date: isoDate(row.date) };
}

export interface JunakPastPositionView {
  id: string;
  title: string;
  scope: PositionScope;
  yearFrom: number;
  yearTo: number | null;
}

export function toPastPositionView(row: JunakPastPosition): JunakPastPositionView {
  return { id: row.id, title: row.title, scope: row.scope, yearFrom: row.yearFrom, yearTo: row.yearTo };
}

export interface HistoryDatesView {
  upyJoinedAt: string | null;
  plastOathAt: string | null;
}
```

`apps/api/src/junak-history/dto/create-remark.dto.ts`:

```ts
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { JunakRemarkKind } from '@prisma/client';

export class CreateRemarkDto {
  @IsEnum(JunakRemarkKind) kind: JunakRemarkKind;
  /** За що. Required, non-blank (checked in the service). */
  @IsString() @MaxLength(1000) text: string;
  /** Як виправити. Required for WARNING, not accepted for AWARD (checked in the service). */
  @IsOptional() @IsString() @MaxLength(1000) howToFix?: string | null;
  @IsDateString({ strict: true }) date: string;
}
```

`apps/api/src/junak-history/dto/update-remark.dto.ts`:

```ts
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** The kind is fixed at creation; an unknown `kind` field is stripped by the whitelist. */
export class UpdateRemarkDto {
  @IsOptional() @IsString() @MaxLength(1000) text?: string;
  @IsOptional() @IsString() @MaxLength(1000) howToFix?: string | null;
  @IsOptional() @IsDateString({ strict: true }) date?: string;
}
```

`apps/api/src/junak-history/dto/create-past-position.dto.ts`:

```ts
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PositionScope } from '@prisma/client';

export class CreatePastPositionDto {
  @IsString() @MaxLength(100) title: string;
  @IsEnum(PositionScope) scope: PositionScope;
  @IsInt() yearFrom: number;
  @IsOptional() @IsInt() yearTo?: number | null;
}
```

`apps/api/src/junak-history/dto/update-past-position.dto.ts`:

```ts
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PositionScope } from '@prisma/client';

export class UpdatePastPositionDto {
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsEnum(PositionScope) scope?: PositionScope;
  @IsOptional() @IsInt() yearFrom?: number;
  @IsOptional() @IsInt() yearTo?: number | null;
}
```

`apps/api/src/junak-history/dto/update-history-dates.dto.ts`:

```ts
import { IsDateString, IsOptional } from 'class-validator';

/** undefined = no change, null = clear, YYYY-MM-DD = set. */
export class UpdateHistoryDatesDto {
  @IsOptional() @IsDateString({ strict: true }) upyJoinedAt?: string | null;
  @IsOptional() @IsDateString({ strict: true }) plastOathAt?: string | null;
}
```

- [ ] **Step 3: Сервіси**

`apps/api/src/junak-history/junak-remarks.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, JunakRemark, JunakRemarkKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HistoryJunak, loadJunakForWrite } from './junak-history-access';
import { blankToNull, parseHistoryDate, requireText } from './history-input.util';
import { JunakRemarkView, isoDate, toRemarkView } from './junak-history.views';
import { CreateRemarkDto } from './dto/create-remark.dto';
import { UpdateRemarkDto } from './dto/update-remark.dto';

const TEXT_REQUIRED = 'Опишіть, за що';
const HOW_TO_FIX_REQUIRED = 'Для перестороги обовʼязково вкажіть, як її виправити';
const AWARD_HAS_NO_FIX = 'Для відзначення поле «Як виправити» не заповнюється';

@Injectable()
export class JunakRemarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(junakId: string, dto: CreateRemarkDto, actor: CurrentUserPayload): Promise<JunakRemarkView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const text = requireText(dto.text, TEXT_REQUIRED);
    let howToFix: string | null = null;
    if (dto.kind === JunakRemarkKind.WARNING) {
      howToFix = requireText(dto.howToFix, HOW_TO_FIX_REQUIRED);
    } else if (blankToNull(dto.howToFix)) {
      throw new BadRequestException(AWARD_HAS_NO_FIX);
    }
    const row = await this.prisma.junakRemark.create({
      data: { junakId, kind: dto.kind, text, howToFix, date: parseHistoryDate(dto.date), createdById: actor.userId },
    });
    await this.record(AuditAction.REMARK_ADDED, junak, row, actor);
    return toRemarkView(row);
  }

  async update(junakId: string, id: string, dto: UpdateRemarkDto, actor: CurrentUserPayload): Promise<JunakRemarkView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const existing = await this.findOwnedOrThrow(junakId, id);
    const data: Prisma.JunakRemarkUpdateInput = {};
    if (dto.text !== undefined) data.text = requireText(dto.text, TEXT_REQUIRED);
    if (dto.howToFix !== undefined) {
      if (existing.kind === JunakRemarkKind.WARNING) {
        data.howToFix = requireText(dto.howToFix, HOW_TO_FIX_REQUIRED);
      } else if (blankToNull(dto.howToFix)) {
        throw new BadRequestException(AWARD_HAS_NO_FIX);
      }
    }
    if (dto.date !== undefined) data.date = parseHistoryDate(dto.date);
    const row = await this.prisma.junakRemark.update({ where: { id }, data });
    await this.record(AuditAction.REMARK_UPDATED, junak, row, actor);
    return toRemarkView(row);
  }

  async remove(junakId: string, id: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    await this.prisma.junakRemark.delete({ where: { id } });
    await this.record(AuditAction.REMARK_REMOVED, junak, row, actor);
    return { success: true };
  }

  private async findOwnedOrThrow(junakId: string, id: string) {
    const row = await this.prisma.junakRemark.findUnique({ where: { id } });
    if (!row || row.junakId !== junakId) {
      throw new NotFoundException('Запис не знайдено');
    }
    return row;
  }

  /** Only the fact, kind and date — never `text` or `howToFix` (sensitive text stays out of the journal). */
  private record(action: AuditAction, junak: HistoryJunak, row: JunakRemark, actor: CurrentUserPayload) {
    return this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action,
      subjectUserId: junak.id,
      entityId: row.id,
      details: { subjectName: personLabel(junak), kind: row.kind, date: isoDate(row.date) },
    });
  }
}
```

`apps/api/src/junak-history/junak-past-positions.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, JunakPastPosition } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HistoryJunak, loadJunakForWrite } from './junak-history-access';
import { assertYearRange, requireText } from './history-input.util';
import { JunakPastPositionView, toPastPositionView } from './junak-history.views';
import { CreatePastPositionDto } from './dto/create-past-position.dto';
import { UpdatePastPositionDto } from './dto/update-past-position.dto';

const TITLE_REQUIRED = 'Вкажіть назву посади';

@Injectable()
export class JunakPastPositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(junakId: string, dto: CreatePastPositionDto, actor: CurrentUserPayload): Promise<JunakPastPositionView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const title = requireText(dto.title, TITLE_REQUIRED);
    const yearTo = dto.yearTo ?? null;
    assertYearRange(dto.yearFrom, yearTo);
    const row = await this.prisma.junakPastPosition.create({
      data: { junakId, title, scope: dto.scope, yearFrom: dto.yearFrom, yearTo, createdById: actor.userId },
    });
    await this.record(AuditAction.PAST_POSITION_ADDED, junak, row, actor);
    return toPastPositionView(row);
  }

  async update(junakId: string, id: string, dto: UpdatePastPositionDto, actor: CurrentUserPayload): Promise<JunakPastPositionView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const existing = await this.findOwnedOrThrow(junakId, id);
    const yearFrom = dto.yearFrom ?? existing.yearFrom;
    const yearTo = dto.yearTo === undefined ? existing.yearTo : dto.yearTo;
    assertYearRange(yearFrom, yearTo);
    const row = await this.prisma.junakPastPosition.update({
      where: { id },
      data: {
        title: dto.title === undefined ? undefined : requireText(dto.title, TITLE_REQUIRED),
        scope: dto.scope,
        yearFrom,
        yearTo,
      },
    });
    await this.record(AuditAction.PAST_POSITION_UPDATED, junak, row, actor);
    return toPastPositionView(row);
  }

  async remove(junakId: string, id: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    await this.prisma.junakPastPosition.delete({ where: { id } });
    await this.record(AuditAction.PAST_POSITION_REMOVED, junak, row, actor);
    return { success: true };
  }

  private async findOwnedOrThrow(junakId: string, id: string) {
    const row = await this.prisma.junakPastPosition.findUnique({ where: { id } });
    if (!row || row.junakId !== junakId) {
      throw new NotFoundException('Запис не знайдено');
    }
    return row;
  }

  private record(action: AuditAction, junak: HistoryJunak, row: JunakPastPosition, actor: CurrentUserPayload) {
    return this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action,
      subjectUserId: junak.id,
      entityId: row.id,
      details: { subjectName: personLabel(junak), title: row.title, scope: row.scope, yearFrom: row.yearFrom, yearTo: row.yearTo },
    });
  }
}
```

`apps/api/src/junak-history/junak-history.service.ts` (задача 10 допише `get`):

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { loadJunakForWrite } from './junak-history-access';
import { patchHistoryDate } from './history-input.util';
import { HistoryDatesView, isoDate } from './junak-history.views';
import { UpdateHistoryDatesDto } from './dto/update-history-dates.dto';

@Injectable()
export class JunakHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async updateDates(junakId: string, dto: UpdateHistoryDatesDto, actor: CurrentUserPayload): Promise<HistoryDatesView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    if (dto.upyJoinedAt === undefined && dto.plastOathAt === undefined) {
      throw new BadRequestException('Немає що змінювати');
    }
    const updated = await this.prisma.user.update({
      where: { id: junakId },
      data: { upyJoinedAt: patchHistoryDate(dto.upyJoinedAt), plastOathAt: patchHistoryDate(dto.plastOathAt) },
      select: { upyJoinedAt: true, plastOathAt: true },
    });
    await this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action: AuditAction.HISTORY_DATES_CHANGED,
      subjectUserId: junak.id,
      details: {
        subjectName: personLabel(junak),
        ...(dto.upyJoinedAt !== undefined ? { upyJoinedAt: dto.upyJoinedAt } : {}),
        ...(dto.plastOathAt !== undefined ? { plastOathAt: dto.plastOathAt } : {}),
      },
    });
    return { upyJoinedAt: isoDate(updated.upyJoinedAt), plastOathAt: isoDate(updated.plastOathAt) };
  }
}
```

- [ ] **Step 4: Контролери й модуль**

`apps/api/src/junak-history/junak-remarks.controller.ts`:

```ts
import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JunakRemarksService } from './junak-remarks.service';
import { CreateRemarkDto } from './dto/create-remark.dto';
import { UpdateRemarkDto } from './dto/update-remark.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/:junakId/remarks')
export class JunakRemarksController {
  constructor(private readonly service: JunakRemarksService) {}

  @Post()
  create(@Param('junakId') junakId: string, @Body() dto: CreateRemarkDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(junakId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('junakId') junakId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRemarkDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(junakId, id, dto, user);
  }

  @Delete(':id')
  remove(@Param('junakId') junakId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(junakId, id, user);
  }
}
```

`apps/api/src/junak-history/junak-past-positions.controller.ts`:

```ts
import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JunakPastPositionsService } from './junak-past-positions.service';
import { CreatePastPositionDto } from './dto/create-past-position.dto';
import { UpdatePastPositionDto } from './dto/update-past-position.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/:junakId/past-positions')
export class JunakPastPositionsController {
  constructor(private readonly service: JunakPastPositionsService) {}

  @Post()
  create(@Param('junakId') junakId: string, @Body() dto: CreatePastPositionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(junakId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('junakId') junakId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePastPositionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(junakId, id, dto, user);
  }

  @Delete(':id')
  remove(@Param('junakId') junakId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(junakId, id, user);
  }
}
```

`apps/api/src/junak-history/junak-history.controller.ts`:

```ts
import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JunakHistoryService } from './junak-history.service';
import { UpdateHistoryDatesDto } from './dto/update-history-dates.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/:junakId/history')
export class JunakHistoryController {
  constructor(private readonly service: JunakHistoryService) {}

  @Patch('dates')
  updateDates(@Param('junakId') junakId: string, @Body() dto: UpdateHistoryDatesDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateDates(junakId, dto, user);
  }
}
```

`apps/api/src/junak-history/junak-history.module.ts` — повний вміст:

```ts
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { JunakSkillsController } from './junak-skills.controller';
import { JunakSkillsService } from './junak-skills.service';
import { JunakVfvController } from './junak-vfv.controller';
import { JunakVfvService } from './junak-vfv.service';
import { JunakCampsController } from './junak-camps.controller';
import { JunakCampsService } from './junak-camps.service';
import { JunakRemarksController } from './junak-remarks.controller';
import { JunakRemarksService } from './junak-remarks.service';
import { JunakPastPositionsController } from './junak-past-positions.controller';
import { JunakPastPositionsService } from './junak-past-positions.service';
import { JunakHistoryController } from './junak-history.controller';
import { JunakHistoryService } from './junak-history.service';

@Module({
  imports: [UsersModule],
  controllers: [
    JunakSkillsController,
    JunakVfvController,
    JunakCampsController,
    JunakRemarksController,
    JunakPastPositionsController,
    JunakHistoryController,
  ],
  providers: [
    JunakSkillsService,
    JunakVfvService,
    JunakCampsService,
    JunakRemarksService,
    JunakPastPositionsService,
    JunakHistoryService,
  ],
})
export class JunakHistoryModule {}
```

- [ ] **Step 5: Запустити — PASS**

`test/junak-remarks-positions.e2e-spec.ts` → зелені; `npx tsc --noEmit -p tsconfig.json`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/junak-history apps/api/test/junak-remarks-positions.e2e-spec.ts
git commit -m "feat(api): remarks with required how-to-fix for warnings, past positions, UPYU and oath dates"
```

---

### Task 10: Агрегат `GET /users/:junakId/history` (з поточними й знятими посадами)

**Files:**
- Modify: `apps/api/src/junak-history/junak-history.views.ts` — `JunakPositionView`, `JunakHistoryView`
- Modify: `apps/api/src/junak-history/junak-history.service.ts` — `get`, конструктор + `UsersService`
- Modify: `apps/api/src/junak-history/junak-history.controller.ts` — `@Get()`
- Test: `apps/api/test/junak-history.e2e-spec.ts`

**Interfaces:**
- Consumes: усі views і моделі задач 5, 8, 9; `loadJunakForRead`, `canWriteJunakHistory`; `KurinPosition` (`positionType`, `scope`, `hurtok.name`, `assignedAt`, `removedAt`).
- Produces:
  - `interface JunakPositionView { id; positionType: PositionType; scope: PositionScope; hurtokName: string | null; assignedAt: string /* ISO */; removedAt: string | null }`.
  - `interface JunakHistoryView { canEdit: boolean; upyJoinedAt: string | null; plastOathAt: string | null; skills: JunakSkillView[]; vfv: JunakVfvView[]; camps: JunakCampView[]; remarks: JunakRemarkView[]; pastPositions: JunakPastPositionView[]; positions: JunakPositionView[] }`.
  - HTTP `GET /users/:junakId/history` → `JunakHistoryView`. Порядок: skills — за `achievedAt` спадно; vfv — за `achievedAt` спадно (без дати — в кінці); camps і pastPositions — за `yearFrom` спадно; remarks — за `date` спадно; positions — за `assignedAt` спадно (поточні й зняті, лише цього куреня).

- [ ] **Step 1: Падаючий e2e**

`apps/api/test/junak-history.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PositionScope, PositionType, PrismaClient, Role } from '@prisma/client';
import { bootApp } from './utils/boot-app';
import { cleanDatabase } from './utils/clean-db';
import { createKurinSuddiaUser, createSkill, issueTokenFor } from './utils/fixtures';
import { createHistoryWorld } from './utils/history-fixtures';

describe('GET /users/:junakId/history — aggregate (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    ({ app, jwtService } = await bootApp());
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function setupWithHistory() {
    const w = await createHistoryWorld(prisma);
    const token = (user: { id: string; role: Role; kurinId: string }) => issueTokenFor(jwtService, user);
    const zv = token(w.zvyazkovyi);
    const skill = await createSkill(prisma, { name: 'Картографія', levels: [2] });
    const post = (path: string, body: object) => http().post(`/users/${w.junak.id}/${path}`).set(auth(zv)).send(body).expect(201);
    await post('skills', { levelId: skill.levels[0].id, achievedAt: '2025-05-01' });
    await post('vfv', { note: 'без дати' });
    await post('vfv', { achievedAt: '2024-06-01' });
    await post('camps', { name: 'Вовча тропа', yearFrom: 2021, yearTo: 2022, role: 'PARTICIPANT' });
    await post('camps', { name: 'Говерла', yearFrom: 2024, role: 'PROVID' });
    await post('remarks', { kind: 'AWARD', text: 'Найкращий табірник', date: '2024-08-01' });
    await post('remarks', { kind: 'WARNING', text: 'Запізнення', howToFix: 'Приходити вчасно', date: '2025-03-10' });
    await post('past-positions', { title: 'Скарбник гуртка', scope: 'HURTOK', yearFrom: 2018, yearTo: 2019 });
    await http().patch(`/users/${w.junak.id}/history/dates`).set(auth(zv)).send({ upyJoinedAt: '2018-09-01', plastOathAt: '2019-02-22' }).expect(200);
    await prisma.kurinPosition.create({
      data: {
        kurinId: w.kurin.id,
        hurtokId: w.hurtokA.id,
        scope: PositionScope.HURTOK,
        positionType: PositionType.HURTKOVYI,
        userId: w.junak.id,
        assignedById: w.zvyazkovyi.id,
        assignedAt: new Date('2023-09-01T10:00:00.000Z'),
        removedAt: new Date('2024-09-01T10:00:00.000Z'),
        removedById: w.zvyazkovyi.id,
      },
    });
    await prisma.kurinPosition.create({
      data: {
        kurinId: w.kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.PYSAR,
        userId: w.junak.id,
        assignedById: w.zvyazkovyi.id,
        assignedAt: new Date('2025-01-15T10:00:00.000Z'),
      },
    });
    return { ...w, token };
  }

  it('returns every section, sorted, with current and removed positions', async () => {
    const w = await setupWithHistory();
    const res = await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(w.zvyazkovyi))).expect(200);
    expect(res.body).toMatchObject({ canEdit: true, upyJoinedAt: '2018-09-01', plastOathAt: '2019-02-22' });
    expect(res.body.skills).toEqual([expect.objectContaining({ skillName: 'Картографія', level: 2, achievedAt: '2025-05-01' })]);
    expect(res.body.vfv.map((v: { achievedAt: string | null }) => v.achievedAt)).toEqual(['2024-06-01', null]);
    expect(res.body.camps.map((c: { name: string }) => c.name)).toEqual(['Говерла', 'Вовча тропа']);
    expect(res.body.remarks.map((r: { kind: string }) => r.kind)).toEqual(['WARNING', 'AWARD']);
    expect(res.body.pastPositions).toEqual([
      { id: expect.any(String), title: 'Скарбник гуртка', scope: 'HURTOK', yearFrom: 2018, yearTo: 2019 },
    ]);
    expect(res.body.positions).toEqual([
      {
        id: expect.any(String),
        positionType: 'PYSAR',
        scope: 'KURIN',
        hurtokName: null,
        assignedAt: '2025-01-15T10:00:00.000Z',
        removedAt: null,
      },
      {
        id: expect.any(String),
        positionType: 'HURTKOVYI',
        scope: 'HURTOK',
        hurtokName: 'Орлики',
        assignedAt: '2023-09-01T10:00:00.000Z',
        removedAt: '2024-09-01T10:00:00.000Z',
      },
    ]);
  });

  it('shows the junak his own history read-only, warnings included in full', async () => {
    const w = await setupWithHistory();
    const res = await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(w.junak))).expect(200);
    expect(res.body.canEdit).toBe(false);
    expect(res.body.remarks[0]).toMatchObject({ kind: 'WARNING', text: 'Запізнення', howToFix: 'Приходити вчасно', date: '2025-03-10' });
  });

  it('follows profile visibility: own vykhovnyk and suddia read, others get 404', async () => {
    const w = await setupWithHistory();
    expect((await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(w.vykhovnykA))).expect(200)).body.canEdit).toBe(true);
    const suddia = await createKurinSuddiaUser(prisma, { kurinId: w.kurin.id });
    expect((await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(suddia))).expect(200)).body.canEdit).toBe(false);
    await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(w.vykhovnykB))).expect(404);
    await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(w.junakNoHurtok))).expect(404);
    await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(w.otherZvyazkovyi))).expect(404);
    await http().get(`/users/${w.zvyazkovyi.id}/history`).set(auth(w.token(w.zvyazkovyi))).expect(404);
  });

  it('returns an empty history for a junak with nothing recorded, read-only once archived', async () => {
    const w = await createHistoryWorld(prisma);
    await prisma.user.update({ where: { id: w.junakNoHurtok.id }, data: { archivedAt: new Date() } });
    const res = await http()
      .get(`/users/${w.junakNoHurtok.id}/history`)
      .set(auth(issueTokenFor(jwtService, w.zvyazkovyi)))
      .expect(200);
    expect(res.body).toEqual({
      canEdit: false,
      upyJoinedAt: null,
      plastOathAt: null,
      skills: [],
      vfv: [],
      camps: [],
      remarks: [],
      pastPositions: [],
      positions: [],
    });
  });
});
```

Run: `test/junak-history.e2e-spec.ts`. Expected: FAIL — `GET /users/:id/history` → 404 на всіх кейсах (маршрут лише `PATCH dates`).

- [ ] **Step 2: Views агрегату**

В `apps/api/src/junak-history/junak-history.views.ts` додати до імпорту `PositionType` і в кінець:

```ts
export interface JunakPositionView {
  id: string;
  positionType: PositionType;
  scope: PositionScope;
  hurtokName: string | null;
  assignedAt: string;
  removedAt: string | null;
}

export interface JunakHistoryView {
  canEdit: boolean;
  upyJoinedAt: string | null;
  plastOathAt: string | null;
  skills: JunakSkillView[];
  vfv: JunakVfvView[];
  camps: JunakCampView[];
  remarks: JunakRemarkView[];
  pastPositions: JunakPastPositionView[];
  positions: JunakPositionView[];
}
```

- [ ] **Step 3: `get` у сервісі й маршрут**

`apps/api/src/junak-history/junak-history.service.ts` — повний вміст:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { UsersService } from '../users/users.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { canWriteJunakHistory, loadJunakForRead, loadJunakForWrite } from './junak-history-access';
import { patchHistoryDate } from './history-input.util';
import {
  HistoryDatesView,
  JUNAK_SKILL_INCLUDE,
  JunakHistoryView,
  isoDate,
  toCampView,
  toJunakSkillView,
  toPastPositionView,
  toRemarkView,
  toVfvView,
} from './junak-history.views';
import { UpdateHistoryDatesDto } from './dto/update-history-dates.dto';

@Injectable()
export class JunakHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
  ) {}

  async get(junakId: string, actor: CurrentUserPayload): Promise<JunakHistoryView> {
    const junak = await loadJunakForRead(this.usersService, junakId, actor);
    const [dates, skills, vfv, camps, remarks, pastPositions, positions] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: junakId }, select: { upyJoinedAt: true, plastOathAt: true } }),
      this.prisma.junakSkill.findMany({
        where: { junakId },
        include: JUNAK_SKILL_INCLUDE,
        orderBy: [{ achievedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.junakVfv.findMany({
        where: { junakId },
        orderBy: [{ achievedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      }),
      this.prisma.junakCamp.findMany({ where: { junakId }, orderBy: [{ yearFrom: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.junakRemark.findMany({ where: { junakId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.junakPastPosition.findMany({ where: { junakId }, orderBy: [{ yearFrom: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.kurinPosition.findMany({
        where: { userId: junakId, kurinId: junak.kurinId },
        include: { hurtok: { select: { name: true } } },
        orderBy: { assignedAt: 'desc' },
      }),
    ]);
    return {
      canEdit: await canWriteJunakHistory(this.prisma, junak, actor),
      upyJoinedAt: isoDate(dates.upyJoinedAt),
      plastOathAt: isoDate(dates.plastOathAt),
      skills: skills.map(toJunakSkillView),
      vfv: vfv.map(toVfvView),
      camps: camps.map(toCampView),
      remarks: remarks.map(toRemarkView),
      pastPositions: pastPositions.map(toPastPositionView),
      positions: positions.map((p) => ({
        id: p.id,
        positionType: p.positionType,
        scope: p.scope,
        hurtokName: p.hurtok?.name ?? null,
        assignedAt: p.assignedAt.toISOString(),
        removedAt: p.removedAt ? p.removedAt.toISOString() : null,
      })),
    };
  }

  async updateDates(junakId: string, dto: UpdateHistoryDatesDto, actor: CurrentUserPayload): Promise<HistoryDatesView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    if (dto.upyJoinedAt === undefined && dto.plastOathAt === undefined) {
      throw new BadRequestException('Немає що змінювати');
    }
    const updated = await this.prisma.user.update({
      where: { id: junakId },
      data: { upyJoinedAt: patchHistoryDate(dto.upyJoinedAt), plastOathAt: patchHistoryDate(dto.plastOathAt) },
      select: { upyJoinedAt: true, plastOathAt: true },
    });
    await this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action: AuditAction.HISTORY_DATES_CHANGED,
      subjectUserId: junak.id,
      details: {
        subjectName: personLabel(junak),
        ...(dto.upyJoinedAt !== undefined ? { upyJoinedAt: dto.upyJoinedAt } : {}),
        ...(dto.plastOathAt !== undefined ? { plastOathAt: dto.plastOathAt } : {}),
      },
    });
    return { upyJoinedAt: isoDate(updated.upyJoinedAt), plastOathAt: isoDate(updated.plastOathAt) };
  }
}
```

У `apps/api/src/junak-history/junak-history.controller.ts`: імпорт `Get` з `@nestjs/common` і перед `@Patch('dates')`:

```ts
  @Get()
  get(@Param('junakId') junakId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.get(junakId, user);
  }
```

- [ ] **Step 4: Запустити — PASS + регресія API**

`test/junak-history.e2e-spec.ts` → зелені. Регресія: `test/junak-skills.e2e-spec.ts`, `test/junak-vfv-camps.e2e-spec.ts`, `test/junak-remarks-positions.e2e-spec.ts`, `test/skills.e2e-spec.ts`, `test/kurin-positions.e2e-spec.ts`, `test/audit-events-people.e2e-spec.ts`; `npx jest src --runInBand --forceExit`; `npx tsc --noEmit -p tsconfig.json`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/junak-history apps/api/test/junak-history.e2e-spec.ts
git commit -m "feat(api): junak history aggregate with current and removed kurin positions"
```

---

### Task 11: Повна «Історія» на основі агрегату: ВФВ і табори (перегляд + редагування)

**Files:**
- Modify: `apps/web/lib/types.ts` (додати типи хвилі B)
- Modify: `apps/web/lib/history-labels.ts` (`CAMP_ROLE_LABELS`, `formatYears`)
- Modify: `apps/web/lib/audit.ts` (`VFV_*`, `CAMP_*`)
- Modify: `apps/web/lib/queries/junak-history.ts` (`useJunakHistory`, хуки ВФВ і таборів; прибрати `useJunakSkills`)
- Create: `apps/web/components/junak-history/vfv-section.tsx`, `apps/web/components/junak-history/camps-section.tsx`
- Modify: `apps/web/components/junak-history.tsx` (перейти на агрегат)
- Test: `apps/web/e2e/junak-history.spec.ts`

**Interfaces:**
- Consumes: `GET /users/:junakId/history`, `POST|PATCH|DELETE /users/:junakId/vfv|camps` (задачі 8, 10); `HistoryCard`, `RowActions`, `DialogActions`, `EmptyText`, `formatDate`, `today` (задача 7); `postAs` (задача 6).
- Produces (використовує задача 12):
  - `lib/types.ts`: `type JunakActivityRole = 'PARTICIPANT' | 'PROVID'`; `interface JunakVfv { id; achievedAt: string | null; note: string | null }`; `interface JunakCamp { id; name; yearFrom: number; yearTo: number | null; role: JunakActivityRole }`; `type JunakRemarkKind = 'AWARD' | 'WARNING'`; `interface JunakRemark { id; kind; text; howToFix: string | null; date: string }`; `interface JunakPastPosition { id; title; scope: PositionScope; yearFrom: number; yearTo: number | null }`; `interface JunakPositionHistory { id; positionType: PositionType; scope: PositionScope; hurtokName: string | null; assignedAt: string; removedAt: string | null }`; `interface JunakHistory { canEdit; upyJoinedAt; plastOathAt; skills: JunakSkill[]; vfv; camps; remarks; pastPositions; positions }`.
  - `lib/history-labels.ts`: `CAMP_ROLE_LABELS: Record<JunakActivityRole, string>`, `formatYears(from: number, to: number | null): string`.
  - `lib/queries/junak-history.ts`: `useJunakHistory(junakId)` (key `['junak-history', junakId]`), `useAddVfv`, `useUpdateVfv`, `useRemoveVfv`, `useAddCamp`, `useUpdateCamp`, `useRemoveCamp`; типи `VfvInput`, `CampInput`.
  - `VfvSection({ junakId, entries, canEdit })` (`data-testid="history-vfv"`, кнопка «Додати ВФВ»), `CampsSection({ junakId, entries, canEdit })` (`data-testid="history-camps"`, «Додати табір», рядок «{назва}, {роки}, {роль}»).

- [ ] **Step 1: Падаючий Playwright**

`apps/web/e2e/junak-history.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';
import { postAs } from './helpers/history-seed';

async function seedJunak() {
  const { program } = await seedProbyProgram();
  const seeded = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const junak = await createOnboardedUserAs(token, {
    firstName: 'Іван',
    lastName: `Петренко${Date.now()}`,
    email: `junak-full-history-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  return { ...seeded, token, hurtok, junak };
}

test('junak sees VFV and camps read-only on /me', async ({ page }) => {
  const s = await seedJunak();
  await postAs(s.token, `/users/${s.junak.user.id}/camps`, { name: 'Вовча тропа', yearFrom: 2023, yearTo: 2024, role: 'PROVID' });
  await postAs(s.token, `/users/${s.junak.user.id}/vfv`, { achievedAt: '2024-06-01', note: 'Склав усі норми' });

  await loginAs(page, s.junak.email, s.junak.password);
  await page.goto('/me');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Історія' })).toBeVisible();
  await expect(main.getByTestId('history-camps')).toContainText('Вовча тропа, 2023–2024, провід');
  await expect(main.getByTestId('history-vfv')).toContainText('01.06.2024');
  await expect(main.getByTestId('history-vfv')).toContainText('Склав усі норми');
  await expect(main.getByRole('button', { name: /^Додати/ })).toHaveCount(0);
  await expect(main.getByRole('button', { name: /Змінити:|Видалити:/ })).toHaveCount(0);
});

test('zvyazkovyi adds a camp and a VFV record, edits and deletes the camp; the journal describes it', async ({ page }) => {
  const s = await seedJunak();
  await loginAs(page, s.zvyazkovyiEmail, s.zvyazkovyiPassword);
  await page.goto(`/users/${s.junak.user.id}`);

  const camps = page.getByTestId('history-camps');
  await expect(camps).toContainText('Таборів ще немає.');
  await camps.getByRole('button', { name: 'Додати табір' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва табору').fill('Говерла');
  await dialog.getByLabel('Рік початку').fill('2024');
  await dialog.getByLabel('Рік завершення (необовʼязково)').fill('2025');
  await dialog.getByLabel('Роль').selectOption('PROVID');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(camps).toContainText('Говерла, 2024–2025, провід');

  await camps.getByRole('button', { name: 'Змінити: Говерла' }).click();
  await dialog.getByLabel('Роль').selectOption('PARTICIPANT');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(camps).toContainText('Говерла, 2024–2025, учасник');

  const vfv = page.getByTestId('history-vfv');
  await vfv.getByRole('button', { name: 'Додати ВФВ' }).click();
  await dialog.getByLabel('Дата (необовʼязково)').fill('2025-06-14');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(vfv).toContainText('14.06.2025');

  page.once('dialog', (confirmDialog) => confirmDialog.accept());
  await camps.getByRole('button', { name: 'Видалити: Говерла' }).click();
  await expect(camps).toContainText('Таборів ще немає.');

  await page.goto('/audit-log');
  await expect(page.getByText(/Додав табір «Говерла» для/)).toBeVisible();
  await expect(page.getByText(/Видалив табір «Говерла» для/)).toBeVisible();
  await expect(page.getByText(/Додав запис ВФВ для/)).toBeVisible();
});
```

Run: `npx playwright test e2e/junak-history.spec.ts`. Expected: FAIL — немає `history-camps`.

- [ ] **Step 2: Типи, підписи, журнал**

В кінець `apps/web/lib/types.ts`:

```ts
export type JunakActivityRole = 'PARTICIPANT' | 'PROVID';

export interface JunakVfv {
  id: string;
  achievedAt: string | null;
  note: string | null;
}

export interface JunakCamp {
  id: string;
  name: string;
  yearFrom: number;
  yearTo: number | null;
  role: JunakActivityRole;
}

export type JunakRemarkKind = 'AWARD' | 'WARNING';

export interface JunakRemark {
  id: string;
  kind: JunakRemarkKind;
  text: string;
  howToFix: string | null;
  date: string;
}

export interface JunakPastPosition {
  id: string;
  title: string;
  scope: PositionScope;
  yearFrom: number;
  yearTo: number | null;
}

export interface JunakPositionHistory {
  id: string;
  positionType: PositionType;
  scope: PositionScope;
  hurtokName: string | null;
  assignedAt: string;
  removedAt: string | null;
}

export interface JunakHistory {
  canEdit: boolean;
  upyJoinedAt: string | null;
  plastOathAt: string | null;
  skills: JunakSkill[];
  vfv: JunakVfv[];
  camps: JunakCamp[];
  remarks: JunakRemark[];
  pastPositions: JunakPastPosition[];
  positions: JunakPositionHistory[];
}
```

В `apps/web/lib/history-labels.ts` розширити імпорт (`import type { JunakActivityRole, SkillGroup } from '@/lib/types';`) і додати:

```ts
export const CAMP_ROLE_LABELS: Record<JunakActivityRole, string> = {
  PARTICIPANT: 'учасник',
  PROVID: 'провід',
};

/** 2021–2024; a single year when there is no (or the same) end year. */
export function formatYears(from: number, to: number | null): string {
  return to !== null && to !== from ? `${from}–${to}` : `${from}`;
}
```

У `apps/web/lib/audit.ts` перед `default:`:

```ts
    case 'VFV_ADDED':
      return `Додав запис ВФВ для ${s(d, 'subjectName')}`;
    case 'VFV_UPDATED':
      return `Змінив запис ВФВ для ${s(d, 'subjectName')}`;
    case 'VFV_REMOVED':
      return `Видалив запис ВФВ для ${s(d, 'subjectName')}`;
    case 'CAMP_ADDED':
      return `Додав табір «${s(d, 'campName')}» для ${s(d, 'subjectName')}`;
    case 'CAMP_UPDATED':
      return `Змінив табір «${s(d, 'campName')}» для ${s(d, 'subjectName')}`;
    case 'CAMP_REMOVED':
      return `Видалив табір «${s(d, 'campName')}» для ${s(d, 'subjectName')}`;
```

- [ ] **Step 3: Хуки**

У `apps/web/lib/queries/junak-history.ts`: прибрати функцію `useJunakSkills` (після цієї задачі її ніхто не використовує), розширити імпорт типів (`JunakCamp, JunakHistory, JunakSkill, JunakVfv, JunakActivityRole`) і додати:

```ts
export function useJunakHistory(junakId: string | undefined) {
  return useQuery({
    queryKey: ['junak-history', junakId],
    queryFn: () => apiFetch<JunakHistory>(`/users/${junakId}/history`),
    enabled: !!junakId,
  });
}

export interface VfvInput {
  achievedAt: string | null;
  note: string | null;
}

export function useAddVfv(junakId: string) {
  return useHistoryMutation(junakId, (dto: VfvInput) =>
    apiFetch<JunakVfv>(`/users/${junakId}/vfv`, { method: 'POST', body: JSON.stringify(dto) }),
  );
}

export function useUpdateVfv(junakId: string) {
  return useHistoryMutation(junakId, ({ id, ...dto }: VfvInput & { id: string }) =>
    apiFetch<JunakVfv>(`/users/${junakId}/vfv/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  );
}

export function useRemoveVfv(junakId: string) {
  return useHistoryMutation(junakId, (id: string) =>
    apiFetch<{ success: true }>(`/users/${junakId}/vfv/${id}`, { method: 'DELETE' }),
  );
}

export interface CampInput {
  name: string;
  yearFrom: number;
  yearTo: number | null;
  role: JunakActivityRole;
}

export function useAddCamp(junakId: string) {
  return useHistoryMutation(junakId, (dto: CampInput) =>
    apiFetch<JunakCamp>(`/users/${junakId}/camps`, { method: 'POST', body: JSON.stringify(dto) }),
  );
}

export function useUpdateCamp(junakId: string) {
  return useHistoryMutation(junakId, ({ id, ...dto }: CampInput & { id: string }) =>
    apiFetch<JunakCamp>(`/users/${junakId}/camps/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  );
}

export function useRemoveCamp(junakId: string) {
  return useHistoryMutation(junakId, (id: string) =>
    apiFetch<{ success: true }>(`/users/${junakId}/camps/${id}`, { method: 'DELETE' }),
  );
}
```

(`JunakSkills` з імпорту прибрати, якщо він більше не використовується.)

- [ ] **Step 4: Секції ВФВ і таборів**

`apps/web/components/junak-history/vfv-section.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddVfv, useRemoveVfv, useUpdateVfv } from '@/lib/queries/junak-history';
import { mutationErrorText } from '@/lib/error-message';
import type { JunakVfv } from '@/lib/types';
import { DialogActions, EmptyText, HistoryCard, RowActions, formatDate, today } from './shared';

export function VfvSection({ junakId, entries, canEdit }: { junakId: string; entries: JunakVfv[]; canEdit: boolean }) {
  const [dialog, setDialog] = useState<{ entry: JunakVfv | null } | null>(null);
  const remove = useRemoveVfv(junakId);
  return (
    <HistoryCard
      title="ВФВ"
      testId="history-vfv"
      addLabel="Додати ВФВ"
      onAdd={canEdit ? () => setDialog({ entry: null }) : undefined}
    >
      {entries.length === 0 ? (
        <EmptyText>Записів про ВФВ ще немає.</EmptyText>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const dateLabel = entry.achievedAt ? formatDate(entry.achievedAt) : 'Дата не вказана';
            return (
              <li key={entry.id} className="flex items-start justify-between gap-2">
                <span>
                  <span className="font-medium">{dateLabel}</span>
                  {entry.note && <span className="block text-muted-foreground">{entry.note}</span>}
                </span>
                {canEdit && (
                  <RowActions
                    label={`ВФВ, ${dateLabel}`}
                    onEdit={() => setDialog({ entry })}
                    onDelete={() => remove.mutate(entry.id)}
                    disabled={remove.isPending}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {remove.isError && <p className="text-destructive">{mutationErrorText(remove.error, 'Не вдалося видалити запис.')}</p>}
      {dialog && <VfvDialog junakId={junakId} entry={dialog.entry} onClose={() => setDialog(null)} />}
    </HistoryCard>
  );
}

function VfvDialog({ junakId, entry, onClose }: { junakId: string; entry: JunakVfv | null; onClose: () => void }) {
  const add = useAddVfv(junakId);
  const update = useUpdateVfv(junakId);
  const mutation = entry ? update : add;
  const [achievedAt, setAchievedAt] = useState(entry?.achievedAt ?? '');
  const [note, setNote] = useState(entry?.note ?? '');

  function submit() {
    const dto = { achievedAt: achievedAt || null, note: note.trim() || null };
    if (entry) update.mutate({ id: entry.id, ...dto }, { onSuccess: onClose });
    else add.mutate(dto, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{entry ? 'Змінити запис ВФВ' : 'Додати ВФВ'}</DialogTitle>
        <div className="space-y-2">
          <Label htmlFor="vfv-date">Дата (необовʼязково)</Label>
          <Input id="vfv-date" type="date" max={today()} value={achievedAt} onChange={(e) => setAchievedAt(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vfv-note">Примітка (необовʼязково)</Label>
          <Input id="vfv-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>
        {mutation.isError && (
          <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти запис.')}</p>
        )}
        <DialogActions onCancel={onClose} onSubmit={submit} disabled={mutation.isPending} />
      </DialogContent>
    </Dialog>
  );
}
```

`apps/web/components/junak-history/camps-section.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddCamp, useRemoveCamp, useUpdateCamp } from '@/lib/queries/junak-history';
import { mutationErrorText } from '@/lib/error-message';
import { CAMP_ROLE_LABELS, formatYears } from '@/lib/history-labels';
import type { JunakActivityRole, JunakCamp } from '@/lib/types';
import { DialogActions, EmptyText, HistoryCard, RowActions } from './shared';

export function CampsSection({ junakId, entries, canEdit }: { junakId: string; entries: JunakCamp[]; canEdit: boolean }) {
  const [dialog, setDialog] = useState<{ entry: JunakCamp | null } | null>(null);
  const remove = useRemoveCamp(junakId);
  return (
    <HistoryCard
      title="Табори"
      testId="history-camps"
      addLabel="Додати табір"
      onAdd={canEdit ? () => setDialog({ entry: null }) : undefined}
    >
      {entries.length === 0 ? (
        <EmptyText>Таборів ще немає.</EmptyText>
      ) : (
        <ul className="space-y-2">
          {entries.map((camp) => (
            <li key={camp.id} className="flex items-center justify-between gap-2">
              <span>
                {camp.name}, {formatYears(camp.yearFrom, camp.yearTo)}, {CAMP_ROLE_LABELS[camp.role]}
              </span>
              {canEdit && (
                <RowActions
                  label={camp.name}
                  onEdit={() => setDialog({ entry: camp })}
                  onDelete={() => remove.mutate(camp.id)}
                  disabled={remove.isPending}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.isError && <p className="text-destructive">{mutationErrorText(remove.error, 'Не вдалося видалити табір.')}</p>}
      {dialog && <CampDialog junakId={junakId} entry={dialog.entry} onClose={() => setDialog(null)} />}
    </HistoryCard>
  );
}

function CampDialog({ junakId, entry, onClose }: { junakId: string; entry: JunakCamp | null; onClose: () => void }) {
  const add = useAddCamp(junakId);
  const update = useUpdateCamp(junakId);
  const mutation = entry ? update : add;
  const currentYear = new Date().getFullYear();
  const [name, setName] = useState(entry?.name ?? '');
  const [yearFrom, setYearFrom] = useState(entry ? String(entry.yearFrom) : String(currentYear));
  const [yearTo, setYearTo] = useState(entry?.yearTo ? String(entry.yearTo) : '');
  const [role, setRole] = useState<JunakActivityRole>(entry?.role ?? 'PARTICIPANT');

  function submit() {
    const dto = { name: name.trim(), yearFrom: Number(yearFrom), yearTo: yearTo ? Number(yearTo) : null, role };
    if (entry) update.mutate({ id: entry.id, ...dto }, { onSuccess: onClose });
    else add.mutate(dto, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{entry ? 'Змінити табір' : 'Додати табір'}</DialogTitle>
        <div className="space-y-2">
          <Label htmlFor="camp-name">Назва табору</Label>
          <Input id="camp-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="camp-year-from">Рік початку</Label>
            <Input
              id="camp-year-from"
              type="number"
              inputMode="numeric"
              min={1990}
              max={currentYear}
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="camp-year-to">Рік завершення (необовʼязково)</Label>
            <Input
              id="camp-year-to"
              type="number"
              inputMode="numeric"
              min={1990}
              max={currentYear}
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="camp-role">Роль</Label>
          <select
            id="camp-role"
            value={role}
            onChange={(e) => setRole(e.target.value as JunakActivityRole)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="PARTICIPANT">Учасник</option>
            <option value="PROVID">Провід</option>
          </select>
        </div>
        {mutation.isError && (
          <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти табір.')}</p>
        )}
        <DialogActions onCancel={onClose} onSubmit={submit} disabled={!name.trim() || !yearFrom || mutation.isPending} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Контейнер на агрегаті**

`apps/web/components/junak-history.tsx` — повний вміст:

```tsx
'use client';

import { useJunakHistory } from '@/lib/queries/junak-history';
import { accessErrorMessage } from '@/lib/error-message';
import { SkillsSection } from '@/components/junak-history/skills-section';
import { VfvSection } from '@/components/junak-history/vfv-section';
import { CampsSection } from '@/components/junak-history/camps-section';

/**
 * «Історія» юнака. Хто може редагувати, вирішує бекенд (`canEdit`): звʼязковий
 * або виховник гуртка юнака. `readOnly` примусово вимикає редагування (/me).
 */
export function JunakHistory({ junakId, readOnly = false }: { junakId: string; readOnly?: boolean }) {
  const { data, isError, error } = useJunakHistory(junakId);
  const canEdit = !!data?.canEdit && !readOnly;
  return (
    <section className="space-y-3" aria-labelledby="junak-history-title">
      <h2 id="junak-history-title" className="text-lg font-semibold">
        Історія
      </h2>
      {isError && <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження історії.'}</p>}
      {data && (
        <>
          <SkillsSection junakId={junakId} skills={data.skills} canEdit={canEdit} />
          <VfvSection junakId={junakId} entries={data.vfv} canEdit={canEdit} />
          <CampsSection junakId={junakId} entries={data.camps} canEdit={canEdit} />
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Запустити — PASS + регресія**

`npx playwright test e2e/junak-history.spec.ts e2e/junak-history-skills.spec.ts e2e/me-page.spec.ts` → зелені; `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/history-labels.ts apps/web/lib/audit.ts apps/web/lib/queries/junak-history.ts apps/web/components/junak-history.tsx apps/web/components/junak-history/vfv-section.tsx apps/web/components/junak-history/camps-section.tsx apps/web/e2e/junak-history.spec.ts
git commit -m "feat(web): junak history on the aggregate endpoint with VFV and camps"
```

---

### Task 12: Відзначення й перестороги, діловодство, дати вступу й присяги в інтерфейсі; беклог

**Files:**
- Modify: `apps/web/lib/history-labels.ts` (`REMARK_KIND_LABELS`, `POSITION_SCOPE_LABELS`)
- Modify: `apps/web/lib/audit.ts` (`REMARK_*`, `PAST_POSITION_*`, `HISTORY_DATES_CHANGED`)
- Modify: `apps/web/lib/queries/junak-history.ts` (хуки відзначень, архіву, дат)
- Create: `apps/web/components/junak-history/remarks-section.tsx`, `dilovodstvo-section.tsx`, `dates-section.tsx`
- Modify: `apps/web/components/junak-history.tsx`
- Modify: `apps/web/app/me/page.tsx` (картка «Діловодство» — лише не для юнака)
- Modify: `docs/backlog.md`
- Test: `apps/web/e2e/junak-history.spec.ts` (додати тести)

**Interfaces:**
- Consumes: `POST|PATCH|DELETE /users/:junakId/remarks|past-positions`, `PATCH /users/:junakId/history/dates` (задача 9); `JunakHistory.positions` (задача 10); `POSITION_LABELS` (`lib/role-labels.ts`); спільні компоненти задачі 7; `assignVykhovnyk`, `postAs`.
- Produces: `RemarksSection({ junakId, entries, canEdit })` (`data-testid="history-remarks"`, кнопка «Додати запис», рядки `data-testid="history-remark"`); `DilovodstvoSection({ junakId, positions, pastPositions, canEdit })` (`data-testid="history-dilovodstvo"`, «Додати посаду»); `DatesSection({ junakId, upyJoinedAt, plastOathAt, canEdit })` (`data-testid="history-dates"`, «Змінити дати»); хуки `useAddRemark`, `useUpdateRemark`, `useRemoveRemark`, `useAddPastPosition`, `useUpdatePastPosition`, `useRemovePastPosition`, `useUpdateHistoryDates`; типи `RemarkInput`, `RemarkPatch`, `PastPositionInput`, `HistoryDatesInput`.

- [ ] **Step 1: Падаючі Playwright-тести**

У `apps/web/e2e/junak-history.spec.ts` розширити імпорт `./helpers/proby-seed` (`assignVykhovnyk, createHurtok, createOnboardedUserAs, loginForToken`) і додати:

```ts
test('zvyazkovyi records a warning (both fields required), an award, an archive position and dates; the junak sees all of it', async ({ page }) => {
  const s = await seedJunak();
  await postAs(s.token, '/kurin-positions', {
    userId: s.junak.user.id,
    scope: 'HURTOK',
    positionType: 'HURTKOVYI',
    hurtokId: s.hurtok.id,
  });
  await loginAs(page, s.zvyazkovyiEmail, s.zvyazkovyiPassword);
  await page.goto(`/users/${s.junak.user.id}`);
  const dialog = page.getByRole('dialog');

  const remarks = page.getByTestId('history-remarks');
  await remarks.getByRole('button', { name: 'Додати запис' }).click();
  await dialog.getByLabel('Тип').selectOption('WARNING');
  await dialog.getByLabel('Дата').fill('2025-03-10');
  await dialog.getByLabel('За що').fill('Запізнився на три сходини поспіль');
  await expect(dialog.getByRole('button', { name: 'Зберегти' })).toBeDisabled();
  await dialog.getByLabel('Як виправити').fill('Відвідати наступні чотири сходини вчасно');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toHaveCount(0);

  await remarks.getByRole('button', { name: 'Додати запис' }).click();
  await dialog.getByLabel('Тип').selectOption('AWARD');
  await expect(dialog.getByLabel('Як виправити')).toHaveCount(0);
  await dialog.getByLabel('Дата').fill('2024-08-01');
  await dialog.getByLabel('За що').fill('Найкращий табірник');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(remarks.getByTestId('history-remark')).toHaveCount(2);
  await expect(remarks.getByTestId('history-remark').first()).toContainText('Пересторога');

  const dilovodstvo = page.getByTestId('history-dilovodstvo');
  await dilovodstvo.getByRole('button', { name: 'Додати посаду' }).click();
  await dialog.getByLabel('Посада').fill('Скарбник гуртка');
  await dialog.getByLabel('Де').selectOption('HURTOK');
  await dialog.getByLabel('Рік початку').fill('2019');
  await dialog.getByLabel('Рік завершення (необовʼязково)').fill('2021');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dilovodstvo).toContainText('Скарбник гуртка');
  await expect(dilovodstvo).toContainText('до застосунку');
  await expect(dilovodstvo).toContainText('Гуртковий');
  await expect(dilovodstvo).toContainText('зараз');

  const dates = page.getByTestId('history-dates');
  await dates.getByRole('button', { name: 'Змінити дати' }).click();
  await dialog.getByLabel('Дата вступу до УПЮ').fill('2018-09-01');
  await dialog.getByLabel('Дата пластової присяги').fill('2019-02-22');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dates).toContainText('01.09.2018');
  await expect(dates).toContainText('22.02.2019');

  await page.goto('/audit-log');
  await expect(page.getByText(/Додав пересторогу для .* \(від 2025-03-10\)/)).toBeVisible();
  await expect(page.getByText('Запізнився на три сходини поспіль')).toHaveCount(0);
  await expect(page.getByText(/Додав до архіву діловодства посаду «Скарбник гуртка»/)).toBeVisible();
  await expect(page.getByText(/Змінив дати вступу до УПЮ та пластової присяги/)).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, s.junak.email, s.junak.password);
  await page.goto('/me');
  const ownRemarks = page.getByTestId('history-remarks');
  await expect(ownRemarks).toContainText('Запізнився на три сходини поспіль');
  await expect(ownRemarks).toContainText('Відвідати наступні чотири сходини вчасно');
  await expect(page.getByTestId('history-dilovodstvo')).toContainText('Скарбник гуртка');
  await expect(page.getByTestId('history-dates')).toContainText('22.02.2019');
  await expect(page.getByRole('main').getByRole('button', { name: /^Додати|^Змінити/ })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/junak-history-me.png', fullPage: true });
});

test('vykhovnyk sees history edit buttons only for junaks of own hurtok', async ({ page }) => {
  const s = await seedJunak();
  const vykhovnyk = await createOnboardedUserAs(s.token, {
    firstName: 'Марія',
    lastName: `Мельник${Date.now()}`,
    email: `vykhovnyk-full-history-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });
  await assignVykhovnyk(s.token, vykhovnyk.user.id, s.hurtok.id);
  const loner = await createOnboardedUserAs(s.token, {
    firstName: 'Петро',
    lastName: `Безгуртковий${Date.now()}`,
    email: `junak-loner-full-${Date.now()}@example.com`,
    role: 'JUNAK',
  });
  const editButtons = ['Додати вмілість', 'Додати ВФВ', 'Додати табір', 'Додати запис', 'Додати посаду', 'Змінити дати'];

  await loginAs(page, vykhovnyk.email, vykhovnyk.password);
  await page.goto(`/users/${s.junak.user.id}`);
  for (const name of editButtons) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }

  await page.goto(`/users/${loner.user.id}`);
  await expect(page.getByTestId('history-remarks')).toBeVisible();
  for (const name of editButtons) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
});
```

Run: `npx playwright test e2e/junak-history.spec.ts`. Expected: FAIL — немає `history-remarks`.

- [ ] **Step 2: Підписи, журнал, хуки**

У `apps/web/lib/history-labels.ts` розширити імпорт (`JunakActivityRole, JunakRemarkKind, PositionScope, SkillGroup`) і додати:

```ts
export const REMARK_KIND_LABELS: Record<JunakRemarkKind, string> = {
  AWARD: 'Відзначення',
  WARNING: 'Пересторога',
};

export const POSITION_SCOPE_LABELS: Record<PositionScope, string> = {
  KURIN: 'курінь',
  HURTOK: 'гурток',
};
```

У `apps/web/lib/audit.ts` після `SKILL_LEVEL_LABELS` додати `const REMARK_KIND_ACCUSATIVE: Record<string, string> = { AWARD: 'відзначення', WARNING: 'пересторогу' };` і перед `default:`:

```ts
    case 'REMARK_ADDED':
      return `Додав ${lookup(REMARK_KIND_ACCUSATIVE, s(d, 'kind'))} для ${s(d, 'subjectName')} (від ${s(d, 'date')})`;
    case 'REMARK_UPDATED':
      return `Змінив ${lookup(REMARK_KIND_ACCUSATIVE, s(d, 'kind'))} для ${s(d, 'subjectName')} (від ${s(d, 'date')})`;
    case 'REMARK_REMOVED':
      return `Видалив ${lookup(REMARK_KIND_ACCUSATIVE, s(d, 'kind'))} для ${s(d, 'subjectName')} (від ${s(d, 'date')})`;
    case 'PAST_POSITION_ADDED':
      return `Додав до архіву діловодства посаду «${s(d, 'title')}» для ${s(d, 'subjectName')}`;
    case 'PAST_POSITION_UPDATED':
      return `Змінив запис архіву діловодства «${s(d, 'title')}» для ${s(d, 'subjectName')}`;
    case 'PAST_POSITION_REMOVED':
      return `Видалив з архіву діловодства посаду «${s(d, 'title')}» для ${s(d, 'subjectName')}`;
    case 'HISTORY_DATES_CHANGED':
      return `Змінив дати вступу до УПЮ та пластової присяги для ${s(d, 'subjectName')}`;
```

У `apps/web/lib/queries/junak-history.ts` розширити імпорт типів (`JunakPastPosition, JunakRemark, JunakRemarkKind, PositionScope`) і додати:

```ts
export interface RemarkInput {
  kind: JunakRemarkKind;
  text: string;
  howToFix?: string;
  date: string;
}

export interface RemarkPatch {
  id: string;
  text: string;
  howToFix?: string;
  date: string;
}

export function useAddRemark(junakId: string) {
  return useHistoryMutation(junakId, (dto: RemarkInput) =>
    apiFetch<JunakRemark>(`/users/${junakId}/remarks`, { method: 'POST', body: JSON.stringify(dto) }),
  );
}

export function useUpdateRemark(junakId: string) {
  return useHistoryMutation(junakId, ({ id, ...dto }: RemarkPatch) =>
    apiFetch<JunakRemark>(`/users/${junakId}/remarks/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  );
}

export function useRemoveRemark(junakId: string) {
  return useHistoryMutation(junakId, (id: string) =>
    apiFetch<{ success: true }>(`/users/${junakId}/remarks/${id}`, { method: 'DELETE' }),
  );
}

export interface PastPositionInput {
  title: string;
  scope: PositionScope;
  yearFrom: number;
  yearTo: number | null;
}

export function useAddPastPosition(junakId: string) {
  return useHistoryMutation(junakId, (dto: PastPositionInput) =>
    apiFetch<JunakPastPosition>(`/users/${junakId}/past-positions`, { method: 'POST', body: JSON.stringify(dto) }),
  );
}

export function useUpdatePastPosition(junakId: string) {
  return useHistoryMutation(junakId, ({ id, ...dto }: PastPositionInput & { id: string }) =>
    apiFetch<JunakPastPosition>(`/users/${junakId}/past-positions/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  );
}

export function useRemovePastPosition(junakId: string) {
  return useHistoryMutation(junakId, (id: string) =>
    apiFetch<{ success: true }>(`/users/${junakId}/past-positions/${id}`, { method: 'DELETE' }),
  );
}

export interface HistoryDatesInput {
  upyJoinedAt: string | null;
  plastOathAt: string | null;
}

export function useUpdateHistoryDates(junakId: string) {
  return useHistoryMutation(junakId, (dto: HistoryDatesInput) =>
    apiFetch<HistoryDatesInput>(`/users/${junakId}/history/dates`, { method: 'PATCH', body: JSON.stringify(dto) }),
  );
}
```

- [ ] **Step 3: Секція «Відзначення та перестороги»**

`apps/web/components/junak-history/remarks-section.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddRemark, useRemoveRemark, useUpdateRemark } from '@/lib/queries/junak-history';
import { mutationErrorText } from '@/lib/error-message';
import { REMARK_KIND_LABELS } from '@/lib/history-labels';
import type { JunakRemark, JunakRemarkKind } from '@/lib/types';
import { DialogActions, EmptyText, HistoryCard, RowActions, formatDate, today } from './shared';

const TEXTAREA = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm';

export function RemarksSection({ junakId, entries, canEdit }: { junakId: string; entries: JunakRemark[]; canEdit: boolean }) {
  const [dialog, setDialog] = useState<{ entry: JunakRemark | null } | null>(null);
  const remove = useRemoveRemark(junakId);
  return (
    <HistoryCard
      title="Відзначення та перестороги"
      testId="history-remarks"
      addLabel="Додати запис"
      onAdd={canEdit ? () => setDialog({ entry: null }) : undefined}
    >
      {entries.length === 0 ? (
        <EmptyText>Відзначень і пересторог немає.</EmptyText>
      ) : (
        <ul className="space-y-3">
          {entries.map((remark) => (
            <li key={remark.id} className="space-y-1 border-b border-border pb-3 last:border-b-0 last:pb-0" data-testid="history-remark">
              <div className="flex items-start justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={remark.kind === 'WARNING' ? 'warning' : 'accent'}>{REMARK_KIND_LABELS[remark.kind]}</Badge>
                  <span className="text-muted-foreground">{formatDate(remark.date)}</span>
                </span>
                {canEdit && (
                  <RowActions
                    label={`${REMARK_KIND_LABELS[remark.kind]} від ${formatDate(remark.date)}`}
                    onEdit={() => setDialog({ entry: remark })}
                    onDelete={() => remove.mutate(remark.id)}
                    disabled={remove.isPending}
                  />
                )}
              </div>
              <p>
                <span className="text-muted-foreground">За що: </span>
                {remark.text}
              </p>
              {remark.kind === 'WARNING' && remark.howToFix && (
                <p>
                  <span className="text-muted-foreground">Як виправити: </span>
                  {remark.howToFix}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.isError && <p className="text-destructive">{mutationErrorText(remove.error, 'Не вдалося видалити запис.')}</p>}
      {dialog && <RemarkDialog junakId={junakId} entry={dialog.entry} onClose={() => setDialog(null)} />}
    </HistoryCard>
  );
}

function RemarkDialog({ junakId, entry, onClose }: { junakId: string; entry: JunakRemark | null; onClose: () => void }) {
  const add = useAddRemark(junakId);
  const update = useUpdateRemark(junakId);
  const mutation = entry ? update : add;
  const [kind, setKind] = useState<JunakRemarkKind>(entry?.kind ?? 'AWARD');
  const [date, setDate] = useState(entry?.date ?? today());
  const [text, setText] = useState(entry?.text ?? '');
  const [howToFix, setHowToFix] = useState(entry?.howToFix ?? '');
  const isWarning = kind === 'WARNING';
  const isValid = !!date && text.trim() !== '' && (!isWarning || howToFix.trim() !== '');

  function submit() {
    const fix = isWarning ? howToFix.trim() : undefined;
    if (entry) update.mutate({ id: entry.id, text: text.trim(), howToFix: fix, date }, { onSuccess: onClose });
    else add.mutate({ kind, text: text.trim(), howToFix: fix, date }, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{entry ? `Змінити: ${REMARK_KIND_LABELS[entry.kind].toLowerCase()}` : 'Відзначення або пересторога'}</DialogTitle>
        {!entry && (
          <div className="space-y-2">
            <Label htmlFor="remark-kind">Тип</Label>
            <select
              id="remark-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as JunakRemarkKind)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="AWARD">Відзначення</option>
              <option value="WARNING">Пересторога</option>
            </select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="remark-date">Дата</Label>
          <Input id="remark-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="remark-text">За що</Label>
          <textarea id="remark-text" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} className={TEXTAREA} />
        </div>
        {isWarning && (
          <div className="space-y-2">
            <Label htmlFor="remark-how-to-fix">Як виправити</Label>
            <textarea
              id="remark-how-to-fix"
              rows={3}
              maxLength={1000}
              value={howToFix}
              onChange={(e) => setHowToFix(e.target.value)}
              className={TEXTAREA}
            />
          </div>
        )}
        {mutation.isError && (
          <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти запис.')}</p>
        )}
        <DialogActions onCancel={onClose} onSubmit={submit} disabled={!isValid || mutation.isPending} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Секція «Діловодство» (поточні, зняті, старі записи — один список)**

`apps/web/components/junak-history/dilovodstvo-section.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddPastPosition, useRemovePastPosition, useUpdatePastPosition } from '@/lib/queries/junak-history';
import { mutationErrorText } from '@/lib/error-message';
import { POSITION_SCOPE_LABELS, formatYears } from '@/lib/history-labels';
import { POSITION_LABELS } from '@/lib/role-labels';
import type { JunakPastPosition, JunakPositionHistory, PositionScope } from '@/lib/types';
import { DialogActions, EmptyText, HistoryCard, RowActions } from './shared';

interface DilovodstvoRow {
  key: string;
  title: string;
  context: string;
  period: string;
  current: boolean;
  sortYear: number;
  past?: JunakPastPosition;
}

/** Current positions first, then everything else by start year, newest first. */
function buildRows(positions: JunakPositionHistory[], pastPositions: JunakPastPosition[]): DilovodstvoRow[] {
  const fromApp: DilovodstvoRow[] = positions.map((p) => {
    const from = new Date(p.assignedAt).getFullYear();
    return {
      key: p.id,
      title: POSITION_LABELS[p.positionType],
      context: p.scope === 'HURTOK' ? `гурток «${p.hurtokName ?? '—'}»` : 'курінь',
      period: `${from}–${p.removedAt ? new Date(p.removedAt).getFullYear() : 'дотепер'}`,
      current: p.removedAt === null,
      sortYear: from,
    };
  });
  const archived: DilovodstvoRow[] = pastPositions.map((p) => ({
    key: p.id,
    title: p.title,
    context: POSITION_SCOPE_LABELS[p.scope],
    period: formatYears(p.yearFrom, p.yearTo),
    current: false,
    sortYear: p.yearFrom,
    past: p,
  }));
  return [...fromApp, ...archived].sort((a, b) => Number(b.current) - Number(a.current) || b.sortYear - a.sortYear);
}

export function DilovodstvoSection({
  junakId,
  positions,
  pastPositions,
  canEdit,
}: {
  junakId: string;
  positions: JunakPositionHistory[];
  pastPositions: JunakPastPosition[];
  canEdit: boolean;
}) {
  const [dialog, setDialog] = useState<{ entry: JunakPastPosition | null } | null>(null);
  const remove = useRemovePastPosition(junakId);
  const rows = buildRows(positions, pastPositions);
  return (
    <HistoryCard
      title="Діловодство"
      testId="history-dilovodstvo"
      addLabel="Додати посаду"
      onAdd={canEdit ? () => setDialog({ entry: null }) : undefined}
    >
      {rows.length === 0 ? (
        <EmptyText>Посад ще не було.</EmptyText>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.title}</span>
                <span className="text-muted-foreground">
                  {row.context}, {row.period}
                </span>
                {row.current && <Badge>зараз</Badge>}
                {row.past && <Badge variant="neutral">до застосунку</Badge>}
              </span>
              {canEdit && row.past && (
                <RowActions
                  label={row.title}
                  onEdit={() => setDialog({ entry: row.past! })}
                  onDelete={() => remove.mutate(row.past!.id)}
                  disabled={remove.isPending}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.isError && <p className="text-destructive">{mutationErrorText(remove.error, 'Не вдалося видалити запис.')}</p>}
      {dialog && <PastPositionDialog junakId={junakId} entry={dialog.entry} onClose={() => setDialog(null)} />}
    </HistoryCard>
  );
}

function PastPositionDialog({ junakId, entry, onClose }: { junakId: string; entry: JunakPastPosition | null; onClose: () => void }) {
  const add = useAddPastPosition(junakId);
  const update = useUpdatePastPosition(junakId);
  const mutation = entry ? update : add;
  const currentYear = new Date().getFullYear();
  const [title, setTitle] = useState(entry?.title ?? '');
  const [scope, setScope] = useState<PositionScope>(entry?.scope ?? 'HURTOK');
  const [yearFrom, setYearFrom] = useState(entry ? String(entry.yearFrom) : '');
  const [yearTo, setYearTo] = useState(entry?.yearTo ? String(entry.yearTo) : '');

  function submit() {
    const dto = { title: title.trim(), scope, yearFrom: Number(yearFrom), yearTo: yearTo ? Number(yearTo) : null };
    if (entry) update.mutate({ id: entry.id, ...dto }, { onSuccess: onClose });
    else add.mutate(dto, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{entry ? 'Змінити запис архіву' : 'Посада до застосунку'}</DialogTitle>
        <div className="space-y-2">
          <Label htmlFor="past-position-title">Посада</Label>
          <Input
            id="past-position-title"
            placeholder="Гуртковий, курінний суддя…"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="past-position-scope">Де</Label>
          <select
            id="past-position-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as PositionScope)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="HURTOK">У гуртку</option>
            <option value="KURIN">У курені</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="past-position-year-from">Рік початку</Label>
            <Input
              id="past-position-year-from"
              type="number"
              inputMode="numeric"
              min={1990}
              max={currentYear}
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="past-position-year-to">Рік завершення (необовʼязково)</Label>
            <Input
              id="past-position-year-to"
              type="number"
              inputMode="numeric"
              min={1990}
              max={currentYear}
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
            />
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти запис.')}</p>
        )}
        <DialogActions onCancel={onClose} onSubmit={submit} disabled={!title.trim() || !yearFrom || mutation.isPending} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Секція «Вступ і присяга»**

`apps/web/components/junak-history/dates-section.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateHistoryDates } from '@/lib/queries/junak-history';
import { mutationErrorText } from '@/lib/error-message';
import { DialogActions, HistoryCard, formatDate, today } from './shared';

export function DatesSection({
  junakId,
  upyJoinedAt,
  plastOathAt,
  canEdit,
}: {
  junakId: string;
  upyJoinedAt: string | null;
  plastOathAt: string | null;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <HistoryCard
      title="Вступ і присяга"
      testId="history-dates"
      extra={
        canEdit ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Змінити дати
          </Button>
        ) : undefined
      }
    >
      <dl className="space-y-1">
        <div className="grid grid-cols-2 gap-3">
          <dt className="text-muted-foreground">Вступ до УПЮ</dt>
          <dd>{upyJoinedAt ? formatDate(upyJoinedAt) : '—'}</dd>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <dt className="text-muted-foreground">Пластова присяга</dt>
          <dd>{plastOathAt ? formatDate(plastOathAt) : '—'}</dd>
        </div>
      </dl>
      {open && (
        <DatesDialog junakId={junakId} upyJoinedAt={upyJoinedAt} plastOathAt={plastOathAt} onClose={() => setOpen(false)} />
      )}
    </HistoryCard>
  );
}

function DatesDialog({
  junakId,
  upyJoinedAt,
  plastOathAt,
  onClose,
}: {
  junakId: string;
  upyJoinedAt: string | null;
  plastOathAt: string | null;
  onClose: () => void;
}) {
  const update = useUpdateHistoryDates(junakId);
  const [joined, setJoined] = useState(upyJoinedAt ?? '');
  const [oath, setOath] = useState(plastOathAt ?? '');
  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>Дати вступу й присяги</DialogTitle>
        <p className="text-xs text-muted-foreground">Порожнє поле прибирає дату.</p>
        <div className="space-y-2">
          <Label htmlFor="history-upy-joined">Дата вступу до УПЮ</Label>
          <Input id="history-upy-joined" type="date" max={today()} value={joined} onChange={(e) => setJoined(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="history-plast-oath">Дата пластової присяги</Label>
          <Input id="history-plast-oath" type="date" max={today()} value={oath} onChange={(e) => setOath(e.target.value)} />
        </div>
        {update.isError && <p className="text-sm text-destructive">{mutationErrorText(update.error, 'Не вдалося зберегти дати.')}</p>}
        <DialogActions
          onCancel={onClose}
          onSubmit={() => update.mutate({ upyJoinedAt: joined || null, plastOathAt: oath || null }, { onSuccess: onClose })}
          disabled={update.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Контейнер і `/me`**

У `apps/web/components/junak-history.tsx` додати імпорти

```tsx
import { RemarksSection } from '@/components/junak-history/remarks-section';
import { DilovodstvoSection } from '@/components/junak-history/dilovodstvo-section';
import { DatesSection } from '@/components/junak-history/dates-section';
```

і замінити фрагмент `{data && (<>…</>)}` на:

```tsx
      {data && (
        <>
          <DatesSection junakId={junakId} upyJoinedAt={data.upyJoinedAt} plastOathAt={data.plastOathAt} canEdit={canEdit} />
          <SkillsSection junakId={junakId} skills={data.skills} canEdit={canEdit} />
          <VfvSection junakId={junakId} entries={data.vfv} canEdit={canEdit} />
          <CampsSection junakId={junakId} entries={data.camps} canEdit={canEdit} />
          <RemarksSection junakId={junakId} entries={data.remarks} canEdit={canEdit} />
          <DilovodstvoSection junakId={junakId} positions={data.positions} pastPositions={data.pastPositions} canEdit={canEdit} />
        </>
      )}
```

У `apps/web/app/me/page.tsx` картку `<Card>…<CardTitle>Діловодство</CardTitle>…</Card>` обгорнути умовою `{session.role !== 'JUNAK' && ( … )}` і над нею додати коментар `{/* Для юнака діловодство (поточне, зняте й до застосунку) показує секція «Історія». */}`. Рядок `const positions = …` і `positions.unshift(…)` лишаються (потрібні не-юнакам).

- [ ] **Step 7: Запустити — PASS + повна регресія фронтенду**

`npx playwright test e2e/junak-history.spec.ts e2e/junak-history-skills.spec.ts e2e/skills-catalog.spec.ts e2e/me-page.spec.ts e2e/users-detail.spec.ts e2e/guardian-contacts.spec.ts e2e/junak-degrees-and-contacts.spec.ts e2e/audit-log.spec.ts e2e/plastuvannia.spec.ts` → зелені; `npx tsc --noEmit`. Потім увесь набір `npx playwright test 2>&1 | tail -60` (фоном/з великим timeout) — допустимі лише відомі давні падіння з Global Constraints. Переглянути `test-results/junak-history-me.png` (не коміттити): бейдж «Пересторога» у токенах warning, «За що» / «Як виправити» читабельні на 375 px.

- [ ] **Step 8: Беклог і коміт**

У `docs/backlog.md`: заголовки `## 🔴 Історія юнака («послужний список»)`, `## 🔴 Архів діловодства (історія посад юнака)`, `## 🔴 Відзначення та перестороги`, `## 🔴 Табори (відбуті)` → `🟡`; у списку всередині «Історія юнака» пункти «Архів діловодства», «Відбуті табори», «Вмілості та іспити вмілостей, ВФВ», «Відзначення та перестороги» → `🟡`. Під описом «Історія юнака» додати:

```markdown
**Що зроблено (spec `docs/superpowers/specs/2026-10-29-junak-history-design.md`, хвилі A і B):**
секція «Історія» на `/users/[id]` (редагують звʼязковий і виховник гуртка юнака) та на `/me`
(лише перегляд): вступ до УПЮ і присяга, вмілості (каталог «Вмілості УПЮ» + власні),
ВФВ, табори, відзначення й перестороги (пересторога — «за що» + «як виправити», юнак
бачить повністю), діловодство (поточні й зняті посади + записи до застосунку);
агрегат `GET /users/:id/history`, події в «Журналі дій» без тексту пересторог.
Наступне — «Запит юнака на документ» / посвідка звільнення.
```

Під заголовком «Вмілості та іспити (ВФВ)» у блоці «Що зроблено» замінити «ВФВ — хвиля B.» на «ВФВ — хвиля B (зроблено).».

```bash
git add apps/web/lib/history-labels.ts apps/web/lib/audit.ts apps/web/lib/queries/junak-history.ts apps/web/components/junak-history.tsx apps/web/components/junak-history/remarks-section.tsx apps/web/components/junak-history/dilovodstvo-section.tsx apps/web/components/junak-history/dates-section.tsx apps/web/app/me/page.tsx apps/web/e2e/junak-history.spec.ts docs/backlog.md
git commit -m "feat(web): remarks, dilovodstvo archive and UPYU/oath dates in the junak history"
```

**Кінець хвилі B.** Деплой бекенду (міграція застосовується при старті контейнера як звичайно) і фронтенду; сид каталогу вже запущено після хвилі A.

---

## Self-Review

**1. Покриття spec (розділ → задача):**

| Розділ / вимога spec | Задача |
|---|---|
| Мета; рішення брейнштормінгу (вмілість = рівень проби; факт здобуття без прогресу вимог) | 1, 5, 7 |
| Модель даних: `SkillGroup`, `Skill`, `SkillLevel`, `JunakSkill` | 1 |
| Модель даних: `JunakVfv`, `JunakCamp`, `JunakRemark(Kind)`, `JunakPastPosition`, `upyJoinedAt`/`plastOathAt`, зворотні звʼязки, лише додавання | 8 |
| Частковий унікальний індекс глобальних назв | 1 (SQL + e2e + drift-перевірка), 8 (не дати Prisma його прибрати) |
| Каталог: джерело PDF не в репо, `skills-catalog.data.ts` + `.data.spec.ts` (9 груп, рівні 1–3, унікальність, непорожні вимоги, без дублів між групами) | 2 |
| Ручне вичитування (лещетарство, скульптура/різьбярство, опечатки, обірвані підпункти як є), «А або Б», «нова вмілість», передумови текстом | 2 |
| `seed-skills-catalog.ts` ідемпотентний, нічого не видаляє, не чіпає власні; запуск на проді вручну | 3 |
| Права: читання (`findScoped`), запис (звʼязковий / виховник гуртка; без гуртка — лише звʼязковий), архівовані — лише читання, ізоляція куренів | 5 (утиліта + e2e), 8–10 (e2e) |
| Права каталогу: читає будь-хто з куреня; власні — звʼязковий; видалення заблоковане при здобуттях; глобальні не змінюються | 4 |
| API: `GET/POST/PATCH/DELETE /skills` | 4 |
| API: `/users/:id/skills` | 5 |
| API: `/vfv`, `/camps` | 8 |
| API: `/remarks`, `/past-positions`, `PATCH …/history/dates` | 9 |
| API: агрегат `GET /users/:id/history` з `positions[]` (поточні й зняті `KurinPosition`) | 10 |
| DTO-валідація: роки 1990–поточний, `yearTo ≥ yearFrom`, дата не в майбутньому, довжини; WARNING — `text` і `howToFix` обовʼязкові, AWARD — без `howToFix` | 5, 8, 9 |
| Журнал: усі дії spec + `SKILL_UPDATED`, `VFV_UPDATED`; `AUDIT_GROUPS.PEOPLE`; `details` без тексту пересторог/відзначень | 1, 8 (enum/групи); 4, 5, 8, 9 (запис + e2e); 6, 7, 11, 12 (`describeAuditEvent` + Playwright на `/audit-log`) |
| UI: `/skills` (акордеон груп, вкладки рівнів, нумеровані вимоги, «Додати власну вмілість») + плитка «Вмілості» в хабі | 6 |
| UI: секція «Історія» на `/me` (перегляд) і `/users/[id]` (редагування): вмілості з пошуковим вибором | 7 |
| UI: ВФВ, табори («назва, 2021–2024, роль») | 11 |
| UI: відзначення та перестороги за датою (дві обовʼязкові поля для пересторог, юнак бачить усе), діловодство одним відсортованим списком, дати вступу й присяги | 12 |
| Стиль: токени, Card/Dialog/Accordion, мобільний і десктоп, українська | Global Constraints; 6, 7, 11, 12 (скріншоти) |
| Тести API e2e: матриця прав, унікальність, каталог = глобальні + свої, правила власних, валідація, агрегат з поточними/знятими посадами, події журналу | 1, 3, 4, 5, 8, 9, 10 |
| Unit: валідація даних каталогу | 2 |
| Playwright: `/skills`; `/me` без кнопок; звʼязковий додає вмілість і табір; виховник — кнопки лише у своїх; сід через `createOnboardedUserAs` | 6, 7, 11, 12 |
| Хвилі A → B; A готова до випуску окремо | порядок задач 1–7 / 8–12 |
| Поза скоупом v1 | Global Constraints (перелік) |

Прогалин немає.

**2. Скан на заглушки:** у кроках немає «TBD/TODO/додати валідацію/аналогічно задачі N»; кожен кодовий крок містить код. Задача 2 свідомо не вставляє всі ~100 текстів вимог — замість цього дає точну форму даних, по одному повному запису на кожен варіант (простий список, підпункти, «А або Б» + ненумерований рівень, передумова, римські розділи), покрокову процедуру вилучення з номерами рядків, таблицю виправлень і спеку, що має пройти (кількості по групах + конкретні перевірки виправлень). Прибрано виправлення «на льоту» в задачі 5 (зайвий імпорт `isoDate`).

**3. Узгодженість імен і типів:** `createSkill`/`createHistoryWorld` — однакові сигнатури в задачах 1, 3–5, 8–10; `loadJunakForWrite`/`loadJunakForRead`/`canWriteJunakHistory`/`HistoryJunak` (задача 5) — у задачах 8–10 без змін; `parseHistoryDate`/`patchHistoryDate`/`blankToNull` (5) і `assertYearRange`/`requireText` (8) — використані з тими ж іменами; `isoDate`, `toJunakSkillView`, `JUNAK_SKILL_INCLUDE`, `toVfvView`, `toCampView`, `toRemarkView`, `toPastPositionView` — визначені до використання в агрегаті (10); `JunakHistoryService` створюється в 9 (`updateDates`) і повністю переписується в 10 (`get` + той самий `updateDates`, конструктор отримує `UsersService` — модуль уже імпортує `UsersModule`). Фронтенд: ключ кешу `['junak-history', junakId]` (агрегат) і `['junak-history', junakId, 'skills']` (хвиля A) інвалідовуються одним префіксом у `useHistoryMutation`; `useJunakSkills` прибирається в 11, коли контейнер переходить на `useJunakHistory`. `SKILL_LEVEL_LABELS` у `lib/history-labels.ts` (UI, «Перша проба») і локальна однойменна мапа в `lib/audit.ts` («перша проба») — різні файли, конфлікту немає. `data-testid`: `history-skills`, `junak-skill`, `history-vfv`, `history-camps`, `history-remarks`, `history-remark`, `history-dilovodstvo`, `history-dates`, `skill-card` — однакові в компонентах і спеках. Підписи кнопок у Playwright («Додати вмілість», «Додати ВФВ», «Додати табір», «Додати запис», «Додати посаду», «Змінити дати», «Змінити: Говерла») збігаються з `addLabel`/`aria-label` компонентів. Тексти журналу в Playwright («Додав власну вмілість «…»», «Зарахував вмілість «Картографія» (друга проба)», «Додав табір «Говерла» для», «Додав пересторогу для … (від 2025-03-10)», «Додав до архіву діловодства посаду «…»», «Змінив дати вступу до УПЮ та пластової присяги») відповідають кейсам `describeAuditEvent`.
