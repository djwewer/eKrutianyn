# Історія юнака (v1): вмілості, табори, відзначення, архів діловодства — дизайн

Дата: 2026-10-29. Піднято Андрієм у звʼязку з посвідкою звільнення з УПЮ
(зразок: Google Doc «посвідка-звільнення-з-УПЮ – приклад»), але потрібно й
саме по собі: щоб можна було подивитися історію юнака. Це перший з двох
проєктів: **цей spec — дані й їхній інтерфейс**; «Запит юнака на документ» і сама
посвідка — окремий наступний проєкт, що споживатиме ці дані.

## Мета

Єдине місце, де зберігається й видно історія юнака в Пласті, крім уже наявних
проб і ступенів: здобуті вмілості (з каталогом вимог), ВФВ, відбуті табори,
відзначення та перестороги, діловодства (поточні й архів), дати вступу до УПЮ
та пластової присяги.

## Рішення, прийняті в брейнштормінгу

- **Вмілості:** каталог з вимогами + фіксація факту здобуття (не відстежується
  прогрес по кожній вимозі). Рівень вмілості = проба (1, 2 або 3), до якої вона
  призначена («Автознавство 1» = перша проба).
- **Каталог** завантажується з правильника «Вмілості УПЮ» (видання 2003 р.,
  `Vmilosti-UPYU.pdf`) сидом і **доповнюється власними вмілостями куреня**
  (наприклад, «Знавець Компʼютерів» немає в каталозі 2003 року).
- **ВФВ:** простий запис без каталогу й вимог.
- **Табори:** окремий запис «Табір»: назва, рік початку, (необовʼязково) рік
  кінця, роль (учасник / провід). Акції в «Моїй активності» лишаються як є.
- **Відзначення та перестороги:** запис з типом, описом і датою (дата потрібна:
  у посвідці йдуть перестороги лише за останні два роки). **Пересторога
  обовʼязково має опис «за що» і опис «як виправити»**; юнак бачить свої
  перестороги повністю (рішення Андрія 2026-10-29).
- **Архів діловодства:** записи про посади до застосунку (вільний текст посади,
  курінь чи гурток, роки) + поточні й зняті посади з наявного `KurinPosition`.
- **Дата вступу до УПЮ** і **дата пластової присяги** — поля юнака.
- **Хто вносить і редагує:** **звʼязковий** куреня та **виховник юнака** (виховник,
  прикріплений до гуртка юнака). Юнак бачить свою історію, але не редагує.
- **Порядок робіт:** хвиля A (каталог і вмілості), хвиля B (решта). Посвідка — після.

## Модель даних (Prisma)

```prisma
enum SkillGroup {
  PRACTICAL   // Вмілості практичного пластування
  FIRST_AID   // Першої допомоги і рятівництва
  NATURE      // Природничі
  SPORT       // Спортивні
  HOME        // Домашньої зарадності
  SPECIAL     // Спеціального зацікавлення
  ARTS        // Мистецькі
  AVIATION    // Літунського пластування
  SEA         // Морського пластування
}

model Skill {
  id        String     @id @default(uuid())
  // null = глобальний каталог (із правильника); не null = власна вмілість куреня
  kurinId   String?
  kurin     Kurin?     @relation(fields: [kurinId], references: [id])
  name      String
  group     SkillGroup
  createdAt DateTime   @default(now())
  levels    SkillLevel[]
  // Унікальність (kurinId, name) для глобальних (kurinId IS NULL) забезпечується
  // частковим унікальним індексом у SQL-міграції (Postgres вважає NULL різними).
  @@index([kurinId])
}

model SkillLevel {
  id           String  @id @default(uuid())
  skillId      String
  skill        Skill   @relation(fields: [skillId], references: [id], onDelete: Cascade)
  level        Int     // 1, 2, 3 (= перша/друга/третя проба)
  // Упорядковані вимоги: [{ text: string, items?: string[] }] (підпункти а/б/в)
  requirements Json
  note         String? // напр. «нова вмілість», «Виконати вимоги А або Б»
  achievements JunakSkill[]
  @@unique([skillId, level])
}

model JunakSkill {
  id                String     @id @default(uuid())
  junakId           String
  junak             User       @relation("JunakSkills", fields: [junakId], references: [id])
  levelId           String
  level             SkillLevel @relation(fields: [levelId], references: [id])
  achievedAt        DateTime   @db.Date
  examiner          String?    // імʼя екзаменатора вільним текстом (може бути непластун)
  certificateNumber String?
  createdById       String
  createdBy         User       @relation("JunakSkillCreatedBy", fields: [createdById], references: [id])
  createdAt         DateTime   @default(now())
  @@unique([junakId, levelId])
  @@index([junakId])
}

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
  role        JunakActivityRole // наявний enum: PARTICIPANT | PROVID
  createdById String
  createdBy   User              @relation("JunakCampCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime          @default(now())
  @@index([junakId])
}

enum JunakRemarkKind {
  AWARD    // відзначення
  WARNING  // пересторога
}

model JunakRemark {
  id          String          @id @default(uuid())
  junakId     String
  junak       User            @relation("JunakRemarks", fields: [junakId], references: [id])
  kind        JunakRemarkKind
  text        String          // опис: за що відзначення / за що пересторога
  howToFix    String?         // лише для WARNING (обовʼязково): що юнак має зробити, щоб виправити
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
  title       String        // «Гуртковий», «Курінний суддя» — вільний текст
  scope       PositionScope // наявний enum: KURIN | HURTOK
  yearFrom    Int
  yearTo      Int?
  createdById String
  createdBy   User          @relation("JunakPastPositionCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime      @default(now())
  @@index([junakId])
}

// User: нові поля
//   upyJoinedAt DateTime? @db.Date   // дата вступу до УПЮ
//   plastOathAt DateTime? @db.Date   // дата пластової присяги
```

