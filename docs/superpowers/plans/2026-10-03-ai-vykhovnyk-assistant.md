# AI-виховник: окремий чат-помічник для підготовки до точок проби

**Goal:** A new page, separate for JUNAK and for ZVYAZKOVYI, where the user chats with an AI ("AI-виховник") about a specific проба point. The AI explains what the point actually requires (grounded in the real `ProbyPoint` data, not guesswork) and produces a concise, information-dense study document — never padded with filler. It must refuse or redirect requests that aren't genuinely about Plast proba preparation, and when a user's request doesn't match what the selected point actually requires, it must say so and offer to prepare the *real* content instead, asking for explicit confirmation before doing so.

**Explicitly out of scope for this plan** (confirmed with the user):
- "Вмілості" (Plast merit/specialty badges) are a separate, real-world Plast concept that this app does not model at all (no catalog, no per-junak progress). This plan covers **only** the already-tracked `ProbyPoint` data (Прихильник/Учасник/Розвідувач program). Adding a vmilist catalog is a distinct, future feature.
- A curated knowledge base of external sources (websites, videos) for RAG-grounded answers is explicitly deferred. For this plan, the AI generates study material from the model's own general knowledge plus the point's own text from the database — nothing else.
- ZVYAZKOVYI gets their **own private chat** (identical feature, for their own testing/use) — not an oversight panel into junaky's conversations. No cross-user visibility of conversations in this plan.
- VYKHOVNYK does not get access to this page in this plan (not requested).

## Context — read before writing any code

- **Existing data model**: `ProbyProgram` → `ProbyStage` (ordered) → `ProbyCategory` → `ProbyPoint` (`description: String`, short free text — this is the canonical "what this point requires" text; there is no longer-form official text anywhere else in the app). See `apps/api/prisma/schema.prisma` lines ~229-269.
- **Per-junak progress** already exists: `JunakProgress` (per point, `status: DONE | NOT_DONE`) and `JunakStageProgress` (per stage, `status`, `hasDebt`, `closedAt`/`firstClosedAt`). `ProbyProgressService.getProgressFor(junakId, actor)` (`apps/api/src/proby-progress/proby-progress.service.ts`) already returns `{ points, stages }` with per-stage status (OPEN/CLOSED/LOCKED) and per-point DONE/NOT_DONE — reuse this, do not reimplement stage-reachability logic.
- **`CurrentUserPayload`** (`apps/api/src/common/decorators/current-user.decorator.ts`) carries `userId`, `kurinId`, `role`, `isKurinniy`, `positions` — the standard shape used by every other controller in this app.
- **Frontend conventions**: `apiFetch` (`apps/web/lib/api-client.ts`) wraps fetch with auth + error handling; query hooks live in `apps/web/lib/queries/*.ts` using `@tanstack/react-query`; `useProbyProgram` (`apps/web/lib/queries/proby.ts`) already fetches the full nested `ProbyProgram → stages → categories → points` tree for the current kurin, and `useJunakProgress` fetches a specific junak's point-level progress. Reuse both for the point-picker rather than inventing new endpoints that duplicate this data.
- **No existing OpenAI/LLM integration anywhere in this codebase.** This plan is the first. `npm install openai --workspace apps/api` (official Node SDK) is needed — check how `googleapis`/`exceljs` were added for this repo's exact monorepo install convention rather than guessing the flag.
- **Env var convention**: secrets are read via `process.env.X` directly in services (see `GoogleDriveService`, `process.env.FRONTEND_URL` in `kurin-google-drive.controller.ts`) and documented in `apps/api/.env.example`. Add `OPENAI_API_KEY` (required) and `OPENAI_MODEL` (optional, default `gpt-4o`) the same way.
- **This plan is split across both apps**: Prisma schema + new backend module in `apps/api`; a new page + nav link in `apps/web`.

## Global Constraints

