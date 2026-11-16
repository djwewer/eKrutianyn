# Kurin admin controls, judge-book disconnect, Google button

_Date: 2026-11-16. Status: design approved by Andrii._

## Goal

1. The admin can **temporarily deactivate** a kurin (later: unpaid subscription) and activate it again.
2. The admin can **force-delete** a kurin with all its people and data (e.g. a test kurin).
3. The **суддя** (and the звʼязковий) can **connect and disconnect** the kurin's Книга судді Google Sheet. While disconnected, nothing syncs between the sheet and the DB.
4. The Google sign-in button on the login page is full form width and centered.

## 1. Deactivation

### Data
- `Kurin.deactivatedAt DateTime?`. Null means active.
- New `AuditAction` values: `KURIN_DEACTIVATED`, `KURIN_ACTIVATED`. Both are written to the kurin's audit log with no actor (admin is not a User). The web audit grouping maps them to the same group as other kurin-settings events.

### Admin API (existing admin guard: API key + login/password)
- `POST /admin/kurins/:id/deactivate` sets `deactivatedAt = now()`. It is idempotent: an already deactivated kurin keeps its original date.
- `POST /admin/kurins/:id/activate` sets `deactivatedAt = null`.
- Both return 404 for an unknown kurin.
- `GET /admin/kurins` includes `deactivatedAt: string | null` per kurin.

### Who can use a deactivated kurin
- **Only the звʼязковий** (`role === ZVYAZKOVYI`) of that kurin. Every other user of the kurin is blocked.
- **Login is blocked in `AuthService.issueSessionFor`.** This single choke point covers password login, Google login and accept-invite.
  - A blocked user gets `403 { code: 'KURIN_DEACTIVATED', message: 'Курінь тимчасово деактивовано. Зверніться до звʼязкового.' }`.
  - Accept-invite still sets the password and consumes the token. Only the session is refused, so the person can log in once the kurin is reactivated.
- **Existing sessions are blocked in `JwtStrategy.validate`.** It already loads the user on every request, so it also selects `kurin.deactivatedAt`. A non-звʼязковий user of a deactivated kurin gets the same 403 `KURIN_DEACTIVATED`.
- Forgot-password keeps working. It doesn't issue a session.

### Web
- **Login page, Google button and `/welcome` page.** On a 403 with `code === 'KURIN_DEACTIVATED'` they show «Курінь тимчасово деактивовано. Зверніться до звʼязкового.» instead of the generic error.
- **`apiFetch`.** On a 403 with that code it calls the logout route, then navigates to `/login?reason=kurin-deactivated`. The login page shows the same message for that query param.
- **Звʼязковий of a deactivated kurin.** The session payload exposes the kurin's deactivated state. A non-dismissable banner shows in the app shell on every page: «Курінь деактивовано. Зверніться до адміністратора, щоб відновити доступ.»
  - Source of truth for the banner: `GET /kurins/me` returns `deactivatedAt`.
- **Admin page.** Each kurin row shows a «Деактивовано з {дата}» badge when deactivated. The row has a «Деактивувати» or «Активувати» action, with a confirm dialog for deactivation.

### Background jobs
- `JudgeBookSyncService.syncAllKurins` skips kurins with `deactivatedAt != null`.

## 2. Force delete

### API
- `DELETE /admin/kurins/:id/force` with body `{ confirmName: string }`.
  - 404 if the kurin doesn't exist.
  - 409 if the kurin is not deactivated: «Спершу деактивуйте курінь».
  - 400 if `confirmName.trim() !== kurin.name.trim()`.
  - Otherwise it deletes **everything that belongs to the kurin** in one interactive transaction, in FK-dependency order. That covers every row whose `kurinId` is this kurin, every row that references one of the kurin's users, the users themselves, and finally the kurin.
  - The implementer enumerates all models from `schema.prisma`. A unit/e2e test proves a fully populated kurin deletes without an FK error and that another kurin's data is untouched.
- `GET /admin/kurins/:id/delete-preview` returns counts for the dialog: `{ users, hurtky, announcements, calendarEvents, inventoryItems, treasuryTransactions }`.
- After success it writes one `Logger.warn` line with kurin id, name and counts. The kurin's own audit log is deleted with it.
- **Google Drive files are not touched.** Only the stored refresh token disappears with the kurin row.
- The existing `DELETE /admin/kurins/:id`, which only works for an empty kurin, stays unchanged.