Назви звʼязків (`@relation`-імена) уточнюються при реалізації (потрібні
зворотні поля на `User`/`Kurin`); міграція — лише додавання, без змін наявних таблиць.

## Каталог вмілостей (сид)

- Джерело: `Vmilosti-UPYU.pdf` (правильник 2003 р.): 9 груп, ≈74 вмілості,
  ≈106 записів «вмілість × рівень», кожен із нумерованими вимогами. PDF у
  репозиторій **не додається** (як і PDF проб); у коді — дані.
- Файли за зразком сидів проб (`seed-real-proby-content*.ts`):
  `apps/api/src/scripts/skills-catalog.data.ts` (дані) +
  `skills-catalog.data.spec.ts` (валідація структури: усі 9 груп, рівні ∈ {1,2,3},
  унікальність (назва, рівень), непорожні вимоги, відсутність дублікатів між групами) +
  `seed-skills-catalog.ts` (ідемпотентний upsert за (група, назва, рівень), нічого
  не видаляє, не чіпає власні вмілості куренів).
- **Ручне вичитування обовʼязкове** (знайдені дефекти джерела, виправляються в даних):
  - «Лещетарство (третя проба)» злите з ще одним рівнем (мандрівне лещетарство
    — окрема вмілість/рівень);
  - під заголовком «Скульптура (третя проба)» стоїть текст вимог різьбярства
    (потрібна окрема «Різьбярство (третя проба)»; заголовки «Скульптура (друга/третя)»
    переплутані між собою);
  - опечатка «Домашня парадність» (має бути «зарадність»), «Актороство»/«Акторство»
    (одна назва), `Табріництво` → «Табірництво»;
  - злиті/обірвані підпункти (напр. «Піонірство» без пункту 6, нумерація зі
    стрибками) — переносити як є, без вигадування вимог.
- Особливі рівні (в `note`): «Виконати вимоги А або Б» («Перша допомога», перша
  проба), «нова вмілість». Передумови («Здобути вмілість X») лишаються текстом у
  вимогах, без автоматичної перевірки.
- Каталог 2003 р. не повний: відсутні вмілості з новіших видань («Знавець
  Компʼютерів» тощо) — додаються звʼязковим як власні.
- Запуск на проді — вручну, як сиди проб (`npx ts-node …/seed-skills-catalog.ts`).

## Права доступу

| Дія | Хто |
|---|---|
| Читати історію юнака (всі розділи) | Той самий набір, що бачить профіль юнака (`UsersService.findScoped`): сам юнак, звʼязковий, курінний/суддя, виховник гуртка юнака |
| Створювати/змінювати/видаляти записи історії та дати вступу й присяги | Звʼязковий куреня; виховник, прикріплений до гуртка юнака (`VykhovnykHurtok`); для юнака без гуртка — лише звʼязковий |
| Читати каталог вмілостей | Будь-який авторизований користувач куреня (глобальні + власні вмілості куреня) |
| Створювати/змінювати/видаляти **власні** вмілості куреня | Звʼязковий. Видалення заблоковане, якщо є здобуті рівні. Глобальні вмілості з інтерфейсу не змінюються |

Усі перевірки — на бекенді; ізоляція між куренями на кожному ендпоінті.
Архівованих юнаків можна читати, редагувати — ні (як і решту даних юнака).

## API

Нові модулі в `apps/api/src/` (патерн `inventory`/`junak-degrees`): `skills`,
`junak-history`.

- `GET /skills` — каталог для куреня: глобальні + власні, згруповані; рівні з вимогами.
- `POST /skills`, `PATCH /skills/:id`, `DELETE /skills/:id` — лише власні вмілості (звʼязковий).
- `GET /users/:junakId/history` — агрегат: `{ upyJoinedAt, plastOathAt, skills[], vfv[], camps[], remarks[], pastPositions[], positions[] }`,
  де `positions[]` — поточні й зняті записи `KurinPosition` юнака (посада, scope, гурток, `assignedAt`, `removedAt`).
