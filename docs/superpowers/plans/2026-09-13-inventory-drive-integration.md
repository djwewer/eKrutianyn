# Облік реманенту + інтеграція з Google Drive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an intendant/zvyazkovyi manage a per-kurin inventory of physical items (each with name, description, quantity, and multiple photos), storing photos on Google Drive via a service account, with a courinny getting read-only visibility.

**Architecture:** A new `GoogleDriveService` (backend, reusable by future features) wraps the Google Drive API behind an injectable client, so it can be faked in tests. A new `InventoryModule` (CRUD + photo endpoints) uses it. Access control introduces a new, generic `positions: PositionType[]` field on `CurrentUserPayload` — computed live on every request (mirroring the existing `isKurinniy` pattern) — instead of one-off booleans, so future position-gated features (Книга судді, Скарбництво) can reuse the same mechanism. Frontend adds a new `/inventory` page with a photo carousel and a dropdown nav entry for zvyazkovyi.

**Tech Stack:** NestJS + Prisma + PostgreSQL (backend), Next.js App Router + TanStack Query (frontend), `googleapis` (new dependency) for Drive access, `multer` (already available via `@nestjs/platform-express`) for file uploads.

## Global Constraints

- **Additive migration only.** Production has live data — this plan adds two new tables (`InventoryItem`, `InventoryItemPhoto`) and one nullable column (`Kurin.driveFolderId`). No `ALTER` on any existing column's type/constraints.
- **`positions: PositionType[]` is computed fresh from the database on every authenticated request** (inside `JwtStrategy.validate()`), exactly like the existing `isKurinniy` field — backend authorization must never trust a `positions` value read directly from the JWT payload. Separately, a snapshot of `positions` is also embedded in the JWT at login time, purely for frontend display/nav-gating convenience — this snapshot may go stale until the next login, the same accepted tradeoff already in place for `isKurinniy`/`kurinNumber`.
- **Do not modify the existing `isKurinniy` field, its computation, or `isKurinniyForUser`** — `positions` is a new, separate, more general mechanism added alongside it, not a replacement.
- **Google Drive API calls must be mockable in tests.** `GoogleDriveService` must depend on an injected client (via a DI token), never construct its own client inline — this is what lets e2e tests override the provider with a fake and never make a real network call to Google.
- **Access rule for inventory:** ZVYAZKOVYI and users holding an active `KurinPosition` with `positionType: INTENDANT` (`scope: KURIN`, `removedAt: null`) get full read/write access; users with `isKurinniy` get read-only access; everyone else gets 403.
- **File deletion from Drive is out of scope.** Deleting an `InventoryItem` or an individual `InventoryItemPhoto` only removes the database row — the underlying Drive file is never deleted by this code.
- **One photo per item is optional; an item can have zero, one, or many photos.** `PATCH` on an item never touches its photos — photos are only ever added/removed through their own dedicated endpoints.
- Git hygiene: every commit uses exact file paths in `git add`, never `-A` or `.`.

---

## Task 1: Prisma schema — `InventoryItem`, `InventoryItemPhoto`, `Kurin.driveFolderId`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing from other tasks (fully self-contained).
- Produces: the `InventoryItem` and `InventoryItemPhoto` Prisma models, and `Kurin.driveFolderId: String?`, that Tasks 3-4 build on.

### Step 1: Add the schema additions

Open `apps/api/prisma/schema.prisma`. In the `Kurin` model, add this line right after the existing `updatedAt      DateTime    @updatedAt` line:

```prisma
  driveFolderId  String?
```

Add these two new models anywhere after the `KurinPosition` model:

```prisma
model InventoryItem {
  id          String   @id @default(uuid())
  kurinId     String
  kurin       Kurin    @relation(fields: [kurinId], references: [id])
  name        String
  description String?
  quantity    Int
  createdById String
  createdBy   User     @relation(fields: [createdById], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  photos InventoryItemPhoto[]
}

model InventoryItemPhoto {
  id          String        @id @default(uuid())
  itemId      String
  item        InventoryItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  driveFileId String
  url         String
  createdAt   DateTime      @default(now())
}
```

In the `Kurin` model, add this line right after the existing `hurtky Hurtok[]` line:

```prisma
  inventoryItems InventoryItem[]
```

In the `User` model, add this line right after the existing `guardianContacts  GuardianContact[] @relation("JunakGuardians")` line:

```prisma
  createdInventoryItems InventoryItem[]
```

### Step 2: Generate and apply the migration

Run (from `apps/api/`, against your local dev database):

```bash
npx prisma migrate dev --name add_inventory
```

Expected: it prints `Your database is now in sync with your schema`, and the generated `migration.sql` contains only `CREATE TABLE "InventoryItem"`, `CREATE TABLE "InventoryItemPhoto"`, their `ADD CONSTRAINT` foreign keys (including `ON DELETE CASCADE` for `InventoryItemPhoto.itemId`), and `ALTER TABLE "Kurin" ADD COLUMN "driveFolderId" TEXT` — a single new nullable column, no type/constraint change on any existing column. If you see anything else, stop — Step 1 was applied incorrectly.

