# Google Drive OAuth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken service-account Google Drive integration (service accounts have zero storage quota and cannot write to a personal Drive folder) with per-kurin OAuth — each kurin's zvyazkovyi connects their own Google account once, then picks a folder via Google Picker for inventory photo uploads.

**Architecture:** `GoogleDriveService` drops its single shared service-account client and instead builds a per-kurin `OAuth2Client` on demand from a `driveRefreshToken` stored on that `Kurin` row. A new controller in the existing `kurins` module exposes the OAuth connect/callback/status/picker-token/folder-selection flow, protected by the existing `JwtAuthGuard`/`RolesGuard` (zvyazkovyi-only) except the Google-facing `callback` route, which is deliberately unauthenticated and instead protected by a signed `state` parameter (reusing the existing `JwtService`/`JWT_SECRET`). `InventoryService` reads `Kurin.driveFolderId` directly instead of auto-creating folders. The frontend gets a "Connect Google Drive" + Picker UI on the kurin settings page and a graceful "not connected" empty state on the inventory page.

**Tech Stack:** NestJS + Prisma + PostgreSQL (backend), Next.js App Router + TanStack Query (frontend), `googleapis` (already a dependency, now used for OAuth2 instead of a service account), Google Picker API (new, loaded client-side via `https://apis.google.com/js/api.js`).

## Global Constraints

- **Additive migration only.** This plan adds four new nullable columns to the existing `Kurin` table (`driveFolderName`, `driveRefreshToken`, `driveConnectedEmail`, `driveConnectedAt`). No `ALTER` on any existing column's type/constraints. `driveFolderId` already exists from a prior subproject and is reused, not renamed.
- **OAuth scope is `https://www.googleapis.com/auth/drive.file` and ONLY this scope.** Do not request `spreadsheets` or the full `drive` scope — `drive.file` already covers future Sheets-based features (per design spec), since it grants access to files the app creates plus files/folders the user explicitly picks via Google Picker.
- **Design assumes the Google Cloud OAuth consent screen is set to "In production" publishing status.** This is a manual Google Cloud Console step Andrii performs outside this plan — no code in this plan differs based on publishing status, but do not write anything that assumes or depends on "Testing" mode's 100-test-user cap (e.g. no hardcoded test-user allowlist).
- **`driveRefreshToken` is stored in plaintext in the `Kurin` table.** This is an explicit, already-made spec decision (the database is already access-restricted and holds other sensitive data) — do not add field-level encryption, hashing, or any other protection for this column unless asked.
- **The `callback` endpoint (`GET /kurins/google-drive/callback`) is deliberately NOT behind `JwtAuthGuard`.** Google's redirect back to our server cannot carry our app's JWT. Its only protection is a signed `state` query parameter (see Task 3). A reviewer must not flag "missing auth guard" on this one specific route without first checking this constraint.
- **All old service-account code is fully removed, not kept as a fallback.** `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `apps/api/src/google-drive/google-drive-client.provider.ts`, the `GOOGLE_DRIVE_CLIENT` DI token, and the `ensureKurinFolder`/`ensureSubfolder` methods are deleted entirely — no dual code path.
- **Creating an inventory item without any photos must keep working regardless of Google Drive connection state.** Only attaching a photo (at creation or via the add-photo endpoint) requires a connected Drive + selected folder.
- **This machine has only 8GB RAM and has crashed once from unconstrained test parallelism.** Every Jest invocation in this plan uses `--runInBand`; every Playwright invocation uses `--workers=1`. Never run either with default parallelism.
- **Git hygiene:** every commit uses exact file paths in `git add`, never `-A` or `.`.
- A stale note in `apps/web/AGENTS.md`/`CLAUDE.md` claims this Next.js install has breaking changes requiring reading `node_modules/next/dist/docs/` before writing code — that path does not exist (confirmed in a prior subproject in this exact repo). Ignore it; every API this plan uses (`fetch`, standard App Router route handlers, client components) is already in active use elsewhere in this codebase.

---

## Task 1: Prisma schema — new `Kurin` OAuth fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing from other tasks (fully self-contained).
- Produces: `Kurin.driveFolderName`, `Kurin.driveRefreshToken`, `Kurin.driveConnectedEmail`, `Kurin.driveConnectedAt` — all nullable, consumed by Tasks 2-4.

### Step 1: Add the schema fields

Open `apps/api/prisma/schema.prisma`. Find the `Kurin` model — it currently looks like this:

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
  driveFolderId  String?

  hurtky Hurtok[]
  inventoryItems InventoryItem[]
  users  User[]
  positions KurinPosition[]
}
```

Replace the `driveFolderId  String?` line with:

```prisma
  driveFolderId        String?
  driveFolderName      String?
  driveRefreshToken    String?
  driveConnectedEmail  String?
  driveConnectedAt     DateTime?
```

### Step 2: Generate and apply the migration

Run (from `apps/api/`, against your local dev database):

```bash
npx prisma migrate dev --name add_google_drive_oauth
```

Expected: it prints `Your database is now in sync with your schema`, and the generated `migration.sql` contains only `ALTER TABLE "Kurin" ADD COLUMN "driveFolderName" TEXT`, `ADD COLUMN "driveRefreshToken" TEXT`, `ADD COLUMN "driveConnectedEmail" TEXT`, `ADD COLUMN "driveConnectedAt" TIMESTAMP(3)` — four new nullable columns, nothing else. If you see anything else, stop — Step 1 was applied incorrectly.

