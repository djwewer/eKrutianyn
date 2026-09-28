# Junak Book Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a kurin's zvyazkovyi (directly) or kurinniy/suddya (via an approval request) import junaky from a connected Google Sheet ("Книга судді") through a manual column-mapping wizard — creating/updating junaky, hurtky, guardian contacts, positions, and backfilling proba progress — plus a minimal write-back that appends a new row when a junak is later created through the normal app flow.

**Architecture:** Reuses the existing per-kurin OAuth infrastructure (`GoogleDriveService`, `Kurin.driveRefreshToken`) from the inventory feature, adding Sheets-API read/append methods. A new `JunakImportMapping` row per kurin persists the column↔field and position-value mappings so they can be reused both for import and for future write-backs. A single shared row-processing function handles both the zvyazkovyi-direct path and the courinniy/suddya-approval-request path (`ApprovalActionType.BULK_IMPORT_JUNAKY`), so the two entry points never duplicate business logic.

**Tech Stack:** NestJS + Prisma + PostgreSQL (backend), Next.js App Router + TanStack Query (frontend), `googleapis` Sheets API v4 (already a dependency, new API surface), Google Picker (already integrated, new view type).

## Global Constraints

- **Additive migration only.** New nullable `Kurin` columns (`judgeBookSpreadsheetId`, `judgeBookSpreadsheetName`), one new table (`JunakImportMapping`), one new value on the existing `ApprovalActionType` enum (`BULK_IMPORT_JUNAKY`). Adding an enum value is a safe, additive Postgres/Prisma migration — no existing enum value is renamed or removed.
- **Proba-progress backfill is additive-only.** Never un-closes an already-closed stage and never un-confirms an already-confirmed point, even if the imported data implies a lower degree than what's already tracked. A stage already `CLOSED` (per `ProbyProgressService`'s status computation) is left untouched by import.
- **Stages must be closed in order.** `ProbyProgressService.confirm()` only allows confirming points in a stage that is currently `OPEN`, and a stage only becomes reachable/`OPEN` once the previous stage has `firstClosedAt` set. Backfilling stage N therefore requires stages 1..N-1 to already be closed (by this same import, if not already closed before it). Always process stages in their `order` (ascending) for a given row.
- **The proba-progress actor is always the effective zvyazkovyi performing the write** — for a direct import, the importing zvyazkovyi's own `CurrentUserPayload`; for an approved bulk request, the *approving* zvyazkovyi's own `CurrentUserPayload` (never the original kurinniy/suddya initiator's). `ProbyProgressService.assertCanConfirm()` only trivially permits `Role.ZVYAZKOVYI`; any other role hits a hurtok-assignment check that has nothing to do with this feature and would wrongly fail.
- **Blank cells never overwrite existing non-blank values** when updating a matched existing junak — only a mapped column with a non-empty cell for that row applies.
- **No "Скоб" mapping target exists** in the Крок 1 field list — the proba catalog (both OLD and NEW programs) has exactly 3 stages, named `"Проба прихильника (...)"`, `"Проба учасника (...)"`, `"Проба розвідувача (...)"` (parenthetical subtitle varies) — match a kurin's stages to the three degree columns by `stage.name.startsWith('Проба прихильника')` / `startsWith('Проба учасника')` / `startsWith('Проба розвідувача')`, never by exact equality.
- **Reuse existing services for anything with real invariants**: `HurtkyService.create()` for new hurtky, `KurinPositionsService.assign()` for positions (do not write `KurinPosition` rows directly — this service already handles "remove any other active position this user holds in this scope"), `ProbyProgressService.confirm()`/`closeStage()` for progress. Plain `User`/`GuardianContact`/`JunakImportMapping` rows are created via direct Prisma calls, matching how `ApprovalRequestsService.approve()`'s existing `CREATE_JUNAK` branch and `UsersService.create()` already do direct `prisma.user.create()` — there is no existing shared "create a junak" service method to reuse for that specific piece.
- **Per-row error isolation is best-effort, not full transactional atomicity.** `KurinPositionsService.assign()` and `ProbyProgressService.confirm()`/`closeStage()` each run their own internal Prisma operations independent of any outer transaction — composing them into one atomic transaction with the plan's own direct writes is not practical without changing those services' signatures, which is out of scope. Instead: wrap the row's own direct writes (user create/update, hurtok create-if-needed, guardian contacts) in one `prisma.$transaction` so *that part* is atomic; if it succeeds, proceed to positions and proba-progress as separate sequential calls. If any later step in the row throws, catch it, record the row's result as failed with the error message, and move to the next row — do not attempt to roll back the earlier steps that already succeeded for that row. State this plainly in code comments and in the row-result shape (`succeededSteps`/`error`), not as a hidden gap.
- **Write-back failures never block or roll back junak creation** — catch, log a warning, continue. Matches the established Drive-graceful-degradation pattern from the OAuth migration plan (`ServiceUnavailableException` caught and swallowed at the call site, not surfaced to the requester).
- **This machine has only 8GB RAM and has crashed from unconstrained test parallelism.** Every Jest invocation uses `--runInBand`; every Playwright invocation uses `--workers=1`. Never run either with default parallelism.
- **Git hygiene:** every commit uses exact file paths in `git add`, never `-A` or `.`.
- A stale note in `apps/web/AGENTS.md`/`CLAUDE.md` claims this Next.js install needs `node_modules/next/dist/docs/` consulted before writing code — that path does not exist (confirmed repeatedly in this exact repo across prior subprojects). Ignore it.

---

## Task 1: Prisma schema — `JunakImportMapping`, `Kurin` fields, `BULK_IMPORT_JUNAKY`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing from other tasks (fully self-contained).
- Produces: `Kurin.judgeBookSpreadsheetId`/`judgeBookSpreadsheetName`, the `JunakImportMapping` model, and `ApprovalActionType.BULK_IMPORT_JUNAKY` — consumed by every later task.

### Step 1: Add the schema changes

Open `apps/api/prisma/schema.prisma`. Find the `Kurin` model (it currently ends with the Drive fields from a prior subproject):

```prisma
model Kurin {
  id             String      @id @default(uuid())
  name           String
  kurinNumber    String      @unique
  gender         KurinGender
  stanytsia      String
  probyProgramId String
  probyProgram   ProbyProgram @relation(fields: [probyProgramId], references: [id])
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  driveFolderId        String?
  driveFolderName      String?
  driveRefreshToken    String?
  driveConnectedEmail  String?
  driveConnectedAt     DateTime?

  hurtky Hurtok[]
  inventoryItems InventoryItem[]
  users  User[]
  positions KurinPosition[]
}
```

Add two new fields right after `driveConnectedAt DateTime?`, and a new relation line in the relations block:

```prisma
model Kurin {
  id             String      @id @default(uuid())
  name           String
  kurinNumber    String      @unique
  gender         KurinGender
  stanytsia      String
  probyProgramId String
  probyProgram   ProbyProgram @relation(fields: [probyProgramId], references: [id])
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  driveFolderId        String?
  driveFolderName      String?
  driveRefreshToken    String?
  driveConnectedEmail  String?
  driveConnectedAt     DateTime?
  judgeBookSpreadsheetId   String?
  judgeBookSpreadsheetName String?

  hurtky Hurtok[]
  inventoryItems InventoryItem[]
  users  User[]
  positions KurinPosition[]
  junakImportMapping JunakImportMapping?
}
```

Add a new model anywhere after `Kurin`:

```prisma
model JunakImportMapping {
  id                   String   @id @default(uuid())
  kurinId              String   @unique
  kurin                Kurin    @relation(fields: [kurinId], references: [id])
  columnMapping        Json
  positionValueMapping Json
  updatedAt            DateTime @updatedAt
}
```

Find the `ApprovalActionType` enum:

```prisma
enum ApprovalActionType {
  CHANGE_FULL_NAME
  CHANGE_BIRTH_DATE
  CHANGE_EMAIL
  CHANGE_HURTOK
  CREATE_JUNAK
}
```

Add the new value:

```prisma
enum ApprovalActionType {
  CHANGE_FULL_NAME
  CHANGE_BIRTH_DATE
  CHANGE_EMAIL
  CHANGE_HURTOK
  CREATE_JUNAK
  BULK_IMPORT_JUNAKY
}
```

### Step 2: Generate and apply the migration

Run (from `apps/api/`, against your local dev database):

```bash
npx prisma migrate dev --name add_junak_import_mapping
```

Expected: `Your database is now in sync with your schema`. The generated `migration.sql` should contain: two `ALTER TABLE "Kurin" ADD COLUMN` statements, one `CREATE TABLE "JunakImportMapping"` with its foreign key and unique constraint on `kurinId`, and one `ALTER TYPE "ApprovalActionType" ADD VALUE 'BULK_IMPORT_JUNAKY'`. Nothing else — no `ALTER` on any existing column, no changes to any other enum value.

### Step 3: Verify the API still builds

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

### Step 4: Commit

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add JunakImportMapping model and BULK_IMPORT_JUNAKY action type"
```

---

## Task 2: Backend + frontend — connect "Книга судді" (Sheets read, mapping storage)

**Files:**
- Modify: `apps/api/src/google-drive/google-drive.service.ts`
- Modify: `apps/api/src/google-drive/google-drive.service.spec.ts`
- Create: `apps/api/src/kurins/dto/save-junak-import-mapping.dto.ts`
- Create: `apps/api/src/kurins/dto/set-junak-import-spreadsheet.dto.ts`
- Create: `apps/api/src/kurins/kurin-junak-import.controller.ts`
- Modify: `apps/api/src/kurins/kurins.module.ts`
- Test: `apps/api/test/kurin-junak-import-mapping.e2e-spec.ts`
- Modify: `apps/web/lib/google-picker.ts`
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/queries/junak-import.ts`
- Modify: `apps/web/app/kurin/page.tsx`

**Interfaces:**
- Consumes: `Kurin.judgeBookSpreadsheetId`/`Name`, `JunakImportMapping` (Task 1).
- Produces: `GoogleDriveService.readSheetValues(kurinId, spreadsheetId): Promise<string[][]>` and `GoogleDriveService.appendSheetRow(kurinId, spreadsheetId, values: string[]): Promise<void>` — consumed by Tasks 3-6. HTTP endpoints:
  - `GET /kurins/:kurinId/junak-import/status` (JWT, zvyazkovyi-only) → `{ connectedSpreadsheetId?: string; connectedSpreadsheetName?: string; mapping?: { columnMapping: unknown[]; positionValueMapping: unknown[] } }`
  - `PATCH /kurins/:kurinId/junak-import/spreadsheet` (JWT, zvyazkovyi-only; body `{ spreadsheetId: string; spreadsheetName: string }`) → sets `Kurin.judgeBookSpreadsheetId`/`Name`
  - `GET /kurins/:kurinId/junak-import/sheet-data` (JWT, zvyazkovyi-only) → `{ rows: string[][] }` — raw grid from the connected sheet
  - `PUT /kurins/:kurinId/junak-import/mapping` (JWT, zvyazkovyi-only; body `{ columnMapping: unknown[]; positionValueMapping: unknown[] }`) → upserts `JunakImportMapping`
  `openGoogleSheetPicker(accessToken, onPicked)` in `apps/web/lib/google-picker.ts` — consumed by Task 7's wizard entry point and by `apps/web/app/kurin/page.tsx`'s new "Книга судді" section.

### Step 1: Add Sheets-API methods to `GoogleDriveService`

Open `apps/api/src/google-drive/google-drive.service.ts`. Read it in full first to confirm the exact current shape of `getAuthorizedClient` (a private method returning an authorized `OAuth2Client` for a kurin, throwing `ServiceUnavailableException` if no `driveRefreshToken`) — it should look like this (from the prior OAuth-migration subproject):

```ts
  private async getAuthorizedClient(kurinId: string) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin?.driveRefreshToken) {
      throw new ServiceUnavailableException('Курінь ще не підключив Google Drive');
    }
    const client = this.createOAuthClient();
    client.setCredentials({ refresh_token: kurin.driveRefreshToken });
    return client;
  }
```

Add these two public methods to the class (anywhere after `uploadFile`):

```ts
  async readSheetValues(kurinId: string, spreadsheetId: string): Promise<string[][]> {
    const client = await this.getAuthorizedClient(kurinId);
    const sheets = google.sheets({ version: 'v4', auth: client });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:ZZ',
    });
    return (res.data.values ?? []) as string[][];
  }

  async appendSheetRow(kurinId: string, spreadsheetId: string, values: string[]): Promise<void> {
    const client = await this.getAuthorizedClient(kurinId);
    const sheets = google.sheets({ version: 'v4', auth: client });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:ZZ',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    });
  }
```

### Step 2: Add unit tests

Open `apps/api/src/google-drive/google-drive.service.spec.ts`. Read it in full — it already mocks `googleapis` at the top of the file with `jest.mock('googleapis', () => ({ google: { auth: {...}, drive: jest.fn()... } }))`. Add a `sheets: jest.fn()` entry to that same mock's `google` object (alongside the existing `auth`/`drive`/`oauth2` entries) — find the exact current mock structure and extend it consistently rather than replacing it. The mock factory should end up looking like:

```ts
jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn().mockImplementation(() => mockOAuth2Instance) },
    drive: jest.fn().mockImplementation(() => ({
      files: { create: mockFilesCreate },
      permissions: { create: mockPermissionsCreate },
    })),
    oauth2: jest.fn().mockImplementation(() => ({
      userinfo: { get: mockUserinfoGet },
    })),
    sheets: jest.fn().mockImplementation(() => ({
      spreadsheets: { values: { get: mockSheetsValuesGet, append: mockSheetsValuesAppend } },
    })),
  },
}));
```

Add the two new mock variables (`mockSheetsValuesGet`, `mockSheetsValuesAppend`) alongside the other `mock*` variables declared before the `jest.mock` call, each a plain `jest.fn()`.

Add two new `describe` blocks:

```ts
  describe('readSheetValues', () => {
    it('returns the sheet grid for a connected kurin', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: 'refresh-abc' });
      mockSheetsValuesGet.mockResolvedValue({ data: { values: [['A', 'B'], ['1', '2']] } });

      const result = await service.readSheetValues('kurin-1', 'sheet-id-1');

      expect(result).toEqual([['A', 'B'], ['1', '2']]);
    });

    it('throws ServiceUnavailableException when the kurin has not connected Drive', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: null });

      await expect(service.readSheetValues('kurin-1', 'sheet-id-1')).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('appendSheetRow', () => {
    it('appends a row to the connected sheet', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: 'refresh-abc' });
      mockSheetsValuesAppend.mockResolvedValue({});

      await service.appendSheetRow('kurin-1', 'sheet-id-1', ['Іван', 'Петренко']);

      expect(mockSheetsValuesAppend).toHaveBeenCalledWith({
        spreadsheetId: 'sheet-id-1',
        range: 'A:ZZ',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [['Іван', 'Петренко']] },
      });
    });
  });
```

Run: `cd apps/api && npx jest google-drive.service.spec --runInBand`
Expected: PASS, all tests (existing + 3 new).

### Step 3: Write the DTOs

The controller in Step 4 sits behind this project's global `ValidationPipe({ whitelist: true, transform: true })` (registered in `apps/api/src/main.ts`) — `whitelist: true` strips any request-body property that has no `class-validator` decorator at all, so every DTO field below needs at least one decorator or its value will silently come through as `undefined` on the server.

Create `apps/api/src/kurins/dto/set-junak-import-spreadsheet.dto.ts`:

```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class SetJunakImportSpreadsheetDto {
  @IsString() @IsNotEmpty() spreadsheetId: string;
  @IsString() @IsNotEmpty() spreadsheetName: string;
}
```

Create `apps/api/src/kurins/dto/save-junak-import-mapping.dto.ts`:

```ts
import { IsArray } from 'class-validator';

export class SaveJunakImportMappingDto {
  @IsArray() columnMapping: { column: string; header: string; field: string }[];
  @IsArray() positionValueMapping: { rawValue: string; positionType: string | null }[];
}
```

### Step 4: Write the controller

Create `apps/api/src/kurins/kurin-junak-import.controller.ts`:

```ts
import { Body, Controller, ForbiddenException, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { SaveJunakImportMappingDto } from './dto/save-junak-import-mapping.dto';
import { SetJunakImportSpreadsheetDto } from './dto/set-junak-import-spreadsheet.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ZVYAZKOVYI)
@Controller('kurins')
export class KurinJunakImportController {
  constructor(
    private readonly googleDrive: GoogleDriveService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':kurinId/junak-import/status')
  async status(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: { judgeBookSpreadsheetId: true, judgeBookSpreadsheetName: true },
    });
    const mapping = await this.prisma.junakImportMapping.findUnique({ where: { kurinId } });
    return {
      connectedSpreadsheetId: kurin?.judgeBookSpreadsheetId ?? undefined,
      connectedSpreadsheetName: kurin?.judgeBookSpreadsheetName ?? undefined,
      mapping: mapping
        ? { columnMapping: mapping.columnMapping, positionValueMapping: mapping.positionValueMapping }
        : undefined,
    };
  }

  @Patch(':kurinId/junak-import/spreadsheet')
  async setSpreadsheet(
    @Param('kurinId') kurinId: string,
    @Body() dto: SetJunakImportSpreadsheetDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertOwnKurin(kurinId, user);
    await this.prisma.kurin.update({
      where: { id: kurinId },
      data: { judgeBookSpreadsheetId: dto.spreadsheetId, judgeBookSpreadsheetName: dto.spreadsheetName },
    });
    return { success: true };
  }

  @Get(':kurinId/junak-import/sheet-data')
  async sheetData(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: { judgeBookSpreadsheetId: true },
    });
    if (!kurin?.judgeBookSpreadsheetId) {
      throw new ForbiddenException('Книга судді ще не підключена');
    }
    const rows = await this.googleDrive.readSheetValues(kurinId, kurin.judgeBookSpreadsheetId);
    return { rows };
  }

  @Put(':kurinId/junak-import/mapping')
  async saveMapping(
    @Param('kurinId') kurinId: string,
    @Body() dto: SaveJunakImportMappingDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertOwnKurin(kurinId, user);
    await this.prisma.junakImportMapping.upsert({
      where: { kurinId },
      create: { kurinId, columnMapping: dto.columnMapping, positionValueMapping: dto.positionValueMapping },
      update: { columnMapping: dto.columnMapping, positionValueMapping: dto.positionValueMapping },
    });
    return { success: true };
  }

  private assertOwnKurin(kurinId: string, user: CurrentUserPayload) {
    if (kurinId !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
  }
}
```

### Step 5: Wire into `KurinsModule`

Open `apps/api/src/kurins/kurins.module.ts`. It currently imports `GoogleDriveModule` and registers `KurinGoogleDriveController` (from the prior OAuth subproject):

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { KurinsController } from './kurins.controller';
import { KurinsService } from './kurins.service';
import { KurinGoogleDriveController } from './kurin-google-drive.controller';

@Module({
  imports: [AuthModule, GoogleDriveModule],
  controllers: [KurinsController, KurinGoogleDriveController],
  providers: [KurinsService],
})
export class KurinsModule {}
```

Add the new controller:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { KurinsController } from './kurins.controller';
import { KurinsService } from './kurins.service';
import { KurinGoogleDriveController } from './kurin-google-drive.controller';
import { KurinJunakImportController } from './kurin-junak-import.controller';

@Module({
  imports: [AuthModule, GoogleDriveModule],
  controllers: [KurinsController, KurinGoogleDriveController, KurinJunakImportController],
  providers: [KurinsService],
})
export class KurinsModule {}
```

### Step 6: Write the e2e tests

Read `apps/api/test/kurin-google-drive.e2e-spec.ts` in full first to match its exact conventions (it overrides `GoogleDriveService` wholesale via `.overrideProvider(GoogleDriveService).useValue(fakeGoogleDrive)`).

Create `apps/api/test/kurin-junak-import-mapping.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';

describe('Kurin Junak Import mapping (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fakeGoogleDrive: { readSheetValues: jest.Mock; appendSheetRow: jest.Mock };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    fakeGoogleDrive = { readSheetValues: jest.fn(), appendSheetRow: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleDriveService)
      .useValue(fakeGoogleDrive)
      .compile();
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
    fakeGoogleDrive.readSheetValues.mockReset();
    fakeGoogleDrive.appendSheetRow.mockReset();
  });

  async function setup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    return { kurin };
  }

  it('reports no spreadsheet connected for a fresh kurin', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({});
  });

  it('forbids a plain junak from accessing import status', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('sets the connected spreadsheet and reflects it in status', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/junak-import/spreadsheet`)
      .set('Authorization', `Bearer ${token}`)
      .send({ spreadsheetId: 'sheet-1', spreadsheetName: 'Книга судді' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const status = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(status.body.connectedSpreadsheetId).toBe('sheet-1');
    expect(status.body.connectedSpreadsheetName).toBe('Книга судді');
  });

  it('returns 403 for sheet-data when no spreadsheet is connected', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/sheet-data`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns the raw sheet grid once a spreadsheet is connected', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    await prisma.kurin.update({ where: { id: kurin.id }, data: { judgeBookSpreadsheetId: 'sheet-1' } });
    fakeGoogleDrive.readSheetValues.mockResolvedValue([['ПІБ', 'Псевдо'], ['Іван Петренко', 'Сокіл']]);

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/sheet-data`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.rows).toEqual([['ПІБ', 'Псевдо'], ['Іван Петренко', 'Сокіл']]);
  });

  it('saves and returns the mapping', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    const columnMapping = [{ column: 'B', header: 'ПІБ', field: 'FIRST_LAST_NAME' }];
    const positionValueMapping = [{ rawValue: 'Гуртковий', positionType: 'HURTKOVYI' }];

    await request(app.getHttpServer())
      .put(`/kurins/${kurin.id}/junak-import/mapping`)
      .set('Authorization', `Bearer ${token}`)
      .send({ columnMapping, positionValueMapping })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const status = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(status.body.mapping.columnMapping).toEqual(columnMapping);
    expect(status.body.mapping.positionValueMapping).toEqual(positionValueMapping);
  });
});
```

### Step 7: Run the tests

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand kurin-junak-import-mapping`
Expected: PASS, 6 tests.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