### Step 3: Verify the API still builds

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors (the new models aren't referenced by any code yet, so this just confirms the schema itself is valid).

### Step 4: Commit

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add InventoryItem, InventoryItemPhoto models and Kurin.driveFolderId"
```

---

## Task 2: Backend — generic `positions` field on `CurrentUserPayload`

**Files:**
- Create: `apps/api/src/common/positions.util.ts`
- Modify: `apps/api/src/common/decorators/current-user.decorator.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/strategies/jwt.strategy.ts`
- Modify: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: nothing from other tasks (independent of Task 1).
- Produces: `CurrentUserPayload.positions: PositionType[]` — a live-computed list of the actor's active `KURIN`-scope positions, available to every guarded route handler/service in the codebase. `getActiveKurinPositions(prisma, userId, kurinId): Promise<PositionType[]>` — the exported helper Task 4's `InventoryService` will call directly (via the same helper, not by re-deriving `CurrentUserPayload.positions` a second time) is not needed — Task 4 reads `actor.positions` directly off `CurrentUserPayload`, which this task guarantees is always fresh.

### Step 1: Write the new positions helper

Create `apps/api/src/common/positions.util.ts`:

```ts
import { PrismaService } from '../prisma/prisma.service';
import { PositionScope, PositionType } from '@prisma/client';

export async function getActiveKurinPositions(
  prisma: PrismaService,
  userId: string,
  kurinId: string,
): Promise<PositionType[]> {
  const rows = await prisma.kurinPosition.findMany({
    where: { userId, kurinId, scope: PositionScope.KURIN, removedAt: null },
    select: { positionType: true },
  });
  return rows.map((row) => row.positionType);
}
```

### Step 2: Add `positions` to `CurrentUserPayload`

Open `apps/api/src/common/decorators/current-user.decorator.ts`. Add the import and field:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PositionType, Role } from '@prisma/client';

export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
  positions: PositionType[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

### Step 3: Compute `positions` live in `JwtStrategy.validate()`

Open `apps/api/src/auth/strategies/jwt.strategy.ts`. Replace its entire contents with:

```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { isKurinniyForUser } from '../../common/kurinniy.util';
import { getActiveKurinPositions } from '../../common/positions.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    const isKurinniy = await isKurinniyForUser(this.prisma, payload.sub);
    const positions = await getActiveKurinPositions(this.prisma, payload.sub, payload.kurinId);
    return { userId: payload.sub, role: payload.role, kurinId: payload.kurinId, isKurinniy, positions };
  }
}
```

### Step 4: Add `positions` to the JWT payload at login

Open `apps/api/src/auth/auth.service.ts`. Add the import:

```ts
import { PositionType, Role } from '@prisma/client';
```

(replacing the existing `import { Role } from '@prisma/client';` line)

Add a second import right after the existing `import { isKurinniyForUser } from '../common/kurinniy.util';` line:

```ts
import { getActiveKurinPositions } from '../common/positions.util';
```

Update the `JwtPayload` interface:

```ts
export interface JwtPayload {
  sub: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
  positions: PositionType[];
  kurinNumber: string;
}
```

Update `signToken`'s signature and body:

```ts
  signToken(
    userId: string,
    role: Role,
    kurinId: string,
    isKurinniy: boolean,
    positions: PositionType[],
    kurinNumber: string,
  ): { accessToken: string } {
    const payload: JwtPayload = { sub: userId, role, kurinId, isKurinniy, positions, kurinNumber };
    return { accessToken: this.jwtService.sign(payload) };
  }
```

Update both call sites. In `loginWithPassword`, change:

```ts
    const isKurinniy = await isKurinniyForUser(this.prisma, user.id);
    const kurin = await this.prisma.kurin.findUnique({ where: { id: user.kurinId } });
    return this.signToken(user.id, user.role, user.kurinId, isKurinniy, kurin!.kurinNumber);
```

to:

```ts
    const isKurinniy = await isKurinniyForUser(this.prisma, user.id);
    const positions = await getActiveKurinPositions(this.prisma, user.id, user.kurinId);
    const kurin = await this.prisma.kurin.findUnique({ where: { id: user.kurinId } });
    return this.signToken(user.id, user.role, user.kurinId, isKurinniy, positions, kurin!.kurinNumber);
```

In `loginWithGoogle`, apply the identical change (same two lines are duplicated in that method — replace both occurrences the same way).

### Step 5: Update the existing auth unit test

Open `apps/api/src/auth/auth.service.spec.ts`. Add `kurinPosition.findMany` to the `prisma` mock object — change:

```ts
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      kurinPosition: { findFirst: jest.fn().mockResolvedValue(null) },
      kurin: { findUnique: jest.fn().mockResolvedValue({ kurinNumber: '75' }) },
    };
```

to:

```ts
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      kurinPosition: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      kurin: { findUnique: jest.fn().mockResolvedValue({ kurinNumber: '75' }) },
    };
```

Update the `signToken` test — change:

```ts
  describe('signToken', () => {
    it('signs a JWT carrying sub/role/kurinId/isKurinniy/kurinNumber and it decodes back', () => {
      const { accessToken } = service.signToken('user-1', Role.ZVYAZKOVYI, 'kurin-1', false, '75');
      const decoded: any = jwtService.verify(accessToken);
      expect(decoded).toMatchObject({
        sub: 'user-1',
        role: Role.ZVYAZKOVYI,
        kurinId: 'kurin-1',
        isKurinniy: false,
        kurinNumber: '75',
      });
    });
  });
```

to:

```ts
  describe('signToken', () => {
    it('signs a JWT carrying sub/role/kurinId/isKurinniy/positions/kurinNumber and it decodes back', () => {
      const { accessToken } = service.signToken('user-1', Role.ZVYAZKOVYI, 'kurin-1', false, [], '75');
      const decoded: any = jwtService.verify(accessToken);
      expect(decoded).toMatchObject({
        sub: 'user-1',
        role: Role.ZVYAZKOVYI,
        kurinId: 'kurin-1',
        isKurinniy: false,
        positions: [],
        kurinNumber: '75',
      });
    });
  });
