# Діловоди — дизайн-документ

## Контекст і межі проєкту

Зараз `Role` — плаский enum (`JUNAK`/`VYKHOVNYK`/`KURINNYI`/`ZVYAZKOVYI`), і
`User.role` — єдине обов'язкове поле. Щоб зробити когось курінним, зв'язковий
створює **нового окремого користувача** з `role: KURINNYI` через прямий
екран створення (`POST /users`).

Це не відповідає реальній структурі: курінний — це юнак, якому доручили
додаткову посаду, а не інша людина. Ця розбіжність уже виявлялась раніше в
проєкті (`docs/superpowers/specs/2026-08-29-kurinniy-proby-tracking-design.md`,
константа `PROBY_TRACKING_ROLES`), яка і тоді трактувала курінного як
"юнак плюс щось зверху" — але лише для проходження проби, не для решти
системи.

Мета цього підпроєкту: замінити "курінний — окрема роль акаунта" на
"курінний (і майбутні посади) — призначювана посада поверх звичайного
юнацького акаунта", керована через нову вкладку "Діловоди".

### Явно поза межами цього підпроєкту

- **Реальні права доступу для нових посад** (суддя, писар, скарбник,
  інтендант, хорунжий, СММник, гуртковий) — зараз це лише реєстр/мітка,
  без жодної нової логіки прав. Права доступу змінюються лише для
  курінного, і поводяться так само, як і зараз.
- **Мультикурінна ієрархія** (станиця/крайова понад курінь) — не
  зачіпається.
- **Сповіщення** при призначенні/знятті посади — не додаються в цьому
  підпроєкті (можливе розширення F пізніше).
- **Повний аудит-лог** — `KurinPosition` веде власну мінімальну історію
  (хто/коли призначив/зняв), але це не заміна майбутньої системи D.

## Архітектура

Нова сутність `KurinPosition` — запис "хто яку посаду тримає, з яким
scope, відколи". `Role` enum скорочується до трьох значень (`JUNAK`,
`VYKHOVNYK`, `ZVYAZKOVYI`) — курінний більше не є базовою роллю акаунта.
Права, що раніше перевіряли `role === KURINNYI`, тепер перевіряють
обчислюваний прапорець `isKurinniy` (чи є в юнака активний запис
`KurinPosition` типу `KURINNYI`).

## Дані

