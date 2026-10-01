# Курінь consolidation — design spec

## Motivation

Today kurin-level management is spread across four separate top-level routes
(`/kurin`, `/positions`, `/hurtky`, `/users`), each gated inconsistently and
each visible only to `ZVYAZKOVYI` plus ad-hoc splices for `isKurinniy`. Plain
members (a `JUNAK` or `VYKHOVNYK` holding no special position) have almost no
visibility into their own kurin's structure. The user wants one consolidated
"Курінь" tab, built as an accordion, that becomes the single place to view
(and, for the right roles, edit) kurin info, leadership, hurtky, the
vykhovnyk roster, and the junak roster — with visibility and edit rights
scaled to the viewer's role/position.

A working prototype accordion shell (caret-prefixed list: Інформація по
куреню, Провід куреня, Гуртки, Кадра виховників, Список юнацтва) was already
approved by the user as the visual direction.

## Scope

In scope:
- One consolidated route (`/kurin`) replacing `/positions`, `/users`, and the
  current top-level `/hurtky`. Detail routes `/hurtky/[slug]` and
  `/users/[id]` are untouched, just reached from inside the new accordion.
- A single `Курінь` nav link, for every role, replacing today's separate
  `Люди` / `Гуртки` / `Курінь` / `Діловоди`-adjacent nav entries. `Запити`,
  `Налаштування`, and the `Діловодство` dropdown (`/inventory`,
  `/suddivstvo`) are unaffected.
- A real authorization pass: `kurin-positions`, `hurtky`, and
  `vykhovnyk-assignments` controllers currently gate on `@Roles(ZVYAZKOVYI)`,
  which only inspects `role` and has no concept of `isKurinniy` or
  `positions`. Kurinniy (role `JUNAK` + `KURINNYI` position) and suddia
  (role `JUNAK`/`VYKHOVNYK` + `SUDDIA` position, KURIN scope) need
  position-aware authorization added to these endpoints.
- A new frontend "request hurtok change" flow on the junak detail page for
  kurinniy and suddia (the `CHANGE_HURTOK` approval-request type already has
  full backend approve/apply logic — see `approval-requests.service.ts`
  `buildUpdateData`/`extractRelevantFields` — but nothing can currently
  create one: `create()` only allows `isKurinniy`, or SUDDIA for
  `BULK_IMPORT_JUNAKY`/`ARCHIVE_JUNAK` specifically).

Out of scope (no change):
- Junak detail page internals (contact info editing, proby, guardian
  contacts) beyond adding the hurtok-move request affordance.
- `CREATE_JUNAK` / vykhovnyk-creation permissions — these already match the
  target state (zvyazkovyi creates any role directly; kurinniy's request
  form is JUNAK-only) and need no backend change, just relocation into the
  new accordion's sections.
- `ARCHIVE_JUNAK` request creation for suddia — already works today
  (`canInitiateArchive` in `approval-requests.service.ts`).
- Any new Prisma schema or migration. `CHANGE_HURTOK` is a pre-existing
  `ApprovalActionType`; no model changes are needed anywhere in this plan.

## Routing & nav

`/kurin` becomes the sole consolidated page. `/positions` and `/users` are
deleted; the current top-level `/hurtky` page is deleted and its accordion
logic (per-hurtok expand/collapse, `HurtokDetailPanel`) is absorbed as the
"Гуртки" section's content. `/hurtky/new`, `/hurtky/[slug]`, `/users/new`,
and `/users/[id]` are kept as-is.

`nav.tsx`'s `LINKS_BY_ROLE` and the `isKurinniy`/position splice logic are
replaced by a single rule: every authenticated session gets
`{ href: '/kurin', label: 'Курінь' }`. The existing `isKurinniy` splice for
`/users`+`/hurtky` and the `role !== 'ZVYAZKOVYI'` pushes for
`/inventory`/`/suddivstvo` are removed/simplified accordingly, but the
`Запити`, `Налаштування`, and `Діловодство` dropdown entries are preserved
unchanged for the roles that already see them today.

## Permissions matrix