- **The system prompt is safety-critical and is specified verbatim in Task 3 below — do not improvise or shorten it.** It encodes the entire "don't let junaky misuse this for unrelated homework" guardrail and the "check the request against the real point, offer the real thing, ask for confirmation" behavior the user explicitly designed. Implement it exactly as given; if something about the actual `ProbyPoint` data shape doesn't fit the template placeholders, flag it rather than guessing.
- **Every assistant turn must be grounded in the server-selected `ProbyPoint`'s real `description` text** (plus its category and stage names for context) — this text is injected into the system prompt by the backend on every request, never trusted from the client, never omitted.
- **No RAG, no external source fetching, no web search tool-calling in this plan.** The OpenAI call is a plain chat completion using the model's own knowledge plus the injected point text. Do not add a "sources" field, a scraper, or a vector store — that is explicitly future work.
- **One continuous conversation per user**, not a list of separate chat sessions. On first message ever, create the user's single `AiConversation` row; all later messages append to it. No "new conversation" / "delete conversation" UI in this plan.
- **Point selection is explicit UI state, not inferred from free text.** The user picks a `ProbyPoint` from a dropdown/list before chatting about it; every message sent to the backend carries the currently-selected `probyPointId`, and the backend re-validates it belongs to the user's own kurin's proba program on every request (never trust a stale client-side selection). Changing the selected point mid-conversation does not start a new conversation — it's still the same thread, the next assistant turn's system prompt just grounds on the newly selected point instead.
- **Point-picker scope differs by role**: for JUNAK, list only points from stages that are not LOCKED and the point itself is not already DONE (reuse `ProbyProgressService.getProgressFor`) — there's no reason to prepare for something already confirmed or not yet reachable. For ZVYAZKOVYI, list the kurin's entire program (all stages, all points) with no filtering — they're using this to test/review the feature across the whole catalog, not to track their own progress (they have none).
- **Access control**: only `JUNAK` and `ZVYAZKOVYI` roles see the nav link and can hit the endpoints. `VYKHOVNYK` gets a 403 if they somehow hit the API directly. A JUNAK can only operate on their own conversation (never pass another user's id). Standard pattern: compare `actor.userId` to the resource owner, same as every other per-user endpoint in this app (e.g. `users.controller.ts`'s `me` routes).
- **No streaming in this plan.** Call OpenAI's chat completions synchronously, wait for the full response, store it, return it. A loading indicator in the UI while waiting is enough; token-by-token streaming is a future polish, not required now.
- **Testing without a real OpenAI key**: wrap the OpenAI SDK call behind a small injectable service (`OpenAiService` or similar) so tests can override it with a fake, the same pattern this codebase already uses for `GoogleDriveService` in e2e specs (`.overrideProvider(...).useValue(fake)`). Never let a test make a real network call to OpenAI.
- **Cost/safety floor, not a hard requirement to build UI for**: cap the conversation history sent to OpenAI on each call (e.g. the last 20 messages) so a very long-running conversation doesn't blow up token costs unbounded. No need for a user-facing "usage" indicator in this plan.

---

## Task 1: Prisma schema — `AiConversation`, `AiMessage`

**Files:** `apps/api/prisma/schema.prisma`, new migration under `apps/api/prisma/migrations/`

Add:
```prisma
enum AiMessageRole {
  USER
  ASSISTANT
}

model AiConversation {
  id        String      @id @default(uuid())
  userId    String      @unique
  user      User        @relation(fields: [userId], references: [id])
  createdAt DateTime    @default(now())
  messages  AiMessage[]
}

model AiMessage {
  id             String         @id @default(uuid())
  conversationId String
  conversation   AiConversation @relation(fields: [conversationId], references: [id])
  role           AiMessageRole
  content        String         @db.Text
  probyPointId   String?
  probyPoint     ProbyPoint?    @relation(fields: [probyPointId], references: [id])
  createdAt      DateTime       @default(now())

  @@index([conversationId, createdAt])
}
```
`userId @unique` on `AiConversation` is what enforces "one conversation per user" at the database level — don't skip this constraint. `probyPointId` on `AiMessage` records which point was selected when that particular message was sent (nullable: a message sent before any point was ever selected has no point; also useful later for "what did we discuss about point X" lookups, though no such UI is built in this plan). Add the reverse relation fields on `User` and `ProbyPoint` models as needed for Prisma's relational integrity (check how other optional back-relations are declared elsewhere in this schema for the exact convention, e.g. on `User` for other 1:1/1:many relations).

