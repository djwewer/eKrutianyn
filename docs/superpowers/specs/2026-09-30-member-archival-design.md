# Архівація юнака, виховника та гуртка — дизайн

**Дата:** 2026-09-30

## Контекст і проблема

У застосунку немає жодного способу прибрати юнака, виховника чи гурток зі
списку активних — ні "видалення", ні "архівації", ні "деактивації". Пряме
(hard) видалення `User` технічно неможливе без руйнування історії:
13 моделей мають `RESTRICT`-звʼязки на `User.id` (прогрес проб,
історія посад `KurinPosition`, guardian-контакти, аудит-лог,
`ApprovalRequest`, `PasswordResetToken` тощо) — `DELETE FROM "User"` впаде
на рівні БД для будь-якого реального (не щойно створеного) юнака чи
виховника. Для `Hurtok` hard delete технічно можливий (лише 3 звʼязки),
але осиротить юнаків (`hurtokId → null`) і вимагає розблокування
`VykhovnykHurtok` (RESTRICT).

Рішення: **м'яке видалення (архівація)** — часова мітка + хто зробив, за
прецедентом, що вже існує в коді: `KurinPosition.removedAt`/`removedById`.
Жодні дані фізично не видаляються.

## Модель даних

```prisma
model User {
  // ...існуючі поля
  archivedAt   DateTime?
  archivedById String?
  archivedBy   User?     @relation("UserArchivedBy", fields: [archivedById], references: [id])
  archivedUsers User[]   @relation("UserArchivedBy")
}

model Hurtok {
  // ...існуючі поля
  archivedAt   DateTime?
  archivedById String?
  archivedBy   User?     @relation("HurtokArchivedBy", fields: [archivedById], references: [id])
}

enum ApprovalActionType {
  // ...існуючі значення
  ARCHIVE_JUNAK
}
```

Додаткова міграція: `ALTER TABLE "User" ADD COLUMN "archivedAt" ..., ADD COLUMN "archivedById" ...`
і аналогічно для `Hurtok`. Обидва поля nullable — існуючі рядки лишаються
`archivedAt = NULL` (активні) без бекфілу.

## Хто може архівувати, і за яких умов

| Сутність | Напряму | Через `ApprovalRequest` | Передумова (блокує, якщо не виконано) |
|---|---|---|---|
| Юнак (`User`, role=JUNAK) | ZVYAZKOVYI | курінний (`isKurinniy`) АБО утримувач `PositionType.SUDDIA` | немає жодної активної `KurinPosition` (будь-якого `scope`) **і** `hurtokId === null` |
| Виховник (`User`, role=VYKHOVNYK) | Лише ZVYAZKOVYI | — (без approval-шляху, симетрично до створення виховника, яке теж лише напряму) | немає жодного активного запису `VykhovnykHurtok` |
| Гурток (`Hurtok`) | Лише ZVYAZKOVYI | — (без approval-шляху, симетрично до створення гуртка) | немає юнака з `hurtokId` = цей гурток, немає активного `VykhovnykHurtok` на цей гурток, немає активної `KurinPosition` з `hurtokId` = цей гурток |

Асиметрія "курінний/суддя можуть ініціювати архівацію юнака, але не
виховника" навмисно повторює вже наявну асиметрію `CREATE_JUNAK` (є
approval-шлях) проти створення виховника (`POST /users` для VYKHOVNYK —
лише ZVYAZKOVYI напряму, без approval-шляху). Суддя включений в гейт
тому, що саме суддя веде Книгу судді (той самий реєстр членства).

**Важливо:** `CurrentUserPayload.positions` (з JWT) містить лише
`KURIN`-scope позиції (`getActiveKurinPositions` фільтрує
`scope: PositionScope.KURIN`). Перевірка "чи є активна позиція" для
блокування архівації юнака має враховувати ОБИДВА scope, тож не можна
покладатись на `actor.positions` чи навіть на `target.positions` (такого
поля взагалі нема) — потрібен прямий запит
`prisma.kurinPosition.findFirst({ where: { userId, removedAt: null } })`
без фільтра по `scope`.

## Backend

### Ендпоінти

