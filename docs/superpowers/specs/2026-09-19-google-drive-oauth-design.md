# Google Drive: перехід із сервісного акаунта на per-kurin OAuth — дизайн-документ

## Контекст і причина

"Облік реманенту" (докладено 2026-09-13/14, `docs/superpowers/specs/2026-09-13-inventory-drive-integration-design.md`)
було повністю реалізовано й задеплоєно з інтеграцією через **сервісний
акаунт Google**, що мав доступ до розшареної папки на особистому Drive
Андрія. При першому реальному тесті на проді (2026-09-15) завантаження
фото впало з помилкою Google API:

> Service Accounts do not have storage quota. Leverage shared drives, or
> use OAuth delegation instead.

Сервісні акаунти не мають власної квоти й не можуть створювати файли
навіть у папці, розшареній звичайним (не Workspace) Gmail-акаунтом — це
працює лише в межах платного Google Workspace (Shared Drives), який
Андрій явно відхилив і при першому дизайні, і при виявленні цієї
проблеми. Рішення зафіксовано в `docs/backlog.md` і
`memory/google-drive-oauth-pivot.md`: перейти на OAuth.

Під час брейнштормінгу (2026-09-15 → 2026-09-19) зʼясувалося, що потрібна
не проста заміна одного акаунта на інший, а **мультитенантна модель**:
кожен курінь підключає **власний** Google-акаунт, а не всі курені
використовують один спільний акаунт Андрія.

## Частина 1: Загальна модель доступу

- Кожен `Kurin` підключає власний Google-акаунт через OAuth. Підключення
  ініціює лише **звʼязковий** цього куреня.
- Дозвіл (OAuth scope) — лише **`https://www.googleapis.com/auth/drive.file`**
  (не повний `drive`, не окремий `spreadsheets`). Цей вузький scope дає
  доступ тільки до (а) файлів/папок, які застосунок сам створив, і (б)
  файлів/папок, які користувач явно обрав через Google Picker. Google
  офіційно приймає `drive.file` як валідний scope і для Sheets API — тож
  коли пізніше будуватиметься "Книга судді" (Google Sheets), той самий
  scope і те саме підключення обслужать і її, без повторної авторизації
  куреня. Менший запитаний обсяг прав також простіший з точки зору
  Google-верифікації додатка.
- OAuth consent screen — статус **"In production"** (не "Testing"):
  Testing обмежує токен 7 днями і 100 тестовими користувачами, що не
  підходить для довільної кількості куренів. Production не потребує
  повної Google-верифікації для такого вузького внутрішнього scope за
  малої кількості користувачів — лише одноразовий екран "додаток не
  перевірено" при кожній новій авторизації (клік "Додатково" → "Перейти
  до [додатка] (небезпечно)"), який Андрій підтвердив як прийнятний.
- Кожна фіча, якій знадобиться Drive/Sheets (зараз — реманент; пізніше —
  "Книга судді", можливо "Скарбниця"), додає власне поле-посилання на
  вибраний через Picker файл/папку в межах уже підключеного акаунта
  куреня — саме підключення (OAuth) не повторюється.

## Частина 2: Модель даних

Розширення вже наявної моделі `Kurin` (без нової таблиці — звʼязок 1:1):

```prisma
model Kurin {
  // ...наявні поля...
  driveFolderId       String?   // ID обраної через Picker папки для реманенту
  driveFolderName     String?   // назва папки, для показу в UI
  driveRefreshToken   String?   // OAuth refresh token цього куреня
  driveConnectedEmail String?   // який Google-акаунт підключено, для UI
  driveConnectedAt    DateTime?
}
```

`driveFolderId` уже існує в схемі (додано в попередньому підпроєкті) —
змінюється лише його сенс: раніше застосунок сам створював цю папку
всередині кореневої (`ensureKurinFolder`/`ensureSubfolder`), тепер це ID
папки, яку звʼязковий явно обрав через Picker. Стара логіка
авто-створення папок прибирається повністю.

Усі нові поля — нульові (`?`), додаткова міграція, безпечна для
продакшн-даних (як усі попередні в цьому проєкті).

`driveRefreshToken` зберігається в БД у відкритому вигляді, без окремого
шифрування поля — та сама база вже містить чутливі персональні дані
неповнолітніх і не доступна ззовні (лише всередині приватної мережі
docker-compose на VPS, Postgres не опублікований на хост). Шифрування
цього конкретного поля визнано зайвим ускладненням для MVP.

## Частина 3: Бекенд