```

### Step 6: Run the tests

Run: `cd apps/api && npx jest auth.service.spec`
Expected: PASS, all tests in this file.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`
Expected: all suites pass (no regressions — `JwtStrategy.validate()`'s new `positions` field is additive to `CurrentUserPayload`, no existing code reads or is broken by its presence).

### Step 7: Commit

```bash
git add apps/api/src/common/positions.util.ts apps/api/src/common/decorators/current-user.decorator.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/strategies/jwt.strategy.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "feat: add live-computed positions field to CurrentUserPayload and JWT"
```

---

## Task 3: Backend — `GoogleDriveModule` (mockable Drive client wrapper)

**Files:**
- Create: `apps/api/src/google-drive/google-drive-client.provider.ts`
- Create: `apps/api/src/google-drive/google-drive.service.ts`
- Create: `apps/api/src/google-drive/google-drive.module.ts`
- Test: `apps/api/src/google-drive/google-drive.service.spec.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Consumes: `Kurin.driveFolderId` from Task 1's schema.
- Produces: `GoogleDriveService` with three public methods — `ensureKurinFolder(kurinId: string): Promise<string>`, `ensureSubfolder(parentFolderId: string, name: string): Promise<string>`, `uploadFile(folderId: string, buffer: Buffer, filename: string, mimeType: string): Promise<{ fileId: string; url: string }>` — and the exported DI token `GOOGLE_DRIVE_CLIENT` that Task 4's e2e tests will override with a fake. `GoogleDriveModule` exports `GoogleDriveService` for `InventoryModule` (Task 4) to import.

### Step 1: Add the `googleapis` dependency

Run (from `apps/api/`):

```bash
npm install googleapis
```

### Step 2: Add the new environment variables

Open `apps/api/.env.example`. Add these two lines at the end:

```
GOOGLE_SERVICE_ACCOUNT_KEY=""
GOOGLE_DRIVE_ROOT_FOLDER_ID=""
```

(`GOOGLE_SERVICE_ACCOUNT_KEY` holds the service account's JSON key, base64-encoded, as one line. `GOOGLE_DRIVE_ROOT_FOLDER_ID` holds the ID of the Drive folder Andrii shares with the service account — the ID is the segment after `/folders/` in that folder's Drive URL. Getting both of these values is a manual, external Google Cloud Console step outside this plan — not something this task's implementer can do.)

### Step 3: Write the injectable Drive client provider

Create `apps/api/src/google-drive/google-drive-client.provider.ts`:

```ts
import { google, drive_v3 } from 'googleapis';

export const GOOGLE_DRIVE_CLIENT = 'GOOGLE_DRIVE_CLIENT';

export function createGoogleDriveClient(): drive_v3.Drive {
  const keyJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? '', 'base64').toString('utf-8');
  const credentials = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}
```

### Step 4: Write `GoogleDriveService`

Create `apps/api/src/google-drive/google-drive.service.ts`:

```ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { GOOGLE_DRIVE_CLIENT } from './google-drive-client.provider';

@Injectable()
export class GoogleDriveService {
  constructor(
    @Inject(GOOGLE_DRIVE_CLIENT) private readonly drive: drive_v3.Drive,
    private readonly prisma: PrismaService,
  ) {}

  async ensureKurinFolder(kurinId: string): Promise<string> {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    if (kurin.driveFolderId) {
      return kurin.driveFolderId;
    }
    const folderId = await this.createFolder(kurin.name, process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID as string);
    await this.prisma.kurin.update({ where: { id: kurinId }, data: { driveFolderId: folderId } });
    return folderId;
  }

  async ensureSubfolder(parentFolderId: string, name: string): Promise<string> {
    const existing = await this.drive.files.list({
      q: `'${parentFolderId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
    });
    const found = existing.data.files?.[0];
    if (found?.id) {
      return found.id;
    }
    return this.createFolder(name, parentFolderId);
  }

  async uploadFile(
    folderId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<{ fileId: string; url: string }> {
    const res = await this.drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id',
    });
    const fileId = res.data.id;
    if (!fileId) {
      throw new Error('Failed to upload file to Drive');
    }
    await this.drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    return { fileId, url: `https://drive.google.com/uc?id=${fileId}` };
  }

  private async createFolder(name: string, parentId: string): Promise<string> {
    const res = await this.drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
    });
    const id = res.data.id;
    if (!id) {
      throw new Error('Failed to create Drive folder');
    }
    return id;
  }
}
```

### Step 5: Write `GoogleDriveModule`

Create `apps/api/src/google-drive/google-drive.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';
import { GOOGLE_DRIVE_CLIENT, createGoogleDriveClient } from './google-drive-client.provider';

