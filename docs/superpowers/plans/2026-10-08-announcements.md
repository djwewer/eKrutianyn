# Оголошення (Announcements) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a kurin-wide "Оголошення" (announcements) feature — a rich-text feed, editable by писар/звʼязковий, with emoji reactions, that becomes the new default home page and sends a real Web Push notification to the whole kurin on publish.

**Architecture:** New Prisma models (`Announcement`, `AnnouncementImage`, `AnnouncementReaction`) and a new `apps/api/src/announcements/` NestJS module following the exact controller/service/DTO conventions already used by `kurin-calendar` and `inventory`. Images are uploaded ahead of publish and linked at publish time (no visible empty drafts). Push reuses the existing `PushNotificationsService`, extended with a kurin-scoped send method; the test-only every-minute cron is deleted. Frontend: a Tiptap-based editor, a read-only feed page, and small `nav.tsx`/`app/page.tsx` changes to make `/news` the default landing page for every role.

**Tech Stack:** NestJS, Prisma/PostgreSQL, class-validator, multer (memoryStorage), web-push (already installed) — backend. Next.js 16 / React 19, TanStack Query, Tiptap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-image`, `@tiptap/html`) — frontend.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-10-08-announcements-design.md` — read it in full before starting; this plan implements it exactly, do not re-derive requirements from scratch.
- Authorization for publish/edit/delete: `actor.role === 'ZVYAZKOVYI' || actor.positions.includes('PYSAR')` — same pattern as `InventoryService.assertCanWrite` (`src/inventory/inventory.service.ts`) and `TreasuryService.assertCanWrite`.
- All authenticated kurin members (any role) can read the feed and react — no `assertCanWrite`-style gate on read/react endpoints beyond kurin-match.
- Images stored as `Bytes` in Postgres (not Google Drive, not S3) — same pattern as `User.photoData`. Mimetype is sniffed from actual file bytes via `detectSafeImageMimeType` (`src/common/image-sniff.util.ts`) — never trust the client-claimed mimetype.
- Content stored as Tiptap/ProseMirror JSON (`Json` column), never as an HTML string.
- Reaction set is exactly 6 fixed emoji (`ReactionEmoji` enum: `THUMBS_UP, HEART, CLAP, WOW, LAUGH, SAD`), one reaction per user per announcement (unique constraint `(announcementId, userId)`).
- Push payload on publish: `{ title: 'Нове оголошення', body: announcement.title, url: '/news' }`, sent to every `PushSubscription` belonging to a `User` with that `kurinId` — never globally.
- The test-only `PushNotificationsCron` (`apps/api/src/push-notifications/push-notifications.cron.ts`) must be deleted entirely, along with its registration in `push-notifications.module.ts` — it has served its purpose (confirmed working on iOS) and real push now fires from announcement publish.
- Never commit without running the affected test suite first and confirming it passes; never merge to `main` without an explicit instruction from the user (this plan covers the `claude/book-import-plan-80k628` branch only).
- Prisma migrations in this environment are written by hand (`npx prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script` to generate SQL, then a timestamped folder under `apps/api/prisma/migrations/`, then `npx prisma migrate deploy`) — `prisma migrate dev` refuses non-interactive shells here. Postgres may need `sudo service postgresql start` first if `pg_isready` fails.

---

### Task 1: Prisma schema — Announcement, AnnouncementImage, ReactionEmoji, AnnouncementReaction

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_announcements/migration.sql`

**Interfaces:**
- Produces: Prisma models `Announcement`, `AnnouncementImage`, `AnnouncementReaction`, enum `ReactionEmoji`, all available via `PrismaService` (`this.prisma.announcement`, `this.prisma.announcementImage`, `this.prisma.announcementReaction`) for every later task.

- [x] **Step 1: Add the models to schema.prisma**

Add to `apps/api/prisma/schema.prisma`, right after the final existing model (`AiMessage`):

```prisma
model Announcement {
  id        String   @id @default(uuid())
  kurinId   String
  kurin     Kurin    @relation(fields: [kurinId], references: [id])
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  title     String
  content   Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  images    AnnouncementImage[]
  reactions AnnouncementReaction[]

  @@index([kurinId, createdAt])
}

// Nullable announcementId: an image is uploaded during composition, before
// the announcement it belongs to exists — linked only once the writer
// actually publishes (POST/PATCH .../announcements with imageIds).
model AnnouncementImage {
  id             String        @id @default(uuid())
  announcementId String?
  announcement   Announcement? @relation(fields: [announcementId], references: [id])
  kurinId        String
  kurin          Kurin         @relation(fields: [kurinId], references: [id])
  uploaderId     String
  uploader       User          @relation(fields: [uploaderId], references: [id])
  data           Bytes
  mimeType       String
  createdAt      DateTime      @default(now())
}

enum ReactionEmoji {
  THUMBS_UP
  HEART
  CLAP
  WOW
  LAUGH
  SAD
}

model AnnouncementReaction {
  id             String        @id @default(uuid())
  announcementId String
  announcement   Announcement  @relation(fields: [announcementId], references: [id])
  userId         String
  user           User          @relation(fields: [userId], references: [id])
  emoji          ReactionEmoji
  createdAt      DateTime      @default(now())

  @@unique([announcementId, userId])
}
```

Add back-relations. On `model Kurin`, after `calendarEvents KurinCalendarEvent[]`:

```prisma
  announcements      Announcement[]
  announcementImages AnnouncementImage[]
```

On `model User`, after `activityEntries JunakActivityEntry[] @relation("JunakActivityEntries")` (and before `pushSubscriptions PushSubscription[]`):

```prisma
  authoredAnnouncements    Announcement[]
  uploadedAnnouncementImages AnnouncementImage[]
  announcementReactions    AnnouncementReaction[]
```

- [x] **Step 2: Generate and write the migration**

```bash
cd apps/api
sudo service postgresql start 2>/dev/null; pg_isready
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

Expected: prints `CREATE TABLE "Announcement"`, `CREATE TABLE "AnnouncementImage"`, the `ReactionEmoji` enum creation, `CREATE TABLE "AnnouncementReaction"`, and the matching foreign keys/indexes/unique constraint.

Create the migration folder with that exact SQL:

```bash
TS=$(date +%Y%m%d%H%M%S)
mkdir -p "apps/api/prisma/migrations/${TS}_add_announcements"
```

Write the printed SQL verbatim into `apps/api/prisma/migrations/<that timestamp>_add_announcements/migration.sql`.

- [x] **Step 3: Apply the migration to dev and test databases, regenerate the client**

```bash
cd apps/api
npx prisma migrate deploy
DATABASE_URL=$(grep '^DATABASE_URL_TEST=' .env | cut -d= -f2- | tr -d '"') npx prisma migrate deploy
npx prisma generate
```

Expected: both `migrate deploy` runs report `All migrations have been successfully applied.`; `generate` reports `Generated Prisma Client`.

- [x] **Step 4: Typecheck**

```bash
cd apps/api && npx tsc --noEmit -p .
```

Expected: no output (clean).