### Step 8: Add the Sheets Picker view (frontend)

Open `apps/web/lib/google-picker.ts`. Read it in full — it currently exports `openGoogleDriveFolderPicker`. Add a new sibling function (do not modify `openGoogleDriveFolderPicker`):

```ts
export async function openGoogleSheetPicker(
  accessToken: string,
  onPicked: (spreadsheetId: string, spreadsheetName: string) => void,
): Promise<void> {
  await loadGooglePickerScript();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY as string;
  const google = (window as any).google;
  const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS);
  const picker = new google.picker.PickerBuilder()
    .setOAuthToken(accessToken)
    .setDeveloperKey(apiKey)
    .addView(view)
    .setCallback((data: { action: string; docs?: { id: string; name: string }[] }) => {
      if (data.action === google.picker.Action.PICKED && data.docs?.[0]) {
        onPicked(data.docs[0].id, data.docs[0].name);
      }
    })
    .build();
  picker.setVisible(true);
}
```

### Step 9: Add types and query hooks

Open `apps/web/lib/types.ts`. Add this interface anywhere after `GoogleDriveStatus`:

```ts
export interface JunakImportStatus {
  connectedSpreadsheetId?: string;
  connectedSpreadsheetName?: string;
  mapping?: {
    columnMapping: { column: string; header: string; field: string }[];
    positionValueMapping: { rawValue: string; positionType: string | null }[];
  };
}
```

Create `apps/web/lib/queries/junak-import.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { JunakImportStatus } from '@/lib/types';

export function useJunakImportStatus(kurinId: string | undefined) {
  return useQuery({
    queryKey: ['junak-import-status', kurinId],
    queryFn: () => apiFetch<JunakImportStatus>(`/kurins/${kurinId}/junak-import/status`),
    enabled: !!kurinId,
  });
}

export function useSetJunakImportSpreadsheet(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { spreadsheetId: string; spreadsheetName: string }) =>
      apiFetch(`/kurins/${kurinId}/junak-import/spreadsheet`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['junak-import-status', kurinId] });
    },
  });
}

export function useJunakImportSheetData(kurinId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['junak-import-sheet-data', kurinId],
    queryFn: () => apiFetch<{ rows: string[][] }>(`/kurins/${kurinId}/junak-import/sheet-data`),
    enabled: !!kurinId && enabled,
  });
}

export function useSaveJunakImportMapping(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      columnMapping: { column: string; header: string; field: string }[];
      positionValueMapping: { rawValue: string; positionType: string | null }[];
    }) =>
      apiFetch(`/kurins/${kurinId}/junak-import/mapping`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['junak-import-status', kurinId] });
    },
  });
}
```

### Step 10: Add the "Книга судді" connect section to `/kurin`

Open `apps/web/app/kurin/page.tsx`. Read it in full first — it already has a Google Drive `Card` (from the prior OAuth subproject) gated on `canChangeProgram`, plus a `Suspense`-wrapped content component (from a later fix wave) reading `useSearchParams`.

Add these imports alongside the existing ones:

```ts
import { useJunakImportStatus, useSetJunakImportSpreadsheet } from '@/lib/queries/junak-import';
import { openGoogleSheetPicker } from '@/lib/google-picker';
```

Inside the page's content component (wherever `driveStatus`/`connectDrive` hooks are declared), add:

```ts
  const junakImportStatus = useJunakImportStatus(kurin?.id);
  const setJunakImportSpreadsheet = useSetJunakImportSpreadsheet(kurin?.id ?? '');
  const [bookConnectError, setBookConnectError] = useState<string | null>(null);

  async function handleConnectJudgeBook() {
    if (!kurin) return;
    setBookConnectError(null);
    try {
      const accessToken = await fetchGoogleDrivePickerToken(kurin.id);
      await openGoogleSheetPicker(accessToken, (spreadsheetId, spreadsheetName) => {
        setJunakImportSpreadsheet.mutate({ spreadsheetId, spreadsheetName });
      });
    } catch {
      setBookConnectError('Не вдалося підключити таблицю. Спробуйте ще раз.');
    }
  }
```