@Module({
  providers: [{ provide: GOOGLE_DRIVE_CLIENT, useFactory: createGoogleDriveClient }, GoogleDriveService],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
```

### Step 6: Write the unit tests with a fake client

Create `apps/api/src/google-drive/google-drive.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';

describe('GoogleDriveService', () => {
  let service: GoogleDriveService;
  let prisma: any;
  let drive: any;

  beforeEach(() => {
    prisma = {
      kurin: { findUnique: jest.fn(), update: jest.fn() },
    };
    drive = {
      files: {
        list: jest.fn(),
        create: jest.fn(),
      },
      permissions: {
        create: jest.fn(),
      },
    };
    service = new GoogleDriveService(drive, prisma);
  });

  describe('ensureKurinFolder', () => {
    it('returns the existing driveFolderId without calling Drive if already set', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'k1', name: 'Курінь 75', driveFolderId: 'existing-folder' });

      const result = await service.ensureKurinFolder('k1');

      expect(result).toBe('existing-folder');
      expect(drive.files.create).not.toHaveBeenCalled();
    });

    it('creates a new folder and saves it when driveFolderId is null', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'k1', name: 'Курінь 75', driveFolderId: null });
      drive.files.create.mockResolvedValue({ data: { id: 'new-folder-id' } });

      const result = await service.ensureKurinFolder('k1');

      expect(result).toBe('new-folder-id');
      expect(prisma.kurin.update).toHaveBeenCalledWith({
        where: { id: 'k1' },
        data: { driveFolderId: 'new-folder-id' },
      });
    });

    it('throws NotFoundException when the kurin does not exist', async () => {
      prisma.kurin.findUnique.mockResolvedValue(null);
      await expect(service.ensureKurinFolder('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('ensureSubfolder', () => {
    it('returns an existing subfolder id without creating a new one', async () => {
      drive.files.list.mockResolvedValue({ data: { files: [{ id: 'existing-sub' }] } });

      const result = await service.ensureSubfolder('parent-1', 'Реманент');

      expect(result).toBe('existing-sub');
      expect(drive.files.create).not.toHaveBeenCalled();
    });

    it('creates a new subfolder when none is found', async () => {
      drive.files.list.mockResolvedValue({ data: { files: [] } });
      drive.files.create.mockResolvedValue({ data: { id: 'new-sub' } });

      const result = await service.ensureSubfolder('parent-1', 'Реманент');

      expect(result).toBe('new-sub');
    });
  });

  describe('uploadFile', () => {
    it('uploads the file, makes it link-viewable, and returns its id and url', async () => {
      drive.files.create.mockResolvedValue({ data: { id: 'file-1' } });
      drive.permissions.create.mockResolvedValue({});

      const result = await service.uploadFile('folder-1', Buffer.from('data'), 'photo.jpg', 'image/jpeg');

      expect(result).toEqual({ fileId: 'file-1', url: 'https://drive.google.com/uc?id=file-1' });
      expect(drive.permissions.create).toHaveBeenCalledWith({
        fileId: 'file-1',
        requestBody: { role: 'reader', type: 'anyone' },
      });
    });
  });
});
```

### Step 7: Run the tests

Run: `cd apps/api && npx jest google-drive.service.spec`
Expected: PASS, all tests.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

### Step 8: Commit

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/.env.example apps/api/src/google-drive
git commit -m "feat: add mockable GoogleDriveService for Drive folder/file management"
```

---

## Task 4: Backend — `InventoryModule` (CRUD + photo endpoints)

**Files:**
- Create: `apps/api/src/inventory/dto/create-inventory-item.dto.ts`
- Create: `apps/api/src/inventory/dto/update-inventory-item.dto.ts`
- Create: `apps/api/src/inventory/inventory.service.ts`
- Create: `apps/api/src/inventory/inventory.controller.ts`
- Create: `apps/api/src/inventory/inventory.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/inventory.e2e-spec.ts`

**Interfaces:**
- Consumes: `GoogleDriveService` (Task 3), `CurrentUserPayload.positions`/`isKurinniy` (Task 2), `InventoryItem`/`InventoryItemPhoto`/`Kurin.driveFolderId` (Task 1).
- Produces: the full HTTP contract Task 5 (frontend) consumes —
  - `GET /kurins/:kurinId/inventory` → `(InventoryItem & { photos: InventoryItemPhoto[] })[]`, newest item first, each item's photos ordered oldest-first.
  - `POST /kurins/:kurinId/inventory` (`multipart/form-data`: `name`, `description?`, `quantity`, `photos?` as 0+ files under the field name `photos`) → the created item with its `photos`.
  - `PATCH /kurins/:kurinId/inventory/:itemId` (JSON body: `name?`, `description?`, `quantity?`) → the updated item with its `photos`.
  - `DELETE /kurins/:kurinId/inventory/:itemId` → `{ success: true }`.
  - `POST /kurins/:kurinId/inventory/:itemId/photos` (`multipart/form-data`, one file under field name `photo`) → the created `InventoryItemPhoto`.
  - `DELETE /kurins/:kurinId/inventory/:itemId/photos/:photoId` → `{ success: true }`.

### Step 1: Add multer type declarations and configure memory storage

NestJS's `FileInterceptor`/`FilesInterceptor` use `multer`'s **disk storage** by default (writing uploaded files to a temp directory and populating `file.path`, not `file.buffer`). `GoogleDriveService.uploadFile` (Task 3) requires `file.buffer` — so every use of these interceptors in this task must explicitly configure memory storage. `multer` itself is already available transitively (a dependency of `@nestjs/platform-express`), but its TypeScript type declarations are not — add them:

Run (from `apps/api/`):

```bash
npm install --save-dev @types/multer
```

### Step 2: Write the DTOs

Create `apps/api/src/inventory/dto/create-inventory-item.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateInventoryItemDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsInt() @Min(0) quantity: number;
}
```

Create `apps/api/src/inventory/dto/update-inventory-item.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class UpdateInventoryItemDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) quantity?: number;
}
```

### Step 3: Write the service

Create `apps/api/src/inventory/inventory.service.ts`:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PositionType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

