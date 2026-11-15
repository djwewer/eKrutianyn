# Invite-link onboarding for new users

_Date: 2026-11-15. Status: design approved by Andrii._

## Goal

Nobody sets an initial password for anyone anymore. This applies to the admin, to the звʼязковий, and to the суддя adding junaks. Every new user gets a welcome email from the app's existing Gmail account with a **one-time link**. The link opens a welcome page where the person sets their own password and is logged straight in.

## Scope

A welcome invite goes to **every newly created user**. A user is "newly created" on any of these four paths:

1. **Admin creates a kurin.** This also creates its first звʼязковий. It covers `POST /admin/kurins` and the separate "first звʼязковий" admin endpoint.
2. **Звʼязковий creates a user directly** (`POST /users`). This covers adults (виховник, суддя, писар, …) and junaks.
3. **An approval request «Створення юнака» (`CREATE_JUNAK`) is approved.** Such requests are submitted by a суддя or other non-звʼязковий staff.
4. **The junak import from Книга судді (bulk import) creates a user.** Only rows that **create** a user get an invite. Rows that update an existing user get no email.

Existing accounts are untouched. Users created earlier with a temporary password keep working as today: `mustChangePassword` forces a change after login. A звʼязковий or the admin can also send them an invite with the "send again" action.

Out of scope: passwordless/magic-link login, Google sign-in changes, and changing the forgot-password flow.

## Design

### Data
- `PasswordResetToken` gets `purpose TokenPurpose @default(RESET)`.
- New enum `TokenPurpose { RESET INVITE }`.
- A single migration. Existing rows become `RESET`.
- Validity: `RESET` stays 1 hour. `INVITE` lasts 7 days.
- New `AuditAction` value `USER_INVITED`. It is written on every invite send, including resends. The web audit-log grouping maps it to the PEOPLE group, and the API's `AUDIT_GROUPS` gets the same mapping.

### Creating users without a password
- Remove `password` from these DTOs:
  - `CreateUserDto`
  - `CreateKurinDto.zvyazkovyi`
  - `CreateAdminUserDto` (first звʼязковий)

  Also drop any password handling in the approval-request and junak-import creation code.
- New users are stored with `passwordHash = null` and `mustChangePassword = false`.
- A user is **not activated** when `passwordHash` is null. Such a user cannot log in with a password; the existing `loginWithPassword` already rejects a null hash.

### Invite service (`apps/api/src/auth/invite.service.ts`)
`sendInvite(userId, invitedBy?)` does the following:
1. Loads the user together with the kurin name/number and role.
2. Marks all of that user's unused `INVITE` tokens as used, so the old links stop working.
3. Creates a new `INVITE` token. Only the hash is stored, using the existing `generateToken`/`hashToken`. It expires in 7 days.
4. Sends the welcome email through a new `MailService.sendWelcomeInvite(to, { firstName, kurinLabel, roleLabel, inviteUrl })`. The URL is `${FRONTEND_URL}/welcome?token=<raw>`.
5. Writes `USER_INVITED` to the audit log.
6. Returns `{ sent: boolean }`.

`sendInvite` is called **after** the creating transaction commits, never inside it. A mail failure is logged and returns `sent: false`; it never rolls back the user. The creating endpoints add `inviteSent: boolean` to their responses. Bulk import reports how many invites failed.

### Auth endpoints
- `GET /auth/invite/:token`
  - Valid `INVITE` token (not used, not expired): returns `{ firstName, kurinLabel }`.
  - Anything else: a uniform 404 «Посилання недійсне або вже використане».
  - It does not consume the token.
- `POST /auth/accept-invite { token, newPassword }`
  - `newPassword` uses the same `MinLength(8)` as today.
  - Requires a valid, unused, unexpired `INVITE` token. A `RESET` token is rejected.
  - In one transaction it sets `passwordHash` and `mustChangePassword = false` and marks the token as used.
  - Returns `{ accessToken }` like login. The web BFF route sets the same cookie as login.