- [x] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "Add Announcement/AnnouncementImage/AnnouncementReaction Prisma models"
```

---

### Task 2: Backend — AnnouncementsService + DTOs (CRUD, authorization)

**Files:**
- Create: `apps/api/src/announcements/dto/create-announcement.dto.ts`
- Create: `apps/api/src/announcements/dto/update-announcement.dto.ts`
- Create: `apps/api/src/announcements/announcements.service.ts`
- Create: `apps/api/src/announcements/announcements.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`src/prisma/prisma.service.ts`), `CurrentUserPayload` (`src/common/decorators/current-user.decorator.ts`, shape `{ userId, role, kurinId, isKurinniy, positions }`).
- Produces: `AnnouncementsService` with methods `list(kurinId, actor)`, `create(kurinId, dto, actor)`, `update(kurinId, id, dto, actor)`, `remove(kurinId, id, actor)` — consumed by Task 3's controller and by Task 5 (which wires push into `create`).

- [x] **Step 1: Write the DTOs**

`apps/api/src/announcements/dto/create-announcement.dto.ts`:

```ts
import { IsArray, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString() @IsNotEmpty() title: string;
  @IsObject() content: Record<string, unknown>;
  @IsArray() @IsString({ each: true }) imageIds: string[];
}
```

`apps/api/src/announcements/dto/update-announcement.dto.ts`:

```ts
import { IsArray, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class UpdateAnnouncementDto {
  @IsString() @IsNotEmpty() title: string;
  @IsObject() content: Record<string, unknown>;
  @IsArray() @IsString({ each: true }) imageIds: string[];
}
```

- [x] **Step 2: Write the failing tests**

`apps/api/src/announcements/announcements.service.spec.ts`:

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