const PHOTOS_ORDER = { photos: { orderBy: { createdAt: 'asc' as const } } };

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleDrive: GoogleDriveService,
  ) {}

  private assertKurinMatches(kurinId: string, actor: CurrentUserPayload) {
    if (kurinId !== actor.kurinId) {
      throw new NotFoundException('Kurin not found');
    }
  }

  private assertCanWrite(actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.INTENDANT)) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private assertCanRead(actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.INTENDANT) && !actor.isKurinniy) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  async list(kurinId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanRead(actor);
    return this.prisma.inventoryItem.findMany({
      where: { kurinId },
      include: PHOTOS_ORDER,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    kurinId: string,
    dto: CreateInventoryItemDto,
    files: Express.Multer.File[],
    actor: CurrentUserPayload,
  ) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    const item = await this.prisma.inventoryItem.create({
      data: {
        kurinId,
        name: dto.name,
        description: dto.description,
        quantity: dto.quantity,
        createdById: actor.userId,
      },
    });
    for (const file of files) {
      await this.uploadAndAttachPhoto(kurinId, item.id, file);
    }
    return this.prisma.inventoryItem.findUnique({ where: { id: item.id }, include: PHOTOS_ORDER });
  }

  async update(kurinId: string, itemId: string, dto: UpdateInventoryItemDto, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    await this.findItemOrThrow(kurinId, itemId);
    return this.prisma.inventoryItem.update({
      where: { id: itemId },
      data: { name: dto.name, description: dto.description, quantity: dto.quantity },
      include: PHOTOS_ORDER,
    });
  }

  async remove(kurinId: string, itemId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    await this.findItemOrThrow(kurinId, itemId);
    await this.prisma.inventoryItem.delete({ where: { id: itemId } });
    return { success: true };
  }

  async addPhoto(kurinId: string, itemId: string, file: Express.Multer.File | undefined, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    await this.findItemOrThrow(kurinId, itemId);
    if (!file) {
      throw new BadRequestException('Photo file is required');
    }
    return this.uploadAndAttachPhoto(kurinId, itemId, file);
  }

  async removePhoto(kurinId: string, itemId: string, photoId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    await this.findItemOrThrow(kurinId, itemId);
    const photo = await this.prisma.inventoryItemPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.itemId !== itemId) {
      throw new NotFoundException('Photo not found');
    }
    await this.prisma.inventoryItemPhoto.delete({ where: { id: photoId } });
    return { success: true };
  }

  private async findItemOrThrow(kurinId: string, itemId: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item || item.kurinId !== kurinId) {
      throw new NotFoundException('Item not found');
    }
    return item;
  }

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
}
```

### Step 4: Write the controller

Create `apps/api/src/inventory/inventory.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

@UseGuards(JwtAuthGuard)
@Controller('kurins/:kurinId/inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  list(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(kurinId, user);
  }

  @Post()
  @UseInterceptors(FilesInterceptor('photos', undefined, { storage: memoryStorage() }))
  create(
    @Param('kurinId') kurinId: string,
    @Body() dto: CreateInventoryItemDto,
    @UploadedFiles() photos: Express.Multer.File[] | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(kurinId, dto, photos ?? [], user);
  }

  @Patch(':itemId')
  update(
    @Param('kurinId') kurinId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(kurinId, itemId, dto, user);
  }

  @Delete(':itemId')
  remove(
    @Param('kurinId') kurinId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(kurinId, itemId, user);
  }

  @Post(':itemId/photos')
  @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage() }))
  addPhoto(
    @Param('kurinId') kurinId: string,
    @Param('itemId') itemId: string,
    @UploadedFile() photo: Express.Multer.File | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.addPhoto(kurinId, itemId, photo, user);
  }

  @Delete(':itemId/photos/:photoId')
  removePhoto(
    @Param('kurinId') kurinId: string,
    @Param('itemId') itemId: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removePhoto(kurinId, itemId, photoId, user);
  }
}
```

### Step 5: Write the module and wire it into `AppModule`

Create `apps/api/src/inventory/inventory.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [GoogleDriveModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
```

Open `apps/api/src/app.module.ts`. Add the import:

```ts
import { InventoryModule } from './inventory/inventory.module';
```

Add `InventoryModule` to the end of the `imports` array (right after `GuardianContactsModule,`).

### Step 6: Write the e2e tests with a faked Drive client

Create `apps/api/test/inventory.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, PositionScope, PositionType, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';
import { GOOGLE_DRIVE_CLIENT } from '../src/google-drive/google-drive-client.provider';

describe('Inventory (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fakeDrive: {
    files: { list: jest.Mock; create: jest.Mock };
    permissions: { create: jest.Mock };
  };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    fakeDrive = {
      files: { list: jest.fn(), create: jest.fn() },
      permissions: { create: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GOOGLE_DRIVE_CLIENT)
      .useValue(fakeDrive)
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
    fakeDrive.files.list.mockReset().mockResolvedValue({ data: { files: [] } });
    fakeDrive.files.create.mockReset().mockImplementation((args: { requestBody?: { mimeType?: string } }) => {
      const isFolder = args.requestBody?.mimeType === 'application/vnd.google-apps.folder';
      return Promise.resolve({ data: { id: isFolder ? 'fake-folder-id' : 'fake-file-id' } });
    });
    fakeDrive.permissions.create.mockReset().mockResolvedValue({});
  });

  async function setup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    return { kurin };
  }

  it('lets zvyazkovyi create an item with a photo', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Пилка')
      .field('quantity', '2')
      .attach('photos', Buffer.from('fake-image-data'), 'saw.jpg')
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.name).toBe('Пилка');
    expect(response.body.quantity).toBe(2);
    expect(response.body.photos).toHaveLength(1);
    expect(response.body.photos[0].driveFileId).toBe('fake-file-id');
  });

  it('lets an intendant create an item without a photo', async () => {
    const { kurin } = await setup();
    const intendant = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.INTENDANT,
        userId: intendant.id,
        assignedById: intendant.id,
      },
    });
    const token = issueTokenFor(jwtService, intendant);

    const response = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Сокира')
      .field('quantity', '1')
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.photos).toHaveLength(0);
  });

  it('forbids a plain junak from creating an item', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Казан')
      .field('quantity', '1')
      .expect(403);
  });

  it('lets a kurinniy view the list but forbids creating items', async () => {
    const { kurin } = await setup();
    const kurinniy = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.KURINNYI,
        userId: kurinniy.id,
        assignedById: kurinniy.id,
      },
    });
    const token = issueTokenFor(jwtService, kurinniy);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Стіл')
      .field('quantity', '1')
      .expect(403);
  });

  it('lets zvyazkovyi update an item without touching its photos', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    const created = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Стіл')
      .field('quantity', '1');

    const response = await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/inventory/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 3 })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.quantity).toBe(3);
    expect(response.body.name).toBe('Стіл');
  });

  it('deletes an item and cascades its photos', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    const created = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Стіл')
      .field('quantity', '1')
      .attach('photos', Buffer.from('fake'), 'a.jpg');

    await request(app.getHttpServer())
      .delete(`/kurins/${kurin.id}/inventory/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const remainingPhotos = await prisma.inventoryItemPhoto.findMany({ where: { itemId: created.body.id } });
    expect(remainingPhotos).toHaveLength(0);
  });

  it('lets zvyazkovyi add and remove an individual photo', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    const created = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Стіл')
      .field('quantity', '1');

    const addResponse = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory/${created.body.id}/photos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake'), 'b.jpg')
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .delete(`/kurins/${kurin.id}/inventory/${created.body.id}/photos/${addResponse.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const remaining = await prisma.inventoryItemPhoto.findMany({ where: { itemId: created.body.id } });
    expect(remaining).toHaveLength(0);
  });

  it('returns 404 for a different kurin', async () => {
    const { kurin } = await setup();
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const outsider = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });
    const token = issueTokenFor(jwtService, outsider);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('reuses the cached kurin Drive folder across multiple uploads', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Річ 1')
      .field('quantity', '1')
      .attach('photos', Buffer.from('fake'), 'a.jpg');

    fakeDrive.files.list.mockResolvedValueOnce({ data: { files: [{ id: 'fake-folder-id' }] } });

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Річ 2')
      .field('quantity', '1')
      .attach('photos', Buffer.from('fake'), 'b.jpg');

    const kurinAfter = await prisma.kurin.findUnique({ where: { id: kurin.id } });
    expect(kurinAfter?.driveFolderId).toBe('fake-folder-id');

    const folderCreateCalls = fakeDrive.files.create.mock.calls.filter(
      (call: [{ requestBody?: { mimeType?: string } }]) =>
        call[0]?.requestBody?.mimeType === 'application/vnd.google-apps.folder',
    );
    expect(folderCreateCalls).toHaveLength(1);
  });
});
```

### Step 7: Run the tests

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand inventory`
Expected: PASS, 9 tests.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