### Step 3: Verify the API still builds

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors (the new columns aren't referenced by any code yet).

### Step 4: Commit

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add Google Drive OAuth fields to Kurin"
```

---

## Task 2: `GoogleDriveService` — replace service account with per-kurin OAuth2

**Files:**
- Delete: `apps/api/src/google-drive/google-drive-client.provider.ts`
- Modify: `apps/api/src/google-drive/google-drive.service.ts`
- Modify: `apps/api/src/google-drive/google-drive.module.ts`
- Modify: `apps/api/src/google-drive/google-drive.service.spec.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Consumes: `Kurin.driveRefreshToken`/`driveConnectedEmail`/`driveConnectedAt` from Task 1's schema.
- Produces: `GoogleDriveService` with four public methods that Tasks 3-4 consume:
  - `getAuthUrl(state: string): string`
  - `handleCallback(kurinId: string, code: string): Promise<{ email: string }>`
  - `getPickerAccessToken(kurinId: string): Promise<string>`
  - `uploadFile(kurinId: string, folderId: string, buffer: Buffer, filename: string, mimeType: string): Promise<{ fileId: string; url: string }>`

  All four throw `ServiceUnavailableException` when the relevant kurin has no `driveRefreshToken` (for `getPickerAccessToken`/`uploadFile`) or when Google's response is unusable (for `handleCallback`, if no `refresh_token` comes back).

### Step 1: Delete the old service-account client provider

```bash
rm apps/api/src/google-drive/google-drive-client.provider.ts
```

### Step 2: Rewrite `GoogleDriveService`

Replace the entire contents of `apps/api/src/google-drive/google-drive.service.ts` with:

```ts
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

@Injectable()
export class GoogleDriveService {
  constructor(private readonly prisma: PrismaService) {}

  getAuthUrl(state: string): string {
    const client = this.createOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [DRIVE_FILE_SCOPE],
      state,
    });
  }

  async handleCallback(kurinId: string, code: string): Promise<{ email: string }> {
    const client = this.createOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new ServiceUnavailableException(
        'Google не повернув довгостроковий токен доступу — спробуйте підключити ще раз',
      );
    }
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email ?? 'невідомо';
    await this.prisma.kurin.update({
      where: { id: kurinId },
      data: {
        driveRefreshToken: tokens.refresh_token,
        driveConnectedEmail: email,
        driveConnectedAt: new Date(),
      },
    });
    return { email };
  }

  async getPickerAccessToken(kurinId: string): Promise<string> {
    const client = await this.getAuthorizedClient(kurinId);
    const { token } = await client.getAccessToken();
    if (!token) {
      throw new ServiceUnavailableException('Не вдалося отримати токен доступу до Google Drive');
    }
    return token;
  }

  async uploadFile(
    kurinId: string,
    folderId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<{ fileId: string; url: string }> {
    const client = await this.getAuthorizedClient(kurinId);
    const drive = google.drive({ version: 'v3', auth: client });
    const res = await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id',
    });
    const fileId = res.data.id;
    if (!fileId) {
      throw new Error('Failed to upload file to Drive');
    }
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    return { fileId, url: `https://drive.google.com/uc?id=${fileId}` };
  }

  private createOAuthClient() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI,
    );
  }

  private async getAuthorizedClient(kurinId: string) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin?.driveRefreshToken) {
      throw new ServiceUnavailableException('Курінь ще не підключив Google Drive');
    }
    const client = this.createOAuthClient();
    client.setCredentials({ refresh_token: kurin.driveRefreshToken });
    return client;
  }
}
```

### Step 3: Rewrite `GoogleDriveModule`

Replace the entire contents of `apps/api/src/google-drive/google-drive.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';

@Module({
  providers: [GoogleDriveService],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
```

### Step 4: Rewrite the unit tests

Replace the entire contents of `apps/api/src/google-drive/google-drive.service.spec.ts` with:

```ts
import { ServiceUnavailableException } from '@nestjs/common';

const mockOAuth2Instance = {
  generateAuthUrl: jest.fn(),
  getToken: jest.fn(),
  setCredentials: jest.fn(),
  getAccessToken: jest.fn(),
};
const mockFilesCreate = jest.fn();
const mockPermissionsCreate = jest.fn();
const mockUserinfoGet = jest.fn();

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
  },
}));

import { GoogleDriveService } from './google-drive.service';