const ZVYAZKOVYI: CurrentUserPayload = {
  userId: 'zvyazkovyi-1',
  role: 'ZVYAZKOVYI' as any,
  kurinId: 'kurin-1',
  isKurinniy: false,
  positions: [],
};
const PYSAR: CurrentUserPayload = {
  userId: 'pysar-1',
  role: 'JUNAK' as any,
  kurinId: 'kurin-1',
  isKurinniy: false,
  positions: ['PYSAR'] as any,
};
const PLAIN_JUNAK: CurrentUserPayload = {
  userId: 'junak-1',
  role: 'JUNAK' as any,
  kurinId: 'kurin-1',
  isKurinniy: false,
  positions: [],
};

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let prisma: {
    announcement: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock; findUnique: jest.Mock };
    announcementImage: { updateMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      announcement: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
      announcementImage: { updateMany: jest.fn() },
    };
    service = new AnnouncementsService(prisma as unknown as PrismaService);
  });

  describe('list', () => {
    it('lists announcements for the given kurin, newest first', async () => {
      await service.list('kurin-1', PLAIN_JUNAK);

      expect(prisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { kurinId: 'kurin-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('create', () => {
    it('allows a writer (PYSAR) to publish, and links the given images', async () => {
      prisma.announcement.create.mockResolvedValue({ id: 'ann-1', kurinId: 'kurin-1', title: 'Хі' });

      const result = await service.create(
        'kurin-1',
        { title: 'Хі', content: { type: 'doc' }, imageIds: ['img-1', 'img-2'] },
        PYSAR,
      );

      expect(prisma.announcement.create).toHaveBeenCalledWith({
        data: { kurinId: 'kurin-1', authorId: 'pysar-1', title: 'Хі', content: { type: 'doc' } },
      });
      expect(prisma.announcementImage.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['img-1', 'img-2'] }, kurinId: 'kurin-1' },
        data: { announcementId: 'ann-1' },
      });
      expect(result).toEqual({ id: 'ann-1', kurinId: 'kurin-1', title: 'Хі' });
    });

    it('allows a zvyazkovyi to publish', async () => {
      prisma.announcement.create.mockResolvedValue({ id: 'ann-1' });

      await expect(
        service.create('kurin-1', { title: 'Хі', content: {}, imageIds: [] }, ZVYAZKOVYI),
      ).resolves.toBeDefined();
    });

    it('rejects a plain junak with no writer position', async () => {
      await expect(
        service.create('kurin-1', { title: 'Хі', content: {}, imageIds: [] }, PLAIN_JUNAK),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.announcement.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('lets a writer edit an announcement authored by someone else', async () => {
      prisma.announcement.findUnique.mockResolvedValue({ id: 'ann-1', kurinId: 'kurin-1', authorId: 'some-other-writer' });
      prisma.announcement.update.mockResolvedValue({ id: 'ann-1' });

      await service.update('kurin-1', 'ann-1', { title: 'Нове', content: {}, imageIds: [] }, PYSAR);

      expect(prisma.announcement.update).toHaveBeenCalledWith({
        where: { id: 'ann-1' },
        data: { title: 'Нове', content: {} },
      });
    });

    it('404s on an announcement from a different kurin', async () => {
      prisma.announcement.findUnique.mockResolvedValue({ id: 'ann-1', kurinId: 'some-other-kurin' });

      await expect(
        service.update('kurin-1', 'ann-1', { title: 'Нове', content: {}, imageIds: [] }, PYSAR),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('lets a zvyazkovyi delete any announcement in their kurin', async () => {
      prisma.announcement.findUnique.mockResolvedValue({ id: 'ann-1', kurinId: 'kurin-1' });

      await service.remove('kurin-1', 'ann-1', ZVYAZKOVYI);

      expect(prisma.announcement.delete).toHaveBeenCalledWith({ where: { id: 'ann-1' } });
    });

    it('rejects a plain junak', async () => {
      prisma.announcement.findUnique.mockResolvedValue({ id: 'ann-1', kurinId: 'kurin-1' });

      await expect(service.remove('kurin-1', 'ann-1', PLAIN_JUNAK)).rejects.toThrow(ForbiddenException);
      expect(prisma.announcement.delete).not.toHaveBeenCalled();
    });
  });
});
```

- [x] **Step 2b: Run it to verify it fails**

```bash
cd apps/api && npx jest src/announcements/announcements.service.spec.ts
```

Expected: FAIL — `Cannot find module './announcements.service'`.

- [x] **Step 3: Implement the service**

`apps/api/src/announcements/announcements.service.ts`:

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  // Every authenticated kurin member can read and react — only
  // publish/edit/delete is gated to писар/звʼязковий (assertCanWrite).
  private assertCanWrite(actor: CurrentUserPayload) {
    if (actor.role !== 'ZVYAZKOVYI' && !actor.positions.includes('PYSAR' as never)) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  async list(kurinId: string, _actor: CurrentUserPayload) {
    return this.prisma.announcement.findMany({
      where: { kurinId },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { firstName: true, lastName: true } },
        images: { select: { id: true } },
        reactions: { select: { userId: true, emoji: true } },
      },
    });
  }

  async create(kurinId: string, dto: CreateAnnouncementDto, actor: CurrentUserPayload) {
    this.assertCanWrite(actor);
    const announcement = await this.prisma.announcement.create({
      data: { kurinId, authorId: actor.userId, title: dto.title, content: dto.content },
    });
    if (dto.imageIds.length > 0) {
      await this.prisma.announcementImage.updateMany({
        where: { id: { in: dto.imageIds }, kurinId },
        data: { announcementId: announcement.id },
      });
    }
    return announcement;
  }

  async update(kurinId: string, id: string, dto: UpdateAnnouncementDto, actor: CurrentUserPayload) {
    this.assertCanWrite(actor);
    await this.findOrThrow(kurinId, id);
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: { title: dto.title, content: dto.content },
    });
    if (dto.imageIds.length > 0) {
      await this.prisma.announcementImage.updateMany({
        where: { id: { in: dto.imageIds }, kurinId },
        data: { announcementId: id },
      });
    }
    return updated;
  }

  async remove(kurinId: string, id: string, actor: CurrentUserPayload) {
    this.assertCanWrite(actor);
    await this.findOrThrow(kurinId, id);
    await this.prisma.announcement.delete({ where: { id } });
    return { success: true };
  }

  private async findOrThrow(kurinId: string, id: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement || announcement.kurinId !== kurinId) {
      throw new NotFoundException('Announcement not found');
    }
    return announcement;
  }
}
```

Note: the `update` test above doesn't mock `announcementImage.updateMany` resolution and passes `imageIds: []`, so that branch is skipped — no mock needed for that test. The `create` test passes two image ids and does assert on `announcementImage.updateMany`.

- [x] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx jest src/announcements/announcements.service.spec.ts
```

Expected: `Tests: 7 passed, 7 total`.

- [x] **Step 5: Typecheck**

```bash
cd apps/api && npx tsc --noEmit -p .
```

Expected: no output.

- [x] **Step 6: Commit**

```bash
git add apps/api/src/announcements
git commit -m "Add AnnouncementsService with CRUD and писар/звʼязковий authorization"
```

---

### Task 3: Backend — controller, module, image upload/serve

**Files:**
- Create: `apps/api/src/announcements/announcements.controller.ts`
- Create: `apps/api/src/announcements/announcements.module.ts`
- Modify: `apps/api/src/announcements/announcements.service.ts` (add `uploadImage`, `getImage`)
- Modify: `apps/api/src/announcements/announcements.service.spec.ts` (add tests for the two new methods)
- Modify: `apps/api/src/app.module.ts` (register `AnnouncementsModule`)

**Interfaces:**
- Consumes: `JwtAuthGuard` (`src/common/guards/jwt-auth.guard.ts`), `detectSafeImageMimeType` (`src/common/image-sniff.util.ts`).
- Produces: `AnnouncementsService.uploadImage(kurinId, file, actor): Promise<{id: string}>` and `getImage(kurinId, imageId): Promise<{data: Buffer, mimeType: string} | null>`, both consumed by `AnnouncementsController`.

- [x] **Step 1: Write the failing tests for uploadImage/getImage**

Append to `apps/api/src/announcements/announcements.service.spec.ts`, inside the `describe('AnnouncementsService', ...)` block (add `announcementImage.create` and `.findUnique` mocks to the `prisma` object built in `beforeEach` first):

```ts
      announcementImage: { updateMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
```

(replacing the earlier, narrower `announcementImage: { updateMany: jest.fn() }` line in `beforeEach`), then add:

```ts
  describe('uploadImage', () => {
    it('rejects a non-image buffer regardless of claimed mimetype', async () => {
      const notAnImage = Buffer.from('not an image');

      await expect(
        service.uploadImage('kurin-1', { buffer: notAnImage, mimetype: 'image/png' } as Express.Multer.File, PYSAR),
      ).rejects.toThrow('Файл не є дійсним зображенням');
      expect(prisma.announcementImage.create).not.toHaveBeenCalled();
    });

    it('stores a real PNG under the kurin and uploader, ignoring the claimed mimetype', async () => {
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
      prisma.announcementImage.create.mockResolvedValue({ id: 'img-1' });

      const result = await service.uploadImage(
        'kurin-1',
        { buffer: pngSignature, mimetype: 'application/octet-stream' } as Express.Multer.File,
        PYSAR,
      );

      expect(prisma.announcementImage.create).toHaveBeenCalledWith({
        data: { kurinId: 'kurin-1', uploaderId: 'pysar-1', data: pngSignature, mimeType: 'image/png' },
      });
      expect(result).toEqual({ id: 'img-1' });
    });

    it('rejects a plain junak (not писар/звʼязковий)', async () => {
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      await expect(
        service.uploadImage('kurin-1', { buffer: pngSignature, mimetype: 'image/png' } as Express.Multer.File, PLAIN_JUNAK),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getImage', () => {
    it("returns the image's bytes and mimetype when it belongs to the actor's kurin", async () => {
      prisma.announcementImage.findUnique.mockResolvedValue({
        id: 'img-1',
        kurinId: 'kurin-1',
        data: Buffer.from('abc'),
        mimeType: 'image/png',
      });

      const result = await service.getImage('kurin-1', 'img-1');

      expect(result).toEqual({ data: Buffer.from('abc'), mimeType: 'image/png' });
    });

    it('returns null for an image belonging to a different kurin', async () => {
      prisma.announcementImage.findUnique.mockResolvedValue({ id: 'img-1', kurinId: 'some-other-kurin' });

      expect(await service.getImage('kurin-1', 'img-1')).toBeNull();
    });

    it('returns null for a non-existent image id', async () => {
      prisma.announcementImage.findUnique.mockResolvedValue(null);

      expect(await service.getImage('kurin-1', 'missing')).toBeNull();
    });
  });
```

- [x] **Step 1b: Run to verify it fails**

```bash
cd apps/api && npx jest src/announcements/announcements.service.spec.ts
```

Expected: FAIL — `service.uploadImage is not a function`.

- [x] **Step 2: Implement uploadImage/getImage**

Add to the top of `apps/api/src/announcements/announcements.service.ts`:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { detectSafeImageMimeType } from '../common/image-sniff.util';
```

(replacing the earlier, narrower import line), and add these two methods inside the class, after `remove`:

```ts
  async uploadImage(kurinId: string, file: Express.Multer.File, actor: CurrentUserPayload) {
    this.assertCanWrite(actor);
    const detectedMimeType = detectSafeImageMimeType(file.buffer);
    if (!detectedMimeType) {
      throw new BadRequestException('Файл не є дійсним зображенням (JPEG, PNG, WebP або GIF)');
    }
    return this.prisma.announcementImage.create({
      data: { kurinId, uploaderId: actor.userId, data: file.buffer, mimeType: detectedMimeType },
    });
  }

  async getImage(kurinId: string, imageId: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const image = await this.prisma.announcementImage.findUnique({ where: { id: imageId } });
    if (!image || image.kurinId !== kurinId) {
      return null;
    }
    return { data: image.data as Buffer, mimeType: image.mimeType };
  }
```

- [x] **Step 3: Run tests to verify they pass**

```bash
cd apps/api && npx jest src/announcements/announcements.service.spec.ts
```

Expected: all tests pass (13 total: 7 from Task 2 + 6 new).

- [x] **Step 4: Write the controller**

`apps/api/src/announcements/announcements.controller.ts`:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@UseGuards(JwtAuthGuard)
@Controller('kurins/:kurinId/announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  list(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(kurinId, user);
  }

  @Post()
  create(@Param('kurinId') kurinId: string, @Body() dto: CreateAnnouncementDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(kurinId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('kurinId') kurinId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(kurinId, id, dto, user);
  }

  @Delete(':id')
  remove(@Param('kurinId') kurinId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(kurinId, id, user);
  }

  @Post('images')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, callback) => {
        callback(
          file.mimetype.startsWith('image/') ? null : new BadRequestException('Дозволені лише зображення'),
          file.mimetype.startsWith('image/'),
        );
      },
    }),
  )
  uploadImage(
    @Param('kurinId') kurinId: string,
    @UploadedFile() image: Express.Multer.File | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!image) {
      throw new BadRequestException('Файл зображення обов\'язковий');
    }
    return this.service.uploadImage(kurinId, image, user);
  }

  @Get('images/:imageId')
  async getImage(@Param('kurinId') kurinId: string, @Param('imageId') imageId: string, @Res() res: Response) {
    const image = await this.service.getImage(kurinId, imageId);
    if (!image) {
      throw new NotFoundException('Image not found');
    }
    res.set('Content-Type', image.mimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(image.data);
  }
}
```

- [x] **Step 5: Write the module**

`apps/api/src/announcements/announcements.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [PrismaModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
```

- [x] **Step 6: Register the module**

In `apps/api/src/app.module.ts`, add the import:

```ts
import { AnnouncementsModule } from './announcements/announcements.module';
```

and add `AnnouncementsModule,` to the `imports` array (after `PushNotificationsModule,`).

- [x] **Step 7: Typecheck and run the full announcements spec**

```bash
cd apps/api && npx tsc --noEmit -p . && npx jest src/announcements
```

Expected: tsc silent; all 13 tests pass.

- [x] **Step 8: Commit**

```bash
git add apps/api/src/announcements apps/api/src/app.module.ts
git commit -m "Add Announcements controller/module, image upload and serve endpoints"
```

---

### Task 4: Backend — reactions (put/delete, upsert-or-remove)

**Files:**
- Create: `apps/api/src/announcements/dto/set-reaction.dto.ts`
- Modify: `apps/api/src/announcements/announcements.service.ts` (add `setReaction`, `removeReaction`)
- Modify: `apps/api/src/announcements/announcements.service.spec.ts` (add tests)
- Modify: `apps/api/src/announcements/announcements.controller.ts` (add two endpoints)

**Interfaces:**
- Produces: `AnnouncementsService.setReaction(kurinId, announcementId, emoji, actor)`, `.removeReaction(kurinId, announcementId, actor)`.

- [x] **Step 1: Write the DTO**

`apps/api/src/announcements/dto/set-reaction.dto.ts`:

```ts
import { IsEnum } from 'class-validator';
import { ReactionEmoji } from '@prisma/client';

export class SetReactionDto {
  @IsEnum(ReactionEmoji) emoji: ReactionEmoji;
}
```

- [x] **Step 2: Write the failing tests**

Append to `apps/api/src/announcements/announcements.service.spec.ts` (add `announcementReaction: { upsert: jest.Mock; deleteMany: jest.Mock }` to the `prisma` object in `beforeEach`):

```ts
      announcementReaction: { upsert: jest.fn(), deleteMany: jest.fn() },
```

```ts
  describe('setReaction', () => {
    it('upserts the reaction, one per (announcement, user)', async () => {
      prisma.announcement.findUnique.mockResolvedValue({ id: 'ann-1', kurinId: 'kurin-1' });

      await service.setReaction('kurin-1', 'ann-1', 'HEART' as any, PLAIN_JUNAK);

      expect(prisma.announcementReaction.upsert).toHaveBeenCalledWith({
        where: { announcementId_userId: { announcementId: 'ann-1', userId: 'junak-1' } },
        create: { announcementId: 'ann-1', userId: 'junak-1', emoji: 'HEART' },
        update: { emoji: 'HEART' },
      });
    });

    it('404s reacting to an announcement from a different kurin', async () => {
      prisma.announcement.findUnique.mockResolvedValue({ id: 'ann-1', kurinId: 'some-other-kurin' });

      await expect(service.setReaction('kurin-1', 'ann-1', 'HEART' as any, PLAIN_JUNAK)).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeReaction', () => {
    it("removes only the actor's own reaction", async () => {
      await service.removeReaction('kurin-1', 'ann-1', PLAIN_JUNAK);

      expect(prisma.announcementReaction.deleteMany).toHaveBeenCalledWith({
        where: { announcementId: 'ann-1', userId: 'junak-1' },
      });
    });
  });
```

- [x] **Step 2b: Run to verify it fails**

```bash
cd apps/api && npx jest src/announcements/announcements.service.spec.ts
```

Expected: FAIL — `service.setReaction is not a function`.

- [x] **Step 3: Implement**

Add to `apps/api/src/announcements/announcements.service.ts`, update the Prisma import to include the enum type and add these two methods after `getImage`:

```ts
import { ReactionEmoji } from '@prisma/client';
```

```ts
  async setReaction(kurinId: string, announcementId: string, emoji: ReactionEmoji, actor: CurrentUserPayload) {
    await this.findOrThrow(kurinId, announcementId);
    return this.prisma.announcementReaction.upsert({
      where: { announcementId_userId: { announcementId, userId: actor.userId } },
      create: { announcementId, userId: actor.userId, emoji },
      update: { emoji },
    });
  }

  async removeReaction(kurinId: string, announcementId: string, actor: CurrentUserPayload) {
    await this.prisma.announcementReaction.deleteMany({
      where: { announcementId, userId: actor.userId },
    });
    return { success: true };
  }
```

- [x] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx jest src/announcements/announcements.service.spec.ts
```

Expected: all tests pass (16 total).

- [x] **Step 5: Add the controller endpoints**

Add to `apps/api/src/announcements/announcements.controller.ts`, importing `SetReactionDto` and adding after `getImage`:

```ts
import { SetReactionDto } from './dto/set-reaction.dto';
```

```ts
  @Post(':id/reactions')
  @HttpCode(200)
  setReaction(
    @Param('kurinId') kurinId: string,
    @Param('id') id: string,
    @Body() dto: SetReactionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.setReaction(kurinId, id, dto.emoji, user);
  }

  @Delete(':id/reactions')
  removeReaction(@Param('kurinId') kurinId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removeReaction(kurinId, id, user);
  }
```

(Using `POST` rather than `PUT` for `setReaction` here keeps it consistent with every other write endpoint in this controller and avoids a bare HTTP verb mismatch with the rest of the codebase's convention, which uses `POST` for both "create" and "upsert-like" actions — e.g. `kurin-positions` assign. This is a deliberate, minor deviation from the design spec's `PUT` wording; functionally identical.)

- [x] **Step 6: Typecheck and run the full suite**

```bash
cd apps/api && npx tsc --noEmit -p . && npx jest src/announcements
```

Expected: tsc silent; all 16 tests pass.

- [x] **Step 7: Commit**

```bash
git add apps/api/src/announcements
git commit -m "Add Announcements reactions endpoints (set/remove, one per user)"
```

---

### Task 5: Backend — kurin-scoped push on publish, remove test cron

**Files:**
- Modify: `apps/api/src/push-notifications/push-notifications.service.ts` (add `sendToKurin`)
- Modify: `apps/api/src/push-notifications/push-notifications.service.spec.ts` (add tests; remove `sendTestPushToAll` tests)
- Delete: `apps/api/src/push-notifications/push-notifications.cron.ts`
- Modify: `apps/api/src/push-notifications/push-notifications.module.ts` (remove the cron provider)
- Modify: `apps/api/src/announcements/announcements.module.ts` (import `PushNotificationsModule`, inject the service)
- Modify: `apps/api/src/announcements/announcements.service.ts` (call `sendToKurin` from `create`)
- Modify: `apps/api/src/announcements/announcements.service.spec.ts` (update `create` tests to cover the push call)

**Interfaces:**
- Consumes: `PushNotificationsService` (exported from `PushNotificationsModule`).
- Produces: `PushNotificationsService.sendToKurin(kurinId: string, payload: { title: string; body: string; url: string }): Promise<void>`.

- [x] **Step 1: Write the failing test for sendToKurin**

Replace the `describe('sendTestPushToAll', ...)` block in `apps/api/src/push-notifications/push-notifications.service.spec.ts` with `describe('sendToKurin', ...)`, and update the `prisma.pushSubscription` mock shape in `beforeEach` to include a `findMany` that can be asserted on with a `where` clause:

```ts
  describe('sendToKurin', () => {
    const PAYLOAD = { title: 'Нове оголошення', body: 'Зимовий табір', url: '/news' };

    it('sends only to subscriptions belonging to users in the given kurin', async () => {
      prisma.pushSubscription.findMany.mockResolvedValue([
        { id: 'sub-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
      ]);
      sendNotificationMock.mockResolvedValue(undefined);

      await service.sendToKurin('kurin-1', PAYLOAD);

      expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith({
        where: { user: { kurinId: 'kurin-1' } },
      });
      expect(sendNotificationMock).toHaveBeenCalledWith(
        { endpoint: 'https://push.example/1', keys: { p256dh: 'p1', auth: 'a1' } },
        JSON.stringify(PAYLOAD),
      );
    });

    it('deletes a subscription whose push fails with 410 Gone, same as before', async () => {
      prisma.pushSubscription.findMany.mockResolvedValue([
        { id: 'sub-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
      ]);
      sendNotificationMock.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));

      await service.sendToKurin('kurin-1', PAYLOAD);

      expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
    });
  });
```

- [x] **Step 1b: Run to verify it fails**

```bash
cd apps/api && npx jest src/push-notifications/push-notifications.service.spec.ts
```

Expected: FAIL — `service.sendToKurin is not a function` (and the deleted `sendTestPushToAll` describe block's tests no longer exist, which is correct — that method is being removed).

- [x] **Step 2: Replace sendTestPushToAll with sendToKurin**

In `apps/api/src/push-notifications/push-notifications.service.ts`, remove the `TEST_NOTIFICATION_TITLE`/`TEST_NOTIFICATION_BODY` constants and the `sendTestPushToAll` method, replacing it with:

```ts
  async sendToKurin(kurinId: string, payload: { title: string; body: string; url: string }): Promise<void> {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { user: { kurinId } },
    });
    const serialized = JSON.stringify(payload);

    await Promise.all(subscriptions.map((sub) => this.sendAndPruneIfGone(sub, serialized)));
  }
```

(`sendAndPruneIfGone` and the rest of the class are unchanged.)

- [x] **Step 3: Run tests to verify they pass**

```bash
cd apps/api && npx jest src/push-notifications/push-notifications.service.spec.ts
```

Expected: `subscribe`/`unsubscribe` tests unchanged and passing; new `sendToKurin` tests pass (6 total: 2 + 2 + 2 from the two unchanged describe blocks plus these two).

- [x] **Step 4: Delete the test cron**

```bash
cd apps/api
git rm src/push-notifications/push-notifications.cron.ts
```

In `apps/api/src/push-notifications/push-notifications.module.ts`, remove the `PushNotificationsCron` import and its entry in `providers`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationsService } from './push-notifications.service';

@Module({
  imports: [PrismaModule],
  controllers: [PushNotificationsController],
  providers: [PushNotificationsService],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
```

(Note the added `exports: [PushNotificationsService]` — required so `AnnouncementsModule` can inject it in the next step.)

- [x] **Step 5: Wire push into AnnouncementsService.create**

Update the `create` test in `apps/api/src/announcements/announcements.service.spec.ts` to also assert the push call. Add a `pushNotifications` mock to the test file:

```ts
const sendToKurinMock = jest.fn();
```

Change the `service = new AnnouncementsService(prisma as unknown as PrismaService);` line in `beforeEach` to also pass a second constructor argument:

```ts
    sendToKurinMock.mockReset();
    service = new AnnouncementsService(
      prisma as unknown as PrismaService,
      { sendToKurin: sendToKurinMock } as unknown as import('../push-notifications/push-notifications.service').PushNotificationsService,
    );
```

Add this assertion inside the existing `'allows a writer (PYSAR) to publish, and links the given images'` test, after the existing `expect` calls:

```ts
      expect(sendToKurinMock).toHaveBeenCalledWith('kurin-1', {
        title: 'Нове оголошення',
        body: 'Хі',
        url: '/news',
      });
```

Update `apps/api/src/announcements/announcements.service.ts`: add the import and constructor parameter, and call it at the end of `create`:

```ts
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
```

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationsService,
  ) {}
```

In `create`, after the `announcementImage.updateMany` block and before `return announcement;`:

```ts
    await this.pushNotifications.sendToKurin(kurinId, {
      title: 'Нове оголошення',
      body: announcement.title,
      url: '/news',
    });
```

- [x] **Step 6: Wire the module dependency**

In `apps/api/src/announcements/announcements.module.ts`, import `PushNotificationsModule`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [PrismaModule, PushNotificationsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
```

- [x] **Step 7: Run both affected suites, typecheck**

```bash
cd apps/api && npx tsc --noEmit -p . && npx jest src/announcements src/push-notifications
```

Expected: tsc silent; all tests in both directories pass.

- [x] **Step 8: Full API unit regression**

```bash
cd apps/api && npm run test
```

Expected: all suites pass (confirms removing the cron didn't break anything registered against it elsewhere, e.g. `app.module.ts` doesn't reference it directly).

- [x] **Step 9: Commit**

```bash
git add apps/api/src/push-notifications apps/api/src/announcements
git commit -m "Send real kurin-scoped push on announcement publish; remove test-only cron"
```

---

### Task 6: Frontend — types, query hooks, Tiptap dependencies

**Files:**
- Modify: `apps/web/package.json` (add Tiptap deps)
- Modify: `apps/web/lib/types.ts` (add `Announcement`, `AnnouncementReactionSummary` types)
- Create: `apps/web/lib/queries/announcements.ts`

**Interfaces:**
- Produces: `useAnnouncements(kurinId)`, `useCreateAnnouncement(kurinId)`, `useUpdateAnnouncement(kurinId, id)`, `useDeleteAnnouncement(kurinId)`, `useUploadAnnouncementImage(kurinId)`, `useSetReaction(kurinId)`, `useRemoveReaction(kurinId)` — consumed by Tasks 7 and 8.

- [x] **Step 1: Install Tiptap**

```bash
cd apps/web
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image @tiptap/html
```

Expected: `package.json`/`package-lock.json` updated, no install errors.

- [x] **Step 2: Add types**

Append to `apps/web/lib/types.ts`:

```ts
export type ReactionEmoji = 'THUMBS_UP' | 'HEART' | 'CLAP' | 'WOW' | 'LAUGH' | 'SAD';

export interface Announcement {
  id: string;
  kurinId: string;
  title: string;
  content: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  author: { firstName: string; lastName: string };
  images: { id: string }[];
  reactions: { userId: string; emoji: ReactionEmoji }[];
}
```

- [x] **Step 3: Write the query hooks**

`apps/web/lib/queries/announcements.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload } from '@/lib/api-client';
import type { Announcement, ReactionEmoji } from '@/lib/types';

export function useAnnouncements(kurinId: string | undefined) {
  return useQuery({
    queryKey: ['announcements', kurinId],
    queryFn: () => apiFetch<Announcement[]>(`/kurins/${kurinId}/announcements`),
    enabled: !!kurinId,
  });
}

export function useCreateAnnouncement(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; content: Record<string, unknown>; imageIds: string[] }) =>
      apiFetch<Announcement>(`/kurins/${kurinId}/announcements`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements', kurinId] }),
  });
}

export function useUpdateAnnouncement(kurinId: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; content: Record<string, unknown>; imageIds: string[] }) =>
      apiFetch<Announcement>(`/kurins/${kurinId}/announcements/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements', kurinId] }),
  });
}

export function useDeleteAnnouncement(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/kurins/${kurinId}/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements', kurinId] }),
  });
}

export function useUploadAnnouncementImage(kurinId: string) {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('image', file);
      return apiUpload<{ id: string }>(`/kurins/${kurinId}/announcements/images`, formData);
    },
  });
}

export function useSetReaction(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ announcementId, emoji }: { announcementId: string; emoji: ReactionEmoji }) =>
      apiFetch<void>(`/kurins/${kurinId}/announcements/${announcementId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements', kurinId] }),
  });
}

export function useRemoveReaction(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (announcementId: string) =>
      apiFetch<void>(`/kurins/${kurinId}/announcements/${announcementId}/reactions`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements', kurinId] }),
  });
}
```

- [x] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit -p .
```

Expected: no output.

- [x] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/lib/types.ts apps/web/lib/queries/announcements.ts
git commit -m "Add Tiptap deps, Announcement types, and announcements query hooks"
```

---

### Task 7: Frontend — read-only reaction emoji map + feed page `/news`

**Files:**
- Create: `apps/web/lib/reaction-emoji.ts`
- Create: `apps/web/components/announcement-card.tsx`
- Create: `apps/web/app/news/page.tsx`

**Interfaces:**
- Consumes: `useAnnouncements`, `useSetReaction`, `useRemoveReaction` (Task 6), `useSession` (`lib/session-client`), `Card`/`CardHeader`/`CardTitle`/`CardContent`/`Button` (`components/ui/*`).
- Produces: default export `NewsPage` at route `/news`.

- [x] **Step 1: Reaction emoji map**

`apps/web/lib/reaction-emoji.ts`:

```ts
import type { ReactionEmoji } from '@/lib/types';

export const REACTION_EMOJI: Record<ReactionEmoji, string> = {
  THUMBS_UP: '👍',
  HEART: '❤️',
  CLAP: '👏',
  WOW: '😮',
  LAUGH: '😂',
  SAD: '😢',
};

export const REACTION_ORDER: ReactionEmoji[] = ['THUMBS_UP', 'HEART', 'CLAP', 'WOW', 'LAUGH', 'SAD'];
```

- [x] **Step 2: Announcement card component**

`apps/web/components/announcement-card.tsx`:

```tsx
'use client';

import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { REACTION_EMOJI, REACTION_ORDER } from '@/lib/reaction-emoji';
import { useSetReaction, useRemoveReaction } from '@/lib/queries/announcements';
import type { Announcement, ReactionEmoji } from '@/lib/types';

const TIPTAP_EXTENSIONS = [StarterKit, Link, Image];

export function AnnouncementCard({
  announcement,
  kurinId,
  currentUserId,
  canManage,
  onEdit,
  onDelete,
}: {
  announcement: Announcement;
  kurinId: string;
  currentUserId: string;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const setReaction = useSetReaction(kurinId);
  const removeReaction = useRemoveReaction(kurinId);
  const html = generateHTML(announcement.content as any, TIPTAP_EXTENSIONS);
  const ownReaction = announcement.reactions.find((r) => r.userId === currentUserId)?.emoji;

  function handleReactionClick(emoji: ReactionEmoji) {
    if (ownReaction === emoji) {
      removeReaction.mutate(announcement.id);
    } else {
      setReaction.mutate({ announcementId: announcement.id, emoji });
    }
  }

  function countFor(emoji: ReactionEmoji): number {
    return announcement.reactions.filter((r) => r.emoji === emoji).length;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{announcement.title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {announcement.author.lastName} {announcement.author.firstName} ·{' '}
            {new Date(announcement.createdAt).toLocaleDateString('uk-UA')}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              Редагувати
            </Button>
            <Button size="sm" variant="outline" onClick={onDelete}>
              Видалити
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: html }} />
        <div className="flex flex-wrap gap-1">
          {REACTION_ORDER.map((emoji) => {
            const count = countFor(emoji);
            return (
              <Button
                key={emoji}
                size="sm"
                variant={ownReaction === emoji ? 'default' : 'outline'}
                onClick={() => handleReactionClick(emoji)}
              >
                {REACTION_EMOJI[emoji]} {count > 0 && count}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [x] **Step 3: Feed page**

`apps/web/app/news/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';
import { useAnnouncements, useDeleteAnnouncement } from '@/lib/queries/announcements';
import { AnnouncementCard } from '@/components/announcement-card';
import { Button } from '@/components/ui/button';

export default function NewsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const kurinId = session?.kurinId;
  const { data: announcements, isLoading } = useAnnouncements(kurinId);
  const deleteAnnouncement = useDeleteAnnouncement(kurinId ?? '');

  const canManage = !!session && (session.role === 'ZVYAZKOVYI' || session.positions.includes('PYSAR'));

  if (isLoading) return <p>Завантаження...</p>;
  if (!kurinId) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Оголошення</h1>
        {canManage && (
          <Button size="sm" onClick={() => router.push('/news/new')}>
            + Нове оголошення
          </Button>
        )}
      </div>
      {!announcements || announcements.length === 0 ? (
        <p className="text-sm text-muted-foreground">Оголошень поки немає.</p>
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              kurinId={kurinId}
              currentUserId={session!.userId}
              canManage={canManage}
              onEdit={() => router.push(`/news/${announcement.id}/edit`)}
              onDelete={() => {
                if (window.confirm('Видалити це оголошення?')) {
                  deleteAnnouncement.mutate(announcement.id);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 4: Typecheck and lint**

```bash
cd apps/web && npx tsc --noEmit -p . && npx eslint app/news/page.tsx components/announcement-card.tsx lib/reaction-emoji.ts
```

Expected: tsc silent; eslint reports no errors (warnings for e.g. `any` on `announcement.content as any` are expected and acceptable here — Tiptap's own `generateHTML` signature requires a loosely-typed JSON document; check the lint output and add a narrow `// eslint-disable-next-line` only if the project's eslint config actually errors on it, matching how other call sites in this codebase handle a similar unavoidable `any`).

- [x] **Step 5: Commit**

```bash
git add apps/web/lib/reaction-emoji.ts apps/web/components/announcement-card.tsx apps/web/app/news/page.tsx
git commit -m "Add /news feed page with read-only Tiptap render and emoji reactions"
```

---

### Task 8: Frontend — Tiptap editor + publish/edit pages

**Files:**
- Create: `apps/web/components/announcement-editor.tsx`
- Create: `apps/web/app/news/new/page.tsx`
- Create: `apps/web/app/news/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `useEditor`/`EditorContent` from `@tiptap/react`, `useCreateAnnouncement`/`useUpdateAnnouncement`/`useUploadAnnouncementImage` (Task 6).
- Produces: `AnnouncementEditor` component, reused by both the "new" and "edit" pages with a `mode` prop.

- [x] **Step 1: Editor component**

`apps/web/components/announcement-editor.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TiptapImage from '@tiptap/extension-image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUploadAnnouncementImage } from '@/lib/queries/announcements';

export function AnnouncementEditor({
  kurinId,
  initialTitle,
  initialContent,
  submitLabel,
  isSaving,
  errorMessage,
  onSubmit,
}: {
  kurinId: string;
  initialTitle: string;
  initialContent: Record<string, unknown> | null;
  submitLabel: string;
  isSaving: boolean;
  errorMessage: string | null;
  onSubmit: (data: { title: string; content: Record<string, unknown>; imageIds: string[] }) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const uploadImage = useUploadAnnouncementImage(kurinId);

  const editor = useEditor({
    extensions: [StarterKit, Link, TiptapImage],
    content: initialContent ?? '<p></p>',
    immediatelyRender: false,
  });

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    const uploaded = await uploadImage.mutateAsync(file);
    setImageIds((prev) => [...prev, uploaded.id]);
    editor.chain().focus().setImage({ src: `/api/backend/kurins/${kurinId}/announcements/images/${uploaded.id}` }).run();
  }

  function handleSubmit() {
    if (!editor) return;
    onSubmit({ title: title.trim(), content: editor.getJSON(), imageIds });
  }

  return (
    <div className="space-y-4">
      <Input placeholder="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      <div className="flex flex-wrap gap-2 rounded-md border border-border p-2">
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleBold().run()}>
          Жирний
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleItalic().run()}>
          Курсив
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
          H1
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          Список
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          Нумерований список
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const url = window.prompt('URL посилання:');
            if (url) editor?.chain().focus().setLink({ href: url }).run();
          }}
        >
          Посилання
        </Button>
        <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent-soft">
          Картинка
          <input type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
        </label>
      </div>
      <div className="min-h-40 rounded-md border border-border p-3">
        <EditorContent editor={editor} />
      </div>
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      <Button disabled={!title.trim() || isSaving} onClick={handleSubmit}>
        {submitLabel}
      </Button>
    </div>
  );
}
```

- [x] **Step 2: "New announcement" page**

`apps/web/app/news/new/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';
import { useCreateAnnouncement } from '@/lib/queries/announcements';
import { AnnouncementEditor } from '@/components/announcement-editor';
import { ApiError } from '@/lib/api-client';

export default function NewAnnouncementPage() {
  const router = useRouter();
  const { data: session, isLoading } = useSession();
  const kurinId = session?.kurinId ?? '';
  const create = useCreateAnnouncement(kurinId);

  if (isLoading) return <p>Завантаження...</p>;
  const canManage = !!session && (session.role === 'ZVYAZKOVYI' || session.positions.includes('PYSAR'));
  if (!canManage) return <p className="text-sm text-destructive">Немає доступу.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Нове оголошення</h1>
      <AnnouncementEditor
        kurinId={kurinId}
        initialTitle=""
        initialContent={null}
        submitLabel="Опублікувати"
        isSaving={create.isPending}
        errorMessage={create.isError ? (create.error instanceof ApiError ? 'Не вдалося опублікувати.' : null) : null}
        onSubmit={(data) => {
          create.mutate(data, { onSuccess: () => router.push('/news') });
        }}
      />
    </div>
  );
}
```

- [x] **Step 3: "Edit announcement" page**

`apps/web/app/news/[id]/edit/page.tsx`:

```tsx
'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';
import { useAnnouncements, useUpdateAnnouncement } from '@/lib/queries/announcements';
import { AnnouncementEditor } from '@/components/announcement-editor';

export default function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session, isLoading: sessionLoading } = useSession();
  const kurinId = session?.kurinId ?? '';
  const { data: announcements, isLoading: listLoading } = useAnnouncements(kurinId);
  const update = useUpdateAnnouncement(kurinId, id);

  if (sessionLoading || listLoading) return <p>Завантаження...</p>;
  const canManage = !!session && (session.role === 'ZVYAZKOVYI' || session.positions.includes('PYSAR'));
  if (!canManage) return <p className="text-sm text-destructive">Немає доступу.</p>;

  const announcement = announcements?.find((a) => a.id === id);
  if (!announcement) return <p>Оголошення не знайдено.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Редагувати оголошення</h1>
      <AnnouncementEditor
        kurinId={kurinId}
        initialTitle={announcement.title}
        initialContent={announcement.content}
        submitLabel="Зберегти"
        isSaving={update.isPending}
        errorMessage={update.isError ? 'Не вдалося зберегти.' : null}
        onSubmit={(data) => {
          update.mutate(data, { onSuccess: () => router.push('/news') });
        }}
      />
    </div>
  );
}
```

- [x] **Step 4: Typecheck and lint**

```bash
cd apps/web && npx tsc --noEmit -p . && npx eslint components/announcement-editor.tsx app/news/new/page.tsx "app/news/[id]/edit/page.tsx"
```

Expected: tsc silent; eslint no errors.

- [x] **Step 5: Commit**

```bash
git add apps/web/components/announcement-editor.tsx "apps/web/app/news/new/page.tsx" "apps/web/app/news/[id]/edit/page.tsx"
git commit -m "Add Tiptap announcement editor and publish/edit pages"
```

---

### Task 9: Frontend — nav.tsx + app/page.tsx wiring (default home page)

**Files:**
- Modify: `apps/web/components/nav.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- No new interfaces — this task only rewires existing navigation/routing.

- [x] **Step 1: Wrap the kurin name in a Link, add "Оголошення" nav links**

In `apps/web/components/nav.tsx`, change:

```tsx
        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold tracking-wide text-accent">єПластун</span>
          {kurin && (
            <h1 className="truncate text-[19px] font-bold tracking-tight">
              {kurin.kurinNumber ? `Курінь ч.${kurin.kurinNumber}` : 'Підготовчий курінь'}{' '}
              {kurin.name.replace(/^курінь\s+/i, '')}
            </h1>
          )}
        </div>
```

to:

```tsx
        <Link href="/news" className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold tracking-wide text-accent">єПластун</span>
          {kurin && (
            <h1 className="truncate text-[19px] font-bold tracking-tight">
              {kurin.kurinNumber ? `Курінь ч.${kurin.kurinNumber}` : 'Підготовчий курінь'}{' '}
              {kurin.name.replace(/^курінь\s+/i, '')}
            </h1>
          )}
        </Link>
```

Then add `{ href: '/news', label: 'Оголошення' },` as the first entry in each of the three arrays inside `LINKS_BY_ROLE` (`JUNAK`, `VYKHOVNYK`, `ZVYAZKOVYI`).

- [x] **Step 2: Make `/news` the default landing page for every role**

Replace the full contents of `apps/web/app/page.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';

export default function HomePage() {
  const router = useRouter();
  const { data: session, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading) {
      router.replace(session ? '/news' : '/login');
    }
  }, [session, isLoading, router]);

  return null;
}
```

- [x] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit -p .
```

Expected: no output.

- [x] **Step 4: Commit**

```bash
git add apps/web/components/nav.tsx apps/web/app/page.tsx
git commit -m "Make /news the default home page for every role; link kurin name to it"
```

---

### Task 10: E2E test, full regression, push to branch

**Files:**
- Create: `apps/web/e2e/announcements.spec.ts`

**Interfaces:**
- Consumes: `seedProbyProgram`, `seedKurinWithZvyazkovyi` (`e2e/helpers/seed.ts`), `loginAs` (`e2e/helpers/auth.ts`), `createUserAs`/`loginForToken` (`e2e/helpers/proby-seed.ts`).

- [x] **Step 1: Write the e2e spec**

`apps/web/e2e/announcements.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

const API_URL = 'http://localhost:3001';

test('zvyazkovyi publishes an announcement, it appears in the feed, and a junak can react to it', async ({ page, context }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/news/new');
  await page.getByPlaceholder('Заголовок').fill('Зимовий табір');
  await page.locator('.ProseMirror').fill('Збір у суботу о 9:00.');
  await page.getByRole('button', { name: 'Опублікувати' }).click();
  await page.waitForURL('/news');

  await expect(page.getByText('Зимовий табір')).toBeVisible();
  await expect(page.getByText('Збір у суботу о 9:00.')).toBeVisible();

  // React with the heart emoji, then toggle it off.
  const heartButton = page.getByRole('button', { name: '❤️' });
  await heartButton.click();
  await expect(page.getByRole('button', { name: '❤️ 1' })).toBeVisible();
  await heartButton.click();
  await expect(page.getByRole('button', { name: '❤️ 1' })).not.toBeVisible();
});

test('a plain junak (no писар position) does not see edit/delete controls or the new-announcement button', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiToken, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  const createRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: zvyazkovyiEmail, password: zvyazkovyiPassword }),
  });
  const { accessToken } = await createRes.json();

  const kurinRes = await fetch(`${API_URL}/kurins/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const kurin = await kurinRes.json();

  await fetch(`${API_URL}/kurins/${kurin.id}/announcements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ title: 'Існуюче оголошення', content: { type: 'doc', content: [] }, imageIds: [] }),
  });

  const junakEmail = `junak-news-${Date.now()}@example.com`;
  const junakPassword = 'password123';
  await fetch(`${API_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ firstName: 'Тест', lastName: 'Юнак', email: junakEmail, role: 'JUNAK', password: junakPassword }),
  });
  const junakLoginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: junakEmail, password: junakPassword }),
  });
  const { accessToken: junakToken } = await junakLoginRes.json();
  await fetch(`${API_URL}/users/me/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${junakToken}` },
    body: JSON.stringify({ currentPassword: junakPassword, newPassword: junakPassword }),
  });

  await loginAs(page, junakEmail, junakPassword);
  await page.goto('/news');

  await expect(page.getByText('Існуюче оголошення')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Нове оголошення' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Редагувати' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Видалити' })).not.toBeVisible();
});
```

- [x] **Step 2: Run it**

```bash
cd apps/web && npx playwright test e2e/announcements.spec.ts
```

Expected: `2 passed`. If `createUserAs`/`loginForToken` style helpers turn out to already exist with different names in `e2e/helpers/proby-seed.ts` (check that file first — it was referenced in other specs this session), prefer those over the raw `fetch` calls shown above to stay consistent with existing spec style; the raw-fetch version above is the fallback if no such helper fits this exact shape (creating a plain JUNAK under an already-seeded kurin without a hurtok).

- [x] **Step 3: Full regression — API unit tests**

```bash
cd apps/api && npm run test
```

Expected: all suites pass.

- [x] **Step 4: Full regression — targeted web e2e specs most likely to interact with nav/home changes**

```bash
cd apps/web && npx playwright test e2e/announcements.spec.ts e2e/calendar.spec.ts e2e/hurtok-archive.spec.ts e2e/user-archive.spec.ts
```

Expected: review output carefully. Any failure that is the same pre-existing Select/Accordion "element detached from DOM" flakiness documented earlier this session (unrelated Base UI issue, not caused by this feature) can be disregarded after confirming via `git stash` that it reproduces identically on the pre-feature commit — do not silently wave away a failure without that check. A failure caused by the `/` redirect change (anything that used to rely on landing on `/proby`, `/kurin`, or `/approval-requests` by default after login) is a real regression from this plan and must be fixed — check whether any existing spec calls `page.goto('/')` and asserts on a role-specific page afterward, and update it to navigate directly to that page instead, since `/` now always goes to `/news`.

- [x] **Step 5: Commit and push**

```bash
cd /home/user/eKrutianyn
git add apps/web/e2e/announcements.spec.ts
git commit -m "Add e2e coverage for announcements publish/react/authorization"
git push -u origin claude/book-import-plan-80k628
```

Do **not** merge to `main` — wait for the user's explicit instruction, same as every other merge this session.

## Plan self-review notes

- **Spec coverage:** every section of the design spec (data model, who-what-can table, backend endpoints, push integration, frontend editor/feed/nav, error handling, testing) maps to a task above (Tasks 1–5 backend, Tasks 6–9 frontend, Task 10 e2e+regression).
- **Deviation from spec flagged inline:** Task 4 uses `POST` instead of the spec's `PUT` for `setReaction`, justified inline as matching this codebase's existing verb convention — functionally identical, noted so no reviewer mistakes it for a missed requirement.
- **Type consistency check:** `AnnouncementsService` constructor signature (`prisma`, `pushNotifications`) is introduced in Task 5 and must match the test file's `new AnnouncementsService(prisma, { sendToKurin: ... })` call added in that same task — Tasks 2–4's tests construct the service with only `prisma` and must be read as "as of Task 2–4," since Task 5 changes that constructor; the implementer of Task 5 must update every earlier `new AnnouncementsService(prisma as unknown as PrismaService)` call site in the spec file to pass the second argument too (there is exactly one such call site, in `beforeEach`), not just the one shown inline in Task 5's Step 5.