(`fetchGoogleDrivePickerToken` and `useState` are already imported in this file from the prior OAuth subproject's work — reuse them, do not add duplicate imports.)

Add a new `Card` right after the existing Google Drive `Card`, gated the same way (`canChangeProgram`):

```tsx
      {canChangeProgram && (
        <Card>
          <CardHeader>
            <CardTitle>Книга судді</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {junakImportStatus.data?.connectedSpreadsheetId ? (
              <>
                <p>Підключена таблиця: {junakImportStatus.data.connectedSpreadsheetName}</p>
                <Button size="sm" variant="outline" onClick={handleConnectJudgeBook}>
                  Змінити таблицю
                </Button>
                <div>
                  <a href="/kurin/junak-import" className="underline">
                    Імпортувати юнаків з цієї таблиці
                  </a>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">Книга судді не підключена.</p>
                <Button size="sm" disabled={setJunakImportSpreadsheet.isPending} onClick={handleConnectJudgeBook}>
                  Підключити Книгу судді
                </Button>
              </>
            )}
            {bookConnectError && <p className="text-sm text-destructive">{bookConnectError}</p>}
          </CardContent>
        </Card>
      )}
```

The link to `/kurin/junak-import` points at Task 7's wizard page (not built yet in this task — the link will 404 until Task 7 lands; this is expected for a plan executed task-by-task in order).

### Step 11: Typecheck and commit

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

```bash
git add apps/api/src/google-drive/google-drive.service.ts apps/api/src/google-drive/google-drive.service.spec.ts apps/api/src/kurins/dto/save-junak-import-mapping.dto.ts apps/api/src/kurins/dto/set-junak-import-spreadsheet.dto.ts apps/api/src/kurins/kurin-junak-import.controller.ts apps/api/src/kurins/kurins.module.ts apps/api/test/kurin-junak-import-mapping.e2e-spec.ts apps/web/lib/google-picker.ts apps/web/lib/types.ts apps/web/lib/queries/junak-import.ts apps/web/app/kurin/page.tsx
git commit -m "feat: connect Книга судді Google Sheet and persist column/position mapping"
```

---

## Task 3: Backend — row processor: junak, hurtok, guardian contacts

**Files:**
- Create: `apps/api/src/junak-import/junak-import-row.types.ts`
- Create: `apps/api/src/junak-import/junak-import-row-processor.service.ts`
- Create: `apps/api/src/junak-import/junak-import.module.ts`
- Modify: `apps/api/src/hurtky/hurtky.module.ts`
- Test: `apps/api/src/junak-import/junak-import-row-processor.service.spec.ts`

**Interfaces:**
- Consumes: `HurtkyService.create(dto, kurinId)`, `HurtkyService.listForKurin(kurinId)` (existing).
- Produces: the `ResolvedJunakRow`/`JunakImportRowResult` types and `JunakImportRowProcessorService.processRow(kurinId, row, rowIndex, actorId): Promise<JunakImportRowResult>` — consumed by Task 4, which changes this same method's fourth parameter from a plain `actorId: string` to the full `actor: CurrentUserPayload` while extending it with position/progress handling, and by Task 5's direct-import/approval endpoints (which call the Task-4-final signature).

### Step 1: Define the resolved-row type

Create `apps/api/src/junak-import/junak-import-row.types.ts`:

```ts
import { PositionType } from '@prisma/client';

export interface ResolvedJunakRow {
  matchedUserId?: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  birthDate?: string;
  email: string;
  phone?: string;
  hurtokName?: string;
  kurinPositionTypes?: PositionType[];
  hurtokPositionTypes?: PositionType[];
  guardians?: { name: string; phone?: string; email?: string }[];
  degreeDates?: {
    PRYHYLNYK?: string;
    UCHASNYK?: string;
    ROZVIDUVACH?: string;
  };
}

export interface JunakImportRowResult {
  row: number;
  junakId?: string;
  created?: boolean;
  succeededSteps: string[];
  error?: string;
}
```

`row` in `JunakImportRowResult` is the 0-based index of the row within the submitted batch (for displaying "рядок N: помилка" in the frontend results summary). `succeededSteps` accumulates labels like `'user'`, `'hurtok'`, `'contacts'`, `'positions'`, `'proba-progress'` as each stage completes, so a partially-failed row's summary can say exactly how far it got.

### Step 2: Write the row processor (this task's slice: user, hurtok, contacts only)

Create `apps/api/src/junak-import/junak-import-row-processor.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HurtkyService } from '../hurtky/hurtky.service';
import { ResolvedJunakRow, JunakImportRowResult } from './junak-import-row.types';

@Injectable()
export class JunakImportRowProcessorService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly hurtky: HurtkyService,
  ) {}

  async processRow(kurinId: string, row: ResolvedJunakRow, rowIndex: number, actorId: string): Promise<JunakImportRowResult> {
    const result: JunakImportRowResult = { row: rowIndex, succeededSteps: [] };
    try {
      const junakId = await this.upsertUserHurtokContacts(kurinId, row, actorId, result);
      result.junakId = junakId;
    } catch (error) {
      result.error = (error as Error).message;
    }
    return result;
  }

  private async upsertUserHurtokContacts(
    kurinId: string,
    row: ResolvedJunakRow,
    actorId: string,
    result: JunakImportRowResult,
  ): Promise<string> {
    let hurtokId: string | undefined;
    if (row.hurtokName) {
      const existing = await this.hurtky.listForKurin(kurinId);
      const match = existing.find((h) => h.name === row.hurtokName);
      hurtokId = match ? match.id : (await this.hurtky.create({ name: row.hurtokName, number: undefined }, kurinId)).id;
      result.succeededSteps.push('hurtok');
    }

    const junakId = await this.prisma.$transaction(async (tx) => {
      let userId: string;
      if (row.matchedUserId) {
        const updateData: Record<string, unknown> = {};
        if (row.firstName) updateData.firstName = row.firstName;
        if (row.lastName) updateData.lastName = row.lastName;
        if (row.nickname) updateData.nickname = row.nickname;
        if (row.birthDate) updateData.birthDate = new Date(row.birthDate);
        if (row.email) updateData.email = row.email;
        if (row.phone) updateData.phone = row.phone;
        if (hurtokId) updateData.hurtokId = hurtokId;
        const updated = await tx.user.update({ where: { id: row.matchedUserId }, data: updateData });
        userId = updated.id;
        result.created = false;
      } else {
        const created = await tx.user.create({
          data: {
            firstName: row.firstName,
            lastName: row.lastName,
            nickname: row.nickname,
            birthDate: row.birthDate ? new Date(row.birthDate) : undefined,
            email: row.email,
            phone: row.phone,
            role: Role.JUNAK,
            kurinId,
            hurtokId,
          },
        });
        userId = created.id;
        result.created = true;
      }

      for (const guardian of row.guardians ?? []) {
        const existingContact = await tx.guardianContact.findFirst({ where: { junakId: userId, name: guardian.name } });
        if (existingContact) {
          await tx.guardianContact.update({
            where: { id: existingContact.id },
            data: { phone: guardian.phone, email: guardian.email },
          });
        } else {
          await tx.guardianContact.create({
            data: { junakId: userId, name: guardian.name, phone: guardian.phone ?? '', email: guardian.email },
          });
        }
      }
      if ((row.guardians ?? []).length > 0) {
        result.succeededSteps.push('contacts');
      }

      return userId;
    });

    result.succeededSteps.push('user');
    void actorId;
    return junakId;
  }
}
```

Note: `actorId` is accepted but unused in this task's slice (it's threaded through for Task 4's position/progress steps, which need the acting zvyazkovyi's full `CurrentUserPayload`, not just an id — Task 4 changes this method's signature; the `void actorId;` line above only silences the unused-parameter lint until then and Task 4 removes it). `GuardianContact.phone` is a required `String` in the schema — `guardian.phone ?? ''` matches the DTO-less direct-Prisma-write convention already used elsewhere in this codebase when a field is required but the import data might omit it; the row's own validation (Task 7's frontend) is expected to require this in the UI before submission, so an empty string here is a defensive fallback, not the expected path.

### Step 3: Write the module

Create `apps/api/src/junak-import/junak-import.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HurtkyModule } from '../hurtky/hurtky.module';
import { JunakImportRowProcessorService } from './junak-import-row-processor.service';

@Module({
  imports: [HurtkyModule],
  providers: [JunakImportRowProcessorService],
  exports: [JunakImportRowProcessorService],
})
export class JunakImportModule {}
```

`apps/api/src/hurtky/hurtky.module.ts` currently does **not** export `HurtkyService` (confirmed by reading it — it only has `providers: [HurtkyService]`, no `exports`). Add an `exports` array so `JunakImportModule` can inject it:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HurtkyController } from './hurtky.controller';
import { HurtkyService } from './hurtky.service';

@Module({
  imports: [AuthModule],
  controllers: [HurtkyController],
  providers: [HurtkyService],
  exports: [HurtkyService],
})
export class HurtkyModule {}
```

### Step 4: Write the unit tests

Create `apps/api/src/junak-import/junak-import-row-processor.service.spec.ts`:

```ts
import { JunakImportRowProcessorService } from './junak-import-row-processor.service';
import { ResolvedJunakRow } from './junak-import-row.types';

describe('JunakImportRowProcessorService', () => {
  let service: JunakImportRowProcessorService;
  let prisma: any;
  let hurtky: any;

  beforeEach(() => {
    prisma = {
      user: { create: jest.fn(), update: jest.fn() },
      guardianContact: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma)),
    };
    hurtky = { listForKurin: jest.fn().mockResolvedValue([]), create: jest.fn() };
    service = new JunakImportRowProcessorService(prisma, hurtky);
  });

  function baseRow(overrides: Partial<ResolvedJunakRow> = {}): ResolvedJunakRow {
    return { firstName: 'Іван', lastName: 'Петренко', email: 'ivan@example.com', ...overrides };
  }

  it('creates a new junak when no matchedUserId is given', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    const result = await service.processRow('kurin-1', baseRow(), 0, 'actor-1');

    expect(result.junakId).toBe('user-1');
    expect(result.created).toBe(true);
    expect(result.succeededSteps).toContain('user');
    expect(result.error).toBeUndefined();
  });

  it('updates an existing junak when matchedUserId is given, only with non-blank fields', async () => {
    prisma.user.update.mockResolvedValue({ id: 'user-2' });

    const result = await service.processRow(
      'kurin-1',
      baseRow({ matchedUserId: 'user-2', phone: undefined }),
      0,
      'actor-1',
    );

    expect(result.junakId).toBe('user-2');
    expect(result.created).toBe(false);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: expect.not.objectContaining({ phone: expect.anything() }),
    });
  });

  it('creates a new hurtok when the named hurtok does not exist', async () => {
    hurtky.listForKurin.mockResolvedValue([{ id: 'h1', name: 'Вовки' }]);
    hurtky.create.mockResolvedValue({ id: 'h2' });
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    const result = await service.processRow('kurin-1', baseRow({ hurtokName: 'Орли' }), 0, 'actor-1');

    expect(hurtky.create).toHaveBeenCalledWith({ name: 'Орли', number: undefined }, 'kurin-1');
    expect(result.succeededSteps).toContain('hurtok');
  });

  it('reuses an existing hurtok by exact name match', async () => {
    hurtky.listForKurin.mockResolvedValue([{ id: 'h1', name: 'Вовки' }]);
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    await service.processRow('kurin-1', baseRow({ hurtokName: 'Вовки' }), 0, 'actor-1');

    expect(hurtky.create).not.toHaveBeenCalled();
  });

  it('creates a new guardian contact when none matches by name', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.guardianContact.findFirst.mockResolvedValue(null);

    const result = await service.processRow(
      'kurin-1',
      baseRow({ guardians: [{ name: 'Марія Петренко', phone: '0501234567' }] }),
      0,
      'actor-1',
    );

    expect(prisma.guardianContact.create).toHaveBeenCalledWith({
      data: { junakId: 'user-1', name: 'Марія Петренко', phone: '0501234567', email: undefined },
    });
    expect(result.succeededSteps).toContain('contacts');
  });

  it('updates an existing guardian contact matched by name instead of duplicating it', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.guardianContact.findFirst.mockResolvedValue({ id: 'contact-1', name: 'Марія Петренко' });

    await service.processRow(
      'kurin-1',
      baseRow({ guardians: [{ name: 'Марія Петренко', phone: '0501234567' }] }),
      0,
      'actor-1',
    );

    expect(prisma.guardianContact.update).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: { phone: '0501234567', email: undefined },
    });
    expect(prisma.guardianContact.create).not.toHaveBeenCalled();
  });

  it('records the error and stops when user creation throws, without throwing itself', async () => {
    prisma.user.create.mockRejectedValue(new Error('email already in use'));

    const result = await service.processRow('kurin-1', baseRow(), 0, 'actor-1');

    expect(result.error).toBe('email already in use');
    expect(result.junakId).toBeUndefined();
  });
});
```

Run: `cd apps/api && npx jest junak-import-row-processor --runInBand`
Expected: PASS, 7 tests.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

### Step 5: Commit

```bash
git add apps/api/src/junak-import apps/api/src/hurtky/hurtky.module.ts
git commit -m "feat: add junak import row processor (user, hurtok, guardian contacts)"
```

---

## Task 4: Backend — row processor: positions and proba-progress backfill

**Files:**
- Modify: `apps/api/src/junak-import/junak-import-row-processor.service.ts`
- Modify: `apps/api/src/junak-import/junak-import.module.ts`
- Modify: `apps/api/src/junak-import/junak-import-row-processor.service.spec.ts`
- Modify: `apps/api/src/kurin-positions/kurin-positions.module.ts`
- Modify: `apps/api/src/proby-progress/proby-progress.module.ts`

**Interfaces:**
- Consumes: `KurinPositionsService.assign(dto, actor)` (existing — note it requires the target junak's `hurtokId` to already match `dto.hurtokId` for HURTOK-scope assignments, which is why this step must run after Task 3's user/hurtok step, not before), `ProbyProgressService.confirm(junakId, pointId, actor)`, `ProbyProgressService.closeStage(junakId, stageId, actor)`, `ProbyProgressService.getProgressFor(junakId, actor)` (existing — returns `{ points, stages: [{ stageId, status, hasDebt }] }`).
- Produces: `JunakImportRowProcessorService.processRow(kurinId, row, rowIndex, actor: CurrentUserPayload)` — the signature changes from Task 3's `actorId: string` to the full `actor: CurrentUserPayload`, since `KurinPositionsService`/`ProbyProgressService` both require the full payload shape, not just an id. Consumed by Task 5's endpoints/approval branch.

### Step 1: Read the position and proba-progress services in full

Read `apps/api/src/kurin-positions/kurin-positions.service.ts`'s `assign()` method and `apps/api/src/kurin-positions/dto/assign-position.dto.ts`'s exact shape (fields: `userId`, `scope`, `positionType`, `hurtokId?`) before writing this task's code — confirm these match what's used below.

Read `apps/api/src/proby-progress/proby-progress.service.ts`'s `confirm()`, `closeStage()`, and `getProgressFor()` in full to confirm the exact signatures used below, and `getProgressFor`'s returned `stages` shape (`{ stageId: string; status: 'LOCKED' | 'OPEN' | 'CLOSED'; hasDebt: boolean }[]`).

### Step 2: Change the row processor's actor parameter and add positions + proba-progress

Open `apps/api/src/junak-import/junak-import-row-processor.service.ts`. Replace its entire contents with:

```ts
import { Injectable } from '@nestjs/common';
import { PositionScope, PositionType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HurtkyService } from '../hurtky/hurtky.service';
import { KurinPositionsService } from '../kurin-positions/kurin-positions.service';
import { ProbyProgressService } from '../proby-progress/proby-progress.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ResolvedJunakRow, JunakImportRowResult } from './junak-import-row.types';