describe('GoogleDriveService', () => {
  let service: GoogleDriveService;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      kurin: { findUnique: jest.fn(), update: jest.fn() },
    };
    service = new GoogleDriveService(prisma);
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://example.com/callback';
  });

  describe('getAuthUrl', () => {
    it('builds a Google consent URL with the drive.file scope and given state', () => {
      mockOAuth2Instance.generateAuthUrl.mockReturnValue('https://accounts.google.com/mock-url');

      const url = service.getAuthUrl('signed-state-123');

      expect(url).toBe('https://accounts.google.com/mock-url');
      expect(mockOAuth2Instance.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/drive.file'],
        state: 'signed-state-123',
      });
    });
  });

  describe('handleCallback', () => {
    it('exchanges the code for tokens and saves refresh token + email on the kurin', async () => {
      mockOAuth2Instance.getToken.mockResolvedValue({ tokens: { refresh_token: 'refresh-abc' } });
      mockUserinfoGet.mockResolvedValue({ data: { email: 'zvyazkovyi@example.com' } });

      const result = await service.handleCallback('kurin-1', 'auth-code-xyz');

      expect(result).toEqual({ email: 'zvyazkovyi@example.com' });
      expect(mockOAuth2Instance.getToken).toHaveBeenCalledWith('auth-code-xyz');
      expect(mockOAuth2Instance.setCredentials).toHaveBeenCalledWith({ refresh_token: 'refresh-abc' });
      expect(prisma.kurin.update).toHaveBeenCalledWith({
        where: { id: 'kurin-1' },
        data: expect.objectContaining({
          driveRefreshToken: 'refresh-abc',
          driveConnectedEmail: 'zvyazkovyi@example.com',
        }),
      });
    });

    it('throws ServiceUnavailableException when Google does not return a refresh token', async () => {
      mockOAuth2Instance.getToken.mockResolvedValue({ tokens: {} });

      await expect(service.handleCallback('kurin-1', 'auth-code-xyz')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('getPickerAccessToken', () => {
    it('returns a fresh access token for a connected kurin', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: 'refresh-abc' });
      mockOAuth2Instance.getAccessToken.mockResolvedValue({ token: 'access-token-123' });

      const token = await service.getPickerAccessToken('kurin-1');

      expect(token).toBe('access-token-123');
      expect(mockOAuth2Instance.setCredentials).toHaveBeenCalledWith({ refresh_token: 'refresh-abc' });
    });

    it('throws ServiceUnavailableException when the kurin has not connected Drive', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: null });

      await expect(service.getPickerAccessToken('kurin-1')).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('uploadFile', () => {
    it('uploads the file, makes it link-viewable, and returns its id and url', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: 'refresh-abc' });
      mockFilesCreate.mockResolvedValue({ data: { id: 'file-1' } });
      mockPermissionsCreate.mockResolvedValue({});

      const result = await service.uploadFile('kurin-1', 'folder-1', Buffer.from('data'), 'photo.jpg', 'image/jpeg');

      expect(result).toEqual({ fileId: 'file-1', url: 'https://drive.google.com/uc?id=file-1' });
      expect(mockPermissionsCreate).toHaveBeenCalledWith({
        fileId: 'file-1',
        requestBody: { role: 'reader', type: 'anyone' },
      });
    });

    it('throws ServiceUnavailableException when the kurin has not connected Drive', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: null });

      await expect(
        service.uploadFile('kurin-1', 'folder-1', Buffer.from('data'), 'photo.jpg', 'image/jpeg'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
```

### Step 5: Update environment variables

Open `apps/api/.env.example`. Remove these two lines:

```
GOOGLE_SERVICE_ACCOUNT_KEY=""
GOOGLE_DRIVE_ROOT_FOLDER_ID=""
```

Add these three lines in their place:

```
GOOGLE_OAUTH_CLIENT_ID=""
GOOGLE_OAUTH_CLIENT_SECRET=""
GOOGLE_OAUTH_REDIRECT_URI="http://localhost:3000/kurins/google-drive/callback"
```

### Step 6: Run the tests

Run: `cd apps/api && npx jest google-drive.service.spec --runInBand`
Expected: PASS, all tests.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

### Step 7: Commit

```bash
git add apps/api/src/google-drive apps/api/.env.example
git commit -m "feat: replace service-account Drive client with per-kurin OAuth2"
```

Note: this commit's `git add apps/api/src/google-drive` will stage the deletion of `google-drive-client.provider.ts` along with the modified files — confirm with `git status` that the deletion is staged before committing.

---

## Task 3: Backend — Google Drive OAuth HTTP endpoints

**Files:**
- Create: `apps/api/src/kurins/google-drive-state.util.ts`
- Create: `apps/api/src/kurins/google-drive-state.util.spec.ts`
- Create: `apps/api/src/kurins/dto/set-google-drive-folder.dto.ts`
- Create: `apps/api/src/kurins/kurin-google-drive.controller.ts`
- Modify: `apps/api/src/kurins/kurins.module.ts`
- Test: `apps/api/test/kurin-google-drive.e2e-spec.ts`

**Interfaces:**
- Consumes: `GoogleDriveService.getAuthUrl`/`handleCallback`/`getPickerAccessToken` (Task 2).
- Produces: the HTTP contract Task 5 (frontend) consumes —
  - `GET /kurins/:kurinId/google-drive/status` (JWT, zvyazkovyi-only) → `{ connected: boolean; email?: string; folderId?: string; folderName?: string }`
  - `GET /kurins/:kurinId/google-drive/connect` (JWT, zvyazkovyi-only) → `{ url: string }`
  - `GET /kurins/google-drive/callback` (no JWT guard — signed `state` param only) → 302 redirect to `${FRONTEND_URL}/kurin?driveConnected=1` or `?driveError=1`
  - `GET /kurins/:kurinId/google-drive/picker-token` (JWT, zvyazkovyi-only) → `{ accessToken: string }`
  - `PATCH /kurins/:kurinId/google-drive/folder` (JWT, zvyazkovyi-only; body `{ folderId: string; folderName: string }`) → the updated `Kurin`

### Step 1: Write the state-signing utility

Create `apps/api/src/kurins/google-drive-state.util.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

const STATE_PURPOSE = 'google-drive-connect';

export function signGoogleDriveState(jwtService: JwtService, kurinId: string): string {
  return jwtService.sign({ kurinId, purpose: STATE_PURPOSE }, { expiresIn: '10m' });
}

export function verifyGoogleDriveState(jwtService: JwtService, state: string): string {
  let payload: { kurinId?: string; purpose?: string };
  try {
    payload = jwtService.verify(state);
  } catch {
    throw new BadRequestException('Недійсний або прострочений запит на підключення Google Drive');
  }
  if (payload.purpose !== STATE_PURPOSE || !payload.kurinId) {
    throw new BadRequestException('Недійсний запит на підключення Google Drive');
  }
  return payload.kurinId;
}
```

This reuses the same `JwtService`/`JWT_SECRET` already configured in `AuthModule` (see `apps/api/src/auth/auth.module.ts`, which registers `JwtModule.register({ secret: process.env.JWT_SECRET, ... })` and exports `JwtModule`) — no new secret or crypto library is introduced.

### Step 2: Write the unit test for the state utility

Create `apps/api/src/kurins/google-drive-state.util.spec.ts`:

```ts
import { JwtService } from '@nestjs/jwt';
import { BadRequestException } from '@nestjs/common';
import { signGoogleDriveState, verifyGoogleDriveState } from './google-drive-state.util';

describe('google-drive-state.util', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });

  it('signs and verifies a state round-trip, returning the original kurinId', () => {
    const state = signGoogleDriveState(jwtService, 'kurin-1');
    expect(verifyGoogleDriveState(jwtService, state)).toBe('kurin-1');
  });

  it('rejects a state signed with a different secret', () => {
    const otherJwtService = new JwtService({ secret: 'other-secret' });
    const state = signGoogleDriveState(otherJwtService, 'kurin-1');
    expect(() => verifyGoogleDriveState(jwtService, state)).toThrow(BadRequestException);
  });

  it('rejects a validly-signed token that lacks the google-drive-connect purpose', () => {
    const foreignToken = jwtService.sign({ kurinId: 'kurin-1', purpose: 'something-else' });
    expect(() => verifyGoogleDriveState(jwtService, foreignToken)).toThrow(BadRequestException);
  });
});
```

Run: `cd apps/api && npx jest google-drive-state.util.spec --runInBand`
Expected: PASS, 3 tests.

### Step 3: Write the folder DTO

Create `apps/api/src/kurins/dto/set-google-drive-folder.dto.ts`:

```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class SetGoogleDriveFolderDto {
  @IsString() @IsNotEmpty() folderId: string;
  @IsString() @IsNotEmpty() folderName: string;
}
```

### Step 4: Write the controller

Create `apps/api/src/kurins/kurin-google-drive.controller.ts`:

```ts
import { Body, Controller, ForbiddenException, Get, Param, Patch, Query, Redirect, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { SetGoogleDriveFolderDto } from './dto/set-google-drive-folder.dto';
import { signGoogleDriveState, verifyGoogleDriveState } from './google-drive-state.util';

@Controller('kurins')
export class KurinGoogleDriveController {
  constructor(
    private readonly googleDrive: GoogleDriveService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ZVYAZKOVYI)
  @Get(':kurinId/google-drive/status')
  async status(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    return {
      connected: !!kurin?.driveRefreshToken,
      email: kurin?.driveConnectedEmail ?? undefined,
      folderId: kurin?.driveFolderId ?? undefined,
      folderName: kurin?.driveFolderName ?? undefined,
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ZVYAZKOVYI)
  @Get(':kurinId/google-drive/connect')
  connect(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    const state = signGoogleDriveState(this.jwtService, kurinId);
    return { url: this.googleDrive.getAuthUrl(state) };
  }

  @Get('google-drive/callback')
  @Redirect()
  async callback(@Query('code') code: string, @Query('state') state: string) {
    try {
      const kurinId = verifyGoogleDriveState(this.jwtService, state);
      await this.googleDrive.handleCallback(kurinId, code);
      return { url: `${process.env.FRONTEND_URL}/kurin?driveConnected=1` };
    } catch {
      return { url: `${process.env.FRONTEND_URL}/kurin?driveError=1` };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ZVYAZKOVYI)
  @Get(':kurinId/google-drive/picker-token')
  async pickerToken(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    const accessToken = await this.googleDrive.getPickerAccessToken(kurinId);
    return { accessToken };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ZVYAZKOVYI)
  @Patch(':kurinId/google-drive/folder')
  async setFolder(
    @Param('kurinId') kurinId: string,
    @Body() dto: SetGoogleDriveFolderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertOwnKurin(kurinId, user);
    return this.prisma.kurin.update({
      where: { id: kurinId },
      data: { driveFolderId: dto.folderId, driveFolderName: dto.folderName },
    });
  }

  private assertOwnKurin(kurinId: string, user: CurrentUserPayload) {
    if (kurinId !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
  }
}
```

Note the `callback` method has no `@UseGuards`/`@Roles` decorators at all — this is intentional (see Global Constraints).

### Step 5: Wire the controller into `KurinsModule`

Open `apps/api/src/kurins/kurins.module.ts`. Its current contents:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KurinsController } from './kurins.controller';
import { KurinsService } from './kurins.service';

@Module({
  imports: [AuthModule],
  controllers: [KurinsController],
  providers: [KurinsService],
})
export class KurinsModule {}
```

Replace it with:

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

`AuthModule` already exports `JwtModule` (see `apps/api/src/auth/auth.module.ts`'s `exports: [AuthService, JwtModule, PassportModule]`), so `JwtService` is available for injection into `KurinGoogleDriveController` without any further wiring.

### Step 6: Write the e2e tests

First, check `apps/api/test/utils/fixtures.ts` for the exact current signatures of `createKurin`, `createUser`, `createProbyProgramTree`, and `issueTokenFor` (read the file — do not guess at these signatures) before writing the tests below, and adjust the calls if the actual signatures differ from what's shown here (they matched this file as of the last read: `createKurin(prisma, { probyProgramId, name?, kurinNumber?, gender?, stanytsia? })`, `issueTokenFor(jwtService, { id, role, kurinId })`).

Create `apps/api/test/kurin-google-drive.e2e-spec.ts`:

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
import { signGoogleDriveState } from '../src/kurins/google-drive-state.util';

describe('Kurin Google Drive OAuth (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fakeGoogleDrive: {
    getAuthUrl: jest.Mock;
    handleCallback: jest.Mock;
    getPickerAccessToken: jest.Mock;
  };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    fakeGoogleDrive = {
      getAuthUrl: jest.fn(),
      handleCallback: jest.fn(),
      getPickerAccessToken: jest.fn(),
    };
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
    fakeGoogleDrive.getAuthUrl.mockReset();
    fakeGoogleDrive.handleCallback.mockReset();
    fakeGoogleDrive.getPickerAccessToken.mockReset();
  });

  async function setup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    return { kurin };
  }

  it('reports not connected for a fresh kurin', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/google-drive/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ connected: false });
  });

  it('forbids a non-zvyazkovyi from checking status', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/google-drive/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns a Google auth URL for connect', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    fakeGoogleDrive.getAuthUrl.mockReturnValue('https://accounts.google.com/mock-consent');

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/google-drive/connect`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ url: 'https://accounts.google.com/mock-consent' });
    expect(fakeGoogleDrive.getAuthUrl).toHaveBeenCalledWith(expect.any(String));
  });

  it('redirects to the frontend with driveConnected=1 on a valid callback', async () => {
    const { kurin } = await setup();
    fakeGoogleDrive.handleCallback.mockResolvedValue({ email: 'test@example.com' });
    const state = signGoogleDriveState(jwtService, kurin.id);

    const response = await request(app.getHttpServer())
      .get(`/kurins/google-drive/callback?code=auth-code&state=${state}`)
      .expect(302);

    expect(response.headers.location).toContain('driveConnected=1');
    expect(fakeGoogleDrive.handleCallback).toHaveBeenCalledWith(kurin.id, 'auth-code');
  });

  it('redirects to the frontend with driveError=1 on an invalid state', async () => {
    const response = await request(app.getHttpServer())
      .get('/kurins/google-drive/callback?code=auth-code&state=not-a-real-token')
      .expect(302);

    expect(response.headers.location).toContain('driveError=1');
  });

  it('returns a picker access token for a connected kurin', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    fakeGoogleDrive.getPickerAccessToken.mockResolvedValue('picker-access-token');

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/google-drive/picker-token`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ accessToken: 'picker-access-token' });
  });

  it('saves the picked folder', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/google-drive/folder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ folderId: 'folder-abc', folderName: 'Обозництво' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const updated = await prisma.kurin.findUnique({ where: { id: kurin.id } });
    expect(updated?.driveFolderId).toBe('folder-abc');
    expect(updated?.driveFolderName).toBe('Обозництво');
  });

  it('forbids acting on a different kurin', async () => {
    const { kurin } = await setup();
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const outsider = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });
    const token = issueTokenFor(jwtService, outsider);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/google-drive/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