### Step 8: Run the full backend suite

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`
Expected: all suites pass (no regressions).

Run: `cd apps/api && npx jest`
Expected: all unit suites pass, including Task 2's and Task 3's.

### Step 9: Commit

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/inventory apps/api/src/app.module.ts apps/api/test/inventory.e2e-spec.ts
git commit -m "feat: add inventory CRUD + photo endpoints"
```

---

## Task 5: Frontend — `/inventory` page, nav entry, multipart proxy fix

**Files:**
- Modify: `apps/web/app/api/backend/[...path]/route.ts`
- Modify: `apps/web/lib/api-client.ts`
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/app/api/session/route.ts`
- Create: `apps/web/lib/queries/inventory.ts`
- Create: `apps/web/app/inventory/page.tsx`
- Modify: `apps/web/components/nav.tsx`
- Test: `apps/web/e2e/inventory.spec.ts`

**Interfaces:**
- Consumes: the full backend contract from Tasks 2 and 4 (`positions` on the session payload; the `/kurins/:kurinId/inventory` HTTP contract).
- Produces: nothing consumed by later tasks (last task in this plan).

### Step 1: Fix the BFF proxy to pass multipart requests through untouched

Open `apps/web/app/api/backend/[...path]/route.ts`. The current `proxy` function always reads the incoming body as text and always forces `Content-Type: application/json` on the outgoing request — this corrupts binary/multipart uploads (both by mangling the body through a text decode/re-encode round-trip and by discarding the original multipart boundary). Replace the whole `proxy` function with:

```ts
async function proxy(request: NextRequest, path: string[]) {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  const targetUrl = `${API_URL}/${path.join('/')}${request.nextUrl.search}`;

  const incomingContentType = request.headers.get('Content-Type');
  const headers: Record<string, string> = { 'Content-Type': incomingContentType ?? 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
  });

  const responseBody = await response.text();
  return new NextResponse(responseBody, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
  });
}
```

The only changes: reading the original request's `Content-Type` (preserving a `multipart/form-data; boundary=...` value when present, falling back to `application/json` only when the browser didn't set one) and reading the body as `arrayBuffer()` instead of `text()` (which passes binary data through unmodified — a JSON body still works fine as an ArrayBuffer since `fetch` accepts that body type).

### Step 2: Add a form-data upload helper to the API client

Open `apps/web/lib/api-client.ts`. Add this new function after `apiFetch`:

```ts
export async function apiUpload<T>(path: string, formData: FormData, method: string = 'POST'): Promise<T> {
  const res = await fetch(`/api/backend${path}`, { method, body: formData });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
```

Note this deliberately does NOT set a `Content-Type` header — the browser sets `multipart/form-data; boundary=...` automatically when given a `FormData` body, and Step 1's proxy now forwards whatever header the browser chose.

### Step 3: Add the new types

Open `apps/web/lib/types.ts`. Add `positions: PositionType[]` to `CurrentUserPayload` — change:

```ts
export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
  kurinNumber: string;
}
```

to:

```ts
export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
  positions: PositionType[];
  kurinNumber: string;
}
```

(`PositionType` is already defined further down in this same file — this forward reference is fine in TypeScript.)

Add these two new interfaces anywhere after the `KurinPosition` interface:

```ts
export interface InventoryItemPhoto {
  id: string;
  driveFileId: string;
  url: string;
}