const DEGREE_STAGE_PREFIXES: { key: keyof NonNullable<ResolvedJunakRow['degreeDates']>; prefix: string }[] = [
  { key: 'PRYHYLNYK', prefix: 'Проба прихильника' },
  { key: 'UCHASNYK', prefix: 'Проба учасника' },
  { key: 'ROZVIDUVACH', prefix: 'Проба розвідувача' },
];

@Injectable()
export class JunakImportRowProcessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hurtky: HurtkyService,
    private readonly kurinPositions: KurinPositionsService,
    private readonly probyProgress: ProbyProgressService,
  ) {}

  async processRow(
    kurinId: string,
    row: ResolvedJunakRow,
    rowIndex: number,
    actor: CurrentUserPayload,
  ): Promise<JunakImportRowResult> {
    const result: JunakImportRowResult = { row: rowIndex, succeededSteps: [] };
    try {
      const { junakId, hurtokId } = await this.upsertUserHurtokContacts(kurinId, row, result);
      result.junakId = junakId;

      await this.assignPositions(kurinId, junakId, hurtokId, row, actor, result);
      await this.backfillProbaProgress(kurinId, junakId, row, actor, result);
    } catch (error) {
      result.error = (error as Error).message;
    }
    return result;
  }

  private async upsertUserHurtokContacts(
    kurinId: string,
    row: ResolvedJunakRow,
    result: JunakImportRowResult,
  ): Promise<{ junakId: string; hurtokId?: string }> {
    let hurtokId: string | undefined;
    if (row.hurtokName) {
      const existing = await this.hurtky.listForKurin(kurinId);
      const match = existing.find((h) => h.name === row.hurtokName);
      hurtokId = match ? match.id : (await this.hurtky.create({ name: row.hurtokName, number: undefined }, kurinId)).id;
      result.succeededSteps.push('hurtok');
    }

    const junakId = await this.prisma.$transaction(async (tx) => {
      let userId: string;
      if (row.matchedUserId) {
        const updateData: Record<string, unknown> = {};
        if (row.firstName) updateData.firstName = row.firstName;
        if (row.lastName) updateData.lastName = row.lastName;
        if (row.nickname) updateData.nickname = row.nickname;
        if (row.birthDate) updateData.birthDate = new Date(row.birthDate);
        if (row.email) updateData.email = row.email;
        if (row.phone) updateData.phone = row.phone;
        if (hurtokId) updateData.hurtokId = hurtokId;
        const updated = await tx.user.update({ where: { id: row.matchedUserId }, data: updateData });
        userId = updated.id;
        result.created = false;
      } else {
        const created = await tx.user.create({
          data: {
            firstName: row.firstName,
            lastName: row.lastName,
            nickname: row.nickname,
            birthDate: row.birthDate ? new Date(row.birthDate) : undefined,
            email: row.email,
            phone: row.phone,
            role: Role.JUNAK,
            kurinId,
            hurtokId,
          },
        });
        userId = created.id;
        result.created = true;
      }

      for (const guardian of row.guardians ?? []) {
        const existingContact = await tx.guardianContact.findFirst({ where: { junakId: userId, name: guardian.name } });
        if (existingContact) {
          await tx.guardianContact.update({
            where: { id: existingContact.id },
            data: { phone: guardian.phone, email: guardian.email },
          });
        } else {
          await tx.guardianContact.create({
            data: { junakId: userId, name: guardian.name, phone: guardian.phone ?? '', email: guardian.email },
          });
        }
      }
      if ((row.guardians ?? []).length > 0) {
        result.succeededSteps.push('contacts');
      }

      return userId;
    });

    result.succeededSteps.push('user');
    return { junakId, hurtokId };
  }

  private async assignPositions(
    kurinId: string,
    junakId: string,
    hurtokId: string | undefined,
    row: ResolvedJunakRow,
    actor: CurrentUserPayload,
    result: JunakImportRowResult,
  ): Promise<void> {
    for (const positionType of row.kurinPositionTypes ?? []) {
      await this.kurinPositions.assign(
        { userId: junakId, scope: PositionScope.KURIN, positionType, hurtokId: undefined },
        actor,
      );
    }
    for (const positionType of row.hurtokPositionTypes ?? []) {
      if (!hurtokId) continue;
      await this.kurinPositions.assign(
        { userId: junakId, scope: PositionScope.HURTOK, positionType, hurtokId },
        actor,
      );
    }
    if ((row.kurinPositionTypes ?? []).length > 0 || (row.hurtokPositionTypes ?? []).length > 0) {
      result.succeededSteps.push('positions');
    }
    void kurinId;
  }

  private async backfillProbaProgress(
    kurinId: string,
    junakId: string,
    row: ResolvedJunakRow,
    actor: CurrentUserPayload,
    result: JunakImportRowResult,
  ): Promise<void> {
    if (!row.degreeDates) return;
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) return;
    const stages = await this.prisma.probyStage.findMany({
      where: { programId: kurin.probyProgramId },
      orderBy: { order: 'asc' },
      include: { categories: { include: { points: { select: { id: true } } } } },
    });

    let touchedAny = false;
    for (const { key, prefix } of DEGREE_STAGE_PREFIXES) {
      const date = row.degreeDates[key];
      if (!date) continue;
      const stage = stages.find((s) => s.name.startsWith(prefix));
      if (!stage) continue;

      const progress = await this.probyProgress.getProgressFor(junakId, actor);
      const currentStatus = progress.stages.find((s: { stageId: string }) => s.stageId === stage.id)?.status;
      if (currentStatus === 'CLOSED') continue;

      const pointIds = stage.categories.flatMap((c: { points: { id: string }[] }) => c.points.map((p) => p.id));
      for (const pointId of pointIds) {
        await this.probyProgress.confirm(junakId, pointId, actor);
      }
      await this.probyProgress.closeStage(junakId, stage.id, actor);
      touchedAny = true;
    }
    if (touchedAny) {
      result.succeededSteps.push('proba-progress');
    }
  }
}
```

Note the loop over `DEGREE_STAGE_PREFIXES` processes stages in their fixed Прихильник→Учасник→Розвідувач order — this matches the Global Constraint that stages must be closed in ascending order, since `getStageStatuses` (called internally by `confirm`/`getProgressFor`) only reports a stage as `OPEN` once the previous one has `firstClosedAt` set.

### Step 3: Update `JunakImportModule`

Open `apps/api/src/junak-import/junak-import.module.ts`. Add the two new module dependencies:

```ts
import { Module } from '@nestjs/common';
import { HurtkyModule } from '../hurtky/hurtky.module';
import { KurinPositionsModule } from '../kurin-positions/kurin-positions.module';
import { ProbyProgressModule } from '../proby-progress/proby-progress.module';
import { JunakImportRowProcessorService } from './junak-import-row-processor.service';

@Module({
  imports: [HurtkyModule, KurinPositionsModule, ProbyProgressModule],
  providers: [JunakImportRowProcessorService],
  exports: [JunakImportRowProcessorService],
})
export class JunakImportModule {}
```

Neither `apps/api/src/kurin-positions/kurin-positions.module.ts` nor `apps/api/src/proby-progress/proby-progress.module.ts` currently exports its service (confirmed by reading both — each only has a bare `providers: [...]`, no `exports`). Add an `exports` array to each, the same way as Task 3 did for `HurtkyModule`:

`apps/api/src/kurin-positions/kurin-positions.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KurinPositionsController } from './kurin-positions.controller';
import { KurinPositionsService } from './kurin-positions.service';

@Module({
  imports: [AuthModule],
  controllers: [KurinPositionsController],
  providers: [KurinPositionsService],
  exports: [KurinPositionsService],
})
export class KurinPositionsModule {}
```

`apps/api/src/proby-progress/proby-progress.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProbyProgressController } from './proby-progress.controller';
import { ProbyProgressService } from './proby-progress.service';

@Module({
  imports: [AuthModule],
  controllers: [ProbyProgressController],
  providers: [ProbyProgressService],
  exports: [ProbyProgressService],
})
export class ProbyProgressModule {}
```

### Step 4: Update the unit tests for the new actor shape and add position/progress tests

Open `apps/api/src/junak-import/junak-import-row-processor.service.spec.ts`. Every existing call like `service.processRow('kurin-1', baseRow(), 0, 'actor-1')` needs its fourth argument changed from the string `'actor-1'` to a `CurrentUserPayload`-shaped object. Add this near the top of the file, after the imports:

```ts
const ACTOR = { userId: 'zvyazkovyi-1', role: 'ZVYAZKOVYI', kurinId: 'kurin-1', isKurinniy: false, positions: [] } as any;
```

Replace every occurrence of the fourth argument `'actor-1'` in the existing tests with `ACTOR`. Also update `beforeEach`'s `service = new JunakImportRowProcessorService(prisma, hurtky);` to pass two more constructor arguments:

```ts
  let kurinPositions: any;
  let probyProgress: any;

  beforeEach(() => {
    prisma = {
      user: { create: jest.fn(), update: jest.fn() },
      guardianContact: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      kurin: { findUnique: jest.fn() },
      probyStage: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma)),
    };
    hurtky = { listForKurin: jest.fn().mockResolvedValue([]), create: jest.fn() };
    kurinPositions = { assign: jest.fn() };
    probyProgress = { getProgressFor: jest.fn(), confirm: jest.fn(), closeStage: jest.fn() };
    service = new JunakImportRowProcessorService(prisma, hurtky, kurinPositions, probyProgress);
  });