```

Note: the last test expects `403` (not `404`) for cross-tenant access, because `assertOwnKurin` in this controller throws `ForbiddenException` (matching the existing pattern in `kurins.controller.ts`'s `changeProbyProgram`/`changeKurinNumber`, which also throw `ForbiddenException` for `id !== user.kurinId` — this differs from `InventoryController`'s pattern of throwing `NotFoundException` for cross-tenant access; follow `kurins.controller.ts`'s convention here since this new controller lives in the same module).

### Step 7: Run the tests

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand kurin-google-drive`
Expected: PASS, 8 tests.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

### Step 8: Run the full backend suite

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`
Expected: all suites pass (no regressions).

Run: `cd apps/api && npx jest --runInBand`
Expected: all unit suites pass, including Task 2's and Task 3's new spec files.

### Step 9: Commit

```bash
git add apps/api/src/kurins apps/api/test/kurin-google-drive.e2e-spec.ts
git commit -m "feat: add Google Drive OAuth connect/callback/status/picker-token/folder endpoints"
```

---

## Task 4: `InventoryService` — use the picked folder directly, remove auto-creation

**Files:**
- Modify: `apps/api/src/inventory/inventory.service.ts`
- Modify: `apps/api/test/inventory.e2e-spec.ts`

**Interfaces:**
- Consumes: `GoogleDriveService.uploadFile(kurinId, folderId, buffer, filename, mimeType)` (Task 2's new signature — note the added `kurinId` first parameter and that `folderId` is now the caller's responsibility to look up, not the service's).
- Produces: nothing consumed by later tasks (Task 5 only consumes the already-existing `InventoryItem`/`InventoryItemPhoto` HTTP contract, unchanged by this task).

### Step 1: Update `uploadAndAttachPhoto`

Open `apps/api/src/inventory/inventory.service.ts`. Add `ServiceUnavailableException` to the existing import from `@nestjs/common` — change:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
```

to:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
```

Replace the `uploadAndAttachPhoto` method — currently:

```ts
  private async uploadAndAttachPhoto(kurinId: string, itemId: string, file: Express.Multer.File) {
    const kurinFolderId = await this.googleDrive.ensureKurinFolder(kurinId);
    const inventoryFolderId = await this.googleDrive.ensureSubfolder(kurinFolderId, 'Реманент');
    const { fileId, url } = await this.googleDrive.uploadFile(
      inventoryFolderId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    return this.prisma.inventoryItemPhoto.create({ data: { itemId, driveFileId: fileId, url } });
  }
```

with:

```ts
  private async uploadAndAttachPhoto(kurinId: string, itemId: string, file: Express.Multer.File) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin?.driveFolderId) {
      throw new ServiceUnavailableException(
        'Курінь ще не підключив Google Drive або не обрав папку для реманенту',
      );
    }
    const { fileId, url } = await this.googleDrive.uploadFile(
      kurinId,
      kurin.driveFolderId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    return this.prisma.inventoryItemPhoto.create({ data: { itemId, driveFileId: fileId, url } });
  }
```

### Step 2: Update the e2e tests

Open `apps/api/test/inventory.e2e-spec.ts`. This file currently overrides the removed `GOOGLE_DRIVE_CLIENT` DI token with a `fakeDrive` object — that token no longer exists (Task 2 deleted it), so this file will fail to compile/run until updated. Read the current full file first, then apply these changes:

1. Replace the import of `GOOGLE_DRIVE_CLIENT`:

   Change:
   ```ts
   import { GOOGLE_DRIVE_CLIENT } from '../src/google-drive/google-drive-client.provider';
   ```
   to:
   ```ts
   import { GoogleDriveService } from '../src/google-drive/google-drive.service';
   ```

2. Replace the `fakeDrive` variable and its `beforeAll`/`beforeEach` setup — currently:

   ```ts
   let fakeDrive: {
     files: { list: jest.Mock; create: jest.Mock };
     permissions: { create: jest.Mock };
   };
   ```

   and in `beforeAll`:
   ```ts
     fakeDrive = {
       files: { list: jest.fn(), create: jest.fn() },
       permissions: { create: jest.fn() },
     };
     const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
       .overrideProvider(GOOGLE_DRIVE_CLIENT)
       .useValue(fakeDrive)
       .compile();
   ```

   and in `beforeEach`:
   ```ts
     fakeDrive.files.list.mockReset().mockResolvedValue({ data: { files: [] } });
     fakeDrive.files.create.mockReset().mockImplementation((args: { requestBody?: { mimeType?: string } }) => {
       const isFolder = args.requestBody?.mimeType === 'application/vnd.google-apps.folder';
       return Promise.resolve({ data: { id: isFolder ? 'fake-folder-id' : 'fake-file-id' } });
     });
     fakeDrive.permissions.create.mockReset().mockResolvedValue({});
   ```

   Replace all three of the above with:

   ```ts
   let fakeGoogleDrive: { uploadFile: jest.Mock };
   ```

   ```ts
     fakeGoogleDrive = { uploadFile: jest.fn() };
     const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
       .overrideProvider(GoogleDriveService)
       .useValue(fakeGoogleDrive)
       .compile();
   ```

   ```ts
     fakeGoogleDrive.uploadFile.mockReset().mockResolvedValue({ fileId: 'fake-file-id', url: 'https://drive.google.com/uc?id=fake-file-id' });
   ```

3. Update the `setup()` helper so kurins created by it already have a connected Drive folder (matching the new model where the folder is picked ahead of time, not auto-created) — currently:

   ```ts
   async function setup() {
     const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
     const kurin = await createKurin(prisma, { probyProgramId: program.id });
     return { kurin };
   }
   ```

   Replace with:

   ```ts
   async function setup() {
     const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
     const kurin = await createKurin(prisma, { probyProgramId: program.id });
     const connectedKurin = await prisma.kurin.update({
       where: { id: kurin.id },
       data: { driveFolderId: 'connected-folder-id' },
     });
     return { kurin: connectedKurin };
   }
   ```

4. Delete the test `'reuses the cached kurin Drive folder across multiple uploads'` entirely — this test exercised the now-removed `ensureKurinFolder`/`ensureSubfolder` auto-creation behavior and no longer applies (folders are Picker-selected, not auto-created).

5. Add two new tests (anywhere after the `setup` function, alongside the other `it(...)` blocks) covering the new fail-fast behavior:

   ```ts
   it('returns 503 when creating an item with a photo on a kurin with no connected Drive folder', async () => {
     const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
     const disconnectedKurin = await createKurin(prisma, { probyProgramId: program.id });
     const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: disconnectedKurin.id });
     const token = issueTokenFor(jwtService, zvyazkovyi);

     await request(app.getHttpServer())
       .post(`/kurins/${disconnectedKurin.id}/inventory`)
       .set('Authorization', `Bearer ${token}`)
       .field('name', 'Пилка')
       .field('quantity', '1')
       .attach('photos', Buffer.from('fake-image-data'), 'saw.jpg')
       .expect(503);
   });

   it('still creates an item without photos on a kurin with no connected Drive folder', async () => {
     const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
     const disconnectedKurin = await createKurin(prisma, { probyProgramId: program.id });
     const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: disconnectedKurin.id });
     const token = issueTokenFor(jwtService, zvyazkovyi);

     const response = await request(app.getHttpServer())
       .post(`/kurins/${disconnectedKurin.id}/inventory`)
       .set('Authorization', `Bearer ${token}`)
       .field('name', 'Стіл')
       .field('quantity', '1')
       .expect((res) => expect([200, 201]).toContain(res.status));

     expect(response.body.photos).toHaveLength(0);
   });
   ```

   The second test confirms the Global Constraint "creating an item without photos must keep working regardless of Drive connection state."

6. For every remaining existing test in this file that calls `.attach('photos', ...)` or `POST .../photos` (uploading a photo), no change is needed to the test body itself — they already go through `setup()`, which now returns a kurin with `driveFolderId` set, so `uploadAndAttachPhoto` will proceed past its new guard and call the mocked `fakeGoogleDrive.uploadFile`.

7. The two "rejects a non-image file" tests (added in a prior fix wave) are unaffected — MIME validation happens in the multer `fileFilter` before the service method is ever called, regardless of Drive-connection state.

### Step 3: Run the tests

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand inventory`
Expected: PASS. The suite currently has 11 tests (9 original + 2 non-image-rejection tests from a prior fix wave). This task deletes 1 (the folder-caching test) and adds 2 (the 503-without-photo and works-without-photo tests), so the suite should now have 12 tests total.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