- `POST /users/:id/resend-invite`
  - Allowed for a звʼязковий of the same kurin.
  - Allowed only while the target is not activated; otherwise 409.
  - Returns `{ inviteSent }`.
- `POST /admin/users/:id/resend-invite`
  - Admin-guarded.
  - Same rules as above; used for звʼязкові.
- The existing forgot-password flow also works for a not-yet-activated user. Setting a password that way activates the account.

### Welcome email
- Subject: «Вітаємо в єПластуні — курінь {№ назва}».
- Same HTML shell as the existing reset mail.
- Body: «Привіт, {Ім'я}! Тебе додано до куреня {№ назва} як {роль}. Щоб увійти в єПластун, перейди за посиланням і встанови пароль. Посилання діє 7 днів.»
- A button «Встановити пароль».
- Footer: «Якщо ви не чекали цього листа, просто проігноруйте його.»
- Sender: the existing `"єПластун" <GMAIL_USER>`.
- In `MAIL_MODE=test` it is captured with type `welcome-invite`, readable through `/admin/test-mail`.

### Web
- **`/welcome?token=…`** is a public page (added to the middleware's public paths).
  - It uses `AuthLayout` (Польовий login style).
  - It fetches `GET /auth/invite/:token` and shows «Вітаємо, {Ім'я}!» and «Курінь {№ назва}».
  - Fields: «Новий пароль» and «Повторіть пароль». The minimum is 8 characters and the two must match.
  - The button is «Встановити пароль і увійти». On success the cookie is set and the page redirects to `/` (the existing home redirect picks the landing page).
  - Invalid or used link: the message «Посилання недійсне або вже використане» with hints «Попросіть звʼязкового надіслати запрошення ще раз» and a link «Забули пароль?».
- **New BFF route** `app/api/auth/accept-invite/route.ts`. It mirrors `auth/login`: it calls the API and sets the `accessToken` cookie.
- **Forms:**
  - The password field is removed from the admin «create kurin» and «first звʼязковий» forms and from `users/new`.
  - After creation each form shows «Запрошення надіслано на {email}». If `inviteSent` is false it shows a warning instead, with «Надіслати ще раз».
- **User page (`/users/[id]`):** for a not-activated user, viewers who may resend see the badge «Ще не активовано · запрошення надіслано {дата}» and the button «Надіслати запрошення ще раз».
  - The API exposes `activated: boolean` and `lastInviteAt: string | null` on the user detail. It never exposes the token.
  - The admin kurins list shows the same state for the звʼязковий, with a resend action.

## Testing
- **API unit tests (jest):**
  - `sendInvite` creates a 7-day `INVITE` token and invalidates earlier ones.
  - `sendInvite` returns `sent: false` on a mail error and writes the audit entry.
  - Accept-invite: success (password set, token used, `accessToken` returned), expired, reused, and a `RESET` token rejected.
  - Invite is called on each of the 4 creation paths. For bulk import it is called only for created rows.
  - Resend is refused (409) for an activated user, and 403/404 for another kurin.
- **E2E (Playwright):**
  - New spec `invite-onboarding.spec.ts`:
    1. The admin creates a kurin.
    2. The test reads the `welcome-invite` mail via `/admin/test-mail`.
    3. The звʼязковий opens the link, sets a password and lands in the app.
    4. The звʼязковий adds a user, who accepts the invite.
    5. Reopening the used link shows «недійсне».
    6. Resend makes the old link invalid.
  - The seed helpers (`seedKurinWithZvyazkovyi`, `createUserAs`, `createOnboardedUserAs`) stop sending passwords. They accept the invite internally (read the captured mail, then `POST /auth/accept-invite` with the spec's known password), so existing specs keep their logins.
  - Specs that asserted on the removed password fields are updated.

## Risks
- A bulk import sends many emails at once, which hits Gmail sending limits (about 500 per day for a regular account). Typical imports are tens of rows, which is acceptable. Failures are reported per row and can be resent.
- The e2e seed helpers change for every spec. Keep the change inside the helpers so the specs stay untouched.