**Нові змінні середовища** (`apps/api/.env`):
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` — новий OAuth-клієнт
  типу "Web application" у Google Cloud Console. Окремий від наявного
  клієнта для "Sign in with Google" (вхід користувачів) — інше
  призначення, інший scope.
- `GOOGLE_OAUTH_REDIRECT_URI` — `https://plast-api.srv1440057.hstgr.cloud/kurins/google-drive/callback`.

**Видаляються** (більше не потрібні): `GOOGLE_SERVICE_ACCOUNT_KEY`,
`GOOGLE_DRIVE_ROOT_FOLDER_ID` — з `.env`, `.env.example`, з коду
(`apps/api/src/google-drive/google-drive-client.provider.ts` видаляється
повністю й замінюється на OAuth-клієнт-провайдер).

**Важливий технічний нюанс**, виявлений при написанні цього спеку:
бекенд (`plast-api.srv1440057.hstgr.cloud`) перевіряє JWT лише через
заголовок `Authorization: Bearer ...` (`ExtractJwt.fromAuthHeaderAsBearerToken()`
в `jwt.strategy.ts`) — цей заголовок додає лише BFF-проксі фронтенду
(`apps/web/app/api/backend/[...path]/route.ts`), який читає httpOnly
cookie і сам підставляє заголовок. Якщо браузер перейде напряму на
бекенд-URL (звичайна навігація, не через BFF), заголовка не буде і
`JwtAuthGuard` відхилить запит. Тому:

- `connect` — **не** прямий редірект, а звичайний JSON-ендпоінт (як усі
  інші), що йде через BFF як завжди: повертає `{ url: string }` з
  Google-адресою; фронтенд сам робить `window.location.href = url`.
- `callback` — приймає редірект **напряму від Google** (не через BFF,
  бо Google не знає про наш BFF і не може пронести JWT) — тому цей
  ендпоінт **без** `JwtAuthGuard`. Захист від підробки — підписаний
  (HMAC із `JWT_SECRET`, той самий підхід, що вже використовується в
  проєкті) `state`-параметр, що несе `kurinId`. Після обробки бекенд сам
  робить 302-редірект на публічну адресу фронтенду
  (`https://eplastun.vercel.app/kurin?driveConnected=1`) — це просто
  перехід браузера на звичайну сторінку застосунку, авторизація якої вже
  діє незалежно (юзер і так залогінений у самому фронтенді).
- `status`, `picker-token`, `folder` — звичайні JSON-ендпоінти під
  `@UseGuards(JwtAuthGuard)` через BFF, як і решта застосунку.

**Ендпоінти** (`apps/api/src/inventory/` або новий підмодуль
`google-drive` — остаточне рішення про розбивку файлів приймається при
написанні плану):

- `GET /kurins/:kurinId/google-drive/status` (JWT, звʼязковий) →
  `{ connected: boolean; email?: string; folderId?: string; folderName?: string }`
- `GET /kurins/:kurinId/google-drive/connect` (JWT, звʼязковий) →
  `{ url: string }` — Google OAuth consent URL з підписаним `state`.
- `GET /kurins/google-drive/callback` (без JWT, захист через `state`) →
  приймає `code` від Google, обмінює на `refresh_token` через
  `googleapis`, окремим викликом дізнається email підключеного акаунта
  (`google.oauth2('v2').userinfo.get`), зберігає обидва значення плюс
  `driveConnectedAt: new Date()` в `Kurin` (визначеному з `state`),
  редіректить на фронтенд (`?driveConnected=1` або `?driveError=1`).
- `GET /kurins/:kurinId/google-drive/picker-token` (JWT, звʼязковий) →
  бекенд обмінює збережений `refresh_token` на короткоживучий
  access-token (стандартний OAuth2 refresh-flow) і повертає його
  фронтенду — саме він передається клієнтському Picker-віджету. Сам
  `refresh_token` ніколи не залишає бекенд.
- `PATCH /kurins/:kurinId/google-drive/folder` (JWT, звʼязковий; body:
  `{ folderId: string; folderName: string }`) → зберігає результат
  вибору з Picker у `driveFolderId`/`driveFolderName`.

**`GoogleDriveService`** спрощується. Видаляються `ensureKurinFolder` і
`ensureSubfolder` (папка більше не створюється застосунком). Новий
публічний інтерфейс:

- `getAuthUrl(kurinId: string): string` — формує URL для Кроку "connect".
- `handleCallback(code: string, kurinId: string): Promise<{ email: string }>` —
  обмінює код на токени, зберігає в `Kurin`, повертає email для
  логування/відповіді.
- `getPickerAccessToken(kurinId: string): Promise<string>` — короткоживучий
  токен для Picker.