### Web (admin page)
- «Видалити назавжди» is visible only on deactivated kurins.
- It opens a dialog. The dialog lists what will be deleted from the preview counts and has an input «Введіть назву куреня, щоб підтвердити». The delete button is enabled only when the input equals the name.
- On success the kurin list refetches.

## 3. Книга судді: суддя connects and disconnects

### Who
- `canManageJudgeBook = role === ZVYAZKOVYI || positions.includes(SUDDIA)`.
- Kurinniy keeps wizard access as today but doesn't get connect or disconnect.

### API
- `PATCH /kurins/:kurinId/junak-import/spreadsheet` is now allowed for `canManageJudgeBook`. Today it is звʼязковий-only.
- `GET /kurins/:kurinId/google-drive/picker-token` is now allowed for `canManageJudgeBook` too, since the суддя needs the picker to choose the file. Connecting the Google Drive account itself stays звʼязковий-only.
- **New `DELETE /kurins/:kurinId/junak-import/spreadsheet`**, for `canManageJudgeBook` in their own kurin. In one transaction it:
  - sets `judgeBookSpreadsheetId` and `judgeBookSpreadsheetName` to null;
  - deletes the kurin's `JunakImportMapping`;
  - sets `judgeBookRowNumber = null` for the kurin's users. This matches what happens today when a different file is connected.

  It writes audit `JUDGE_BOOK_DISCONNECTED`, a new `AuditAction`. It returns `{ success: true }`.
- Once disconnected, the nightly sync no longer selects the kurin (its query already requires a spreadsheet id and a mapping). Import endpoints that need a sheet already handle «not connected».

### Web (`/suddivstvo`)
- The connect button and the new «Відʼєднати таблицю» button show for `canManageJudgeBook`. That is the звʼязковий or a session with `SUDDIA` in `positions`.
- Disconnect opens a confirm dialog: «Синхронізація з таблицею зупиниться. Якщо підключите таблицю знову, відповідність колонок доведеться налаштувати заново.»
- If Google Drive is not connected, the суддя sees the existing state and a hint that the звʼязковий must connect Google Drive first.

## 4. Google sign-in button

- `components/google-signin-button.tsx` renders the GIS button at the width of its container, measured at mount and capped at Google's 400px max. It sits centered in a full-width wrapper.
- It uses `theme: 'filled_black'` in the dark theme and `'outline'` in light. The theme is read from the resolved `data-theme` or `prefers-color-scheme`.
- The personalized «Увійти як …» behavior stays. This is a frontend-only change.

## Testing

### API unit tests (jest)
- **Deactivate/activate:** set and clear `deactivatedAt` and write audit.
- **`issueSessionFor`:** throws 403 `KURIN_DEACTIVATED` for a non-звʼязковий of a deactivated kurin and succeeds for the звʼязковий.
- **`JwtStrategy`:** same rule.
- **Force delete:** 409 when not deactivated, 400 on name mismatch, and success. The success test (e2e against the real DB) uses a kurin with users, hurtky, announcements, etc., and checks that another kurin is untouched.
- **Judge book:** суддя can connect and disconnect, a plain виховник gets 403, and disconnect clears id, name, mapping and row numbers.
- **Sync:** skips deactivated kurins.

### E2E (Playwright)
- **Deactivation flow:**
  1. The admin deactivates a kurin.
  2. A junak's login shows the deactivated message.
  3. An already logged-in junak's next action is redirected to login with the message.
  4. The звʼязковий logs in and sees the banner.
  5. The admin activates the kurin, and the junak can log in again.
- **Force delete:** the button is hidden on an active kurin. Deactivate, then type the name, then delete. The kurin is gone from the list.
- **Суддя:** the connect and disconnect buttons are visible to a суддя and not to a plain виховник. The API calls themselves are covered by the unit tests, since the Google picker can't run in e2e.

### Visual
- Screenshot the login page (light and dark, mobile and desktop) to check the Google button.
- Screenshot the admin kurin row in active and deactivated state.
- Screenshot the звʼязковий banner.

## Out of scope
- Subscriptions and payments.
- Notifying kurin members by email about deactivation.
- Deleting Google Drive files.
- A custom-styled Google button.