export interface InventoryItem {
  id: string;
  kurinId: string;
  name: string;
  description: string | null;
  quantity: number;
  photos: InventoryItemPhoto[];
}
```

### Step 4: Decode `positions` in the session route

Open `apps/web/app/api/session/route.ts`. Change:

```ts
    const session: CurrentUserPayload = {
      userId: decoded.sub,
      role: decoded.role,
      kurinId: decoded.kurinId,
      isKurinniy: !!decoded.isKurinniy,
      kurinNumber: decoded.kurinNumber,
    };
```

to:

```ts
    const session: CurrentUserPayload = {
      userId: decoded.sub,
      role: decoded.role,
      kurinId: decoded.kurinId,
      isKurinniy: !!decoded.isKurinniy,
      positions: Array.isArray(decoded.positions) ? decoded.positions : [],
      kurinNumber: decoded.kurinNumber,
    };
```

### Step 5: Write the query hooks

Create `apps/web/lib/queries/inventory.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload } from '@/lib/api-client';
import type { InventoryItem, InventoryItemPhoto } from '@/lib/types';

export function useInventory(kurinId: string | undefined) {
  return useQuery({
    queryKey: ['inventory', kurinId],
    queryFn: () => apiFetch<InventoryItem[]>(`/kurins/${kurinId}/inventory`),
    enabled: !!kurinId,
  });
}

export function useCreateInventoryItem(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; quantity: number; photos: File[] }) => {
      const formData = new FormData();
      formData.append('name', data.name);
      if (data.description) formData.append('description', data.description);
      formData.append('quantity', String(data.quantity));
      data.photos.forEach((photo) => formData.append('photos', photo));
      return apiUpload<InventoryItem>(`/kurins/${kurinId}/inventory`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', kurinId] });
    },
  });
}

export function useUpdateInventoryItem(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      ...data
    }: {
      itemId: string;
      name?: string;
      description?: string;
      quantity?: number;
    }) =>
      apiFetch<InventoryItem>(`/kurins/${kurinId}/inventory/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', kurinId] });
    },
  });
}

export function useDeleteInventoryItem(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => apiFetch(`/kurins/${kurinId}/inventory/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', kurinId] });
    },
  });
}

export function useAddInventoryPhoto(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, photo }: { itemId: string; photo: File }) => {
      const formData = new FormData();
      formData.append('photo', photo);
      return apiUpload<InventoryItemPhoto>(`/kurins/${kurinId}/inventory/${itemId}/photos`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', kurinId] });
    },
  });
}