### Step 4: Run the full backend suite

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`
Expected: all suites pass.

Run: `cd apps/api && npx jest --runInBand`
Expected: all unit suites pass.

### Step 5: Commit

```bash
git add apps/api/src/inventory/inventory.service.ts apps/api/test/inventory.e2e-spec.ts
git commit -m "fix: read Kurin.driveFolderId directly instead of auto-creating Drive folders"
```

---

## Task 5: Frontend — connect/Picker UI, inventory empty state

**Files:**
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/queries/google-drive.ts`
- Create: `apps/web/lib/google-picker.ts`
- Modify: `apps/web/app/kurin/page.tsx`
- Modify: `apps/web/app/inventory/page.tsx`
- Modify: `apps/web/.env.local.example`
- Modify: `apps/api/src/admin/dto/create-kurin.dto.ts` (test-seeding support only — see Step 8)
- Modify: `apps/web/e2e/helpers/seed.ts`
- Test: `apps/web/e2e/inventory.spec.ts`

**Interfaces:**
- Consumes: the full backend contract from Task 3 (`status`/`connect`/`picker-token`/`folder` endpoints) and Task 4 (503 behavior when Drive isn't connected).
- Produces: nothing consumed by later tasks (last task in this plan).

### Step 1: Add the `GoogleDriveStatus` type

Open `apps/web/lib/types.ts`. Add this interface anywhere after the `Kurin` interface:

```ts
export interface GoogleDriveStatus {
  connected: boolean;
  email?: string;
  folderId?: string;
  folderName?: string;
}
```

### Step 2: Write the query hooks

Create `apps/web/lib/queries/google-drive.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { GoogleDriveStatus } from '@/lib/types';

export function useGoogleDriveStatus(kurinId: string | undefined) {
  return useQuery({
    queryKey: ['google-drive-status', kurinId],
    queryFn: () => apiFetch<GoogleDriveStatus>(`/kurins/${kurinId}/google-drive/status`),
    enabled: !!kurinId,
  });
}

export function useConnectGoogleDrive(kurinId: string) {
  return useMutation({
    mutationFn: async () => {
      const { url } = await apiFetch<{ url: string }>(`/kurins/${kurinId}/google-drive/connect`);
      window.location.href = url;
    },
  });
}

export async function fetchGoogleDrivePickerToken(kurinId: string): Promise<string> {
  const { accessToken } = await apiFetch<{ accessToken: string }>(`/kurins/${kurinId}/google-drive/picker-token`);
  return accessToken;
}

export function useSetGoogleDriveFolder(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { folderId: string; folderName: string }) =>
      apiFetch(`/kurins/${kurinId}/google-drive/folder`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-drive-status', kurinId] });
    },
  });
}
```

`fetchGoogleDrivePickerToken` is a plain async function (not a `useQuery` hook) because it's called on-demand right before opening the Picker widget, not rendered reactively.

### Step 3: Write the Google Picker loader utility

Create `apps/web/lib/google-picker.ts`:

```ts
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

let scriptLoadingPromise: Promise<void> | null = null;

function loadGooglePickerScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.gapi?.picker) {
    return Promise.resolve();
  }
  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }
  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('picker', { callback: () => resolve() });
    };
    script.onerror = () => reject(new Error('Не вдалося завантажити Google Picker'));
    document.body.appendChild(script);
  });
  return scriptLoadingPromise;
}

export async function openGoogleDriveFolderPicker(
  accessToken: string,
  onPicked: (folderId: string, folderName: string) => void,
): Promise<void> {
  await loadGooglePickerScript();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY as string;
  const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
    .setSelectFolderEnabled(true)
    .setIncludeFolders(true);
  const picker = new window.google.picker.PickerBuilder()
    .setOAuthToken(accessToken)
    .setDeveloperKey(apiKey)
    .addView(view)
    .setCallback((data: { action: string; docs?: { id: string; name: string }[] }) => {
      if (data.action === window.google.picker.Action.PICKED && data.docs?.[0]) {
        onPicked(data.docs[0].id, data.docs[0].name);
      }
    })
    .build();
  picker.setVisible(true);
}
```

### Step 4: Add the Picker API key env var

Open `apps/web/.env.local.example`. Add this line at the end:

```
NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=
```

### Step 5: Add the Drive connect/Picker section to the kurin settings page

Open `apps/web/app/kurin/page.tsx`. Read it in full first — it currently renders two `Card`s (kurin info, proby program) gated by `canChangeProgram = session?.role === 'ZVYAZKOVYI'`.

Add these imports at the top, alongside the existing ones:

```ts
import { useGoogleDriveStatus, useConnectGoogleDrive, useSetGoogleDriveFolder, fetchGoogleDrivePickerToken } from '@/lib/queries/google-drive';
import { openGoogleDriveFolderPicker } from '@/lib/google-picker';
```

Inside the `KurinPage` component, add these hooks alongside the existing ones (after `const canChangeProgram = ...` line):

```ts
  const driveStatus = useGoogleDriveStatus(kurin?.id);
  const connectDrive = useConnectGoogleDrive(kurin?.id ?? '');
  const setDriveFolder = useSetGoogleDriveFolder(kurin?.id ?? '');

  async function handlePickFolder() {
    if (!kurin) return;
    const accessToken = await fetchGoogleDrivePickerToken(kurin.id);
    await openGoogleDriveFolderPicker(accessToken, (folderId, folderName) => {
      setDriveFolder.mutate({ folderId, folderName });
    });
  }
```

Add a new `Card` after the existing "Програма проб" `Card` (before the closing `</div>` of the component), gated the same way as the other zvyazkovyi-only controls:

```tsx
      {canChangeProgram && (
        <Card>
          <CardHeader>
            <CardTitle>Google Drive</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {driveStatus.data?.connected ? (
              <>
                <p>Підключено як: {driveStatus.data.email}</p>
                <p>
                  Папка для реманенту:{' '}
                  {driveStatus.data.folderName ?? <span className="text-muted-foreground">не обрана</span>}
                </p>
                <Button size="sm" variant="outline" onClick={handlePickFolder}>
                  {driveStatus.data.folderName ? 'Змінити папку' : 'Обрати папку для реманенту'}
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">Google Drive не підключено.</p>
                <Button size="sm" disabled={connectDrive.isPending} onClick={() => connectDrive.mutate()}>
                  Підключити Google Drive
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
```

### Step 6: Add the "not connected" empty state to the inventory page

Open `apps/web/app/inventory/page.tsx`. Read it in full first.

Add this import alongside the existing ones:

```ts
import { useGoogleDriveStatus } from '@/lib/queries/google-drive';
```

Inside `InventoryPage`, add this hook after the existing `canEdit` line:

```ts
  const driveStatus = useGoogleDriveStatus(kurinId);
  const driveReady = !!driveStatus.data?.connected && !!driveStatus.data?.folderId;
```

Replace the block that renders the "Додати річ" card — currently:

```tsx
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Додати річ</CardTitle>
          </CardHeader>
          <CardContent>
            <AddItemForm kurinId={kurinId} />
          </CardContent>
        </Card>
      )}
```

with:

```tsx
      {canEdit && driveReady && (
        <Card>
          <CardHeader>
            <CardTitle>Додати річ</CardTitle>
          </CardHeader>
          <CardContent>
            <AddItemForm kurinId={kurinId} />
          </CardContent>
        </Card>
      )}
      {canEdit && !driveReady && (
        <p className="text-sm text-muted-foreground">
          Спершу підключіть Google Drive і оберіть папку для реманенту у{' '}
          <a href="/kurin" className="underline">
            налаштуваннях куреня
          </a>
          .
        </p>
      )}
```

The existing items grid below this block is untouched — it keeps rendering regardless of `driveReady`, per the Global Constraint that viewing/editing existing items stays available.

### Step 7: Typecheck

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

### Step 8: Add an optional `driveFolderId` to admin kurin creation (test seeding support)

`apps/web/e2e/helpers/seed.ts`'s `seedKurinWithZvyazkovyi` seeds kurins by calling the real `POST /admin/kurins` endpoint over HTTP (`adminPost`), not via a direct Prisma client — there is no direct database access available from Playwright spec files in this codebase. `seedKurinWithZvyazkovyi` is used by 23 other spec files (grep confirms this: `grep -rl "seedKurinWithZvyazkovyi" apps/web/e2e/` lists 24 files including itself) — its default behavior for existing callers must not change.

Open `apps/api/src/admin/dto/create-kurin.dto.ts`. Its current contents:

```ts
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { KurinGender } from '@prisma/client';

export class CreateKurinDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() @IsNotEmpty() @Matches(/^[\p{L}\p{N}][\p{L}\p{N} \-]{0,23}$/u) kurinNumber?: string;
  @IsEnum(KurinGender) gender: KurinGender;
  @IsString() @IsNotEmpty() stanytsia: string;
  @IsUUID() probyProgramId: string;
}
```

Add one new optional field:

```ts
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { KurinGender } from '@prisma/client';

export class CreateKurinDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() @IsNotEmpty() @Matches(/^[\p{L}\p{N}][\p{L}\p{N} \-]{0,23}$/u) kurinNumber?: string;
  @IsEnum(KurinGender) gender: KurinGender;
  @IsString() @IsNotEmpty() stanytsia: string;
  @IsUUID() probyProgramId: string;
  @IsOptional() @IsString() driveFolderId?: string;
}
```

No change is needed to `apps/api/src/admin/kurins-admin.service.ts`'s `createKurin` method — it already does `this.prisma.kurin.create({ data: { ...dto, kurinNumber } })`, spreading the whole DTO, so the new optional field flows straight through to Prisma once it exists on the DTO.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

### Step 9: Update the seed helper and the Playwright tests

Open `apps/web/e2e/helpers/seed.ts`. Its current `seedKurinWithZvyazkovyi`:

```ts
export async function seedKurinWithZvyazkovyi(probyProgramId: string) {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const kurinNumber = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const kurin = await adminPost<{ id: string; name: string; kurinNumber: string }>('/admin/kurins', {
    name: `Курінь ${uniqueSuffix}`,
    kurinNumber,
    gender: 'MALE',
    stanytsia: 'Тестова станиця',
    probyProgramId,
  });
  const email = `zvyazkovyi-${uniqueSuffix}@example.com`;
  const password = 'password123';
  const zvyazkovyi = await adminPost<{ id: string; email: string }>('/admin/kurins/zvyazkovyi', {
    firstName: 'Зв\'язковий',
    lastName: 'Тестовий',
    email,
    password,
    kurinId: kurin.id,
  });
  return { kurin, zvyazkovyi, zvyazkovyiEmail: email, zvyazkovyiPassword: password };
}
```

Replace it with (adds one optional parameter; every existing call site with zero arguments beyond `probyProgramId` behaves identically to before, since `options` defaults to `undefined` and the spread only adds `driveFolderId` when explicitly provided):

```ts
export async function seedKurinWithZvyazkovyi(probyProgramId: string, options?: { driveFolderId?: string }) {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const kurinNumber = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const kurin = await adminPost<{ id: string; name: string; kurinNumber: string }>('/admin/kurins', {
    name: `Курінь ${uniqueSuffix}`,
    kurinNumber,
    gender: 'MALE',
    stanytsia: 'Тестова станиця',
    probyProgramId,
    ...(options?.driveFolderId ? { driveFolderId: options.driveFolderId } : {}),
  });
  const email = `zvyazkovyi-${uniqueSuffix}@example.com`;
  const password = 'password123';
  const zvyazkovyi = await adminPost<{ id: string; email: string }>('/admin/kurins/zvyazkovyi', {
    firstName: 'Зв\'язковий',
    lastName: 'Тестовий',
    email,
    password,
    kurinId: kurin.id,
  });
  return { kurin, zvyazkovyi, zvyazkovyiEmail: email, zvyazkovyiPassword: password };
}
```

Open `apps/web/e2e/inventory.spec.ts`. Read it in full first — it currently seeds a kurin via `seedProbyProgram`/`seedKurinWithZvyazkovyi` and logs in as zvyazkovyi, then adds an item with no photo. Find its call to `seedKurinWithZvyazkovyi(program.id)` and change it to pass a connected folder, so this existing happy-path test keeps exercising the add-item form (which now requires a connected Drive folder to render):

```ts
const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id, {
  driveFolderId: 'e2e-test-folder-id',
});
```

Add a new test to the same file, alongside the existing one — this one deliberately calls `seedKurinWithZvyazkovyi` with no second argument, so the seeded kurin has no `driveFolderId` and the page must show the empty-state message instead of the add form:

```ts
test('shows a message instead of the add form when Google Drive is not connected', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.getByText('Діловодство').click();
  await page.getByRole('link', { name: 'Облік реманенту' }).click();

  await expect(page.getByText('Спершу підключіть Google Drive і оберіть папку для реманенту у')).toBeVisible();
  await expect(page.getByPlaceholder('Назва (наприклад, Пилка)')).not.toBeVisible();
});
```

### Step 10: Run the tests

Run: `cd apps/web && npx playwright test inventory --workers=1`
Expected: PASS, both tests (the existing happy-path and the new empty-state test).

Run: `cd apps/web && npx playwright test --workers=1`
Expected: all tests pass — no regressions. The `driveFolderId` field added to `CreateKurinDto` in Step 8 is purely additive and optional, so none of the other 23 spec files calling `seedKurinWithZvyazkovyi(probyProgramId)` with no second argument are affected.

### Step 11: Commit

```bash
git add apps/api/src/admin/dto/create-kurin.dto.ts apps/web/lib/types.ts apps/web/lib/queries/google-drive.ts apps/web/lib/google-picker.ts apps/web/app/kurin/page.tsx apps/web/app/inventory/page.tsx apps/web/.env.local.example apps/web/e2e/inventory.spec.ts apps/web/e2e/helpers/seed.ts
git commit -m "feat: add Google Drive connect/Picker UI and inventory not-connected empty state"
```

---

## Manual, Out-of-Plan Steps (Andrii, after this plan ships)

These cannot be done by an implementer and are not part of any task above:

1. In Google Cloud Console: create a new OAuth 2.0 Client ID of type "Web application" (separate from the existing one used for "Sign in with Google" login). Add the authorized redirect URI matching `GOOGLE_OAUTH_REDIRECT_URI` (production: `https://plast-api.srv1440057.hstgr.cloud/kurins/google-drive/callback`).
2. Set the OAuth consent screen's publishing status to "In production."
3. Create a separate "API key" (not an OAuth client) restricted to the Google Picker API, for `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`.
4. Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` in `apps/api/.env` on the VPS; remove the now-unused `GOOGLE_SERVICE_ACCOUNT_KEY`/`GOOGLE_DRIVE_ROOT_FOLDER_ID` lines.
5. Set `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` in Vercel's environment variables for `apps/web`.
6. Before redeploying, run this SQL against the production database to clear any `driveFolderId` values set by the old, now-removed service-account auto-creation logic — those folder IDs live inside Andrii's personal Drive under the old scheme and are meaningless under the new per-kurin OAuth scheme (a `drive.file`-scoped OAuth client has no grant over a folder it neither created nor had explicitly picked, so leaving a stale ID would make the app believe a kurin is "ready" and then fail with an opaque Google API error on the first real upload attempt, instead of the friendly "not connected" message):
   ```sql
   UPDATE "Kurin" SET "driveFolderId" = NULL;
   ```
7. Redeploy both sides; a zvyazkovyi then connects their kurin's Drive and picks a folder through the app itself.