- **`PATCH /users/:id/archive`** (`UsersController`, `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.ZVYAZKOVYI)`). Курінний/суддя НІКОЛИ не викликають цей ендпоінт напряму — для юнака вони йдуть виключно через `POST /approval-requests` (`ARCHIVE_JUNAK`), тож ендпоінт може бути звичайним ZVYAZKOVYI-only контролером без розгалуження за роллю actor'а, як і `updateHurtok`/`kurin-positions`/`vykhovnyk-assignments`:
  - `UsersService.archive(userId, actor)`:
    1. Знайти `target`, перевірити `target.kurinId === actor.kurinId` (крос-тенантний захист), `target.archivedAt === null` (інакше `BadRequestException('Уже архівовано')`).
    2. Якщо `target.role === Role.VYKHOVNYK`: перевірити немає активного `VykhovnykHurtok` (`findFirst({ where: { vykhovnykId: target.id } })` — модель без soft-delete, будь-який рядок = активний), інакше `BadRequestException('Спершу зніміть виховника з гуртка(ів)')`.
    3. Якщо `target.role === Role.JUNAK`: перевірити немає активної `KurinPosition` (`findFirst({ where: { userId: target.id, removedAt: null } })`, без фільтра scope) і `target.hurtokId === null`, інакше `BadRequestException('Спершу зніміть юнака з гуртка та всіх посад')`.
    4. `prisma.user.update({ where: { id }, data: { archivedAt: new Date(), archivedById: actor.userId } })`.
  - Роль `ZVYAZKOVYI` як ціль архівації — не підтримується взагалі (немає бізнес-сценарію; якщо колись знадобиться — окрема розмова).
  - Курінний/суддя, що архівують юнака, використовують ЛИШЕ approval-шлях нижче — власної гілки авторизації в цьому ендпоінті для них немає.

- **`PATCH /hurtky/:id/archive`** (`HurtkyController`, `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.ZVYAZKOVYI)`):
  - `HurtkyService.archive(hurtokId, actor)`:
    1. `hurtok.kurinId === actor.kurinId`, `hurtok.archivedAt === null`.
    2. `prisma.user.findFirst({ where: { hurtokId, archivedAt: null } })` — якщо є, `BadRequestException('У гуртку ще є юнаки')`.
    3. `prisma.vykhovnykHurtok.findFirst({ where: { hurtokId } })` — якщо є, `BadRequestException('До гуртка ще прикріплені виховники')`.
    4. `prisma.kurinPosition.findFirst({ where: { hurtokId, removedAt: null } })` — якщо є, `BadRequestException('У гуртку є активна посада')`.
    5. `prisma.hurtok.update({ where: { id }, data: { archivedAt: new Date(), archivedById: actor.userId } })`.

### `ApprovalRequest` — `ARCHIVE_JUNAK`

- `approval-requests.service.ts` `create()`:
  - Розширити гейт:
    ```ts
    const canInitiateBulkImport =
      dto.actionType === ApprovalActionType.BULK_IMPORT_JUNAKY && actor.positions.includes(PositionType.SUDDIA);
    const canInitiateArchive =
      dto.actionType === ApprovalActionType.ARCHIVE_JUNAK && actor.positions.includes(PositionType.SUDDIA);
    if (!actor.isKurinniy && !canInitiateBulkImport && !canInitiateArchive) {
      throw new ForbiddenException('Only kurinniy can create approval requests');
    }
    ```
  - `ARCHIVE_JUNAK` вимагає `junakId` (не входить у `noJunakIdActionTypes`), `newData: {}` (порожній обʼєкт — немає полів, що змінюються, ціль повністю визначається `junakId`).
  - `oldData` для `ARCHIVE_JUNAK` в `extractRelevantFields()` — не обовʼязково (можна повернути `{}` або пропустити case, який зараз кидає `BadRequestException('Unsupported action type')` — додати явний case, що повертає `{}`).
- `approve()`:
  - Новий гілка **перед** загальним `$transaction`-блоком (аналогічно до `approveBulkImport`, бо потребує тих самих перевірок передумов, що й прямий `UsersService.archive`, а не просто `buildUpdateData`):
    ```ts
    if (req.actionType === ApprovalActionType.ARCHIVE_JUNAK) {
      return this.approveArchiveJunak(req, actor);
    }
    ```
  - `approveArchiveJunak()` — атомарно (`updateMany` claim, як `approveBulkImport`, щоб уникнути гонки з паралельним `reject()`), потім ПОВТОРНО перевіряє передумови (стан юнака міг змінитися відколи створено запит — наприклад, йому призначили посаду вже після подання запиту) і архівує, інакше кидає помилку (запит лишається `PENDING`; звʼязковий бачить причину і може відхилити або попросити повторно).

### Логін