```

`prisma.kurin.findUnique` is new here — Task 3's `beforeEach` never declared a `kurin` key on the `prisma` mock at all, since Task 3's slice of the row processor never touched the `Kurin` table; Task 4's `backfillProbaProgress` does, via `this.prisma.kurin.findUnique`. This replaces Task 3's `beforeEach` entirely (note `user.findUnique` is also dropped — Task 3 never called it either; it was never part of the real implementation).

Add these new tests at the end of the `describe` block:

```ts
  it('assigns a kurin-scope position via KurinPositionsService', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    const result = await service.processRow(
      'kurin-1',
      baseRow({ kurinPositionTypes: ['SUDDIA' as any] }),
      0,
      ACTOR,
    );

    expect(kurinPositions.assign).toHaveBeenCalledWith(
      { userId: 'user-1', scope: 'KURIN', positionType: 'SUDDIA', hurtokId: undefined },
      ACTOR,
    );
    expect(result.succeededSteps).toContain('positions');
  });

  it('assigns a hurtok-scope position only when the row resolved a hurtokId', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    hurtky.listForKurin.mockResolvedValue([{ id: 'h1', name: 'Вовки' }]);

    await service.processRow(
      'kurin-1',
      baseRow({ hurtokName: 'Вовки', hurtokPositionTypes: ['HURTKOVYI' as any] }),
      0,
      ACTOR,
    );

    expect(kurinPositions.assign).toHaveBeenCalledWith(
      { userId: 'user-1', scope: 'HURTOK', positionType: 'HURTKOVYI', hurtokId: 'h1' },
      ACTOR,
    );
  });

  it('backfills proba progress for a degree stage that is not yet closed, in stage order', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', probyProgramId: 'program-1' });
    prisma.probyStage.findMany.mockResolvedValue([
      { id: 'stage-1', name: 'Проба прихильника (Відзнака прихильника)', order: 1, categories: [{ points: [{ id: 'p1' }, { id: 'p2' }] }] },
      { id: 'stage-2', name: 'Проба учасника (Скобине крило)', order: 2, categories: [{ points: [{ id: 'p3' }] }] },
    ]);
    probyProgress.getProgressFor.mockResolvedValue({ points: [], stages: [{ stageId: 'stage-1', status: 'OPEN', hasDebt: false }] });

    const result = await service.processRow(
      'kurin-1',
      baseRow({ degreeDates: { PRYHYLNYK: '2020-01-01' } }),
      0,
      ACTOR,
    );

    expect(probyProgress.confirm).toHaveBeenCalledWith('user-1', 'p1', ACTOR);
    expect(probyProgress.confirm).toHaveBeenCalledWith('user-1', 'p2', ACTOR);
    expect(probyProgress.closeStage).toHaveBeenCalledWith('user-1', 'stage-1', ACTOR);
    expect(result.succeededSteps).toContain('proba-progress');
  });

  it('does not touch a stage that is already CLOSED', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', probyProgramId: 'program-1' });
    prisma.probyStage.findMany.mockResolvedValue([
      { id: 'stage-1', name: 'Проба прихильника (Відзнака прихильника)', order: 1, categories: [{ points: [{ id: 'p1' }] }] },
    ]);
    probyProgress.getProgressFor.mockResolvedValue({ points: [], stages: [{ stageId: 'stage-1', status: 'CLOSED', hasDebt: false }] });

    const result = await service.processRow(
      'kurin-1',
      baseRow({ degreeDates: { PRYHYLNYK: '2020-01-01' } }),
      0,
      ACTOR,
    );

    expect(probyProgress.confirm).not.toHaveBeenCalled();
    expect(probyProgress.closeStage).not.toHaveBeenCalled();
    expect(result.succeededSteps).not.toContain('proba-progress');
  });
```

In every one of Task 3's 7 existing tests, replace the fourth argument to `service.processRow(...)` — the plain string `'actor-1'` — with `ACTOR` (search the file for `'actor-1'` and replace every match; the new `beforeEach` above already provides `ACTOR` and the new `prisma.kurin` mock for all tests, old and new, in this file).

Run: `cd apps/api && npx jest junak-import-row-processor --runInBand`
Expected: PASS, 11 tests (7 from Task 3 updated + 4 new).

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

### Step 5: Commit

```bash
git add apps/api/src/junak-import apps/api/src/kurin-positions/kurin-positions.module.ts apps/api/src/proby-progress/proby-progress.module.ts
git commit -m "feat: add position assignment and proba-progress backfill to junak import row processor"
```

---

## Task 5: Backend — dedup matching, direct import, and `BULK_IMPORT_JUNAKY` approval

**Files:**
- Create: `apps/api/src/junak-import/dto/import-junak-rows.dto.ts`
- Create: `apps/api/src/junak-import/junak-import.controller.ts`
- Modify: `apps/api/src/junak-import/junak-import.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/approval-requests/approval-requests.service.ts`
- Modify: `apps/api/src/approval-requests/approval-requests.module.ts`
- Test: `apps/api/test/junak-import.e2e-spec.ts`
- Test: `apps/api/test/approval-requests-bulk-import.e2e-spec.ts`

**Interfaces:**
- Consumes: `JunakImportRowProcessorService.processRow(kurinId, row, rowIndex, actor)` (Task 4).
- Produces:
  - `GET /kurins/:kurinId/junak-import/match-candidates` (JWT, zvyazkovyi-only; query `firstName`, `lastName`, `birthDate?`) → `{ candidates: { id: string; firstName: string; lastName: string; birthDate: string | null }[] }` — junaky in the kurin whose first+last name matches case-insensitively (birthDate, if given, narrows further but is not required for a match, since the sheet's own birthDate for that row might differ from what's stored if it was previously entered wrong).
  - `POST /kurins/:kurinId/junak-import/rows` (JWT, zvyazkovyi-only; body `{ rows: ResolvedJunakRow[] }`) → `{ results: JunakImportRowResult[] }` — the direct-import path, processes every row immediately.
  - `ApprovalActionType.BULK_IMPORT_JUNAKY` support in `POST /approval-requests` (courinniy or suddya) and `POST /approval-requests/:id/approve` (zvyazkovyi) — consumed by Task 7's frontend wizard when the acting user is not zvyazkovyi.

### Step 1: Write the DTO

Create `apps/api/src/junak-import/dto/import-junak-rows.dto.ts`:

```ts
import { IsArray } from 'class-validator';

export class ImportJunakRowsDto {
  @IsArray() rows: unknown[];
}
```

The individual row shape (`ResolvedJunakRow`) is validated loosely here (as `unknown[]`) rather than with per-field `class-validator` decorators — the wizard UI (Task 7) is the only client of this endpoint and is trusted to send well-formed rows, matching how `CreateApprovalRequestDto.newData` is already `@IsObject() newData: Record<string, unknown>` with no deep validation elsewhere in this codebase for approval-request payloads.

### Step 2: Write the controller

Create `apps/api/src/junak-import/junak-import.controller.ts`:

```ts
import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JunakImportRowProcessorService } from './junak-import-row-processor.service';
import { ImportJunakRowsDto } from './dto/import-junak-rows.dto';
import { ResolvedJunakRow } from './junak-import-row.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ZVYAZKOVYI)
@Controller('kurins')
export class JunakImportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rowProcessor: JunakImportRowProcessorService,
  ) {}

  @Get(':kurinId/junak-import/match-candidates')
  async matchCandidates(
    @Param('kurinId') kurinId: string,
    @Query('firstName') firstName: string,
    @Query('lastName') lastName: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertOwnKurin(kurinId, user);
    const candidates = await this.prisma.user.findMany({
      where: {
        kurinId,
        role: Role.JUNAK,
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
      },
      select: { id: true, firstName: true, lastName: true, birthDate: true },
    });
    return { candidates };
  }

  @Post(':kurinId/junak-import/rows')
  async importRows(
    @Param('kurinId') kurinId: string,
    @Body() dto: ImportJunakRowsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertOwnKurin(kurinId, user);
    const results = [];
    for (let i = 0; i < dto.rows.length; i++) {
      results.push(await this.rowProcessor.processRow(kurinId, dto.rows[i] as ResolvedJunakRow, i, user));
    }
    return { results };
  }

  private assertOwnKurin(kurinId: string, user: CurrentUserPayload) {
    if (kurinId !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
  }
}
```

### Step 3: Wire the controller into `JunakImportModule` and `AppModule`

Open `apps/api/src/junak-import/junak-import.module.ts`. Add the controller:

```ts
import { Module } from '@nestjs/common';
import { HurtkyModule } from '../hurtky/hurtky.module';
import { KurinPositionsModule } from '../kurin-positions/kurin-positions.module';
import { ProbyProgressModule } from '../proby-progress/proby-progress.module';
import { JunakImportRowProcessorService } from './junak-import-row-processor.service';
import { JunakImportController } from './junak-import.controller';

@Module({
  imports: [HurtkyModule, KurinPositionsModule, ProbyProgressModule],
  controllers: [JunakImportController],
  providers: [JunakImportRowProcessorService],
  exports: [JunakImportRowProcessorService],
})
export class JunakImportModule {}
```

Open `apps/api/src/app.module.ts`. It currently imports `InventoryModule` and lists it in the `imports` array (line 17 for the import, line 35 inside the array). Add the new import on its own line right after the `InventoryModule` import:

```ts
import { InventoryModule } from './inventory/inventory.module';
import { JunakImportModule } from './junak-import/junak-import.module';
```

And add `JunakImportModule,` to the `imports` array right after the existing `InventoryModule,` entry:

```ts
    InventoryModule,
    JunakImportModule,
```

### Step 4: Extend `ApprovalRequestsService` for `BULK_IMPORT_JUNAKY`

Open `apps/api/src/approval-requests/approval-requests.service.ts`. Read it in full first. Its `create()` method currently starts:

```ts
  async create(dto: CreateApprovalRequestDto, actor: CurrentUserPayload) {
    if (!actor.isKurinniy) {
      throw new ForbiddenException('Only kurinniy can create approval requests');
    }
```

Change this to also allow an active `SUDDIA` position holder, but **only** for the new action type:

```ts
  async create(dto: CreateApprovalRequestDto, actor: CurrentUserPayload) {
    const canInitiateBulkImport =
      dto.actionType === ApprovalActionType.BULK_IMPORT_JUNAKY && actor.positions.includes(PositionType.SUDDIA);
    if (!actor.isKurinniy && !canInitiateBulkImport) {
      throw new ForbiddenException('Only kurinniy can create approval requests');
    }
```

Add `PositionType` to the existing `@prisma/client` import at the top of the file (it likely already imports `ApprovalActionType`, `ApprovalStatus`, `Role` — add `PositionType` alongside them).

Find the `if (dto.actionType === ApprovalActionType.CREATE_JUNAK && dto.junakId)` / `if (dto.actionType !== ApprovalActionType.CREATE_JUNAK && !dto.junakId)` validation pair right after — `BULK_IMPORT_JUNAKY` also has no single `junakId` (like `CREATE_JUNAK`), so it must be added to the first condition's exemption. Change:

```ts
    if (dto.actionType === ApprovalActionType.CREATE_JUNAK && dto.junakId) {
      throw new BadRequestException('junakId must not be provided for CREATE_JUNAK');
    }
    if (dto.actionType !== ApprovalActionType.CREATE_JUNAK && !dto.junakId) {
      throw new BadRequestException('junakId is required for this action type');
    }
```

to:

```ts
    const noJunakIdActionTypes = [ApprovalActionType.CREATE_JUNAK, ApprovalActionType.BULK_IMPORT_JUNAKY];
    if (noJunakIdActionTypes.includes(dto.actionType) && dto.junakId) {
      throw new BadRequestException('junakId must not be provided for this action type');
    }
    if (!noJunakIdActionTypes.includes(dto.actionType) && !dto.junakId) {
      throw new BadRequestException('junakId is required for this action type');
    }
```

Now find `approve()`'s branching — it currently has:

```ts
      if (req.actionType === ApprovalActionType.CREATE_JUNAK) {
        // ... existing CREATE_JUNAK handling ...
      } else {
        // ... existing update-by-junakId handling ...
      }
```

Add a new branch before the `else`, and inject `JunakImportRowProcessorService` into the constructor. First, the constructor — find the existing constructor (likely just `private readonly prisma: PrismaService`) and add the new dependency:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly rowProcessor: JunakImportRowProcessorService,
  ) {}
```

Add the import at the top: `import { JunakImportRowProcessorService } from '../junak-import/junak-import-row-processor.service';` and `import { ResolvedJunakRow } from '../junak-import/junak-import-row.types';`.

Change the branching in `approve()` from:

```ts
      if (req.actionType === ApprovalActionType.CREATE_JUNAK) {
        const data = req.newData as {
          firstName: string;
          lastName: string;
          email: string;
          hurtokId: string;
          birthDate?: string;
        };
        await this.validateHurtokBelongsToKurin(data.hurtokId, actor.kurinId);
        await tx.user.create({
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            role: Role.JUNAK,
            kurinId: actor.kurinId,
            hurtokId: data.hurtokId,
            birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          },
        });
      } else {
```

to:

```ts
      if (req.actionType === ApprovalActionType.BULK_IMPORT_JUNAKY) {
        const data = req.newData as { rows: ResolvedJunakRow[] };
        const results = [];
        for (let i = 0; i < data.rows.length; i++) {
          results.push(await this.rowProcessor.processRow(actor.kurinId, data.rows[i], i, actor));
        }
        return tx.approvalRequest.update({
          where: { id: requestId },
          data: {
            status: ApprovalStatus.APPROVED,
            approvedById: actor.userId,
            decidedAt: new Date(),
            newData: { rows: data.rows, results } as any,
          },
        });
      } else if (req.actionType === ApprovalActionType.CREATE_JUNAK) {
        const data = req.newData as {
          firstName: string;
          lastName: string;
          email: string;
          hurtokId: string;
          birthDate?: string;
        };
        await this.validateHurtokBelongsToKurin(data.hurtokId, actor.kurinId);
        await tx.user.create({
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            role: Role.JUNAK,
            kurinId: actor.kurinId,
            hurtokId: data.hurtokId,
            birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          },
        });
      } else {
```

The `BULK_IMPORT_JUNAKY` branch returns early with its own `approvalRequest.update` call (storing the per-row `results` back into `newData` so the detail page can show what happened, not just what was requested) instead of falling through to the shared `return tx.approvalRequest.update(...)` at the bottom of the surrounding `$transaction` callback that the `CREATE_JUNAK`/`else` branches share — read the full existing method to confirm exactly where that shared final `return` statement is and that returning early from inside the `if` block is syntactically valid there (it is, since this is all inside one `async (tx) => { ... }` transaction callback).

Note `this.rowProcessor.processRow(...)` runs its own internal `prisma.$transaction` calls (Task 3/4) which happens INSIDE this outer `approve()` transaction's callback — Prisma supports nested transaction calls being invoked from within a transaction callback as long as they go through the same `PrismaService`/`PrismaClient` instance (interactive transactions in this Prisma version do not nest atomically, but this is acceptable here: the outer `approve()` transaction's only OTHER write in this branch is the final `approvalRequest.update`, and if that fails after rows were already processed, the rows' effects remain — which is consistent with this task's already-accepted "best-effort, not full atomicity" per-row model, not a new gap).

### Step 5: Wire `JunakImportModule` into `ApprovalRequestsModule`

Open `apps/api/src/approval-requests/approval-requests.module.ts`. Its current contents:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApprovalRequestsController } from './approval-requests.controller';
import { ApprovalRequestsService } from './approval-requests.service';