| Section | ZVYAZKOVYI | Kurinniy | Suddia (KURIN-scope) | Everyone else |
|---|---|---|---|---|
| Інформація по куреню | edit | view | view | view |
| Провід куреня | edit all slots, incl. Курінний | edit all slots **except** Курінний — cannot assign into it, remove it, or reassign himself out of it; that slot is entirely invisible-as-editable to him | view | view |
| Гуртки (settings: founding date, vykhovnyk assignment, діловоди, disband) | edit | view only (no settings dialog) | edit, full parity with ZVYAZKOVYI | view |
| Junak hurtok-move / archive (on the junak's own page) | direct | via approval request (already works) | via approval request (archive already works; hurtok-move is new) | not visible |
| Кадра виховників (add/remove vykhovnyk) | edit | view only | view only | not visible |
| Список юнацтва (create/view junaky) | edit (existing direct-create rights, unchanged) | edit (existing request-create rights, unchanged) | view + request archive/move (new) | not visible |

Visibility tiers:
- **Full tier** (all 5 sections, edit rights per the table above):
  `ZVYAZKOVYI`, kurinniy, KURIN-scope suddia.
- **Read-only tier** (first 3 sections only — Інформація, Провід, Гуртки;
  Кадра виховників and Список юнацтва are not rendered at all): every other
  member, i.e. a plain `JUNAK` or `VYKHOVNYK` with no qualifying position.
  This is a net-new capability for plain `JUNAK` (who today has no kurin
  visibility at all) and a change in shape for plain `VYKHOVNYK` (who today
  sees only their own assigned hurtky under "Мої гуртки"; in the new
  read-only Гуртки section they see **all** hurtky in the kurin, read-only).

A HURTOK-scope suddia (i.e. a `SUDDIA` position tied to one specific hurtok,
not the kurin-wide slot) does **not** get the full tier — they fall into the
read-only tier like any other member, unless they separately qualify via
kurinniy or a KURIN-scope position.

## Backend changes

1. **`kurin-positions.controller.ts` / `.service.ts`** — `list`/`assign`/
   `remove` currently require `@Roles(ZVYAZKOVYI)`. Replace with logic that
   allows `ZVYAZKOVYI` (unrestricted) or `isKurinniy` (restricted: cannot
   `assign` with `positionType === KURINNYI`; cannot `remove` a position
   record where `positionType === KURINNYI`). Both checks live at the
   service layer (where `actor.isKurinniy` and the target position's type
   are both available), not purely in a decorator.
2. **`hurtky.controller.ts`** — `update`/`archive` currently require
   `@Roles(ZVYAZKOVYI)`; add a KURIN-scope-SUDDIA bypass alongside it.
   `GET by-slug/:slug` currently is `@Roles(VYKHOVNYK, ZVYAZKOVYI)` only;
   add `JUNAK` so plain junaky (and kurinniy, who is role JUNAK) can read
   hurtok detail for the read-only/view-only Гуртки section.
3. **`vykhovnyk-assignments.controller.ts`** — `assign`/`remove` currently
   require `@Roles(ZVYAZKOVYI)`; add the same KURIN-scope-SUDDIA bypass.
4. **`approval-requests.service.ts` `create()`** — add a
   `canInitiateChangeHurtok = dto.actionType === CHANGE_HURTOK &&
   actor.positions.includes(SUDDIA)` branch (mirroring the existing
   `canInitiateBulkImport`/`canInitiateArchive` pattern), so KURIN-scope
   suddia can submit a `CHANGE_HURTOK` request. Kurinniy already can
   (covered by the existing `isKurinniy` branch) — only the frontend UI is
   missing for them today.
5. Cross-tenant and archived-target checks on all of the above follow the
   existing patterns elsewhere in the codebase (`findUnique` + kurinId
   match, reject if `archivedAt` set where relevant).

"KURIN-scope SUDDIA" is determined the same way everywhere: the actor has an
active `KurinPosition` with `positionType === SUDDIA && scope === KURIN`.
`CurrentUserPayload.positions` (`auth.service.ts`) is a flat `PositionType[]`
with no scope attached, baked into the JWT at login via `signToken(...)`
alongside `isKurinniy` (itself computed once at login time by
`isKurinniyForUser`, `common/kurinniy.util.ts`) — changing `positions`'
shape would break every existing `positions.includes(X)` call site
(`nav.tsx`, `approval-requests.service.ts`, `hurtok-detail-panel.tsx`,
etc.). Instead, this plan adds one new boolean, `isSuddiaKurin`, computed by
a new `isSuddiaKurinForUser` helper mirroring `isKurinniyForUser` exactly
(same query shape, `positionType: SUDDIA, scope: KURIN, removedAt: null`),
threaded through `signToken`/`JwtPayload`/`CurrentUserPayload` the same way
`isKurinniy` already is. Like `isKurinniy`, this is a login-time snapshot —
a user who gains or loses the KURIN-scope SUDDIA position mid-session sees
it reflected only after their next login, matching existing behavior for
`isKurinniy` and `positions` today (no new staleness class, just the
existing one extended to one more field).

## Frontend changes

- **`/kurin/page.tsx`**: becomes the outer accordion shell with 3 or 5
  sections per the visibility tiers above, each collapsed by default.
  Section content reuses existing components:
  - Інформація по куреню → today's `/kurin` content (`KurinPageContent`),
    split into a view-only render path and the existing edit controls
    gated on `canChangeProgram`.
  - Провід куреня → today's `/positions` content (`PositionSlot` list),
    with `canEditSlot(positionType)` now `ZVYAZKOVYI` always, or
    `isKurinniy && positionType !== 'KURINNYI'`.
  - Гуртки → today's `/hurtky` page content (the per-hurtok nested
    accordion using `HurtokDetailPanel`), with `HurtokDetailPanel`'s
    existing `canConfigure` extended to include KURIN-scope suddia, and a
    read-only render path (no settings button, no add-junak link) for the
    read-only tier.
  - Кадра виховників → today's `/users` list pre-filtered to `VYKHOVNYK`,
    no filter buttons (the section itself is the filter); "Додати людину"
    (vykhovnyk creation) stays zvyazkovyi-only and moves here.
  - Список юнацтва → today's `/users` list pre-filtered to `JUNAK`, no
    filter buttons; "Додати людину" (junak creation, direct or
    request-based) moves here.