- `auth/strategies/jwt.strategy.ts` `validate()`: довантажити `user` (`findUnique({ where: { id: payload.sub } })`) замість припущення, що він існує; якщо `!user || user.archivedAt`, `throw new UnauthorizedException()`. Це перевіряється на КОЖЕН запит (не лише при логіні), тож вже видані токени архівованих людей перестають працювати одразу, без очікування на закінчення строку дії.
- `auth.service.ts` `loginWithPassword()`/`loginWithGoogle()`: після знаходження `user`, якщо `user.archivedAt`, `throw new UnauthorizedException('Обліковий запис архівовано')` — до видачі токена.

### Списки

- `users.service.ts` `list()` — додати `archivedAt: null` у `where` за замовчуванням (`findMany` там, де формується список).
- `hurtky.service.ts` `listForKurin()` — додати `archivedAt: null` у `where`.
- `findById()` (`users.service.ts`) — **не фільтрувати**: архівованого юнака/виховника можна відкрити напряму за посиланням (наприклад, з історичного `ApprovalRequest`), щоб не ламати старі посилання; просто на фронтенді сторінка покаже позначку "Архівовано" і сховає активні дії.

## Frontend

- `apps/web/app/users/[id]/page.tsx`:
  - Якщо `user.archivedAt` — банер "Архівовано {дата}" замість активних форм редагування (контакти, посади, гурток), проте профіль і історія прогресу лишаються видимими.
  - Кнопка "Архівувати" (тільки для нео-архівованих):
    - Видима звʼязковому завжди; курінному/судді — лише коли `user.role === 'JUNAK'`.
    - Прихована (не dísabled — з коротким текстом-поясненням), якщо є активний гурток чи посада: "Спершу зніміть юнака з гуртка та посад" / "Спершу зніміть виховника з гуртка(ів)".
    - На клік: `window.confirm('Архівувати {імʼя}? Юнак/виховник втратить доступ до входу.')`, далі: звʼязковий → `PATCH /users/:id/archive` напряму; курінний/суддя на юнакові → `POST /approval-requests` (`ARCHIVE_JUNAK`).
- `apps/web/app/[kurinNumber]/hurtky/[slug]/page.tsx`:
  - Кнопка "Архівувати гурток" (лише звʼязковий), та сама логіка прихованості за живими членами/посадами, `window.confirm`, `PATCH /hurtky/:id/archive`.
- `apps/web/app/approval-requests/[id]/page.tsx`: додати `ARCHIVE_JUNAK: 'Архівація юнака'` в `ACTION_LABELS`.
- `apps/web/app/users/page.tsx`, `apps/web/app/hurtky/page.tsx`: без змін — бекенд вже не повертає архівованих, списки лишаються "як є".

## Явно поза межами цієї фічі (YAGNI)

- **Відновлення (unarchive)** — немає UI. Дані ніколи не губляться, тож
  відновлення завжди можливе вручну (пряма зміна `archivedAt = NULL` через
  БД чи майбутній окремий ендпоінт) — не будуємо зараз, бо не було
  запитано.
- **Перегляд списку архівованих** — так само не будуємо; якщо знадобиться
  "колишні члени" — окрема майбутня фіча.
- **Видалення `ZVYAZKOVYI`** — поза межами, немає бізнес-сценарію.
- **Каскадне автознімання** посад/гуртка/виховницьких прив'язок при
  архівації — свідомо НЕ робимо; натомість блокуємо архівацію, доки
  оператор не зробить це вручну через вже наявні екрани (`/positions`,
  `/vykhovnyk-assignments`, зміна гуртка юнака).

## Тестування

Playwright e2e (`apps/web/e2e/`), новий файл
`member-archival.spec.ts` (чи кілька файлів за сутністю) — за існуючим
паттерном (`seedKurinWithZvyazkovyi`, `loginAs`, реальний бекенд):
- звʼязковий архівує юнака без активних звʼязків → успіх, зникає зі
  списку, логін архівованого падає.
- спроба архівувати юнака з активною посадою/гуртком → 400 з описом
  причини.
- курінний ініціює `ARCHIVE_JUNAK` → створюється `ApprovalRequest`;
  звʼязковий затверджує → юнак архівований; повторна спроба затвердити
  вже вирішений запит → помилка (існуючий `loadPendingRequestForKurin`
  вже це покриває).
- звʼязковий архівує виховника з активною прив'язкою до гуртка → 400;
  після "Зняти" — успіх.
- звʼязковий архівує гурток з юнаками → 400; спорожнений гурток →
  успіх.
- курінний намагається `PATCH /users/:id/archive` виховника напряму →
  403.

Плюс `apps/api` e2e-специфікації (`apps/api/test/`) на самі
сервіс-методи/ендпоінти за існуючим паттерном (див.
`kurin-junak-import-mapping.e2e-spec.ts` як приклад структури).