@Module({
  imports: [AuthModule],
  controllers: [ApprovalRequestsController],
  providers: [ApprovalRequestsService],
})
export class ApprovalRequestsModule {}
```

Add `JunakImportModule` to `imports` so `JunakImportRowProcessorService` is injectable into `ApprovalRequestsService`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JunakImportModule } from '../junak-import/junak-import.module';
import { ApprovalRequestsController } from './approval-requests.controller';
import { ApprovalRequestsService } from './approval-requests.service';

@Module({
  imports: [AuthModule, JunakImportModule],
  controllers: [ApprovalRequestsController],
  providers: [ApprovalRequestsService],
})
export class ApprovalRequestsModule {}
```

### Step 6: Write the direct-import e2e tests

Read `apps/api/test/inventory.e2e-spec.ts` for the exact `fakeGoogleDrive`-override e2e pattern this project uses (not needed here directly, but for consistent file structure/imports).

Create `apps/api/test/junak-import.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Junak import — direct rows endpoint (e2e)', () => {
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

  async function setup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    return { kurin };
  }

  it('creates junaky from submitted rows', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/junak-import/rows`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          { firstName: 'Іван', lastName: 'Петренко', email: `ivan-${Date.now()}@example.com`, hurtokName: 'Орли' },
        ],
      })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0].created).toBe(true);
    expect(response.body.results[0].error).toBeUndefined();

    const createdHurtok = await prisma.hurtok.findFirst({ where: { kurinId: kurin.id, name: 'Орли' } });
    expect(createdHurtok).not.toBeNull();
  });

  it('reports a per-row error without failing the whole batch', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const existing = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/junak-import/rows`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          { firstName: 'Дублікат', lastName: 'Юнак', email: existing.email },
          { firstName: 'Новий', lastName: 'Юнак', email: `new-${Date.now()}@example.com` },
        ],
      })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.results[0].error).toBeDefined();
    expect(response.body.results[1].created).toBe(true);
    expect(response.body.results[1].error).toBeUndefined();
  });

  it('forbids a non-zvyazkovyi from importing directly', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/junak-import/rows`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [] })
      .expect(403);
  });

  it('returns match candidates by exact case-insensitive first+last name', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, firstName: 'Іван', lastName: 'Петренко' } as any);
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/match-candidates?firstName=іван&lastName=ПЕТРЕНКО`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.candidates).toHaveLength(1);
  });
});
```

Check `createUser`'s exact signature in `apps/api/test/utils/fixtures.ts` before writing the last test — if it does not currently accept `firstName`/`lastName` overrides, read the function and adjust the test to set those fields via a follow-up `prisma.user.update(...)` call instead of passing them to `createUser`, rather than modifying the shared fixture.

### Step 7: Write the approval-request e2e tests