Run this repo's actual migration generation command (check a recent migration's name for the naming convention — do not hand-write the SQL) and `npx prisma generate`.

**Verification:** migration applies cleanly against the dev DB; `npx tsc --noEmit` clean in `apps/api` (new Prisma types will be generated).

---

## Task 2: `OpenAiService` — thin, mockable OpenAI wrapper

**Files:** new `apps/api/src/ai-assistant/openai.service.ts`, test file `apps/api/src/ai-assistant/openai.service.spec.ts`, `apps/api/package.json`, `apps/api/.env.example`

1. `npm install openai --workspace apps/api` (check the exact monorepo-aware install syntax already used for `googleapis`/`exceljs` in this repo's history — don't guess the flag).
2. Add to `apps/api/.env.example`:
   ```
   OPENAI_API_KEY="sk-replace-me"
   OPENAI_MODEL="gpt-4o"
   ```
3. New injectable service:
   ```ts
   @Injectable()
   export class OpenAiService {
     private readonly client: OpenAI;
     constructor() {
       this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
     }

     async createChatCompletion(messages: { role: 'system' | 'user' | 'assistant'; content: string }[]): Promise<string> {
       const response = await this.client.chat.completions.create({
         model: process.env.OPENAI_MODEL ?? 'gpt-4o',
         messages,
       });
       const content = response.choices[0]?.message?.content;
       if (!content) {
         throw new ServiceUnavailableException('OpenAI returned an empty response');
       }
       return content;
     }
   }
   ```
   (Exact shape of the OpenAI Node SDK's chat completions call may differ slightly by SDK version — check the installed version's actual types/docs rather than trusting this snippet blindly, and adjust accordingly; the important parts are: takes an ordered list of role+content messages, returns the assistant's text, throws a clear error if the API call fails or returns nothing usable.)
4. If `OPENAI_API_KEY` is not set at startup, do not crash the whole app — the SDK client can still construct; only throw when an actual call is attempted and the key is missing/invalid (the SDK will naturally error on the real HTTP call — don't add redundant upfront validation beyond what's needed for a clear error message).

**Tests to add** in `openai.service.spec.ts`: mock the `openai` package itself (same approach as this session's `google-drive.service.spec.ts` mocking `googleapis` — hand-mock the SDK's constructor and `chat.completions.create`), verify: (1) a successful call returns the message content, (2) an empty/missing response content throws a clear error, (3) the model name falls back to `gpt-4o` when `OPENAI_MODEL` is unset.

**Verification:** `npx jest src/ai-assistant/openai.service.spec.ts` green, no real network call made.

---

## Task 3: `AiAssistantService` + controller — conversation, guardrail, point grounding

**Files:** new `apps/api/src/ai-assistant/ai-assistant.module.ts`, `ai-assistant.service.ts`, `ai-assistant.controller.ts`, `dto/send-message.dto.ts`, test files for each.

### Endpoints

- `GET /ai-assistant/conversation` — returns the current user's conversation (`{ id, messages: [{ role, content, probyPointId, createdAt }] }`), creating an empty one on first access if none exists yet. Any authenticated JUNAK or ZVYAZKOVYI can call this for themselves only (no `:userId` param — always `actor.userId`).
- `POST /ai-assistant/messages` — body `{ probyPointId: string, content: string }`. Validates `probyPointId` belongs to a `ProbyPoint` within the actor's own kurin's `probyProgramId` (join through `ProbyPoint → ProbyCategory → ProbyStage → ProbyProgram`, compare to `kurin.probyProgramId` for `actor.kurinId`) — 404/403 if not. For a JUNAK actor, additionally verify the point is eligible per the Global Constraints' point-picker scope (not DONE, stage not LOCKED) — reuse `ProbyProgressService.getProgressFor(actor.userId, actor)` to get this, do not reimplement the stage-status logic. For a ZVYAZKOVYI actor, skip this extra filter (any point in the program is fine). Then: load/create the conversation, build the system prompt (Task 3's own section below), build the message list (system + last 20 stored messages + the new user message), call `OpenAiService.createChatCompletion`, store both the new user message and the assistant's reply (both tagged with this `probyPointId`), return the assistant's reply plus the full updated message list.