- `uploadFile(kurinId: string, folderId: string, buffer: Buffer, filename: string, mimeType: string): Promise<{ fileId: string; url: string }>` —
  та сама сигнатура завантаження, що й раніше, але авторизується як
  конкретний курінь (через збережений `refresh_token`), а не через
  єдиний сервісний клієнт. Якщо в куреня немає `driveRefreshToken` —
  кидає `ServiceUnavailableException('Курінь ще не підключив Google Drive')`
  (той самий патерн graceful-деградації, що вже є в коді після
  попереднього фінального рев'ю).

Внутрішньо кожен метод будує `google.auth.OAuth2(clientId, clientSecret)`,
викликає `.setCredentials({ refresh_token })`, і передає цей клієнт у
`google.drive({ version: 'v3', auth })` — `googleapis` сам подбає про
оновлення access-token за потреби. DI-токен `GOOGLE_DRIVE_CLIENT`
(з попереднього підпроєкту) прибирається — клієнт тепер будується
динамічно на льоту, за-kurin, а не один статичний на весь застосунок; у
тестах мокатиметься сам `GoogleDriveService` цілком (не внутрішній Drive
SDK-клієнт), оскільки він більше не єдиний на всю систему.

**`InventoryService`**: `uploadAndAttachPhoto` більше не викликає
`ensureKurinFolder`/`ensureSubfolder` — просто читає `kurin.driveFolderId`
і, якщо воно порожнє, кидає ту саму `ServiceUnavailableException` ще до
виклику Drive API (швидший, зрозуміліший фейл). Створення речі **без**
фото працює незалежно від стану підключення Drive (як і раніше).

## Частина 4: Фронтенд

Нова секція на сторінці `/kurin` (налаштування куреня, видима лише
звʼязковому):

- Не підключено → кнопка **"Підключити Google Drive"**, що звичайним
  запитом (через BFF, як завжди) отримує `{ url }` з
  `GET .../google-drive/connect`, після чого фронтенд сам переходить
  туди (`window.location.href = url`) — саме на цьому переході браузер
  залишає застосунок і потрапляє на Google.
- Підключено → **"Підключено як: {email}"** + кнопка **"Обрати папку для
  реманенту"**, що відкриває Google Picker (офіційний JS-віджет,
  `<script src="https://apis.google.com/js/api.js">`, ініціалізується з
  `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` — новий публічний env на Vercel —
  та access-token з `/picker-token`). Обраний результат (`folderId`,
  `folderName`) одразу відправляється на `PATCH .../folder`. Показується
  поточна назва: **"Папка: {folderName}"**.

На сторінці `/inventory`: якщо `GET /kurins/:kurinId/inventory` (чи
окремий виклик статусу) показує, що Drive не підключено або папка не
обрана — замість форми додавання показується повідомлення "Спершу
підключіть Google Drive у налаштуваннях куреня" з посиланням на
`/kurin`, без падіння сторінки. Перегляд і редагування вже існуючих
речей (без нових фото) лишається доступним незалежно від стану
підключення.

## Тестування

- **Backend e2e**: `connect`/`callback`/`picker-token`/`folder` тестуються
  з мокнутим `GoogleDriveService` (весь сервіс підміняється фейком через
  DI, а не лише внутрішній Drive SDK-клієнт, як було раніше) — реальний
  Google API ніколи не викликається в тестах. Перевіряються: збереження
  токена й email після callback, 403 для не-звʼязкового, `status` до/після
  підключення, `uploadFile` кидає `ServiceUnavailableException`, коли
  `driveRefreshToken` відсутній.
- **Playwright**: живий OAuth-флоу й Picker не тестуються (зовнішній
  Google-сервіс, як і раніше) — покривається лише те, що можна замокати
  на бекенді: стан "не підключено" показує повідомлення на `/inventory`
  замість форми. Сам живий флоу перевіряється вручну на проді, як і для
  первинного деплою сервісного акаунта.

## Обмеження (свідомі спрощення)

- `driveRefreshToken` не шифрується окремим ключем у БД (див. Частину 2).
- Якщо звʼязковий відкликає доступ застосунку в налаштуваннях свого
  Google-акаунта, наступне завантаження фото впаде з тим самим
  `ServiceUnavailableException` — повторне підключення через ту саму
  кнопку "Підключити Google Drive" перезаписує токен. Окремого
  сповіщення звʼязковому про відкликаний доступ не будується.
- Зміна вибраної папки на іншу через Picker не переносить уже завантажені
  фото зі старої папки — нові фото йдуть у нову папку, старі лишаються
  доступними за вже збереженими посиланнями.