export function useRemoveInventoryPhoto(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, photoId }: { itemId: string; photoId: string }) =>
      apiFetch(`/kurins/${kurinId}/inventory/${itemId}/photos/${photoId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', kurinId] });
    },
  });
}
```

### Step 6: Write the page

Create `apps/web/app/inventory/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import {
  useInventory,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
  useAddInventoryPhoto,
  useRemoveInventoryPhoto,
} from '@/lib/queries/inventory';
import type { InventoryItem } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accessErrorMessage } from '@/lib/error-message';

function PhotoCarousel({ item, canEdit, kurinId }: { item: InventoryItem; canEdit: boolean; kurinId: string }) {
  const [index, setIndex] = useState(0);
  const removePhoto = useRemoveInventoryPhoto(kurinId);
  const photo = item.photos[index];

  if (item.photos.length === 0) {
    return <p className="text-sm text-muted-foreground">Немає фото</p>;
  }

  return (
    <div className="space-y-2">
      <img src={photo.url} alt={item.name} className="h-40 w-full rounded object-cover" />
      {item.photos.length > 1 && (
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIndex((index - 1 + item.photos.length) % item.photos.length)}
          >
            ◂
          </Button>
          <span className="text-xs text-muted-foreground">
            {index + 1} / {item.photos.length}
          </span>
          <Button size="sm" variant="outline" onClick={() => setIndex((index + 1) % item.photos.length)}>
            ▸
          </Button>
        </div>
      )}
      {canEdit && (
        <Button
          size="sm"
          variant="outline"
          disabled={removePhoto.isPending}
          onClick={() => {
            removePhoto.mutate({ itemId: item.id, photoId: photo.id });
            setIndex(0);
          }}
        >
          Видалити це фото
        </Button>
      )}
    </div>
  );
}

function AddItemForm({ kurinId }: { kurinId: string }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [photos, setPhotos] = useState<File[]>([]);
  const create = useCreateInventoryItem(kurinId);

  return (
    <div className="space-y-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва (наприклад, Пилка)" />
      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Опис" />
      <Input
        type="number"
        min={0}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        placeholder="Кількість"
      />
      <Input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} />
      <Button
        size="sm"
        disabled={!name || create.isPending}
        onClick={() =>
          create.mutate(
            { name, description: description || undefined, quantity: Number(quantity), photos },
            {
              onSuccess: () => {
                setName('');
                setDescription('');
                setQuantity('1');
                setPhotos([]);
              },
            },
          )
        }
      >
        Додати річ
      </Button>
      {create.isError && (
        <p className="text-sm text-destructive">{accessErrorMessage(create.error) ?? 'Не вдалося додати річ.'}</p>
      )}
    </div>
  );
}

function InventoryItemCard({ item, canEdit, kurinId }: { item: InventoryItem; canEdit: boolean; kurinId: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? '');
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const update = useUpdateInventoryItem(kurinId);
  const remove = useDeleteInventoryItem(kurinId);
  const addPhoto = useAddInventoryPhoto(kurinId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{item.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <PhotoCarousel item={item} canEdit={canEdit} kurinId={kurinId} />
        {isEditing ? (
          <div className="space-y-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(
                    { itemId: item.id, name, description: description || undefined, quantity: Number(quantity) },
                    { onSuccess: () => setIsEditing(false) },
                  )
                }
              >
                Зберегти
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                Скасувати
              </Button>
            </div>
          </div>
        ) : (
          <>
            {item.description && <p className="text-sm">{item.description}</p>}
            <p className="text-sm text-muted-foreground">Кількість: {item.quantity}</p>
          </>
        )}
        {canEdit && !isEditing && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                Редагувати
              </Button>
              <Button size="sm" variant="outline" onClick={() => remove.mutate(item.id)} disabled={remove.isPending}>
                Видалити
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setNewPhoto(e.target.files?.[0] ?? null)}
              />
              <Button
                size="sm"
                disabled={!newPhoto || addPhoto.isPending}
                onClick={() => {
                  if (newPhoto) addPhoto.mutate({ itemId: item.id, photo: newPhoto }, { onSuccess: () => setNewPhoto(null) });
                }}
              >
                Додати фото
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const kurinId = session?.kurinId;
  const { data: items, isLoading, isError, error } = useInventory(kurinId);
  const canEdit = session?.role === 'ZVYAZKOVYI' || !!session?.positions.includes('INTENDANT');

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження.'}</p>;
  if (!kurinId) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Облік реманенту</h1>
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
      <div className="grid gap-4 sm:grid-cols-2">
        {(items ?? []).map((item) => (
          <InventoryItemCard key={item.id} item={item} canEdit={canEdit} kurinId={kurinId} />
        ))}
      </div>
    </div>
  );
}
```

### Step 7: Add navigation

Open `apps/web/components/nav.tsx`. This page must be reachable for `ZVYAZKOVYI` (via a dropdown, so future diloviody pages don't clutter the top-level nav), for a user holding the `INTENDANT` position, and for `isKurinniy`.

Replace the whole file with:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/session-client';
import { Button } from '@/components/ui/button';

const LINKS_BY_ROLE: Record<string, { href: string; label: string }[]> = {
  JUNAK: [
    { href: '/proby', label: 'Моя проба' },
    { href: '/settings', label: 'Налаштування' },
  ],
  VYKHOVNYK: [
    { href: '/hurtky', label: 'Мої гуртки' },
    { href: '/settings', label: 'Налаштування' },
  ],
  ZVYAZKOVYI: [
    { href: '/approval-requests', label: 'Запити' },
    { href: '/users', label: 'Люди' },
    { href: '/hurtky', label: 'Гуртки' },
    { href: '/vykhovnyk-assignments', label: 'Призначення' },
    { href: '/kurin', label: 'Курінь' },
    { href: '/positions', label: 'Діловоди' },
    { href: '/settings', label: 'Налаштування' },
  ],
};

const DILOVODY_PAGES = [{ href: '/inventory', label: 'Облік реманенту' }];

export function Nav() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    queryClient.clear();
    router.push('/login');
    router.refresh();
  }

  if (!session) return null;

  const links = [...(LINKS_BY_ROLE[session.role] ?? [])];
  if (session.isKurinniy) {
    links.splice(1, 0, { href: '/users', label: 'Юнаки' }, { href: '/vykhovnyk-assignments', label: 'Виховники' });
  }
  if (session.role !== 'ZVYAZKOVYI' && (session.positions.includes('INTENDANT') || session.isKurinniy)) {
    links.push({ href: '/inventory', label: 'Облік реманенту' });
  }

  return (
    <nav className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-4">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="text-sm font-medium">
            {link.label}
          </Link>
        ))}
        {session.role === 'ZVYAZKOVYI' && (
          <details className="relative">
            <summary className="cursor-pointer text-sm font-medium">Діловодство</summary>
            <div className="absolute z-10 mt-1 flex flex-col rounded border bg-background p-2 shadow-md">
              {DILOVODY_PAGES.map((page) => (
                <Link key={page.href} href={page.href} className="whitespace-nowrap px-2 py-1 text-sm">
                  {page.label}
                </Link>
              ))}
            </div>
          </details>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={handleLogout}>
        Вийти
      </Button>
    </nav>
  );
}
```

### Step 8: Typecheck

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

### Step 9: Write the Playwright test

Create `apps/web/e2e/inventory.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi add an inventory item with a photo and delete it', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.getByText('Діловодство').click();
  await page.getByRole('link', { name: 'Облік реманенту' }).click();

  await expect(page.getByRole('heading', { name: 'Облік реманенту' })).toBeVisible();

  await page.getByPlaceholder('Назва (наприклад, Пилка)').fill('Тестова пилка');
  await page.getByPlaceholder('Кількість').fill('3');
  await page.getByRole('button', { name: 'Додати річ' }).click();

  await expect(page.getByRole('heading', { name: 'Тестова пилка' })).toBeVisible();
  await expect(page.getByText('Кількість: 3')).toBeVisible();

  await page.getByRole('button', { name: 'Видалити' }).click();
  await expect(page.getByRole('heading', { name: 'Тестова пилка' })).not.toBeVisible();
});
```

This test deliberately does not attach a real photo file — it exercises the text-only path (name/quantity, zero photos), which is the part of the flow this Playwright suite can exercise without a real Google Drive account. The photo-upload path is already covered by Task 4's backend e2e tests against a faked Drive client.

### Step 10: Run the new test and the full suite

Run: `cd apps/web && npx playwright test inventory`
Expected: PASS.

Run: `cd apps/web && npx playwright test`
Expected: all tests pass — in particular, no other spec depends on `components/nav.tsx`'s exact link list in a way this addition would break (grep the existing specs for nav-related assertions if unsure, but the change here is additive — new links pushed onto the array, no existing link removed or renamed).

### Step 11: Commit

```bash
git add apps/web/app/api/backend apps/web/lib/api-client.ts apps/web/lib/types.ts apps/web/app/api/session/route.ts apps/web/lib/queries/inventory.ts apps/web/app/inventory/page.tsx apps/web/components/nav.tsx apps/web/e2e/inventory.spec.ts
git commit -m "feat: add /inventory page, nav entry, and multipart proxy support"
```