```prisma
enum PositionScope {
  KURIN
  HURTOK
}

enum PositionType {
  KURINNYI    // лише курінь
  SUDDIA      // курінь або гурток
  PYSAR       // курінь або гурток
  SKARBNYK    // курінь або гурток
  INTENDANT   // лише курінь
  KHORUNZHYI  // лише курінь
  SMM         // лише курінь
  HURTKOVYI   // лише гурток
}

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

Валідація "яка посада на якому рівні можлива" — на рівні застосунку (не
типу бази), спільна константа:

```ts
export const KURIN_POSITIONS: PositionType[] = [
  'KURINNYI', 'SUDDIA', 'PYSAR', 'SKARBNYK', 'INTENDANT', 'KHORUNZHYI', 'SMM',
];
export const HURTOK_POSITIONS: PositionType[] = [
  'HURTKOVYI', 'SUDDIA', 'PYSAR', 'SKARBNYK',
];
```

`SUDDIA`/`PYSAR`/`SKARBNYK` — одна назва посади, окремі записи на рівні
куреня й на рівні кожного гуртка (розрізняються `scope`+`hurtokId`), тож
одна й та сама людина теоретично може одночасно бути, наприклад, писарем
свого гуртка й писарем усього куреня.

**Один активний тримач на "слот"** (kurinId + scope + hurtokId +
positionType): призначення нового автоматично знімає попереднього
(`removedAt`/`removedById` проставляються), історія лишається в базі,
нічого не видаляється.

## Бекенд

Новий модуль `apps/api/src/kurin-positions/`:

- `GET /kurin-positions` — усі активні посади куреня (і куреня, і всіх
  його гуртків) одним запитом. Доступно зв'язковому.
- `POST /kurin-positions` — призначити: `{ userId, positionType, scope,
  hurtokId? }`. Перевіряє: `positionType` валідний для `scope`
  (`KURIN_POSITIONS`/`HURTOK_POSITIONS`); цільовий користувач — юнак
  цього куреня (і, якщо `scope: HURTOK`, саме цього гуртка); знімає
  попереднього тримача цього слоту, якщо є; створює новий запис. Лише
  зв'язковий. Окремо перевіряти "курінний завжди має гурток" не треба —
  юнак і так не міг бути створений без `hurtokId` (наявна валідація), тож
  будь-який кандидат на посаду вже задовольняє цю вимогу.
- `DELETE /kurin-positions/:id` — зняти без заміни (`removedAt`
  проставляється). Лише зв'язковий.

**`isKurinniy` — обчислюваний прапорець на кожен запит.** `JwtStrategy`
(`apps/api/src/auth/strategies/jwt.strategy.ts`) після валідації токена
довантажує один рядок — чи є активний `KurinPosition` типу `KURINNYI`
для цього `userId` — і додає `isKurinniy: boolean` до `CurrentUserPayload`
поряд із наявними `userId`/`role`/`kurinId`. Це той самий за вартістю
патерн, що вже використовується для перевірки призначень виховника
(`vykhovnykHurtok.findMany` за потреби всередині сервісів) — один
недорогий, індексований запит.

**Заміна всіх 9 місць, де зараз `role === KURINNYI` (backend):**

| Файл | Було | Стає |
|---|---|---|
| `approval-requests/approval-requests.controller.ts` | `@Roles(Role.KURINNYI)` на створення запиту | декоратор прибирається, перевірка `actor.isKurinniy` всередині сервісу |
| `vykhovnyk-assignments/vykhovnyk-assignments.controller.ts` | `@Roles(ZVYAZKOVYI, VYKHOVNYK, KURINNYI)` | `KURINNYI` прибирається з декоратора, додається `\|\| actor.isKurinniy` в тілі |
| `proby-progress/proby-progress.service.ts` | `actor.role === Role.KURINNYI` | `actor.isKurinniy` |
| `users/users.controller.ts` | `@Roles(KURINNYI, ZVYAZKOVYI)` на `contact-info` | `KURINNYI` прибирається з декоратора, `actor.isKurinniy \|\| actor.role === ZVYAZKOVYI` в тілі |
| `users/users.service.ts` (list, ×2) | `actor.role === Role.KURINNYI` | `actor.isKurinniy` |
| `users/users.service.ts` (isVisibleTo) | `role === KURINNYI` → `target.role !== KURINNYI` | `actor.isKurinniy` → `return true` (єдиний курінний на курінь, "інших курінних" більше не існує як поняття) |
| `common/proby-tracking-roles.ts` | `PROBY_TRACKING_ROLES = [JUNAK, KURINNYI]` | **видаляється повністю** — курінний тепер завжди `role === JUNAK`, усі місця, що використовували цю константу (`proby-progress.service.ts`, `kurins.service.ts`, `hurtky.service.ts`, `users.service.ts`), спрощуються до прямої перевірки `role === Role.JUNAK` |

## Фронтенд

- Нова сторінка `app/positions/page.tsx` ("Діловоди"): розділ "Посади
  куреня" (7 позицій зі списком поточних тримачів і кнопкою
  призначити/зняти) і розділ "Посади гуртків" (те саме на кожен гурток:
  гуртковий/суддя/писар/скарбник). Призначення — пошук юнака зі списку
  цього куреня/гуртка.
- `lib/queries/positions.ts`: `useKurinPositions()`,
  `useAssignPosition()`, `useRemovePosition()`.
- `useSession()`/`/api/session` — до `CurrentUserPayload` додається
  `isKurinniy: boolean` (дзеркалить бекенд).
- `lib/types.ts`: `Role` звужується до трьох значень.
- `lib/role-labels.ts`: `KURINNYI` переїжджає з `ROLE_LABELS` у новий
  `POSITION_LABELS` (усі 8 типів посад).
- `components/nav.tsx`: гілка `LINKS_BY_ROLE.KURINNYI` зникає. Юнак, що
  тримає посаду курінного, бачить базові посилання юнака **плюс**
  додаткові (Люди, Виховники), коли `session.isKurinniy`. Зв'язковий
  отримує нове посилання "Діловоди".
- `app/users/new/page.tsx`: `ZvyazkovyiDirectCreateForm` втрачає опцію
  "Курінний" у випадаючому списку ролей (лишається юнак/виховник).
  Видимість `KurinnyiApprovalRequestForm` — з `session.role ===
  'KURINNYI'` на `session.isKurinniy`.
- `app/users/[id]/page.tsx`: `canEditContactInfo` — з `session.role ===
  'KURINNYI'` на `session.isKurinniy`.
- `app/users/page.tsx`, `app/page.tsx`: гілки, що перевіряли
  `role === 'KURINNYI'`, замінюються на `isKurinniy` (для фільтрів
  списку, домашнього редіректу — юнак-курінний іде на `/proby` як
  звичайний юнак, це вже працює без змін).

## Розгортання й міграція

На проді є лише тестовий акаунт курінного (безпечно видалити) і реальний
зв'язковий (не займаємо). Prisma-міграція:

1. `UPDATE "User" SET role = 'JUNAK' WHERE role = 'KURINNYI'` — прямо в
   SQL-міграції, автоматично, без ручного кроку. Тестовий акаунт стає
   звичайним юнаком (без жодної посади) — якщо він більше не потрібен,
   його можна видалити окремо, вручну, вже після міграції.
2. Створення `KurinPosition`/enum-ів.
3. Видалення значення `KURINNYI` з enum `Role` (безпечно — рядків, що
   на нього посилаються, вже нема після кроку 1).

Розкатується тим самим `git pull && docker compose up -d --build`.

## Тестування

Бекенд (e2e): призначення курінного (старий тримач автоматично знятий,
історія лишається), спроба призначити посаду не з того scope
(`HURTKOVYI` на рівні куреня — 400), `isKurinniy`-юнак отримує доступ до
`GET /vykhovnyk-assignments`/`PATCH .../contact-info`/створення
approval-request, звичайний юнак без посади — ні. Регресія: увесь
наявний набір тестів, що раніше сідив `Role.KURINNYI` напряму
(`test/utils/fixtures.ts`'s `createUser`), потребує оновлення — курінного
тепер створюють як юнака + окремий `KurinPosition`.

Фронтенд (Playwright): призначення посади через "Діловоди", після чого
юнак під цим акаунтом бачить розширену навігацію; зняття посади —
навігація повертається до звичайної юнацької.

## Обмеження MVP (свідомі спрощення)

- Одна активна людина на слот — без "тимчасового заступництва" чи
  паралельних тримачів одного й того ж титулу.
- Немає сповіщення при призначенні/знятті — лише запис в базі.
- Немає окремого екрана "історія посад" — дані зберігаються
  (`removedAt`), але переглянути минулих тримачів можна поки що лише
  прямим запитом до бази, не з UI.