- `PATCH /users/:junakId/history/dates` — `{ upyJoinedAt?, plastOathAt? }`.
- `POST|PATCH|DELETE /users/:junakId/skills[/:id]` — здобуті вмілості (рівень каталогу + дата + екзаменатор + номер).
- `POST|PATCH|DELETE /users/:junakId/vfv[/:id]`, `/camps[/:id]`, `/remarks[/:id]`, `/past-positions[/:id]`.
- DTO з валідацією: роки 1990–поточний, `yearTo ≥ yearFrom`, дата не в майбутньому
  для здобутих вмілостей/присяги, довжини текстів. Для `WARNING` поля `text` і
  `howToFix` обовʼязкові й непорожні; для `AWARD` `howToFix` не приймається.

## «Журнал дій»

Нові дії в `AuditAction` (група PEOPLE; тест-захист `audit.constants.spec` вимагає
включення кожної дії в `AUDIT_GROUPS`): `SKILL_ACHIEVED`, `SKILL_REMOVED`,
`VFV_ADDED`, `VFV_REMOVED`, `CAMP_ADDED`, `CAMP_UPDATED`, `CAMP_REMOVED`,
`REMARK_ADDED`, `REMARK_UPDATED`, `REMARK_REMOVED`, `PAST_POSITION_ADDED`,
`PAST_POSITION_UPDATED`, `PAST_POSITION_REMOVED`, `HISTORY_DATES_CHANGED`,
`CUSTOM_SKILL_CREATED`, `CUSTOM_SKILL_UPDATED`, `CUSTOM_SKILL_DELETED`. У `details` —
читабельні назви (імʼя юнака, вмілість+рівень, назва табору), **без** тексту
пересторог і відзначень (ні `text`, ні `howToFix`; лише факт, тип і дата), щоб журнал не став
сховищем чутливого тексту.
Тексти відображення додаються в `apps/web/lib/audit.ts` (`describeAuditEvent`).

## Інтерфейс (apps/web)

- **Секція «Історія»** (компонент `components/junak-history.tsx`):
  вмілості (за групами, бейдж «назва + рівень», дата), ВФВ, табори («назва, 2021–2024, роль»),
  відзначення та перестороги (за датою), діловодство (поточне, зняті, старі записи — єдиний
  відсортований список), дати вступу й присяги. Показується на **`/me`** (лише перегляд) і на
  сторінці юнака **`/users/[id]`** (редагування для звʼязкового й виховника юнака: діалоги
  додавання/зміни/видалення, пошуковий вибір вмілості з каталогу + рівень + дата + екзаменатор + номер).
- **`/skills` — «Вмілості»:** перегляд каталогу по групах (акордеон), у картці вмілості вкладки
  рівнів 1–3 з нумерованими вимогами; для звʼязкового — «Додати власну вмілість». Плитка
  «Вмілості» у хабі «Моє пластування».
- Стиль — наявні токени/компоненти (Card, Dialog, Accordion), мобільний і десктопний розклад
  без особливих умов. Тексти українською.
- Перестороги (`WARNING`) бачать ті ж, хто читає історію, **включно з самим юнаком**:
  він бачить і дату, і «за що», і «як виправити». Форма пересторози має два обовʼязкові
  поля («За що», «Як виправити»); форма відзначення — одне («За що»).

## Хвилі

**A — каталог і вмілості:** міграція `Skill`/`SkillLevel`/`JunakSkill`, сид і дані каталогу
(з вичитуванням), `skills` модуль, `GET/POST…` здобутих вмілостей, права, журнал, сторінка
`/skills` і плитка в хабі, секція «Вмілості» в історії.
**B — решта:** `JunakVfv`, `JunakCamp`, `JunakRemark`, `JunakPastPosition`, поля `upyJoinedAt`/`plastOathAt`,
агрегат `GET …/history`, повна секція «Історія» на `/me` і `/users/[id]`, журнал, тести.

## Тести

- API e2e (патерн наявних `test/*.e2e-spec.ts`): матриця прав (звʼязковий — так; виховник
  свого гуртка — так; виховник чужого — ні; юнак — лише читання себе; інший курінь — 404);
  унікальність (юнак, рівень); каталог = глобальні + власні свого куреня; правила власних
  вмілостей (видалення заблоковане при наявних здобуттях); валідація років/дат; агрегат історії
  включає поточні й зняті `KurinPosition`; події журналу для кожної дії.
- Unit: валідація даних каталогу (структура, унікальність, 9 груп).
- Playwright: `/skills` (групи, вкладки рівнів, вимоги), секція «Історія» на `/me`
  (юнак без кнопок редагування), додавання вмілості та табору звʼязковим на `/users/[id]`,
  виховник бачить кнопки лише у своїх юнаків. Сід юнаків — `createOnboardedUserAs`.

## Поза скоупом v1

Відстеження кожної вимоги вмілості; редагування глобального каталогу з інтерфейсу;
відзнаки-значки; звʼязок вмілостей із вимогами проб; запит юнака на документ і посвідка
звільнення (наступний проєкт); імпорт історії з Книги судді; експорт; вкладка історії поза
`/me` і `/users/[id]`; різні підписи «Скоб» / «Вірлиця» (окрема дрібна правка в ступенях).