Read `apps/api/test/approval-requests-decide.e2e-spec.ts` in full for the exact test conventions (shown earlier in this task's research — `baseSetup()` creates `kurin`, `kurinnyi` via `createKurinniyUser`, and `zvyazkovyi`).

Create `apps/api/test/approval-requests-bulk-import.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import {
  PrismaClient,
  Role,
  ProbyProgramVersion,
  ApprovalActionType,
  ApprovalStatus,
  PositionScope,
  PositionType,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

describe('Approval requests — BULK_IMPORT_JUNAKY (e2e)', () => {
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

  async function baseSetup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    return { kurin, kurinnyi, zvyazkovyi };
  }

  it('lets kurinniy create a BULK_IMPORT_JUNAKY request', async () => {
    const { kurin, kurinnyi } = await baseSetup();
    const token = issueTokenFor(jwtService, kurinnyi);

    const response = await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: ApprovalActionType.BULK_IMPORT_JUNAKY,
        newData: { rows: [{ firstName: 'Іван', lastName: 'Петренко', email: `x-${Date.now()}@example.com` }] },
      })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.actionType).toBe(ApprovalActionType.BULK_IMPORT_JUNAKY);
    expect(response.body.status).toBe(ApprovalStatus.PENDING);
  });

  it('lets a suddya create a BULK_IMPORT_JUNAKY request', async () => {
    const { kurin } = await baseSetup();
    const suddya = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.SUDDIA,
        userId: suddya.id,
        assignedById: suddya.id,
      },
    });
    const token = issueTokenFor(jwtService, suddya);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: ApprovalActionType.BULK_IMPORT_JUNAKY, newData: { rows: [] } })
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('forbids a plain junak (no kurinniy, no suddya) from creating a BULK_IMPORT_JUNAKY request', async () => {
    const { kurin } = await baseSetup();
    const plainJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, plainJunak);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: ApprovalActionType.BULK_IMPORT_JUNAKY, newData: { rows: [] } })
      .expect(403);
  });

  it('processes all rows when zvyazkovyi approves the request', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const email = `approved-${Date.now()}@example.com`;
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        actionType: ApprovalActionType.BULK_IMPORT_JUNAKY,
        newData: { rows: [{ firstName: 'Іван', lastName: 'Петренко', email }] },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.status).toBe(ApprovalStatus.APPROVED);
    const created = await prisma.user.findUnique({ where: { email } });
    expect(created).not.toBeNull();
    expect(created?.kurinId).toBe(kurin.id);
  });
});
```

### Step 8: Run the tests

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand junak-import`
Expected: PASS, 4 tests.

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand approval-requests-bulk-import`
Expected: PASS, 4 tests.

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`
Expected: all suites pass (no regressions in existing `approval-requests-*` suites from the `create()`/`approve()` changes).

Run: `cd apps/api && npx jest --runInBand`
Expected: all unit suites pass.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

### Step 9: Commit

```bash
git add apps/api/src/junak-import apps/api/src/app.module.ts apps/api/src/approval-requests/approval-requests.service.ts apps/api/src/approval-requests/approval-requests.module.ts apps/api/test/junak-import.e2e-spec.ts apps/api/test/approval-requests-bulk-import.e2e-spec.ts
git commit -m "feat: add direct junak import endpoint and BULK_IMPORT_JUNAKY approval flow"
```

---

## Task 6: Backend — write-back on `CREATE_JUNAK` approval

**Files:**
- Modify: `apps/api/src/approval-requests/approval-requests.service.ts`
- Test: `apps/api/test/approval-requests-decide.e2e-spec.ts` (add tests, do not remove existing ones)

**Interfaces:**
- Consumes: `GoogleDriveService.appendSheetRow(kurinId, spreadsheetId, values)` (Task 2), `Kurin.judgeBookSpreadsheetId`, `JunakImportMapping.columnMapping` (Task 1).
- Produces: nothing consumed by later tasks (last backend task).

### Step 1: Inject `GoogleDriveService` into `ApprovalRequestsService`

Open `apps/api/src/approval-requests/approval-requests.service.ts` (already modified by Task 5). Add `GoogleDriveService` to the constructor:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly rowProcessor: JunakImportRowProcessorService,
    private readonly googleDrive: GoogleDriveService,
  ) {}
```

Add the import: `import { GoogleDriveService } from '../google-drive/google-drive.service';`.

### Step 2: Add the write-back call inside the `CREATE_JUNAK` branch

Find the `CREATE_JUNAK` branch (from Task 5's edit):

```ts
      } else if (req.actionType === ApprovalActionType.CREATE_JUNAK) {
        const data = req.newData as {
          firstName: string;
          lastName: string;
          email: string;
          hurtokId: string;
          birthDate?: string;
        };
        await this.validateHurtokBelongsToKurin(data.hurtokId, actor.kurinId);
        await tx.user.create({
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            role: Role.JUNAK,
            kurinId: actor.kurinId,
            hurtokId: data.hurtokId,
            birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          },
        });
      } else {
```

Add a write-back call right after the `tx.user.create(...)` call, still inside the same branch:

```ts
      } else if (req.actionType === ApprovalActionType.CREATE_JUNAK) {
        const data = req.newData as {
          firstName: string;
          lastName: string;
          email: string;
          hurtokId: string;
          birthDate?: string;
        };
        await this.validateHurtokBelongsToKurin(data.hurtokId, actor.kurinId);
        const created = await tx.user.create({
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            role: Role.JUNAK,
            kurinId: actor.kurinId,
            hurtokId: data.hurtokId,
            birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          },
        });
        await this.appendToJudgeBookIfConnected(actor.kurinId, created);
      } else {
```

Add a new private method to the class:

```ts
  private async appendToJudgeBookIfConnected(
    kurinId: string,
    junak: { firstName: string; lastName: string; nickname: string | null; birthDate: Date | null; email: string; phone: string | null },
  ): Promise<void> {
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: { judgeBookSpreadsheetId: true },
    });
    if (!kurin?.judgeBookSpreadsheetId) {
      return;
    }
    const mapping = await this.prisma.junakImportMapping.findUnique({ where: { kurinId } });
    if (!mapping) {
      return;
    }
    try {
      const columnMapping = mapping.columnMapping as { column: string; field: string }[];
      const row = this.buildSheetRow(columnMapping, junak);
      await this.googleDrive.appendSheetRow(kurinId, kurin.judgeBookSpreadsheetId, row);
    } catch (error) {
      this.logger.warn(`Failed to append new junak to Книга судді for kurin ${kurinId}: ${(error as Error).message}`);
    }
  }

  private buildSheetRow(
    columnMapping: { column: string; field: string }[],
    junak: { firstName: string; lastName: string; nickname: string | null; birthDate: Date | null; email: string; phone: string | null },
  ): string[] {
    const columnIndex = (column: string): number => {
      let index = 0;
      for (const char of column) {
        index = index * 26 + (char.charCodeAt(0) - 'A'.charCodeAt(0) + 1);
      }
      return index - 1;
    };
    const values: string[] = [];
    for (const { column, field } of columnMapping) {
      const idx = columnIndex(column);
      let value = '';
      if (field === 'FIRST_LAST_NAME') value = `${junak.firstName} ${junak.lastName}`;
      else if (field === 'NICKNAME') value = junak.nickname ?? '';
      else if (field === 'BIRTH_DATE') value = junak.birthDate ? junak.birthDate.toISOString().slice(0, 10) : '';
      else if (field === 'EMAIL') value = junak.email;
      else if (field === 'PHONE') value = junak.phone ?? '';
      while (values.length <= idx) values.push('');
      values[idx] = value;
    }
    return values;
  }
```

Add a `Logger` instance to the class (NestJS convention already used in `KurinGoogleDriveController` from the prior OAuth subproject):

```ts
import { Logger } from '@nestjs/common';
// ...
  private readonly logger = new Logger(ApprovalRequestsService.name);
```

### Step 3: Add tests to the existing decide-spec file

Open `apps/api/test/approval-requests-decide.e2e-spec.ts`. Read it in full. Since `ApprovalRequestsService` now depends on `GoogleDriveService`, and this test file compiles `AppModule` directly (no override), the real `GoogleDriveService` will be constructed — this is fine and matches the pattern already established: `GoogleDriveService`'s constructor only needs `PrismaService`, and it never eagerly touches Google APIs (only when a method like `appendSheetRow` is actually called, and that only happens if `Kurin.judgeBookSpreadsheetId` is set, which these existing CREATE_JUNAK tests never set). Confirm this by re-reading `google-drive.service.ts` if any doubt remains — no test changes are needed there.

Add two new tests to this file's existing `describe` block:

```ts
  it('does not attempt a write-back when no Книга судді is connected', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const hurtok = await prisma.hurtok.create({ data: { name: 'Test Hurtok', kurinId: kurin.id } });
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        actionType: ApprovalActionType.CREATE_JUNAK,
        newData: { firstName: 'Новий', lastName: 'Юнак', email: `new-${Date.now()}@example.com`, hurtokId: hurtok.id },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));
    // No assertion beyond "the request completes successfully" — absence of a connected
    // spreadsheet means appendToJudgeBookIfConnected returns early, which this test proves
    // indirectly by the approve call not hanging or throwing.
  });
```

Given a *real* Sheets API call cannot be exercised without live Google credentials, and this project's established pattern is to override `GoogleDriveService` wholesale for tests that need to verify Drive/Sheets interaction (see `apps/api/test/inventory.e2e-spec.ts`, `apps/api/test/kurin-junak-import-mapping.e2e-spec.ts` from Task 2), add a **second** test file rather than trying to override `GoogleDriveService` inside this already-compiled-without-override `describe` block (mixing an overridden and non-overridden `TestingModule` in the same file/describe is error-prone — keep them separate):

Create `apps/api/test/approval-requests-create-junak-writeback.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ApprovalActionType, ApprovalStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';

describe('CREATE_JUNAK approval — Книга судді write-back (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fakeGoogleDrive: { appendSheetRow: jest.Mock };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    fakeGoogleDrive = { appendSheetRow: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleDriveService)
      .useValue(fakeGoogleDrive)
      .compile();
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
    fakeGoogleDrive.appendSheetRow.mockReset().mockResolvedValue(undefined);
  });

  async function setup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    return { kurin, kurinnyi, zvyazkovyi };
  }

  it('appends a new row to the connected sheet when a junak is created via approval', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await setup();
    await prisma.kurin.update({ where: { id: kurin.id }, data: { judgeBookSpreadsheetId: 'sheet-1' } });
    await prisma.junakImportMapping.create({
      data: {
        kurinId: kurin.id,
        columnMapping: [
          { column: 'A', header: 'ПІБ', field: 'FIRST_LAST_NAME' },
          { column: 'B', header: 'Email', field: 'EMAIL' },
        ],
        positionValueMapping: [],
      },
    });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Test Hurtok', kurinId: kurin.id } });
    const email = `writeback-${Date.now()}@example.com`;
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        actionType: ApprovalActionType.CREATE_JUNAK,
        newData: { firstName: 'Іван', lastName: 'Петренко', email, hurtokId: hurtok.id },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(fakeGoogleDrive.appendSheetRow).toHaveBeenCalledWith(kurin.id, 'sheet-1', ['Іван Петренко', email]);
  });

  it('still creates the junak when the write-back call throws', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await setup();
    await prisma.kurin.update({ where: { id: kurin.id }, data: { judgeBookSpreadsheetId: 'sheet-1' } });
    await prisma.junakImportMapping.create({
      data: { kurinId: kurin.id, columnMapping: [], positionValueMapping: [] },
    });
    fakeGoogleDrive.appendSheetRow.mockRejectedValue(new Error('Google API down'));
    const hurtok = await prisma.hurtok.create({ data: { name: 'Test Hurtok', kurinId: kurin.id } });
    const email = `writeback-fail-${Date.now()}@example.com`;
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        actionType: ApprovalActionType.CREATE_JUNAK,
        newData: { firstName: 'Петро', lastName: 'Сидоренко', email, hurtokId: hurtok.id },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const created = await prisma.user.findUnique({ where: { email } });
    expect(created).not.toBeNull();
  });
});
```

### Step 4: Run the tests

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand approval-requests`
Expected: PASS, all approval-requests suites including the new one and the added test in `approval-requests-decide.e2e-spec.ts`.

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`
Expected: all suites pass.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

### Step 5: Commit

```bash
git add apps/api/src/approval-requests/approval-requests.service.ts apps/api/test/approval-requests-decide.e2e-spec.ts apps/api/test/approval-requests-create-junak-writeback.e2e-spec.ts
git commit -m "feat: append new junak to Книга судді on CREATE_JUNAK approval when connected"
```

---

## Task 7: Frontend — import wizard, approval-request rendering

**Files:**
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/queries/junak-import-rows.ts`
- Create: `apps/web/app/kurin/junak-import/page.tsx`
- Modify: `apps/web/app/approval-requests/page.tsx`
- Modify: `apps/web/app/approval-requests/[id]/page.tsx`
- Test: `apps/web/e2e/junak-import.spec.ts`

**Interfaces:**
- Consumes: the full backend contract from Tasks 2, 5, 6 (`/junak-import/{status,sheet-data,mapping,match-candidates,rows}`, `BULK_IMPORT_JUNAKY` approval requests).
- Produces: nothing consumed by later tasks (last task in this plan).

### Step 1: Add types

Open `apps/web/lib/types.ts`. Find the existing `ApprovalActionType` union (it currently ends with `| 'CREATE_JUNAK';`) and add the new value:

```ts
export type ApprovalActionType =
  | 'CHANGE_FULL_NAME'
  | 'CHANGE_BIRTH_DATE'
  | 'CHANGE_EMAIL'
  | 'CHANGE_HURTOK'
  | 'CREATE_JUNAK'
  | 'BULK_IMPORT_JUNAKY';
```

Add these interfaces after `JunakImportStatus` (from Task 2):

```ts
export type JunakImportField =
  | 'FIRST_LAST_NAME'
  | 'NICKNAME'
  | 'BIRTH_DATE'
  | 'HURTOK'
  | 'EMAIL'
  | 'PHONE'
  | 'DEGREE_PRYHYLNYK_DATE'
  | 'DEGREE_UCHASNYK_DATE'
  | 'DEGREE_ROZVIDUVACH_DATE'
  | 'HURTOK_POSITION'
  | 'KURIN_POSITION'
  | 'GUARDIAN_1_NAME'
  | 'GUARDIAN_1_PHONE'
  | 'GUARDIAN_1_EMAIL'
  | 'GUARDIAN_2_NAME'
  | 'GUARDIAN_2_PHONE'
  | 'GUARDIAN_2_EMAIL';

export const JUNAK_IMPORT_FIELD_LABELS: Record<JunakImportField, string> = {
  FIRST_LAST_NAME: "Ім'я та прізвище",
  NICKNAME: 'Псевдо',
  BIRTH_DATE: 'Дата народження',
  HURTOK: 'Гурток',
  EMAIL: 'Email',
  PHONE: 'Телефон',
  DEGREE_PRYHYLNYK_DATE: 'Дата здобуття ступеня "Прихильник"',
  DEGREE_UCHASNYK_DATE: 'Дата здобуття ступеня "Учасник"',
  DEGREE_ROZVIDUVACH_DATE: 'Дата здобуття ступеня "Розвідувач"',
  HURTOK_POSITION: 'Діловодство в гуртку',
  KURIN_POSITION: 'Діловодство в курені',
  GUARDIAN_1_NAME: "Контакт 1 — ім'я",
  GUARDIAN_1_PHONE: 'Контакт 1 — телефон',
  GUARDIAN_1_EMAIL: 'Контакт 1 — email',
  GUARDIAN_2_NAME: "Контакт 2 — ім'я",
  GUARDIAN_2_PHONE: 'Контакт 2 — телефон',
  GUARDIAN_2_EMAIL: 'Контакт 2 — email',
};

export interface JunakImportColumnMapping {
  column: string;
  header: string;
  field: JunakImportField;
}

export interface JunakImportPositionValueMapping {
  rawValue: string;
  positionType: string | null;
}

export interface JunakImportRowResult {
  row: number;
  junakId?: string;
  created?: boolean;
  succeededSteps: string[];
  error?: string;
}
```

### Step 2: Write query hooks

Create `apps/web/lib/queries/junak-import-rows.ts`:

```ts
'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { JunakImportRowResult } from '@/lib/types';

export function useMatchCandidates(kurinId: string | undefined, firstName: string, lastName: string) {
  return useQuery({
    queryKey: ['junak-import-match-candidates', kurinId, firstName, lastName],
    queryFn: () =>
      apiFetch<{ candidates: { id: string; firstName: string; lastName: string; birthDate: string | null }[] }>(
        `/kurins/${kurinId}/junak-import/match-candidates?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}`,
      ),
    enabled: !!kurinId && !!firstName && !!lastName,
  });
}

export function useImportJunakRows(kurinId: string) {
  return useMutation({
    mutationFn: (rows: unknown[]) =>
      apiFetch<{ results: JunakImportRowResult[] }>(`/kurins/${kurinId}/junak-import/rows`, {
        method: 'POST',
        body: JSON.stringify({ rows }),
      }),
  });
}
```

`useCreateApprovalRequest` (for the courinniy/suddya path) already exists in `apps/web/lib/queries/approval-requests.ts` — reuse it directly, no new hook needed.

### Step 3: Write the wizard page

This is the largest new frontend file in this plan. Create `apps/web/app/kurin/junak-import/page.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useKurin } from '@/lib/queries/kurin';
import {
  useJunakImportStatus,
  useJunakImportSheetData,
  useSaveJunakImportMapping,
} from '@/lib/queries/junak-import';
import { useImportJunakRows } from '@/lib/queries/junak-import-rows';
import { useCreateApprovalRequest } from '@/lib/queries/approval-requests';
import {
  JUNAK_IMPORT_FIELD_LABELS,
  type JunakImportField,
  type JunakImportColumnMapping,
  type JunakImportPositionValueMapping,
  type JunakImportRowResult,
} from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const FIELD_OPTIONS = Object.keys(JUNAK_IMPORT_FIELD_LABELS) as JunakImportField[];
const POSITION_TYPES = ['KURINNYI', 'SUDDIA', 'PYSAR', 'SKARBNYK', 'INTENDANT', 'KHORUNZHYI', 'SMM', 'HURTKOVYI'];

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function parseUkrainianDate(raw: string): string | undefined {
  const match = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

interface WizardRow {
  cells: string[];
  hurtokName: string;
  firstName: string;
  lastName: string;
  matchedUserId?: string;
  matchChoice: 'new' | string;
}

export default function JunakImportPage() {
  const { data: session } = useSession();
  const { data: kurin } = useKurin();
  const kurinId = kurin?.id;
  const status = useJunakImportStatus(kurinId);
  const sheetData = useJunakImportSheetData(kurinId, true);
  const saveMapping = useSaveJunakImportMapping(kurinId ?? '');
  const importRows = useImportJunakRows(kurinId ?? '');
  const createApprovalRequest = useCreateApprovalRequest();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [columnMapping, setColumnMapping] = useState<Record<number, JunakImportField | ''>>({});
  const [positionValueMapping, setPositionValueMapping] = useState<Record<string, string>>({});
  const [rowOverrides, setRowOverrides] = useState<Record<number, { email?: string; matchChoice?: string }>>({});
  const [results, setResults] = useState<JunakImportRowResult[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const rawRows = sheetData.data?.rows ?? [];
  const header = rawRows[0] ?? [];
  const dataRows = rawRows.slice(1);

  const isZvyazkovyi = session?.role === 'ZVYAZKOVYI';

  const uniquePositionValues = useMemo(() => {
    const positionColumnIndexes = Object.entries(columnMapping)
      .filter(([, field]) => field === 'HURTOK_POSITION' || field === 'KURIN_POSITION')
      .map(([idx]) => Number(idx));
    const values = new Set<string>();
    for (const row of dataRows) {
      for (const idx of positionColumnIndexes) {
        const raw = (row[idx] ?? '').trim();
        if (raw) values.add(raw);
      }
    }
    return Array.from(values);
  }, [columnMapping, dataRows]);

  const wizardRows: WizardRow[] = useMemo(() => {
    let lastHurtok = '';
    const hurtokColIndex = Object.entries(columnMapping).find(([, f]) => f === 'HURTOK')?.[0];
    const nameColIndex = Object.entries(columnMapping).find(([, f]) => f === 'FIRST_LAST_NAME')?.[0];
    return dataRows
      .map((cells, i) => {
        const hurtokRaw = hurtokColIndex ? (cells[Number(hurtokColIndex)] ?? '').trim() : '';
        if (hurtokRaw) lastHurtok = hurtokRaw;
        const fullName = nameColIndex ? (cells[Number(nameColIndex)] ?? '').trim() : '';
        const [firstName, ...rest] = fullName.split(' ');
        return {
          cells,
          hurtokName: lastHurtok,
          firstName: firstName ?? '',
          lastName: rest.join(' '),
          matchChoice: rowOverrides[i]?.matchChoice ?? 'new',
        };
      })
      .filter((r) => r.firstName || r.lastName);
  }, [dataRows, columnMapping, rowOverrides]);

  function handleSaveMapping() {
    const mapping: JunakImportColumnMapping[] = Object.entries(columnMapping)
      .filter(([, field]) => field !== '')
      .map(([idx, field]) => ({ column: columnLetter(Number(idx)), header: header[Number(idx)] ?? '', field: field as JunakImportField }));
    const posMapping: JunakImportPositionValueMapping[] = Object.entries(positionValueMapping)
      .filter(([, positionType]) => positionType !== '')
      .map(([rawValue, positionType]) => ({ rawValue, positionType }));
    saveMapping.mutate({ columnMapping: mapping, positionValueMapping: posMapping }, { onSuccess: () => setStep(3) });
  }

  function colIndexFor(field: JunakImportField): number | undefined {
    const entry = Object.entries(columnMapping).find(([, f]) => f === field);
    return entry ? Number(entry[0]) : undefined;
  }

  function cellFor(cells: string[], field: JunakImportField): string {
    const idx = colIndexFor(field);
    return idx !== undefined ? (cells[idx] ?? '').trim() : '';
  }

  function resolvePositionTypes(cells: string[], field: 'HURTOK_POSITION' | 'KURIN_POSITION'): string[] {
    const raw = cellFor(cells, field);
    if (!raw) return [];
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => positionValueMapping[part])
      .filter((mapped): mapped is string => !!mapped);
  }

  function buildResolvedRows() {
    const emailColIndex = colIndexFor('EMAIL');
    return wizardRows.map((row, i) => {
      const emailFromSheet = emailColIndex !== undefined ? (row.cells[emailColIndex] ?? '').trim() : '';
      const email = rowOverrides[i]?.email || emailFromSheet;

      const guardians: { name: string; phone?: string; email?: string }[] = [];
      const guardian1Name = cellFor(row.cells, 'GUARDIAN_1_NAME');
      if (guardian1Name) {
        guardians.push({
          name: guardian1Name,
          phone: cellFor(row.cells, 'GUARDIAN_1_PHONE') || undefined,
          email: cellFor(row.cells, 'GUARDIAN_1_EMAIL') || undefined,
        });
      }
      const guardian2Name = cellFor(row.cells, 'GUARDIAN_2_NAME');
      if (guardian2Name) {
        guardians.push({
          name: guardian2Name,
          phone: cellFor(row.cells, 'GUARDIAN_2_PHONE') || undefined,
          email: cellFor(row.cells, 'GUARDIAN_2_EMAIL') || undefined,
        });
      }

      const degreeDates: { PRYHYLNYK?: string; UCHASNYK?: string; ROZVIDUVACH?: string } = {};
      const pryhylnykRaw = cellFor(row.cells, 'DEGREE_PRYHYLNYK_DATE');
      if (pryhylnykRaw) degreeDates.PRYHYLNYK = parseUkrainianDate(pryhylnykRaw);
      const uchasnykRaw = cellFor(row.cells, 'DEGREE_UCHASNYK_DATE');
      if (uchasnykRaw) degreeDates.UCHASNYK = parseUkrainianDate(uchasnykRaw);
      const rozviduvachRaw = cellFor(row.cells, 'DEGREE_ROZVIDUVACH_DATE');
      if (rozviduvachRaw) degreeDates.ROZVIDUVACH = parseUkrainianDate(rozviduvachRaw);

      const birthDateRaw = cellFor(row.cells, 'BIRTH_DATE');

      return {
        matchedUserId: row.matchChoice !== 'new' ? row.matchChoice : undefined,
        firstName: row.firstName,
        lastName: row.lastName,
        nickname: cellFor(row.cells, 'NICKNAME') || undefined,
        birthDate: birthDateRaw ? parseUkrainianDate(birthDateRaw) : undefined,
        email,
        phone: cellFor(row.cells, 'PHONE') || undefined,
        hurtokName: row.hurtokName || undefined,
        kurinPositionTypes: resolvePositionTypes(row.cells, 'KURIN_POSITION'),
        hurtokPositionTypes: resolvePositionTypes(row.cells, 'HURTOK_POSITION'),
        guardians: guardians.length > 0 ? guardians : undefined,
        degreeDates: Object.keys(degreeDates).length > 0 ? degreeDates : undefined,
      };
    });
  }

  async function handleImport() {
    setSubmitError(null);
    const rows = buildResolvedRows();
    const missingEmail = rows.some((r) => !r.email);
    if (missingEmail) {
      setSubmitError("У деяких рядках відсутній email — заповніть його перед імпортом.");
      return;
    }
    if (isZvyazkovyi) {
      const response = await importRows.mutateAsync(rows);
      setResults(response.results);
    } else {
      await createApprovalRequest.mutateAsync({ actionType: 'BULK_IMPORT_JUNAKY', newData: { rows } });
      setResults(null);
    }
  }

  if (!kurinId) return <p>Завантаження...</p>;
  if (!status.data?.connectedSpreadsheetId) {
    return <p className="text-sm text-destructive">Спершу підключіть Книгу судді на сторінці налаштувань куреня.</p>;
  }
  if (sheetData.isLoading) return <p>Завантаження таблиці...</p>;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Імпорт юнаків з Книги судді</h1>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Крок 1: Мапінг стовпчиків</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {header.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-48 truncate text-sm">{h || `Стовпчик ${columnLetter(i)}`}</span>
                <select
                  className="rounded border p-1 text-sm"
                  value={columnMapping[i] ?? ''}
                  onChange={(e) => setColumnMapping((prev) => ({ ...prev, [i]: e.target.value as JunakImportField }))}
                >
                  <option value="">Не імпортувати</option>
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {JUNAK_IMPORT_FIELD_LABELS[f]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <Button
              size="sm"
              onClick={() => (uniquePositionValues.length > 0 ? setStep(2) : handleSaveMapping())}
            >
              Далі
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Крок 2: Мапінг значень посад</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {uniquePositionValues.map((value) => (
              <div key={value} className="flex items-center gap-2">
                <span className="w-48 truncate text-sm">{value}</span>
                <select
                  className="rounded border p-1 text-sm"
                  value={positionValueMapping[value] ?? ''}
                  onChange={(e) => setPositionValueMapping((prev) => ({ ...prev, [value]: e.target.value }))}
                >
                  <option value="">Не імпортувати</option>
                  {POSITION_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <Button size="sm" onClick={handleSaveMapping} disabled={saveMapping.isPending}>
              Далі
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 3 && !results && (
        <Card>
          <CardHeader>
            <CardTitle>Крок 3: Перегляд</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">Рядків до імпорту: {wizardRows.length}</p>
            {wizardRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2 border-b pb-1 text-sm">
                <span className="w-40 truncate">
                  {row.firstName} {row.lastName}
                </span>
                <span className="w-24 truncate text-muted-foreground">{row.hurtokName || '—'}</span>
                <Input
                  className="w-56"
                  placeholder="Email"
                  defaultValue={rowOverrides[i]?.email}
                  onChange={(e) => setRowOverrides((prev) => ({ ...prev, [i]: { ...prev[i], email: e.target.value } }))}
                />
              </div>
            ))}
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            <Button onClick={handleImport} disabled={importRows.isPending || createApprovalRequest.isPending}>
              {isZvyazkovyi ? 'Імпортувати' : 'Надіслати на затвердження звʼязковому'}
            </Button>
          </CardContent>
        </Card>
      )}

      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Результат</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {results.map((r) => (
              <p key={r.row} className={r.error ? 'text-destructive' : ''}>
                Рядок {r.row + 1}: {r.error ? `помилка — ${r.error}` : r.created ? 'створено' : 'оновлено'}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {!isZvyazkovyi && results === null && createApprovalRequest.isSuccess && (
        <p className="text-sm text-muted-foreground">
          Запит надіслано звʼязковому на затвердження.
        </p>
      )}
    </div>
  );
}
```

`buildResolvedRows()` reads guardians, positions (split on `,` and mapped through `positionValueMapping` — a single cell like `"Гуртковий, Скарбник"` resolves to two position types), and degree dates (converted from the sheet's `ДД.ММ.РРРР` text via `parseUkrainianDate` to the `YYYY-MM-DD` shape the backend expects) directly from each row's mapped cells. Крок 3 does **not** offer per-row editing for any of these beyond the email field — matching the spec's description of Крок 3 as primarily: fill-down hurtok (already computed), missing-email entry, and match/new decision. Rows with `matchChoice !== 'new'` (choosing an existing junak) are not wired to a picker UI for selecting *which* candidate in this first version of the page — every row defaults to `'new'`. Note this explicitly as a known simplification for this task rather than silently shipping a half-built dropdown: the `useMatchCandidates` hook from Step 2 is written but not yet called from this page. If you have time within this task's scope after the above passes review, wire a per-row "Знайдено збіг: X — використати?" prompt using `useMatchCandidates(kurinId, row.firstName, row.lastName)` per row and a small inline choice (radio: "Новий" / "Оновити {ім'я}"), setting `rowOverrides[i].matchChoice` to the candidate's id when chosen — but do not block this task's completion on it if it doesn't fit; open a `docs/fixes-backlog.md` entry for it instead (see Step 6).

### Step 4: Update approval-requests pages

Open `apps/web/app/approval-requests/page.tsx`. Add one entry to `ACTION_LABELS`:

```ts
const ACTION_LABELS: Record<string, string> = {
  CHANGE_FULL_NAME: 'Зміна ПІБ',
  CHANGE_BIRTH_DATE: 'Зміна дати народження',
  CHANGE_EMAIL: 'Зміна email',
  CHANGE_HURTOK: 'Переведення в інший гурток',
  CREATE_JUNAK: 'Створення юнака',
  BULK_IMPORT_JUNAKY: 'Масовий імпорт юнаків з Книги судді',
};
```

Open `apps/web/app/approval-requests/[id]/page.tsx`. Make the identical addition to its own `ACTION_LABELS` constant (this file has its own separate copy, not a shared import — confirm this by reading both files' current top before editing, and if a shared constant already exists elsewhere by the time you implement this, use it instead of duplicating).

No other change is needed on this page — `newData` (which for `BULK_IMPORT_JUNAKY` now holds `{ rows, results }` once approved, or just `{ rows }` while pending, per Task 5's Step 4) already renders generically via the existing `<pre>{JSON.stringify(request.newData, null, 2)}</pre>`.

### Step 5: Typecheck

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

### Step 6: Add the deferred match-candidate UI to the fixes backlog

Open `docs/fixes-backlog.md`. Add a new entry (follow the file's existing `## 🔴 <title>` format):

```markdown
## 🔴 Вибір конкретного кандидата при імпорті юнаків з Книги судді

**Опис:** сторінка `/kurin/junak-import` (майстер імпорту) наразі не дає
звʼязковому вибрати, З ЯКИМ саме наявним юнаком зіставити рядок таблиці —
кожен рядок завжди створює нового юнака (`matchChoice` завжди `'new'`).
Бекендовий ендпоінт `GET .../junak-import/match-candidates` уже існує й
працює (Task 5 плану `docs/superpowers/plans/2026-09-28-junak-book-import.md`),
і хук `useMatchCandidates` написаний (Task 7), але не підключений до UI.

**Де копати:** `apps/web/app/kurin/junak-import/page.tsx`, Крок 3 —
для кожного рядка викликати `useMatchCandidates(kurinId, row.firstName, row.lastName)`
і, якщо є кандидати, показати вибір "Новий юнак" / "Оновити {ім'я
кандидата}", записуючи вибір у `rowOverrides[i].matchChoice`.
```

Run: no test needed for a doc-only change.

### Step 7: Write the Playwright test

The live Google Sheets connection cannot be exercised in Playwright (external service, same limitation as every prior Drive/Sheets subproject in this project) — the only thing coverable without live OAuth is the "not connected" gate.

Read `apps/web/e2e/inventory.spec.ts` for the exact seeding/login conventions (`seedProbyProgram`, `seedKurinWithZvyazkovyi`, `loginAs`).

Create `apps/web/e2e/junak-import.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('shows a message instead of the wizard when Книга судді is not connected', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin/junak-import');

  await expect(page.getByText('Спершу підключіть Книгу судді на сторінці налаштувань куреня.')).toBeVisible();
});
```

### Step 8: Run the tests

Run: `cd apps/web && npx playwright test junak-import --workers=1`
Expected: PASS, 1 test.

Run: `cd apps/web && npx playwright test --workers=1`
Expected: all tests pass — no regressions (the `ACTION_LABELS` additions and the new `/kurin/junak-import` route are purely additive).

### Step 9: Commit

```bash
git add apps/web/lib/types.ts apps/web/lib/queries/junak-import-rows.ts apps/web/app/kurin/junak-import/page.tsx apps/web/app/approval-requests/page.tsx "apps/web/app/approval-requests/[id]/page.tsx" apps/web/e2e/junak-import.spec.ts docs/fixes-backlog.md
git commit -m "feat: add junak import wizard UI and BULK_IMPORT_JUNAKY approval-request labels"
```