- **Junak detail page (`/users/[id]/page.tsx`)**: the existing
  `canMoveHurtok` (today `ZVYAZKOVYI`-only, direct write) gets a sibling
  request-based path: kurinniy and KURIN-scope suddia see the same hurtok
  `<select>` but submitting goes through
  `useCreateApprovalRequest().mutate({ actionType: 'CHANGE_HURTOK', junakId, newData: { hurtokId } })`
  instead of the direct `useUpdateHurtok` mutation, mirroring the existing
  archive button's `isZvyazkovyi ? direct : request` branch at
  `users/[id]/page.tsx:255-262`.
- **`nav.tsx`**: simplified per the Routing & nav section above.
- Deleted: `app/positions/page.tsx`, `app/users/page.tsx`, the current
  `app/hurtky/page.tsx` (its logic moves into the Гуртки section
  component). `e2e` specs covering deleted pages are updated or removed to
  match, the same way the hurtky-ui-rework plan handled `/positions` and
  `/vykhovnyk-assignments` removal.

## Testing

Existing Playwright coverage for `/positions`, `/users`, `/hurtky` (listing,
filtering, creating, settings-dialog flows) gets rewritten against the new
accordion structure, following the same pattern used in the hurtky-ui-rework
plan (`hurtky-accordion.spec.ts`, `hurtok-settings.spec.ts`, etc.) — same
assertions, new navigation path (expand a `/kurin` section instead of
visiting a dedicated route). New coverage is needed for:
- Kurinniy editing a non-Курінний slot in Провід куреня, and confirming the
  Курінний slot shows no edit controls for kurinniy.
- KURIN-scope suddia opening the hurtok settings dialog and editing it.
- KURIN-scope suddia submitting a `CHANGE_HURTOK` request and a zvyazkovyi
  approving it (mirroring the existing `ARCHIVE_JUNAK` approval e2e).
- Kurinniy submitting a `CHANGE_HURTOK` request via the new UI (previously
  impossible — no UI existed).
- A plain `JUNAK` and a plain `VYKHOVNYK` each seeing exactly 3 sections,
  all read-only, and not seeing Кадра виховників/Список юнацтва at all.
- A HURTOK-scope suddia (not KURIN-scope) confirmed to fall into the
  read-only tier, not the full tier.

Backend e2e coverage mirrors the controller/service changes in the Backend
changes section: kurinniy blocked from touching the Курінний slot at the API
level (not just hidden in the UI), KURIN-scope suddia allowed and
HURTOK-scope suddia rejected on the hurtky/vykhovnyk-assignments endpoints,
and `approval-requests` `create()` accepting `CHANGE_HURTOK` from suddia.