### Access control

- `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.JUNAK, Role.ZVYAZKOVYI)` at the controller level (check `RolesGuard`'s actual decorator-combination convention from an existing controller, e.g. `kurin-positions.controller.ts`, rather than guessing the exact decorator usage).
- Every operation is implicitly scoped to `actor.userId` — there is no "view another user's AI conversation" capability anywhere in this plan, for either role.

### The system prompt — use this exact structure, filling in the bracketed values from the real `ProbyPoint`/category/stage data

```
Ти — AI-виховник, асистент для юнака пластового куреня, який готується до проби.

Юнак зараз працює над точкою:
Ступінь: [ProbyStage.name]
Категорія: [ProbyCategory.name]
Точка: [ProbyPoint.description]

Твоя задача:
1. Якщо прохання юнака справді стосується підготовки до ЦІЄЇ точки — підготуй для нього стислий, інформативний документ, яким він може скористатися для підготовки. Без зайвої води, без філерних фраз — лише те, що реально потрібно знати чи вміти для цієї точки.
2. Якщо прохання юнака НЕ відповідає тому, що реально вимагає ця точка (наприклад, він просить щось значно ширше, вужче, або геть не пов'язане з наведеним описом) — НЕ виконуй прохання як є. Прямо скажи, що саме вимагає ця точка за офіційним описом, і запропонуй підготувати матеріал саме під цю вимогу. Запитай окреме підтвердження, перш ніж продовжити.
3. Якщо прохання юнака взагалі не стосується підготовки до проби чи пластового життя (наприклад, прохання виконати шкільне домашнє завдання, написати код для стороннього проекту, чи будь-яке інше завдання, не пов'язане з точкою проби) — ввічливо відмов і поясни, що ти допомагаєш тільки з підготовкою до точок проби.

Завжди лишайся доброзичливим, говори українською мовою.
```

(This is the required baseline — the implementer must substitute the real values and may adapt wording for correctness, but must preserve the three numbered behaviors and the "without filler" instruction exactly in substance.)

### Error handling

If `OpenAiService.createChatCompletion` throws, surface a clear 503-equivalent error to the frontend without storing a broken assistant message (store the user's message regardless, since they did send it — but only store an assistant message if a real reply was obtained).

**Tests to add** (unit, hand-mocked Prisma + a fake `OpenAiService`, same style as `junak-import-row-processor.service.spec.ts`):
- Builds the correct system prompt content (stage name, category name, point description all present) for a given point.
- Rejects a `probyPointId` that doesn't belong to the actor's kurin's program (403/404).
- For a JUNAK actor, rejects a point that's already DONE or in a LOCKED stage.
- For a ZVYAZKOVYI actor, accepts any point in the program regardless of status.
- Creates the conversation on first message, reuses it on the second.
- Caps history sent to OpenAI at the last 20 stored messages (seed more than 20, assert the call only includes the most recent ones plus the system prompt).
- Stores the user message even when the OpenAI call fails, but does not store a fabricated assistant message.

**e2e tests** (new `apps/api/test/ai-assistant.e2e-spec.ts`, `.overrideProvider(OpenAiService).useValue(fakeOpenAi)` following the `kurin-google-drive.e2e-spec.ts` pattern): a JUNAK can fetch their empty conversation, send a message about one of their own open points and get a stored exchange back; a VYKHOVNYK gets 403; a JUNAK sending a `probyPointId` for an already-DONE point gets rejected; a ZVYAZKOVYI can message about any point in their kurin's program.

**Verification:** `npx jest src/ai-assistant` and the new e2e spec (via `--runInBand`) green; `npx tsc --noEmit` clean.

---

## Task 4: Frontend — `/ai-vykhovnyk` page, chat UI, point picker

**Files:** new `apps/web/app/ai-vykhovnyk/page.tsx`, new `apps/web/lib/queries/ai-assistant.ts`, types added to `apps/web/lib/types.ts`, new e2e spec.

1. Query hooks (`apps/web/lib/queries/ai-assistant.ts`, mirroring the style of `apps/web/lib/queries/proby.ts`/`inventory.ts`):
   - `useAiConversation()` — `GET /ai-assistant/conversation`.
   - `useSendAiMessage()` — `POST /ai-assistant/messages`, invalidates the conversation query on success.
2. Page (`apps/web/app/ai-vykhovnyk/page.tsx`), gated to `session.role === 'JUNAK' || session.role === 'ZVYAZKOVYI'` (redirect or show nothing otherwise, matching this app's existing per-page access pattern — check how another role-gated page, e.g. `/inventory`, does this):
   - A point picker: for JUNAK, fetch via `useProbyProgram()` + `useJunakProgress(session.userId)` and filter to not-DONE points in non-LOCKED stages (mirror the exact filtering the backend also applies — the backend is the enforcement, this is just for a sane default UI list); for ZVYAZKOVYI, fetch `useProbyProgram()` and list everything, grouped by stage → category for readability (a flat 50-item dropdown is unusable — use nested optgroups or a similar grouped control, check if this app already has a grouped-select pattern, e.g. in the hurtok assignment UI, before inventing a new one).
   - Below the picker: the chat thread (user messages right-aligned or visually distinct from assistant messages — reuse this app's existing message/bubble visual language if anything similar exists, e.g. check `components/ui/` for any chat-like primitive before building from scratch) and a text input + send button.
   - Selecting a different point does not clear the chat thread (per Global Constraints) — only changes what gets sent as `probyPointId` on the next message.
   - Disable the send button while a point isn't selected, and while a message is in flight (`useSendAiMessage().isPending`).
3. Nav link: add an entry for JUNAK and ZVYAZKOVYI roles in `apps/web/components/nav.tsx`'s `LINKS_BY_ROLE` map (label e.g. "AI-виховник"), not for VYKHOVNYK.

**e2e test** (new `apps/web/e2e/ai-vykhovnyk.spec.ts`): mock the backend's `/ai-assistant/*` routes via `page.route` (do not call the real OpenAI-backed backend from a frontend e2e test) — seed a kurin + junak, mock a conversation + point list, select a point, send a message, assert the mocked assistant reply renders in the thread. Also assert a VYKHOVNYK does not see the nav link.

**Verification:** `npx tsc --noEmit` and lint clean in `apps/web`; the new e2e spec passes; manually run the dev server and exercise the page in a real browser (per this session's standing UI-verification practice) before calling this task done.

---

## Final Integration Task: full regression + review

1. `npx tsc --noEmit` and full `apps/api` unit + e2e suites (`npx jest`, `npx jest --config ./test/jest-e2e.json --runInBand`) green; `npx tsc --noEmit` and lint clean in `apps/web`, full `apps/web` e2e suite (`npx playwright test`) green.
2. Dispatch the final whole-branch review (most capable available model) against this plan's diff, using this plan's Global Constraints as the constraints block. Pay particular attention to: (a) the system prompt is actually grounded in the real selected point's text on every request, not a stale/cached one; (b) a JUNAK genuinely cannot address another user's conversation or an ineligible point even via a crafted request; (c) the OpenAI API key is never logged or echoed back to the client in any error path; (d) the guardrail behavior (steps 2 and 3 of the system prompt) is the kind of instruction a reviewer should sanity-check reads correctly as written, not just "looks present."
3. Fix Critical/Important findings, re-verify, re-review if needed, then stop (per the user's standing practice this session — no merge to main without their explicit instruction).
