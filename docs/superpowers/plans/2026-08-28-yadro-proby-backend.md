# Ядро + Проби — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend API (NestJS + Prisma + PostgreSQL) implementing the "Ядро + Проби" domain: multi-tenant курінь/гурток structure, four-role RBAC (юнак/виховник/курінний/зв'язковий), proby-program catalog with point-level progress tracking, mutable proby-program per курінь with point-mapping carryover, and the курінний approval workflow.

**Architecture:** A single NestJS app (`apps/api`) inside an npm-workspaces monorepo root (leaves room for a `apps/web` frontend later without restructuring). PostgreSQL via Prisma ORM. JWT-based auth (email+password via argon2, and Google SSO) issued by an `/auth` module; per-route `@Roles()` + `RolesGuard` enforce RBAC; every service scopes Prisma queries by `kurinId` for tenant isolation (no generic tenant guard — route shapes differ too much for one to fit cleanly). A separate `x-admin-key`-guarded `/admin` surface handles platform-level operations not owned by any of the four in-app roles (creating a курінь + its first зв'язковий, populating the shared proby-program catalog, defining point mappings).

**Tech Stack:** Node.js + TypeScript, NestJS 10, Prisma 5 + PostgreSQL 16, argon2, @nestjs/jwt + passport-jwt, google-auth-library, class-validator/class-transformer, Jest + Supertest (e2e against a real test database), Docker Compose (local Postgres).

## Global Constraints

- No self-registration anywhere — all accounts are created by зв'язковий, or (for юнак key-field changes) proposed by курінний and approved by зв'язковий. (Spec: "Онбординг")
- Every query/service must scope by `kurinId` — tenant isolation is enforced in the service layer, not by a generic guard. (Spec: "Ролі та доступи")
- Курінний has zero visibility or control over виховник/зв'язковий accounts or assignments — only юнак records. (Spec: "Ролі та доступи")
- Proby-program version is set per курінь and is mutable; when changed, DONE points are carried over via an explicit point-to-point mapping table, and the original progress records are never deleted. (Spec: "Проби", "Модель даних")
- Progress confirm/unconfirm actions must be audit-logged (who, when, which action). (Spec: "Безпека")
- Passwords hashed with argon2; JWT sessions carry `role` and `kurinId` as claims. (Spec: "Автентифікація")
- PII minimization: only ім'я, прізвище, псевдо (optional), email, дата народження, phone/notes (optional), гурток/курінь linkage are stored on a user. (Spec: "Безпека")

## Assumptions (spec gaps filled during planning — flag if wrong)

1. **Platform-admin surface.** The spec's scenario 1 ("адміністратор платформи створює курінь") implies an actor outside the four in-app roles, but the Ролі table only defines юнак/виховник/курінний/зв'язковий. Since courinnyi/зв'язковий can't bootstrap the very first курінь or its first зв'язковий (chicken-and-egg), this plan adds a minimal `x-admin-key`-header-guarded `/admin` surface (static secret from an env var) for: creating a курінь + its first зв'язковий, and populating the shared proby-program catalog (`ПрограмаПроб`/`СтупіньПроби`/`КатегоріяПроби`/`ТочкаПроби`) and `ТочкаВідповідність`. This is not one of the four RBAC roles and has no UI in this plan — it's an ops-only surface Andrii calls directly (curl/Postman) when onboarding a new курінь or updating the catalog.
2. **Audit log table.** The spec's data model only stores the *current* confirm state on `ПрогресЮнака` (`підтвердив_id`, `дата_підтвердження`), but the Безпека section requires a full audit log of confirm/unconfirm actions. This plan adds a `ProgressAuditLog` table (append-only: junak, point, action, actor, timestamp) to satisfy that explicit requirement.
3. **"Другорядні дані" fields.** The spec's Ролі table says курінний can edit "нотатки, контактна інформація" on a юнак without approval, but no such fields exist in the data model. This plan adds nullable `notes` and `phone` fields to `Користувач` to give that sentence something concrete to act on.
4. **Point-mapping direction.** `ТочкаВідповідність` is modeled as one row per equivalent point pair (`oldPointId`/`newPointId`, one-to-one, per the spec's stated MVP limitation). The migration logic looks up a mapping from either side, so it works for a курінь moving in either direction (old→new or new→old), not just old→new.

---

### Task 1: Monorepo scaffold, NestJS app, Docker Postgres, health check

**Files:**
- Create: `package.json` (root)
- Create: `.gitignore` (root)
- Create: `docker-compose.yml`
- Create: `docker/init-test-db.sql`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/.env.example`
- Create: `apps/api/.gitignore`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/test/jest-e2e.json`
- Test: `apps/api/test/health.e2e-spec.ts`

**Interfaces:**
- Produces: booted Nest app on `PORT` (default 3000); `GET /health` → `{ status: 'ok' }`. All later tasks add modules to `apps/api/src/app.module.ts` and controllers/services under `apps/api/src/`.

- [ ] **Step 1: Root workspace files**

`package.json`:
```json
{
  "name": "plast-app",
  "private": true,
  "workspaces": ["apps/*"]
}
```

`.gitignore`:
```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 2: Docker Compose for local Postgres (dev + test databases)**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: plast
      POSTGRES_PASSWORD: plast
      POSTGRES_DB: plast_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql

volumes:
  pgdata:
```

`docker/init-test-db.sql`:
```sql
CREATE DATABASE plast_test;
```

Run: `docker compose up -d`
Expected: `docker compose ps` shows the `postgres` service as `running`/`healthy`.

- [ ] **Step 3: Scaffold the NestJS app skeleton**

`apps/api/package.json`:
```json
{
  "name": "api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json --runInBand",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "@nestjs/core": "^10.4.15",
    "@nestjs/config": "^3.3.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/platform-express": "^10.4.15",
    "@prisma/client": "^5.22.0",
    "argon2": "^0.41.1",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "google-auth-library": "^9.14.1",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.9",
    "@nestjs/testing": "^10.4.15",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.14",
    "@types/node": "^20.16.11",
    "@types/passport-jwt": "^4.0.1",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "prisma": "^5.22.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.3"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".spec.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": true
  }
}
```

`apps/api/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

`apps/api/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

`apps/api/.gitignore`:
```
node_modules/
dist/
.env
```

`apps/api/.env.example`:
```
DATABASE_URL="postgresql://plast:plast@localhost:5432/plast_dev"
DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test"
JWT_SECRET="dev-secret-change-me"
JWT_EXPIRES_IN="1d"
GOOGLE_CLIENT_ID=""
ADMIN_API_KEY="dev-admin-key-change-me"
PORT=3000
```

Copy `apps/api/.env.example` to `apps/api/.env` and adjust nothing for local dev.

`apps/api/src/main.ts`:
```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

`apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
export class AppModule {}
```

`apps/api/test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "..",
  "testEnvironment": "node",
  "testRegex": "test/.*\\.e2e-spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

Run: `cd apps/api && npm install`
Expected: installs without errors.

- [ ] **Step 4: Write the failing health-check e2e test**

`apps/api/test/health.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET) returns ok', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
```

Run: `cd apps/api && npm run test:e2e`
Expected: FAIL — `Cannot GET /health` (404), because `HealthController` doesn't exist yet.

- [ ] **Step 5: Implement the health controller and wire it in**

`apps/api/src/health/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
```

Modify `apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 6: Run the test again, verify it passes**

Run: `cd apps/api && npm run test:e2e`
Expected: PASS (1 passed).

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore docker-compose.yml docker/init-test-db.sql apps/api
git commit -m "Scaffold NestJS API monorepo with health check"
```

---

### Task 2: Prisma schema, PrismaService, DB smoke test

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/test/utils/clean-db.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/prisma.e2e-spec.ts`

**Interfaces:**
- Produces: `PrismaService` (injectable, extends `PrismaClient`), importable Prisma-generated types/enums from `@prisma/client` (`Role`, `KurinGender`, `ProbyProgramVersion`, `ProgressStatus`, `ProgressAction`, `ApprovalStatus`, `ApprovalActionType`), and `cleanDatabase(prisma)` test helper. Every later task's Prisma models and enums are defined here — nothing else touches `schema.prisma` for the rest of this plan.
- Consumes: Docker Postgres from Task 1 (`DATABASE_URL`, `DATABASE_URL_TEST`).

- [ ] **Step 1: Write the full Prisma schema**

`apps/api/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  JUNAK
  VYKHOVNYK
  KURINNYI
  ZVYAZKOVYI
}

enum KurinGender {
  MALE
  FEMALE
}

enum ProbyProgramVersion {
  OLD
  NEW
}

enum ProgressStatus {
  NOT_DONE
  DONE
}

enum ProgressAction {
  CONFIRM
  UNCONFIRM
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
}

enum ApprovalActionType {
  CHANGE_FULL_NAME
  CHANGE_BIRTH_DATE
  CHANGE_EMAIL
  CHANGE_HURTOK
  CREATE_JUNAK
}

model Kurin {
  id             String      @id @default(uuid())
  name           String
  kurinNumber    String
  gender         KurinGender
  stanytsia      String
  probyProgramId String
  probyProgram   ProbyProgram @relation(fields: [probyProgramId], references: [id])
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  hurtky Hurtok[]
  users  User[]
}

model Hurtok {
  id      String  @id @default(uuid())
  kurinId String
  kurin   Kurin   @relation(fields: [kurinId], references: [id])
  name    String
  number  String?

  junaky               User[]            @relation("JunakHurtok")
  vykhovnykAssignments VykhovnykHurtok[]
}

model User {
  id           String    @id @default(uuid())
  firstName    String
  lastName     String
  nickname     String?
  email        String    @unique
  passwordHash String?
  googleId     String?   @unique
  role         Role
  birthDate    DateTime?
  notes        String?
  phone        String?
  kurinId      String
  kurin        Kurin     @relation(fields: [kurinId], references: [id])
  hurtokId     String?
  hurtok       Hurtok?   @relation("JunakHurtok", fields: [hurtokId], references: [id])
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  vykhovnykAssignments VykhovnykHurtok[]  @relation("VykhovnykAssignments")
  progressEntries      JunakProgress[]    @relation("JunakProgressEntries")
  confirmedProgress    JunakProgress[]    @relation("ConfirmedByUser")
  auditLogEntries      ProgressAuditLog[] @relation("ActorAuditLogs")
  initiatedRequests    ApprovalRequest[]  @relation("InitiatedRequests")
  decidedRequests      ApprovalRequest[]  @relation("DecidedRequests")
}

model VykhovnykHurtok {
  id          String @id @default(uuid())
  vykhovnykId String
  vykhovnyk   User   @relation("VykhovnykAssignments", fields: [vykhovnykId], references: [id])
  hurtokId    String
  hurtok      Hurtok @relation(fields: [hurtokId], references: [id])

  @@unique([vykhovnykId, hurtokId])
}

model ProbyProgram {
  id      String               @id @default(uuid())
  version ProbyProgramVersion
  name    String

  stages ProbyStage[]
  kuriny Kurin[]
}

model ProbyStage {
  id        String       @id @default(uuid())
  programId String
  program   ProbyProgram @relation(fields: [programId], references: [id])
  order     Int
  name      String

  categories ProbyCategory[]
}

model ProbyCategory {
  id      String     @id @default(uuid())
  stageId String
  stage   ProbyStage @relation(fields: [stageId], references: [id])
  name    String

  points ProbyPoint[]
}

model ProbyPoint {
  id          String        @id @default(uuid())
  categoryId  String
  category    ProbyCategory @relation(fields: [categoryId], references: [id])
  order       Int
  description String

  progressEntries    JunakProgress[] @relation("PointProgress")
  transferredEntries JunakProgress[] @relation("TransferredFromPoint")
  mappingsAsOld      PointMapping[]  @relation("OldPoint")
  mappingsAsNew      PointMapping[]  @relation("NewPoint")
}

model PointMapping {
  id         String     @id @default(uuid())
  oldPointId String
  oldPoint   ProbyPoint @relation("OldPoint", fields: [oldPointId], references: [id])
  newPointId String
  newPoint   ProbyPoint @relation("NewPoint", fields: [newPointId], references: [id])

  @@unique([oldPointId, newPointId])
}

model JunakProgress {
  id                     String         @id @default(uuid())
  junakId                String
  junak                  User           @relation("JunakProgressEntries", fields: [junakId], references: [id])
  pointId                String
  point                  ProbyPoint     @relation("PointProgress", fields: [pointId], references: [id])
  status                 ProgressStatus @default(NOT_DONE)
  confirmedById          String?
  confirmedBy            User?          @relation("ConfirmedByUser", fields: [confirmedById], references: [id])
  confirmedAt            DateTime?
  transferredFromPointId String?
  transferredFromPoint   ProbyPoint?    @relation("TransferredFromPoint", fields: [transferredFromPointId], references: [id])

  @@unique([junakId, pointId])
}

model ProgressAuditLog {
  id        String         @id @default(uuid())
  junakId   String
  pointId   String
  action    ProgressAction
  actorId   String
  actor     User           @relation("ActorAuditLogs", fields: [actorId], references: [id])
  createdAt DateTime       @default(now())
}

model ApprovalRequest {
  id            String             @id @default(uuid())
  initiatedById String
  initiatedBy   User               @relation("InitiatedRequests", fields: [initiatedById], references: [id])
  junakId       String?
  actionType    ApprovalActionType
  oldData       Json?
  newData       Json
  status        ApprovalStatus     @default(PENDING)
  approvedById  String?
  approvedBy    User?              @relation("DecidedRequests", fields: [approvedById], references: [id])
  decidedAt     DateTime?
  createdAt     DateTime           @default(now())
}
```

- [ ] **Step 2: Generate and run the initial migration against the dev database**

Run: `cd apps/api && npx prisma migrate dev --name init`
Expected: creates `apps/api/prisma/migrations/<timestamp>_init/migration.sql`, applies it to `plast_dev`, and generates the Prisma client. No errors.

Also apply it to the test database:
Run: `cd apps/api && DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy` (or `env $(cat .env | grep DATABASE_URL_TEST) npx prisma migrate deploy` — any way of pointing `DATABASE_URL` at the test DB for this one command)
Expected: applies the same migration to `plast_test`, no errors.

- [ ] **Step 3: PrismaService and PrismaModule**

`apps/api/src/prisma/prisma.service.ts`:
```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`apps/api/src/prisma/prisma.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Modify `apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 4: Test database cleanup helper**

`apps/api/test/utils/clean-db.ts`:
```ts
import { PrismaClient } from '@prisma/client';

export async function cleanDatabase(prisma: PrismaClient) {
  await prisma.$transaction([
    prisma.progressAuditLog.deleteMany(),
    prisma.approvalRequest.deleteMany(),
    prisma.junakProgress.deleteMany(),
    prisma.pointMapping.deleteMany(),
    prisma.probyPoint.deleteMany(),
    prisma.probyCategory.deleteMany(),
    prisma.probyStage.deleteMany(),
    prisma.vykhovnykHurtok.deleteMany(),
    prisma.user.deleteMany(),
    prisma.hurtok.deleteMany(),
    prisma.kurin.deleteMany(),
    prisma.probyProgram.deleteMany(),
  ]);
}
```

- [ ] **Step 5: Write the failing smoke test**

`apps/api/test/prisma.e2e-spec.ts`:
```ts
import { PrismaClient, KurinGender, ProbyProgramVersion } from '@prisma/client';
import { cleanDatabase } from './utils/clean-db';

describe('Prisma smoke test (e2e)', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL_TEST } },
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  it('creates and reads back a Kurin linked to a ProbyProgram', async () => {
    const program = await prisma.probyProgram.create({
      data: { version: ProbyProgramVersion.OLD, name: 'Стара програма' },
    });

    const kurin = await prisma.kurin.create({
      data: {
        name: 'Тестовий курінь',
        kurinNumber: '1',
        gender: KurinGender.MALE,
        stanytsia: 'Тестова станиця',
        probyProgramId: program.id,
      },
    });

    const found = await prisma.kurin.findUnique({ where: { id: kurin.id } });
    expect(found?.name).toBe('Тестовий курінь');
    expect(found?.probyProgramId).toBe(program.id);
  });
});
```

Set `DATABASE_URL_TEST` in the shell before running (or load `apps/api/.env` via `dotenv` — for this task, export it manually):
Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: FAIL — Prisma client doesn't yet exist / types not generated if Step 2 was skipped, or passes trivially if Step 2 already ran. If it fails because the client wasn't generated, this confirms the test is wired correctly; run `npx prisma generate` and retry to confirm it then passes (this validates the schema, not application code, so the "red" phase here is about catching schema/migration mistakes rather than missing implementation).

- [ ] **Step 6: Run again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: PASS (2 passed, including Task 1's health test).

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma apps/api/src/prisma apps/api/src/app.module.ts apps/api/test
git commit -m "Add Prisma schema and PrismaService"
```

---

### Task 3: AuthService core (password hashing, JWT signing, Google token verification)

**Files:**
- Create: `apps/api/src/auth/google-token-verifier.service.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/auth/google-token-verifier.service.spec.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 2), `Role` enum from `@prisma/client` (Task 2).
- Produces: `AuthService` with `hashPassword(plain): Promise<string>`, `validatePassword(plain, hash): Promise<boolean>`, `signToken(userId, role, kurinId): { accessToken: string }`, `loginWithPassword(email, password): Promise<{ accessToken: string }>`, `loginWithGoogle(idToken): Promise<{ accessToken: string }>`. `JwtPayload` interface `{ sub: string; role: Role; kurinId: string }`. `GoogleTokenVerifierService.verify(idToken): Promise<{ email: string; sub: string } | null>`. Task 4 (login endpoint) and Task 5 (Google endpoint) wrap these in a controller; Task 6's `JwtStrategy` consumes `JwtPayload`'s shape.

- [ ] **Step 1: Write the failing unit tests**

`apps/api/src/auth/google-token-verifier.service.spec.ts`:
```ts
import { GoogleTokenVerifierService } from './google-token-verifier.service';

const verifyIdTokenMock = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
}));

describe('GoogleTokenVerifierService', () => {
  let service: GoogleTokenVerifierService;

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    service = new GoogleTokenVerifierService();
  });

  it('returns email and sub when the token is valid', async () => {
    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({ email: 'a@example.com', sub: 'google-sub-1' }),
    });

    const result = await service.verify('valid-token');
    expect(result).toEqual({ email: 'a@example.com', sub: 'google-sub-1' });
  });

  it('returns null when the payload has no email', async () => {
    verifyIdTokenMock.mockResolvedValue({ getPayload: () => ({ sub: 'google-sub-1' }) });
    const result = await service.verify('token-without-email');
    expect(result).toBeNull();
  });

  it('returns null when verification throws', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('invalid token'));
    const result = await service.verify('bad-token');
    expect(result).toBeNull();
  });
});
```

`apps/api/src/auth/auth.service.spec.ts`:
```ts
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let googleVerifier: { verify: jest.Mock };
  const jwtService = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '1h' } });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    googleVerifier = { verify: jest.fn() };
    service = new AuthService(prisma as any, jwtService, googleVerifier as any);
  });

  describe('hashPassword / validatePassword', () => {
    it('hashes a password and validates it against the hash', async () => {
      const hash = await service.hashPassword('correct-horse-battery-staple');
      await expect(service.validatePassword('correct-horse-battery-staple', hash)).resolves.toBe(true);
      await expect(service.validatePassword('wrong-password', hash)).resolves.toBe(false);
    });
  });

  describe('signToken', () => {
    it('signs a JWT carrying sub/role/kurinId and it decodes back', () => {
      const { accessToken } = service.signToken('user-1', Role.ZVYAZKOVYI, 'kurin-1');
      const decoded: any = jwtService.verify(accessToken);
      expect(decoded).toMatchObject({ sub: 'user-1', role: Role.ZVYAZKOVYI, kurinId: 'kurin-1' });
    });
  });

  describe('loginWithPassword', () => {
    it('returns a token when email and password match', async () => {
      const hash = await argon2.hash('secret123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        passwordHash: hash,
        role: Role.JUNAK,
        kurinId: 'kurin-1',
      });

      const result = await service.loginWithPassword('a@example.com', 'secret123');
      expect(result.accessToken).toEqual(expect.any(String));
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.loginWithPassword('nobody@example.com', 'x')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the password is wrong', async () => {
      const hash = await argon2.hash('secret123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        passwordHash: hash,
        role: Role.JUNAK,
        kurinId: 'kurin-1',
      });
      await expect(service.loginWithPassword('a@example.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('loginWithGoogle', () => {
    it('returns a token and links googleId when the verified email matches an existing user', async () => {
      googleVerifier.verify.mockResolvedValue({ email: 'a@example.com', sub: 'google-sub-1' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        googleId: null,
        role: Role.JUNAK,
        kurinId: 'kurin-1',
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.loginWithGoogle('fake-id-token');
      expect(result.accessToken).toEqual(expect.any(String));
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { googleId: 'google-sub-1' },
      });
    });

    it('throws UnauthorizedException when no account matches the verified email', async () => {
      googleVerifier.verify.mockResolvedValue({ email: 'nobody@example.com', sub: 'google-sub-2' });
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.loginWithGoogle('fake-id-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the Google token is invalid', async () => {
      googleVerifier.verify.mockResolvedValue(null);
      await expect(service.loginWithGoogle('bad-token')).rejects.toThrow(UnauthorizedException);
    });
  });
});
```

Run: `cd apps/api && npm test -- auth`
Expected: FAIL — `Cannot find module './google-token-verifier.service'` / `'./auth.service'`.

- [ ] **Step 2: Implement GoogleTokenVerifierService and AuthService**

`apps/api/src/auth/google-token-verifier.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleVerifiedIdentity {
  email: string;
  sub: string;
}

@Injectable()
export class GoogleTokenVerifierService {
  private readonly client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  async verify(idToken: string): Promise<GoogleVerifiedIdentity | null> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload?.email || !payload.sub) return null;
      return { email: payload.email, sub: payload.sub };
    } catch {
      return null;
    }
  }
}
```

`apps/api/src/auth/auth.service.ts`:
```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleTokenVerifierService } from './google-token-verifier.service';

export interface JwtPayload {
  sub: string;
  role: Role;
  kurinId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly googleVerifier: GoogleTokenVerifierService,
  ) {}

  hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  validatePassword(plain: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  signToken(userId: string, role: Role, kurinId: string): { accessToken: string } {
    const payload: JwtPayload = { sub: userId, role, kurinId };
    return { accessToken: this.jwtService.sign(payload) };
  }

  async loginWithPassword(email: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await this.validatePassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.signToken(user.id, user.role, user.kurinId);
  }

  async loginWithGoogle(idToken: string): Promise<{ accessToken: string }> {
    const verified = await this.googleVerifier.verify(idToken);
    if (!verified) {
      throw new UnauthorizedException('Invalid Google token');
    }
    const user = await this.prisma.user.findUnique({ where: { email: verified.email } });
    if (!user) {
      throw new UnauthorizedException('No account found for this email');
    }
    if (!user.googleId) {
      await this.prisma.user.update({ where: { id: user.id }, data: { googleId: verified.sub } });
    }
    return this.signToken(user.id, user.role, user.kurinId);
  }
}
```

- [ ] **Step 3: Run the tests again, verify they pass**

Run: `cd apps/api && npm test -- auth`
Expected: PASS (all `auth` unit tests green).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/auth
git commit -m "Add AuthService with password and Google login logic"
```

---

### Task 4: POST /auth/login + shared e2e test fixtures

**Files:**
- Create: `apps/api/src/auth/dto/login.dto.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/test/utils/fixtures.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthService.loginWithPassword` (Task 3).
- Produces: `POST /auth/login` → `{ accessToken: string }` (401 on bad credentials, 400 on invalid body). Test helpers `createProbyProgramTree(prisma, version, pointDescriptions)`, `createKurin(prisma, { probyProgramId, ... })`, `createUser(prisma, { role, kurinId, hurtokId?, email?, password? })`, `issueTokenFor(jwtService, user)` in `test/utils/fixtures.ts` — reused by every e2e test in every later task, unchanged.

- [ ] **Step 1: Write the shared fixtures helper**

`apps/api/test/utils/fixtures.ts`:
```ts
import { PrismaClient, Role, KurinGender, ProbyProgramVersion } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

export async function createProbyProgramTree(
  prisma: PrismaClient,
  version: ProbyProgramVersion,
  pointDescriptions: string[],
) {
  const program = await prisma.probyProgram.create({
    data: { version, name: `${version} program` },
  });
  const stage = await prisma.probyStage.create({
    data: { programId: program.id, order: 1, name: 'Stage 1' },
  });
  const category = await prisma.probyCategory.create({
    data: { stageId: stage.id, name: 'Category 1' },
  });
  const points = [];
  for (let i = 0; i < pointDescriptions.length; i++) {
    points.push(
      await prisma.probyPoint.create({
        data: { categoryId: category.id, order: i + 1, description: pointDescriptions[i] },
      }),
    );
  }
  return { program, stage, category, points };
}

export async function createKurin(
  prisma: PrismaClient,
  overrides: {
    probyProgramId: string;
    name?: string;
    kurinNumber?: string;
    gender?: KurinGender;
    stanytsia?: string;
  },
) {
  return prisma.kurin.create({
    data: {
      name: overrides.name ?? 'Test Kurin',
      kurinNumber: overrides.kurinNumber ?? '1',
      gender: overrides.gender ?? KurinGender.MALE,
      stanytsia: overrides.stanytsia ?? 'Test Stanytsia',
      probyProgramId: overrides.probyProgramId,
    },
  });
}

export async function createUser(
  prisma: PrismaClient,
  overrides: {
    role: Role;
    kurinId: string;
    hurtokId?: string;
    email?: string;
    password?: string;
  },
) {
  const email =
    overrides.email ?? `${overrides.role.toLowerCase()}-${Date.now()}-${Math.random()}@example.com`;
  const passwordHash = overrides.password ? await argon2.hash(overrides.password) : undefined;
  return prisma.user.create({
    data: {
      firstName: 'Test',
      lastName: 'User',
      email,
      passwordHash,
      role: overrides.role,
      kurinId: overrides.kurinId,
      hurtokId: overrides.hurtokId,
    },
  });
}

export function issueTokenFor(
  jwtService: JwtService,
  user: { id: string; role: Role; kurinId: string },
) {
  return jwtService.sign({ sub: user.id, role: user.role, kurinId: user.kurinId });
}
```

- [ ] **Step 2: Write the failing e2e test**

`apps/api/test/auth.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser } from './utils/fixtures';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  describe('POST /auth/login', () => {
    it('returns an access token for correct email+password', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      await createUser(prisma, {
        role: Role.ZVYAZKOVYI,
        kurinId: kurin.id,
        email: 'zvyazkovyi@example.com',
        password: 'secret123',
      });

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'zvyazkovyi@example.com', password: 'secret123' })
        .expect(201);

      expect(response.body.accessToken).toEqual(expect.any(String));
    });

    it('returns 401 for a wrong password', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      await createUser(prisma, {
        role: Role.ZVYAZKOVYI,
        kurinId: kurin.id,
        email: 'zvyazkovyi2@example.com',
        password: 'secret123',
      });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'zvyazkovyi2@example.com', password: 'wrong-password' })
        .expect(401);
    });

    it('returns 401 for an unknown email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever1' })
        .expect(401);
    });

    it('returns 400 when the body fails validation', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);
    });
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- auth`
Expected: FAIL — `POST /auth/login` doesn't exist (404), since `AuthModule` isn't wired in yet.

- [ ] **Step 3: Implement the login DTO, controller, and module**

`apps/api/src/auth/dto/login.dto.ts`:
```ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

`apps/api/src/auth/auth.controller.ts`:
```ts
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.loginWithPassword(dto.email, dto.password);
  }
}
```

`apps/api/src/auth/auth.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleTokenVerifierService } from './google-token-verifier.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '1d' },
    }),
  ],
  providers: [AuthService, GoogleTokenVerifierService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
```

Modify `apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 4: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- auth`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth apps/api/src/app.module.ts apps/api/test
git commit -m "Add POST /auth/login and shared e2e fixtures"
```

---

### Task 5: POST /auth/google

**Files:**
- Create: `apps/api/src/auth/dto/google-login.dto.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Test: `apps/api/test/auth-google.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthService.loginWithGoogle` (Task 3), `GoogleTokenVerifierService` (Task 3, overridden in this test via Nest's `overrideProvider`).
- Produces: `POST /auth/google` → `{ accessToken: string }` (401 if no matching account or invalid token, 400 on invalid body).

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/auth-google.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { GoogleTokenVerifierService } from '../src/auth/google-token-verifier.service';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser } from './utils/fixtures';

describe('Auth Google login (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });
  const verifyMock = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleTokenVerifierService)
      .useValue({ verify: verifyMock })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    verifyMock.mockReset();
    await cleanDatabase(prisma);
  });

  it('returns an access token when the verified email matches an existing user', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, email: 'junak@example.com' });
    verifyMock.mockResolvedValue({ email: 'junak@example.com', sub: 'google-sub-1' });

    const response = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'fake-google-token' })
      .expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
  });

  it('returns 401 when no account matches the verified email', async () => {
    verifyMock.mockResolvedValue({ email: 'unknown@example.com', sub: 'google-sub-2' });

    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'fake-google-token' })
      .expect(401);
  });

  it('returns 401 when the Google token is invalid', async () => {
    verifyMock.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'bad-token' })
      .expect(401);
  });

  it('returns 400 when idToken is missing', async () => {
    await request(app.getHttpServer()).post('/auth/google').send({}).expect(400);
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- auth-google`
Expected: FAIL — `POST /auth/google` doesn't exist (404).

- [ ] **Step 2: Add the DTO and wire the controller route**

`apps/api/src/auth/dto/google-login.dto.ts`:
```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
```

Modify `apps/api/src/auth/auth.controller.ts`:
```ts
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.loginWithPassword(dto.email, dto.password);
  }

  @Post('google')
  loginWithGoogle(@Body() dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto.idToken);
  }
}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- auth-google`
Expected: PASS (4 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/auth apps/api/test/auth-google.e2e-spec.ts
git commit -m "Add POST /auth/google"
```

---

### Task 6: JwtAuthGuard, RolesGuard, CurrentUser decorator

**Files:**
- Create: `apps/api/src/auth/strategies/jwt.strategy.ts`
- Create: `apps/api/src/common/guards/jwt-auth.guard.ts`
- Create: `apps/api/src/common/guards/roles.guard.ts`
- Create: `apps/api/src/common/decorators/roles.decorator.ts`
- Create: `apps/api/src/common/decorators/current-user.decorator.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Test: `apps/api/test/guards.e2e-spec.ts`

**Interfaces:**
- Consumes: `JwtPayload` (Task 3), `Role` enum (Task 2).
- Produces: `JwtAuthGuard` (validates Bearer JWT, populates `request.user`), `@Roles(...roles: Role[])` decorator + `RolesGuard` (403 if `request.user.role` isn't in the list; passes through when no `@Roles` is set), `CurrentUserPayload` interface `{ userId: string; role: Role; kurinId: string }`, `@CurrentUser()` param decorator. Every controller from Task 7 onward uses `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(...)`, and `@CurrentUser()`.

- [ ] **Step 1: Write the failing e2e test against a throwaway controller**

`apps/api/test/guards.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { Roles } from '../src/common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../src/common/decorators/current-user.decorator';

@Controller('test-protected')
class TestProtectedController {
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ZVYAZKOVYI)
  @Get('zvyazkovyi-only')
  zvyazkovyiOnly(@CurrentUser() user: CurrentUserPayload) {
    return { userId: user.userId, role: user.role, kurinId: user.kurinId };
  }

  @UseGuards(JwtAuthGuard)
  @Get('any-role')
  anyRole(@CurrentUser() user: CurrentUserPayload) {
    return { userId: user.userId };
  }
}

describe('Auth guards (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestProtectedController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = moduleRef.get(JwtService, { strict: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 with no token', async () => {
    await request(app.getHttpServer()).get('/test-protected/any-role').expect(401);
  });

  it('returns 200 with any valid token on a route with no @Roles', async () => {
    const token = jwtService.sign({ sub: 'user-1', role: Role.JUNAK, kurinId: 'kurin-1' });
    await request(app.getHttpServer())
      .get('/test-protected/any-role')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('returns 403 when the role does not match @Roles', async () => {
    const token = jwtService.sign({ sub: 'user-1', role: Role.JUNAK, kurinId: 'kurin-1' });
    await request(app.getHttpServer())
      .get('/test-protected/zvyazkovyi-only')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 200 and the decoded user when the role matches @Roles', async () => {
    const token = jwtService.sign({ sub: 'user-1', role: Role.ZVYAZKOVYI, kurinId: 'kurin-1' });
    const response = await request(app.getHttpServer())
      .get('/test-protected/zvyazkovyi-only')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ userId: 'user-1', role: Role.ZVYAZKOVYI, kurinId: 'kurin-1' });
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- guards`
Expected: FAIL — `JwtAuthGuard`/`RolesGuard`/`Roles`/`CurrentUser` modules don't exist yet.

- [ ] **Step 2: Implement the strategy, guards, and decorators**

`apps/api/src/auth/strategies/jwt.strategy.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  validate(payload: JwtPayload) {
    return { userId: payload.sub, role: payload.role, kurinId: payload.kurinId };
  }
}
```

`apps/api/src/common/guards/jwt-auth.guard.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

`apps/api/src/common/decorators/current-user.decorator.ts`:
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

`apps/api/src/common/decorators/roles.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

`apps/api/src/common/guards/roles.guard.ts`:
```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
```

Modify `apps/api/src/auth/auth.module.ts` (register `JwtStrategy` as a provider):
```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleTokenVerifierService } from './google-token-verifier.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '1d' },
    }),
  ],
  providers: [AuthService, GoogleTokenVerifierService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- guards`
Expected: PASS (4 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/auth apps/api/src/common apps/api/test/guards.e2e-spec.ts
git commit -m "Add JwtAuthGuard, RolesGuard, and CurrentUser decorator"
```

---

### Task 7: Admin — AdminKeyGuard, create Kurin, bootstrap first Zvyazkovyi

**Files:**
- Create: `apps/api/src/common/guards/admin-key.guard.ts`
- Create: `apps/api/src/admin/dto/create-kurin.dto.ts`
- Create: `apps/api/src/admin/dto/create-admin-user.dto.ts`
- Create: `apps/api/src/admin/kurins-admin.service.ts`
- Create: `apps/api/src/admin/kurins-admin.controller.ts`
- Create: `apps/api/src/admin/admin.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/admin-kurins.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthService.hashPassword` (Task 3), `KurinGender`/`Role` enums (Task 2).
- Produces: `AdminKeyGuard` (checks `x-admin-key` header against `process.env.ADMIN_API_KEY`, 401 otherwise) — reused by Tasks 8 and 9. `POST /admin/kurins` → creates a Kurin (404 if `probyProgramId` doesn't exist). `POST /admin/kurins/zvyazkovyi` → creates the first ZVYAZKOVYI user for a kurin (404 if `kurinId` doesn't exist).

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/admin-kurins.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, ProbyProgramVersion, KurinGender } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree } from './utils/fixtures';

describe('Admin kurins (e2e)', () => {
  let app: INestApplication;
  let adminKey: string;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    adminKey = process.env.ADMIN_API_KEY ?? 'dev-admin-key-change-me';
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  describe('POST /admin/kurins', () => {
    it('creates a kurin when the admin key is correct', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);

      const response = await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .send({
          name: 'Курінь Тестовий',
          kurinNumber: '5',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
        })
        .expect(201);

      expect(response.body.id).toEqual(expect.any(String));
      expect(response.body.name).toBe('Курінь Тестовий');
    });

    it('returns 401 with a missing or wrong admin key', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const payload = {
        name: 'Курінь Тестовий',
        kurinNumber: '5',
        gender: KurinGender.MALE,
        stanytsia: 'Львів',
        probyProgramId: program.id,
      };

      await request(app.getHttpServer()).post('/admin/kurins').send(payload).expect(401);
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', 'wrong-key')
        .send(payload)
        .expect(401);
    });

    it('returns 404 when probyProgramId does not exist', async () => {
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .send({
          name: 'Курінь Тестовий',
          kurinNumber: '5',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: '00000000-0000-0000-0000-000000000000',
        })
        .expect(404);
    });
  });

  describe('POST /admin/kurins/zvyazkovyi', () => {
    it('creates the first zvyazkovyi for a kurin, who can then log in', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await prisma.kurin.create({
        data: {
          name: 'Курінь',
          kurinNumber: '5',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/admin/kurins/zvyazkovyi')
        .set('x-admin-key', adminKey)
        .send({
          firstName: 'Іван',
          lastName: 'Франко',
          email: 'zvyazkovyi-bootstrap@example.com',
          password: 'secret123',
          kurinId: kurin.id,
        })
        .expect(201);

      expect(response.body.role).toBe('ZVYAZKOVYI');

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'zvyazkovyi-bootstrap@example.com', password: 'secret123' })
        .expect(201);
      expect(loginResponse.body.accessToken).toEqual(expect.any(String));
    });

    it('returns 404 when kurinId does not exist', async () => {
      await request(app.getHttpServer())
        .post('/admin/kurins/zvyazkovyi')
        .set('x-admin-key', adminKey)
        .send({
          firstName: 'Іван',
          lastName: 'Франко',
          email: 'nobody@example.com',
          password: 'secret123',
          kurinId: '00000000-0000-0000-0000-000000000000',
        })
        .expect(404);
    });
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- admin-kurins`
Expected: FAIL — `/admin/kurins*` routes don't exist (404s where 401/201/etc. expected).

- [ ] **Step 2: Implement the guard, DTOs, service, controller, and module**

`apps/api/src/common/guards/admin-key.guard.ts`:
```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const key = request.headers['x-admin-key'];
    if (!key || key !== process.env.ADMIN_API_KEY) {
      throw new UnauthorizedException('Invalid admin key');
    }
    return true;
  }
}
```

`apps/api/src/admin/dto/create-kurin.dto.ts`:
```ts
import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { KurinGender } from '@prisma/client';

export class CreateKurinDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() kurinNumber: string;
  @IsEnum(KurinGender) gender: KurinGender;
  @IsString() @IsNotEmpty() stanytsia: string;
  @IsUUID() probyProgramId: string;
}
```

`apps/api/src/admin/dto/create-admin-user.dto.ts`:
```ts
import { IsEmail, IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAdminUserDto {
  @IsString() @IsNotEmpty() firstName: string;
  @IsString() @IsNotEmpty() lastName: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsUUID() kurinId: string;
}
```

`apps/api/src/admin/kurins-admin.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateKurinDto } from './dto/create-kurin.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';

@Injectable()
export class KurinsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async createKurin(dto: CreateKurinDto) {
    const program = await this.prisma.probyProgram.findUnique({ where: { id: dto.probyProgramId } });
    if (!program) {
      throw new NotFoundException('Proby program not found');
    }
    return this.prisma.kurin.create({ data: dto });
  }

  async createFirstZvyazkovyi(dto: CreateAdminUserDto) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: dto.kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    const passwordHash = await this.authService.hashPassword(dto.password);
    return this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        passwordHash,
        role: Role.ZVYAZKOVYI,
        kurinId: dto.kurinId,
      },
    });
  }
}
```

`apps/api/src/admin/kurins-admin.controller.ts`:
```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { CreateKurinDto } from './dto/create-kurin.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { KurinsAdminService } from './kurins-admin.service';

@UseGuards(AdminKeyGuard)
@Controller('admin/kurins')
export class KurinsAdminController {
  constructor(private readonly service: KurinsAdminService) {}

  @Post()
  create(@Body() dto: CreateKurinDto) {
    return this.service.createKurin(dto);
  }

  @Post('zvyazkovyi')
  createZvyazkovyi(@Body() dto: CreateAdminUserDto) {
    return this.service.createFirstZvyazkovyi(dto);
  }
}
```

`apps/api/src/admin/admin.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KurinsAdminController } from './kurins-admin.controller';
import { KurinsAdminService } from './kurins-admin.service';

@Module({
  imports: [AuthModule],
  controllers: [KurinsAdminController],
  providers: [KurinsAdminService],
})
export class AdminModule {}
```

Modify `apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, AdminModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- admin-kurins`
Expected: PASS (5 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/admin apps/api/src/common/guards/admin-key.guard.ts apps/api/src/app.module.ts apps/api/test/admin-kurins.e2e-spec.ts
git commit -m "Add admin endpoints: create kurin, bootstrap first zvyazkovyi"
```

---

### Task 8: Admin — proby catalog tree (program / stage / category / point)

**Files:**
- Create: `apps/api/src/admin/dto/create-proby-program.dto.ts`
- Create: `apps/api/src/admin/dto/create-proby-stage.dto.ts`
- Create: `apps/api/src/admin/dto/create-proby-category.dto.ts`
- Create: `apps/api/src/admin/dto/create-proby-point.dto.ts`
- Create: `apps/api/src/admin/proby-catalog-admin.service.ts`
- Create: `apps/api/src/admin/proby-catalog-admin.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Test: `apps/api/test/admin-proby-catalog.e2e-spec.ts`

**Interfaces:**
- Consumes: `AdminKeyGuard` (Task 7).
- Produces: `POST /admin/proby-programs`, `POST /admin/proby-programs/:programId/stages`, `POST /admin/proby-stages/:stageId/categories`, `POST /admin/proby-categories/:categoryId/points` — each 404s if its parent id doesn't exist. This is how Andrii populates the "стара"/"нова" proby catalogs Andrii will hand over as reference material.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/admin-proby-catalog.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';

describe('Admin proby catalog (e2e)', () => {
  let app: INestApplication;
  let adminKey: string;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    adminKey = process.env.ADMIN_API_KEY ?? 'dev-admin-key-change-me';
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  it('builds a full program -> stage -> category -> point tree', async () => {
    const programRes = await request(app.getHttpServer())
      .post('/admin/proby-programs')
      .set('x-admin-key', adminKey)
      .send({ version: ProbyProgramVersion.OLD, name: 'Стара програма' })
      .expect(201);

    const stageRes = await request(app.getHttpServer())
      .post(`/admin/proby-programs/${programRes.body.id}/stages`)
      .set('x-admin-key', adminKey)
      .send({ order: 1, name: 'Перший ступінь' })
      .expect(201);

    const categoryRes = await request(app.getHttpServer())
      .post(`/admin/proby-stages/${stageRes.body.id}/categories`)
      .set('x-admin-key', adminKey)
      .send({ name: 'Практичне пластування' })
      .expect(201);

    const pointRes = await request(app.getHttpServer())
      .post(`/admin/proby-categories/${categoryRes.body.id}/points`)
      .set('x-admin-key', adminKey)
      .send({ order: 1, description: "В'язати 5 вузлів" })
      .expect(201);

    expect(pointRes.body.categoryId).toBe(categoryRes.body.id);
  });

  it('returns 404 when creating a stage under a nonexistent program', async () => {
    await request(app.getHttpServer())
      .post('/admin/proby-programs/00000000-0000-0000-0000-000000000000/stages')
      .set('x-admin-key', adminKey)
      .send({ order: 1, name: 'Перший ступінь' })
      .expect(404);
  });

  it('returns 401 without the admin key', async () => {
    await request(app.getHttpServer())
      .post('/admin/proby-programs')
      .send({ version: ProbyProgramVersion.OLD, name: 'Стара програма' })
      .expect(401);
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- admin-proby-catalog`
Expected: FAIL — none of the `/admin/proby-*` routes exist yet.

- [ ] **Step 2: Implement the DTOs, service, and controller**

`apps/api/src/admin/dto/create-proby-program.dto.ts`:
```ts
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ProbyProgramVersion } from '@prisma/client';

export class CreateProbyProgramDto {
  @IsEnum(ProbyProgramVersion) version: ProbyProgramVersion;
  @IsString() @IsNotEmpty() name: string;
}
```

`apps/api/src/admin/dto/create-proby-stage.dto.ts`:
```ts
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateProbyStageDto {
  @IsInt() @Min(1) order: number;
  @IsString() @IsNotEmpty() name: string;
}
```

`apps/api/src/admin/dto/create-proby-category.dto.ts`:
```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateProbyCategoryDto {
  @IsString() @IsNotEmpty() name: string;
}
```

`apps/api/src/admin/dto/create-proby-point.dto.ts`:
```ts
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateProbyPointDto {
  @IsInt() @Min(1) order: number;
  @IsString() @IsNotEmpty() description: string;
}
```

`apps/api/src/admin/proby-catalog-admin.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProbyProgramDto } from './dto/create-proby-program.dto';
import { CreateProbyStageDto } from './dto/create-proby-stage.dto';
import { CreateProbyCategoryDto } from './dto/create-proby-category.dto';
import { CreateProbyPointDto } from './dto/create-proby-point.dto';

@Injectable()
export class ProbyCatalogAdminService {
  constructor(private readonly prisma: PrismaService) {}

  createProgram(dto: CreateProbyProgramDto) {
    return this.prisma.probyProgram.create({ data: dto });
  }

  async createStage(programId: string, dto: CreateProbyStageDto) {
    const program = await this.prisma.probyProgram.findUnique({ where: { id: programId } });
    if (!program) throw new NotFoundException('Proby program not found');
    return this.prisma.probyStage.create({ data: { ...dto, programId } });
  }

  async createCategory(stageId: string, dto: CreateProbyCategoryDto) {
    const stage = await this.prisma.probyStage.findUnique({ where: { id: stageId } });
    if (!stage) throw new NotFoundException('Proby stage not found');
    return this.prisma.probyCategory.create({ data: { ...dto, stageId } });
  }

  async createPoint(categoryId: string, dto: CreateProbyPointDto) {
    const category = await this.prisma.probyCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Proby category not found');
    return this.prisma.probyPoint.create({ data: { ...dto, categoryId } });
  }
}
```

`apps/api/src/admin/proby-catalog-admin.controller.ts`:
```ts
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { ProbyCatalogAdminService } from './proby-catalog-admin.service';
import { CreateProbyProgramDto } from './dto/create-proby-program.dto';
import { CreateProbyStageDto } from './dto/create-proby-stage.dto';
import { CreateProbyCategoryDto } from './dto/create-proby-category.dto';
import { CreateProbyPointDto } from './dto/create-proby-point.dto';

@UseGuards(AdminKeyGuard)
@Controller('admin')
export class ProbyCatalogAdminController {
  constructor(private readonly service: ProbyCatalogAdminService) {}

  @Post('proby-programs')
  createProgram(@Body() dto: CreateProbyProgramDto) {
    return this.service.createProgram(dto);
  }

  @Post('proby-programs/:programId/stages')
  createStage(@Param('programId') programId: string, @Body() dto: CreateProbyStageDto) {
    return this.service.createStage(programId, dto);
  }

  @Post('proby-stages/:stageId/categories')
  createCategory(@Param('stageId') stageId: string, @Body() dto: CreateProbyCategoryDto) {
    return this.service.createCategory(stageId, dto);
  }

  @Post('proby-categories/:categoryId/points')
  createPoint(@Param('categoryId') categoryId: string, @Body() dto: CreateProbyPointDto) {
    return this.service.createPoint(categoryId, dto);
  }
}
```

Modify `apps/api/src/admin/admin.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KurinsAdminController } from './kurins-admin.controller';
import { KurinsAdminService } from './kurins-admin.service';
import { ProbyCatalogAdminController } from './proby-catalog-admin.controller';
import { ProbyCatalogAdminService } from './proby-catalog-admin.service';

@Module({
  imports: [AuthModule],
  controllers: [KurinsAdminController, ProbyCatalogAdminController],
  providers: [KurinsAdminService, ProbyCatalogAdminService],
})
export class AdminModule {}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- admin-proby-catalog`
Expected: PASS (3 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/admin apps/api/test/admin-proby-catalog.e2e-spec.ts
git commit -m "Add admin proby catalog endpoints"
```

---

### Task 9: Admin — PointMapping endpoint

**Files:**
- Create: `apps/api/src/admin/dto/create-point-mapping.dto.ts`
- Create: `apps/api/src/admin/point-mapping-admin.service.ts`
- Create: `apps/api/src/admin/point-mapping-admin.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Test: `apps/api/test/admin-point-mapping.e2e-spec.ts`

**Interfaces:**
- Consumes: `AdminKeyGuard` (Task 7), `ProbyPoint` model (Task 2).
- Produces: `POST /admin/point-mappings` → creates a `PointMapping` row (404 if either point doesn't exist, 409 on a duplicate pair). This is the `ТочкаВідповідність` table the migration logic in Task 16 reads from.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/admin-point-mapping.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree } from './utils/fixtures';

describe('Admin point mappings (e2e)', () => {
  let app: INestApplication;
  let adminKey: string;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    adminKey = process.env.ADMIN_API_KEY ?? 'dev-admin-key-change-me';
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  it('creates a mapping between an old and a new point', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Вузли (стара)']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Вузли (нова)']);

    const response = await request(app.getHttpServer())
      .post('/admin/point-mappings')
      .set('x-admin-key', adminKey)
      .send({ oldPointId: oldTree.points[0].id, newPointId: newTree.points[0].id })
      .expect(201);

    expect(response.body.oldPointId).toBe(oldTree.points[0].id);
    expect(response.body.newPointId).toBe(newTree.points[0].id);
  });

  it('returns 404 when either point does not exist', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Вузли (стара)']);

    await request(app.getHttpServer())
      .post('/admin/point-mappings')
      .set('x-admin-key', adminKey)
      .send({ oldPointId: oldTree.points[0].id, newPointId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);
  });

  it('returns 409 when the same mapping is created twice', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Вузли (стара)']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Вузли (нова)']);

    await request(app.getHttpServer())
      .post('/admin/point-mappings')
      .set('x-admin-key', adminKey)
      .send({ oldPointId: oldTree.points[0].id, newPointId: newTree.points[0].id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/admin/point-mappings')
      .set('x-admin-key', adminKey)
      .send({ oldPointId: oldTree.points[0].id, newPointId: newTree.points[0].id })
      .expect(409);
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- admin-point-mapping`
Expected: FAIL — `/admin/point-mappings` doesn't exist yet.

- [ ] **Step 2: Implement the DTO, service, and controller**

`apps/api/src/admin/dto/create-point-mapping.dto.ts`:
```ts
import { IsUUID } from 'class-validator';

export class CreatePointMappingDto {
  @IsUUID() oldPointId: string;
  @IsUUID() newPointId: string;
}
```

`apps/api/src/admin/point-mapping-admin.service.ts`:
```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePointMappingDto } from './dto/create-point-mapping.dto';

@Injectable()
export class PointMappingAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePointMappingDto) {
    const [oldPoint, newPoint] = await Promise.all([
      this.prisma.probyPoint.findUnique({ where: { id: dto.oldPointId } }),
      this.prisma.probyPoint.findUnique({ where: { id: dto.newPointId } }),
    ]);
    if (!oldPoint || !newPoint) {
      throw new NotFoundException('One or both proby points not found');
    }
    try {
      return await this.prisma.pointMapping.create({ data: dto });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('This point mapping already exists');
      }
      throw err;
    }
  }
}
```

`apps/api/src/admin/point-mapping-admin.controller.ts`:
```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { PointMappingAdminService } from './point-mapping-admin.service';
import { CreatePointMappingDto } from './dto/create-point-mapping.dto';

@UseGuards(AdminKeyGuard)
@Controller('admin/point-mappings')
export class PointMappingAdminController {
  constructor(private readonly service: PointMappingAdminService) {}

  @Post()
  create(@Body() dto: CreatePointMappingDto) {
    return this.service.create(dto);
  }
}
```

Modify `apps/api/src/admin/admin.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KurinsAdminController } from './kurins-admin.controller';
import { KurinsAdminService } from './kurins-admin.service';
import { ProbyCatalogAdminController } from './proby-catalog-admin.controller';
import { ProbyCatalogAdminService } from './proby-catalog-admin.service';
import { PointMappingAdminController } from './point-mapping-admin.controller';
import { PointMappingAdminService } from './point-mapping-admin.service';

@Module({
  imports: [AuthModule],
  controllers: [KurinsAdminController, ProbyCatalogAdminController, PointMappingAdminController],
  providers: [KurinsAdminService, ProbyCatalogAdminService, PointMappingAdminService],
})
export class AdminModule {}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- admin-point-mapping`
Expected: PASS (3 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/admin apps/api/test/admin-point-mapping.e2e-spec.ts
git commit -m "Add admin point mapping endpoint"
```

---

### Task 10: Hurtky module (create + list, tenant-scoped)

**Files:**
- Create: `apps/api/src/hurtky/dto/create-hurtok.dto.ts`
- Create: `apps/api/src/hurtky/hurtky.service.ts`
- Create: `apps/api/src/hurtky/hurtky.controller.ts`
- Create: `apps/api/src/hurtky/hurtky.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/hurtky.e2e-spec.ts`

**Interfaces:**
- Consumes: `JwtAuthGuard`/`RolesGuard`/`@Roles`/`@CurrentUser`/`CurrentUserPayload` (Task 6), `issueTokenFor`/`createKurin`/`createUser`/`createProbyProgramTree` (Task 4).
- Produces: `POST /hurtky` (ZVYAZKOVYI only) → creates a Hurtok scoped to `user.kurinId`. `GET /hurtky` (any authenticated role) → lists only the caller's own kurin's hurtky. This is the first task that demonstrates the "no generic tenant guard — services filter by `kurinId`" approach from the Architecture section; every later module scoped by kurin follows this same pattern.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/hurtky.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Hurtky (e2e)', () => {
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

  it('lets zvyazkovyi create a hurtok in their own kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post('/hurtky')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Орлики', number: '3' })
      .expect(201);

    expect(response.body.kurinId).toBe(kurin.id);
    expect(response.body.number).toBe('3');
  });

  it('forbids a vykhovnyk from creating a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .post('/hurtky')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Орлики' })
      .expect(403);
  });

  it("only lists hurtky belonging to the caller's own kurin", async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'Kurin A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'Kurin B' });
    await prisma.hurtok.create({ data: { name: 'Hurtok A', kurinId: kurinA.id } });
    await prisma.hurtok.create({ data: { name: 'Hurtok B', kurinId: kurinB.id } });

    const userA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, userA);

    const response = await request(app.getHttpServer())
      .get('/hurtky')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].name).toBe('Hurtok A');
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer()).get('/hurtky').expect(401);
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- hurtky`
Expected: FAIL — `/hurtky` doesn't exist yet.

- [ ] **Step 2: Implement the DTO, service, controller, and module**

`apps/api/src/hurtky/dto/create-hurtok.dto.ts`:
```ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateHurtokDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() number?: string;
}
```

`apps/api/src/hurtky/hurtky.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHurtokDto } from './dto/create-hurtok.dto';

@Injectable()
export class HurtkyService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateHurtokDto, kurinId: string) {
    return this.prisma.hurtok.create({ data: { name: dto.name, number: dto.number, kurinId } });
  }

  listForKurin(kurinId: string) {
    return this.prisma.hurtok.findMany({ where: { kurinId } });
  }
}
```

`apps/api/src/hurtky/hurtky.controller.ts`:
```ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HurtkyService } from './hurtky.service';
import { CreateHurtokDto } from './dto/create-hurtok.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hurtky')
export class HurtkyController {
  constructor(private readonly service: HurtkyService) {}

  @Roles(Role.ZVYAZKOVYI)
  @Post()
  create(@Body() dto: CreateHurtokDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user.kurinId);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.listForKurin(user.kurinId);
  }
}
```

`apps/api/src/hurtky/hurtky.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HurtkyController } from './hurtky.controller';
import { HurtkyService } from './hurtky.service';

@Module({
  imports: [AuthModule],
  controllers: [HurtkyController],
  providers: [HurtkyService],
})
export class HurtkyModule {}
```

Modify `apps/api/src/app.module.ts` (add `HurtkyModule` to `imports`):
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { HurtkyModule } from './hurtky/hurtky.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AdminModule,
    HurtkyModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- hurtky`
Expected: PASS (4 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/hurtky apps/api/src/app.module.ts apps/api/test/hurtky.e2e-spec.ts
git commit -m "Add Hurtky module with tenant-scoped create/list"
```

---

### Task 11: Users module — create юнак/виховник/курінний, GET /users/me

**Files:**
- Create: `apps/api/src/users/dto/create-user.dto.ts`
- Create: `apps/api/src/users/users.service.ts`
- Create: `apps/api/src/users/users.controller.ts`
- Create: `apps/api/src/users/users.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/users.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthService.hashPassword` (Task 3), guards/decorators (Task 6).
- Produces: `POST /users` (ZVYAZKOVYI only) → creates a JUNAK/VYKHOVNYK/KURINNYI in the caller's own kurin (400 if trying to create another ZVYAZKOVYI, 400 if JUNAK has no `hurtokId`, 404 if `hurtokId` belongs to another kurin). `GET /users/me` (any role) → the caller's own profile, password hash excluded. Task 20 adds a `PATCH /users/:id/contact-info` route to this same controller/service.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/users.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Users (e2e)', () => {
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

  describe('POST /users', () => {
    it('lets zvyazkovyi create a vykhovnyk', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
      const token = issueTokenFor(jwtService, zvyazkovyi);

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Марія', lastName: 'Іванко', email: 'vykhovnyk@example.com', role: Role.VYKHOVNYK })
        .expect(201);

      expect(response.body.role).toBe(Role.VYKHOVNYK);
      expect(response.body.kurinId).toBe(kurin.id);
    });

    it('requires hurtokId for JUNAK and rejects a hurtok from another kurin', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
      const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
      const hurtokB = await prisma.hurtok.create({ data: { name: 'Hurtok B', kurinId: kurinB.id } });
      const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
      const token = issueTokenFor(jwtService, zvyazkovyiA);

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Юн', lastName: 'Ак', email: 'junak-nohurtok@example.com', role: Role.JUNAK })
        .expect(400);

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Юн',
          lastName: 'Ак',
          email: 'junak-crosstenant@example.com',
          role: Role.JUNAK,
          hurtokId: hurtokB.id,
        })
        .expect(404);
    });

    it('forbids creating another ZVYAZKOVYI through this endpoint', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
      const token = issueTokenFor(jwtService, zvyazkovyi);

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'X', lastName: 'Y', email: 'x@example.com', role: Role.ZVYAZKOVYI })
        .expect(400);
    });

    it('forbids a vykhovnyk from creating users', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
      const token = issueTokenFor(jwtService, vykhovnyk);

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'X', lastName: 'Y', email: 'x2@example.com', role: Role.JUNAK })
        .expect(403);
    });
  });

  describe('GET /users/me', () => {
    it("returns the caller's own profile without the password hash", async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      const junak = await createUser(prisma, {
        role: Role.JUNAK,
        kurinId: kurin.id,
        email: 'me@example.com',
        password: 'secret123',
      });
      const token = issueTokenFor(jwtService, junak);

      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.email).toBe('me@example.com');
      expect(response.body.passwordHash).toBeUndefined();
    });
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- users`
Expected: FAIL — `/users*` routes don't exist yet.

- [ ] **Step 2: Implement the DTO, service, controller, and module**

`apps/api/src/users/dto/create-user.dto.ts`:
```ts
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsString() @IsNotEmpty() firstName: string;
  @IsString() @IsNotEmpty() lastName: string;
  @IsEmail() email: string;
  @IsEnum(Role) role: Role;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsUUID() hurtokId?: string;
}
```

`apps/api/src/users/users.service.ts`:
```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async create(dto: CreateUserDto, actorKurinId: string) {
    if (dto.role === Role.ZVYAZKOVYI) {
      throw new BadRequestException('Cannot self-service create another zvyazkovyi');
    }
    if (dto.role === Role.JUNAK && !dto.hurtokId) {
      throw new BadRequestException('hurtokId is required for JUNAK role');
    }
    if (dto.hurtokId) {
      const hurtok = await this.prisma.hurtok.findUnique({ where: { id: dto.hurtokId } });
      if (!hurtok || hurtok.kurinId !== actorKurinId) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }
    const passwordHash = dto.password ? await this.authService.hashPassword(dto.password) : undefined;
    return this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        role: dto.role,
        passwordHash,
        kurinId: actorKurinId,
        hurtokId: dto.hurtokId,
      },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        email: true,
        role: true,
        birthDate: true,
        kurinId: true,
        hurtokId: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
```

`apps/api/src/users/users.controller.ts`:
```ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Roles(Role.ZVYAZKOVYI)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user.kurinId);
  }

  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findById(user.userId);
  }
}
```

`apps/api/src/users/users.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
```

Modify `apps/api/src/app.module.ts` (add `UsersModule` to `imports`):
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { HurtkyModule } from './hurtky/hurtky.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AdminModule,
    HurtkyModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- users`
Expected: PASS (5 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/users apps/api/src/app.module.ts apps/api/test/users.e2e-spec.ts
git commit -m "Add Users module: create by zvyazkovyi, GET /users/me"
```

---

### Task 12: Vykhovnyk↔Hurtok assignment module

**Files:**
- Create: `apps/api/src/vykhovnyk-assignments/dto/assign-vykhovnyk.dto.ts`
- Create: `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.service.ts`
- Create: `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.controller.ts`
- Create: `apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/vykhovnyk-assignments.e2e-spec.ts`

**Interfaces:**
- Consumes: guards/decorators (Task 6), `VykhovnykHurtok` model (Task 2).
- Produces: `POST /vykhovnyk-assignments` (ZVYAZKOVYI only) → assigns a VYKHOVNYK to a Hurtok (404 if either belongs to another kurin, 409 on a duplicate pair — multiple vykhovnyky per hurtok is allowed, per spec). `DELETE /vykhovnyk-assignments/:id` (ZVYAZKOVYI only) → removes an assignment (404 across tenants). Task 13's progress-visibility check and Tasks 14-15's confirm/unconfirm checks all query this table to verify a vykhovnyk is assigned to a junak's hurtok.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/vykhovnyk-assignments.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Vykhovnyk assignments (e2e)', () => {
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

  it('lets zvyazkovyi assign a vykhovnyk to a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id })
      .expect(201);

    expect(response.body.vykhovnykId).toBe(vykhovnyk.id);
    expect(response.body.hurtokId).toBe(hurtok.id);
  });

  it('allows multiple vykhovnyky on one hurtok, rejects the exact same pair twice', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk1 = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const vykhovnyk2 = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnyk1.id, hurtokId: hurtok.id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnyk2.id, hurtokId: hurtok.id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnyk1.id, hurtokId: hurtok.id })
      .expect(409);
  });

  it('returns 404 when the vykhovnyk or hurtok belongs to another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'Hurtok B', kurinId: kurinB.id } });
    const vykhovnykB = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurinB.id });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnykB.id, hurtokId: hurtokB.id })
      .expect(404);
  });

  it('forbids a vykhovnyk from creating assignments', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id })
      .expect(403);
  });

  it('lets zvyazkovyi remove an assignment', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const assignment = await prisma.vykhovnykHurtok.create({
      data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id },
    });

    await request(app.getHttpServer())
      .delete(`/vykhovnyk-assignments/${assignment.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const remaining = await prisma.vykhovnykHurtok.findUnique({ where: { id: assignment.id } });
    expect(remaining).toBeNull();
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- vykhovnyk-assignments`
Expected: FAIL — `/vykhovnyk-assignments*` routes don't exist yet.

- [ ] **Step 2: Implement the DTO, service, controller, and module**

`apps/api/src/vykhovnyk-assignments/dto/assign-vykhovnyk.dto.ts`:
```ts
import { IsUUID } from 'class-validator';

export class AssignVykhovnykDto {
  @IsUUID() vykhovnykId: string;
  @IsUUID() hurtokId: string;
}
```

`apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.service.ts`:
```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignVykhovnykDto } from './dto/assign-vykhovnyk.dto';

@Injectable()
export class VykhovnykAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(dto: AssignVykhovnykDto, actorKurinId: string) {
    const [vykhovnyk, hurtok] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.vykhovnykId } }),
      this.prisma.hurtok.findUnique({ where: { id: dto.hurtokId } }),
    ]);
    if (!vykhovnyk || vykhovnyk.role !== Role.VYKHOVNYK || vykhovnyk.kurinId !== actorKurinId) {
      throw new NotFoundException('Vykhovnyk not found in this kurin');
    }
    if (!hurtok || hurtok.kurinId !== actorKurinId) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }
    try {
      return await this.prisma.vykhovnykHurtok.create({
        data: { vykhovnykId: dto.vykhovnykId, hurtokId: dto.hurtokId },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('This vykhovnyk is already assigned to this hurtok');
      }
      throw err;
    }
  }

  async unassign(id: string, actorKurinId: string) {
    const assignment = await this.prisma.vykhovnykHurtok.findUnique({
      where: { id },
      include: { hurtok: true },
    });
    if (!assignment || assignment.hurtok.kurinId !== actorKurinId) {
      throw new NotFoundException('Assignment not found');
    }
    await this.prisma.vykhovnykHurtok.delete({ where: { id } });
    return { success: true };
  }
}
```

`apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.controller.ts`:
```ts
import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { VykhovnykAssignmentsService } from './vykhovnyk-assignments.service';
import { AssignVykhovnykDto } from './dto/assign-vykhovnyk.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ZVYAZKOVYI)
@Controller('vykhovnyk-assignments')
export class VykhovnykAssignmentsController {
  constructor(private readonly service: VykhovnykAssignmentsService) {}

  @Post()
  assign(@Body() dto: AssignVykhovnykDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.assign(dto, user.kurinId);
  }

  @Delete(':id')
  unassign(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.unassign(id, user.kurinId);
  }
}
```

`apps/api/src/vykhovnyk-assignments/vykhovnyk-assignments.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VykhovnykAssignmentsController } from './vykhovnyk-assignments.controller';
import { VykhovnykAssignmentsService } from './vykhovnyk-assignments.service';

@Module({
  imports: [AuthModule],
  controllers: [VykhovnykAssignmentsController],
  providers: [VykhovnykAssignmentsService],
})
export class VykhovnykAssignmentsModule {}
```

Modify `apps/api/src/app.module.ts` (add `VykhovnykAssignmentsModule` to `imports`):
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { HurtkyModule } from './hurtky/hurtky.module';
import { UsersModule } from './users/users.module';
import { VykhovnykAssignmentsModule } from './vykhovnyk-assignments/vykhovnyk-assignments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AdminModule,
    HurtkyModule,
    UsersModule,
    VykhovnykAssignmentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- vykhovnyk-assignments`
Expected: PASS (5 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/vykhovnyk-assignments apps/api/src/app.module.ts apps/api/test/vykhovnyk-assignments.e2e-spec.ts
git commit -m "Add Vykhovnyk-Hurtok assignment module"
```

---

### Task 13: GET junak proby progress (role-based visibility)

**Files:**
- Create: `apps/api/src/proby-progress/proby-progress.service.ts`
- Create: `apps/api/src/proby-progress/proby-progress.controller.ts`
- Create: `apps/api/src/proby-progress/proby-progress.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/proby-progress.e2e-spec.ts`

**Interfaces:**
- Consumes: `VykhovnykHurtok` (Task 12), `CurrentUserPayload` (Task 6).
- Produces: `GET /junaky/:junakId/progress` → JUNAK can view only their own; VYKHOVNYK only if assigned to the junak's hurtok; ZVYAZKOVYI any junak in their own kurin; KURINNYI is forbidden entirely (per spec, курінний has no proby-progress visibility); 404 if the junak is in another kurin. `ProbyProgressService.getProgressFor(junakId, actor)` — Tasks 14-15 add `confirm`/`unconfirm` to this same service, reusing the same visibility/assignment checks.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/proby-progress.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Proby progress GET (e2e)', () => {
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
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    await prisma.junakProgress.create({
      data: { junakId: junak.id, pointId: points[0].id, status: ProgressStatus.DONE },
    });
    return { kurin, hurtok, junak, points };
  }

  it('lets a junak view their own progress', async () => {
    const { junak } = await setup();
    const token = issueTokenFor(jwtService, junak);

    const response = await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].status).toBe(ProgressStatus.DONE);
  });

  it("forbids a junak from viewing another junak's progress", async () => {
    const { junak, kurin, hurtok } = await setup();
    const otherJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const token = issueTokenFor(jwtService, otherJunak);

    await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lets an assigned vykhovnyk view progress, forbids an unassigned one', async () => {
    const { junak, hurtok, kurin } = await setup();
    const assignedVykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: assignedVykhovnyk.id, hurtokId: hurtok.id } });
    const unassignedVykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });

    await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, assignedVykhovnyk)}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, unassignedVykhovnyk)}`)
      .expect(403);
  });

  it('lets zvyazkovyi view any junak in their own kurin', async () => {
    const { junak, kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });

    await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, zvyazkovyi)}`)
      .expect(200);
  });

  it('forbids kurinnyi from viewing proby progress', async () => {
    const { junak, kurin } = await setup();
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });

    await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, kurinnyi)}`)
      .expect(403);
  });

  it('returns 404 for a junak in another kurin', async () => {
    const { junak } = await setup();
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const outsider = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });

    await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, outsider)}`)
      .expect(404);
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- proby-progress`
Expected: FAIL — `/junaky/:junakId/progress` doesn't exist yet.

- [ ] **Step 2: Implement the service, controller, and module**

`apps/api/src/proby-progress/proby-progress.service.ts`:
```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Injectable()
export class ProbyProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async getProgressFor(junakId: string, actor: CurrentUserPayload) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found');
    }

    if (actor.role === Role.JUNAK && actor.userId !== junakId) {
      throw new ForbiddenException("Cannot view another junak's progress");
    }

    if (actor.role === Role.KURINNYI) {
      throw new ForbiddenException('Kurinnyi cannot view proby progress');
    }

    if (actor.role === Role.VYKHOVNYK) {
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId: junak.hurtokId ?? undefined },
      });
      if (!assigned) {
        throw new ForbiddenException("Not assigned to this junak's hurtok");
      }
    }

    return this.prisma.junakProgress.findMany({
      where: { junakId },
      include: { point: true },
    });
  }
}
```

`apps/api/src/proby-progress/proby-progress.controller.ts`:
```ts
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ProbyProgressService } from './proby-progress.service';

@UseGuards(JwtAuthGuard)
@Controller('junaky/:junakId/progress')
export class ProbyProgressController {
  constructor(private readonly service: ProbyProgressService) {}

  @Get()
  getProgress(@Param('junakId') junakId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getProgressFor(junakId, user);
  }
}
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
})
export class ProbyProgressModule {}
```

Modify `apps/api/src/app.module.ts` (add `ProbyProgressModule` to `imports`):
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { HurtkyModule } from './hurtky/hurtky.module';
import { UsersModule } from './users/users.module';
import { VykhovnykAssignmentsModule } from './vykhovnyk-assignments/vykhovnyk-assignments.module';
import { ProbyProgressModule } from './proby-progress/proby-progress.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AdminModule,
    HurtkyModule,
    UsersModule,
    VykhovnykAssignmentsModule,
    ProbyProgressModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- proby-progress`
Expected: PASS (6 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/proby-progress apps/api/src/app.module.ts apps/api/test/proby-progress.e2e-spec.ts
git commit -m "Add GET junak proby progress with role-based visibility"
```

---

### Task 14: Confirm a proby point (vykhovnyk) + audit log

**Files:**
- Modify: `apps/api/src/proby-progress/proby-progress.service.ts`
- Modify: `apps/api/src/proby-progress/proby-progress.controller.ts`
- Test: `apps/api/test/proby-progress-confirm.e2e-spec.ts`

**Interfaces:**
- Consumes: `ProgressAuditLog` model (Task 2), `VykhovnykHurtok` (Task 12).
- Produces: `POST /junaky/:junakId/progress/:pointId/confirm` (VYKHOVNYK only, must be assigned to the junak's hurtok) → upserts `JunakProgress` to `DONE` with `confirmedById`/`confirmedAt`, and appends a `ProgressAuditLog` row with `action: CONFIRM`. Idempotent — confirming twice keeps one `JunakProgress` row. `ProbyProgressService.assertAssignedVykhovnyk(junakId, actor)` private helper — reused by Task 15's `unconfirm`.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/proby-progress-confirm.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus, ProgressAction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Proby progress confirm (e2e)', () => {
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
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    return { kurin, hurtok, junak, points };
  }

  it('lets an assigned vykhovnyk confirm a point and logs it', async () => {
    const { junak, hurtok, kurin, points } = await setup();
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const token = issueTokenFor(jwtService, vykhovnyk);

    const response = await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(response.body.status).toBe(ProgressStatus.DONE);
    expect(response.body.confirmedById).toBe(vykhovnyk.id);

    const auditEntries = await prisma.progressAuditLog.findMany({ where: { junakId: junak.id } });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].action).toBe(ProgressAction.CONFIRM);
    expect(auditEntries[0].actorId).toBe(vykhovnyk.id);
  });

  it('forbids an unassigned vykhovnyk from confirming', async () => {
    const { junak, kurin, points } = await setup();
    const unassignedVykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, unassignedVykhovnyk);

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('forbids a zvyazkovyi from confirming (only vykhovnyk can)', async () => {
    const { junak, kurin, points } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('is idempotent: confirming an already-DONE point keeps a single progress row', async () => {
    const { junak, hurtok, kurin, points } = await setup();
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const rows = await prisma.junakProgress.findMany({ where: { junakId: junak.id, pointId: points[0].id } });
    expect(rows).toHaveLength(1);
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- proby-progress-confirm`
Expected: FAIL — `POST /junaky/:junakId/progress/:pointId/confirm` doesn't exist yet.

- [ ] **Step 2: Add `confirm` to the service and controller**

Modify `apps/api/src/proby-progress/proby-progress.service.ts` (add imports for `ProgressStatus`, `ProgressAction`, and the `confirm`/`assertAssignedVykhovnyk` methods):
```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProgressAction, ProgressStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Injectable()
export class ProbyProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async getProgressFor(junakId: string, actor: CurrentUserPayload) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found');
    }

    if (actor.role === Role.JUNAK && actor.userId !== junakId) {
      throw new ForbiddenException("Cannot view another junak's progress");
    }

    if (actor.role === Role.KURINNYI) {
      throw new ForbiddenException('Kurinnyi cannot view proby progress');
    }

    if (actor.role === Role.VYKHOVNYK) {
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId: junak.hurtokId ?? undefined },
      });
      if (!assigned) {
        throw new ForbiddenException("Not assigned to this junak's hurtok");
      }
    }

    return this.prisma.junakProgress.findMany({
      where: { junakId },
      include: { point: true },
    });
  }

  async confirm(junakId: string, pointId: string, actor: CurrentUserPayload) {
    await this.assertAssignedVykhovnyk(junakId, actor);
    const progress = await this.prisma.junakProgress.upsert({
      where: { junakId_pointId: { junakId, pointId } },
      update: { status: ProgressStatus.DONE, confirmedById: actor.userId, confirmedAt: new Date() },
      create: {
        junakId,
        pointId,
        status: ProgressStatus.DONE,
        confirmedById: actor.userId,
        confirmedAt: new Date(),
      },
    });
    await this.prisma.progressAuditLog.create({
      data: { junakId, pointId, action: ProgressAction.CONFIRM, actorId: actor.userId },
    });
    return progress;
  }

  private async assertAssignedVykhovnyk(junakId: string, actor: CurrentUserPayload) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found');
    }
    const assigned = await this.prisma.vykhovnykHurtok.findFirst({
      where: { vykhovnykId: actor.userId, hurtokId: junak.hurtokId ?? undefined },
    });
    if (!assigned) {
      throw new ForbiddenException("Not assigned to this junak's hurtok");
    }
    return junak;
  }
}
```

Modify `apps/api/src/proby-progress/proby-progress.controller.ts`:
```ts
import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ProbyProgressService } from './proby-progress.service';

@UseGuards(JwtAuthGuard)
@Controller('junaky/:junakId/progress')
export class ProbyProgressController {
  constructor(private readonly service: ProbyProgressService) {}

  @Get()
  getProgress(@Param('junakId') junakId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getProgressFor(junakId, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.VYKHOVNYK)
  @Post(':pointId/confirm')
  confirm(
    @Param('junakId') junakId: string,
    @Param('pointId') pointId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.confirm(junakId, pointId, user);
  }
}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- proby-progress-confirm`
Expected: PASS (4 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/proby-progress apps/api/test/proby-progress-confirm.e2e-spec.ts
git commit -m "Add point confirmation with audit logging"
```

---

### Task 15: Unconfirm a proby point (vykhovnyk) + audit log

**Files:**
- Modify: `apps/api/src/proby-progress/proby-progress.service.ts`
- Modify: `apps/api/src/proby-progress/proby-progress.controller.ts`
- Test: `apps/api/test/proby-progress-unconfirm.e2e-spec.ts`

**Interfaces:**
- Consumes: `assertAssignedVykhovnyk` (Task 14).
- Produces: `POST /junaky/:junakId/progress/:pointId/unconfirm` (VYKHOVNYK only, must be assigned) → sets `JunakProgress.status` back to `NOT_DONE`, clears `confirmedById`/`confirmedAt`, appends a `ProgressAuditLog` row with `action: UNCONFIRM`.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/proby-progress-unconfirm.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus, ProgressAction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Proby progress unconfirm (e2e)', () => {
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
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    await prisma.junakProgress.create({
      data: {
        junakId: junak.id,
        pointId: points[0].id,
        status: ProgressStatus.DONE,
        confirmedById: vykhovnyk.id,
        confirmedAt: new Date(),
      },
    });
    return { kurin, hurtok, junak, points, vykhovnyk };
  }

  it('lets an assigned vykhovnyk undo a wrong confirmation and logs it', async () => {
    const { junak, points, vykhovnyk } = await setup();
    const token = issueTokenFor(jwtService, vykhovnyk);

    const response = await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/unconfirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(response.body.status).toBe(ProgressStatus.NOT_DONE);
    expect(response.body.confirmedById).toBeNull();

    const auditEntries = await prisma.progressAuditLog.findMany({
      where: { junakId: junak.id, action: ProgressAction.UNCONFIRM },
    });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].actorId).toBe(vykhovnyk.id);
  });

  it('forbids an unassigned vykhovnyk from unconfirming', async () => {
    const { junak, points, kurin } = await setup();
    const unassignedVykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, unassignedVykhovnyk);

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/unconfirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- proby-progress-unconfirm`
Expected: FAIL — `POST /junaky/:junakId/progress/:pointId/unconfirm` doesn't exist yet.

- [ ] **Step 2: Add `unconfirm` to the service and controller**

Modify `apps/api/src/proby-progress/proby-progress.service.ts` (add the `unconfirm` method, after `confirm`):
```ts
  async unconfirm(junakId: string, pointId: string, actor: CurrentUserPayload) {
    await this.assertAssignedVykhovnyk(junakId, actor);
    const progress = await this.prisma.junakProgress.upsert({
      where: { junakId_pointId: { junakId, pointId } },
      update: { status: ProgressStatus.NOT_DONE, confirmedById: null, confirmedAt: null },
      create: { junakId, pointId, status: ProgressStatus.NOT_DONE },
    });
    await this.prisma.progressAuditLog.create({
      data: { junakId, pointId, action: ProgressAction.UNCONFIRM, actorId: actor.userId },
    });
    return progress;
  }
```

Modify `apps/api/src/proby-progress/proby-progress.controller.ts` (add the `unconfirm` route, after `confirm`):
```ts
  @UseGuards(RolesGuard)
  @Roles(Role.VYKHOVNYK)
  @Post(':pointId/unconfirm')
  unconfirm(
    @Param('junakId') junakId: string,
    @Param('pointId') pointId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.unconfirm(junakId, pointId, user);
  }
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- proby-progress-unconfirm`
Expected: PASS (2 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/proby-progress apps/api/test/proby-progress-unconfirm.e2e-spec.ts
git commit -m "Add point unconfirmation with audit logging"
```

---

### Task 16: Kurin proby-program change with point-mapping carryover

**Files:**
- Create: `apps/api/src/kurins/dto/change-proby-program.dto.ts`
- Create: `apps/api/src/kurins/kurins.service.ts`
- Create: `apps/api/src/kurins/kurins.controller.ts`
- Create: `apps/api/src/kurins/kurins.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/kurins-proby-program.e2e-spec.ts`

**Interfaces:**
- Consumes: `PointMapping` (Task 9), `JunakProgress`/`ProgressStatus` (Task 2).
- Produces: `PATCH /kurins/:id/proby-program` (ZVYAZKOVYI only, `id` must equal caller's own `kurinId` — 403 otherwise) → walks every JUNAK in the kurin, and for each `DONE` point under the *old* program, looks up `PointMapping` from either side (works moving old→new or new→old) and upserts a `DONE` `JunakProgress` on the mapped point with `transferredFromPointId` set, without ever overwriting a point that already has its own independent progress row. The original progress rows are never touched or deleted. This is the concrete implementation of assumption #4 and the spec's "Зміна програми проб куреня" scenario.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/kurins-proby-program.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Kurin proby-program change (e2e)', () => {
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

  it('carries over a DONE point via the mapping and preserves the old record', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Вузли (стара)']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Вузли (нова)']);
    await prisma.pointMapping.create({
      data: { oldPointId: oldTree.points[0].id, newPointId: newTree.points[0].id },
    });
    const kurin = await createKurin(prisma, { probyProgramId: oldTree.program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: {
        junakId: junak.id,
        pointId: oldTree.points[0].id,
        status: ProgressStatus.DONE,
        confirmedById: vykhovnyk.id,
        confirmedAt: new Date(),
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/proby-program`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newProgramId: newTree.program.id })
      .expect(200);

    expect(response.body.probyProgramId).toBe(newTree.program.id);

    const newProgress = await prisma.junakProgress.findUnique({
      where: { junakId_pointId: { junakId: junak.id, pointId: newTree.points[0].id } },
    });
    expect(newProgress?.status).toBe(ProgressStatus.DONE);
    expect(newProgress?.transferredFromPointId).toBe(oldTree.points[0].id);

    const oldProgress = await prisma.junakProgress.findUnique({
      where: { junakId_pointId: { junakId: junak.id, pointId: oldTree.points[0].id } },
    });
    expect(oldProgress?.status).toBe(ProgressStatus.DONE);
  });

  it('leaves an unmapped DONE point untouched with no new row created', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, [
      'Мандрівка (без відповідника)',
    ]);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Щось інше']);
    const kurin = await createKurin(prisma, { probyProgramId: oldTree.program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: junak.id, pointId: oldTree.points[0].id, status: ProgressStatus.DONE },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/proby-program`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newProgramId: newTree.program.id })
      .expect(200);

    const allProgress = await prisma.junakProgress.findMany({ where: { junakId: junak.id } });
    expect(allProgress).toHaveLength(1);
    expect(allProgress[0].pointId).toBe(oldTree.points[0].id);
  });

  it('does not overwrite a target point that was already independently confirmed', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Вузли (стара)']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Вузли (нова)']);
    await prisma.pointMapping.create({
      data: { oldPointId: oldTree.points[0].id, newPointId: newTree.points[0].id },
    });
    const kurin = await createKurin(prisma, { probyProgramId: oldTree.program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const originalConfirmer = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: junak.id, pointId: oldTree.points[0].id, status: ProgressStatus.DONE },
    });
    await prisma.junakProgress.create({
      data: {
        junakId: junak.id,
        pointId: newTree.points[0].id,
        status: ProgressStatus.DONE,
        confirmedById: originalConfirmer.id,
        confirmedAt: new Date('2025-01-01'),
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/proby-program`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newProgramId: newTree.program.id })
      .expect(200);

    const targetProgress = await prisma.junakProgress.findUnique({
      where: { junakId_pointId: { junakId: junak.id, pointId: newTree.points[0].id } },
    });
    expect(targetProgress?.confirmedById).toBe(originalConfirmer.id);
  });

  it('returns 403 when a zvyazkovyi targets another kurin', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Point']);
    const kurinA = await createKurin(prisma, { probyProgramId: oldTree.program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: oldTree.program.id, name: 'B' });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurinB.id}/proby-program`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newProgramId: newTree.program.id })
      .expect(403);
  });

  it('returns 403 for a non-zvyazkovyi role', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Point']);
    const kurin = await createKurin(prisma, { probyProgramId: oldTree.program.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/proby-program`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newProgramId: newTree.program.id })
      .expect(403);
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- kurins-proby-program`
Expected: FAIL — `PATCH /kurins/:id/proby-program` doesn't exist yet.

- [ ] **Step 2: Implement the DTO, service, controller, and module**

`apps/api/src/kurins/dto/change-proby-program.dto.ts`:
```ts
import { IsUUID } from 'class-validator';

export class ChangeProbyProgramDto {
  @IsUUID()
  newProgramId: string;
}
```

`apps/api/src/kurins/kurins.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ProgressStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KurinsService {
  constructor(private readonly prisma: PrismaService) {}

  async changeProbyProgram(kurinId: string, newProgramId: string) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) throw new NotFoundException('Kurin not found');

    const newProgram = await this.prisma.probyProgram.findUnique({ where: { id: newProgramId } });
    if (!newProgram) throw new NotFoundException('Proby program not found');

    if (kurin.probyProgramId === newProgramId) {
      return kurin;
    }

    const oldProgramId = kurin.probyProgramId;
    const junaky = await this.prisma.user.findMany({
      where: { kurinId, role: Role.JUNAK },
      select: { id: true },
    });

    for (const junak of junaky) {
      const doneOldEntries = await this.prisma.junakProgress.findMany({
        where: {
          junakId: junak.id,
          status: ProgressStatus.DONE,
          point: { category: { stage: { programId: oldProgramId } } },
        },
      });

      for (const entry of doneOldEntries) {
        const mapping = await this.prisma.pointMapping.findFirst({
          where: {
            OR: [{ oldPointId: entry.pointId }, { newPointId: entry.pointId }],
          },
        });
        if (!mapping) continue;

        const targetPointId =
          mapping.oldPointId === entry.pointId ? mapping.newPointId : mapping.oldPointId;

        await this.prisma.junakProgress.upsert({
          where: { junakId_pointId: { junakId: junak.id, pointId: targetPointId } },
          update: {},
          create: {
            junakId: junak.id,
            pointId: targetPointId,
            status: ProgressStatus.DONE,
            confirmedById: entry.confirmedById,
            confirmedAt: entry.confirmedAt,
            transferredFromPointId: entry.pointId,
          },
        });
      }
    }

    return this.prisma.kurin.update({
      where: { id: kurinId },
      data: { probyProgramId: newProgramId },
    });
  }
}
```

`apps/api/src/kurins/kurins.controller.ts`:
```ts
import { Body, Controller, ForbiddenException, Param, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { KurinsService } from './kurins.service';
import { ChangeProbyProgramDto } from './dto/change-proby-program.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kurins')
export class KurinsController {
  constructor(private readonly kurinsService: KurinsService) {}

  @Roles(Role.ZVYAZKOVYI)
  @Patch(':id/proby-program')
  changeProbyProgram(
    @Param('id') id: string,
    @Body() dto: ChangeProbyProgramDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (id !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    return this.kurinsService.changeProbyProgram(id, dto.newProgramId);
  }
}
```

`apps/api/src/kurins/kurins.module.ts`:
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

Modify `apps/api/src/app.module.ts` (add `KurinsModule` to `imports`):
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { HurtkyModule } from './hurtky/hurtky.module';
import { UsersModule } from './users/users.module';
import { VykhovnykAssignmentsModule } from './vykhovnyk-assignments/vykhovnyk-assignments.module';
import { ProbyProgressModule } from './proby-progress/proby-progress.module';
import { KurinsModule } from './kurins/kurins.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AdminModule,
    HurtkyModule,
    UsersModule,
    VykhovnykAssignmentsModule,
    ProbyProgressModule,
    KurinsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- kurins-proby-program`
Expected: PASS (5 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/kurins apps/api/src/app.module.ts apps/api/test/kurins-proby-program.e2e-spec.ts
git commit -m "Add proby-program change with point-mapping carryover"
```

---

### Task 17: ApprovalRequest — kurinnyi creates a request

**Files:**
- Create: `apps/api/src/approval-requests/dto/create-approval-request.dto.ts`
- Create: `apps/api/src/approval-requests/approval-requests.service.ts`
- Create: `apps/api/src/approval-requests/approval-requests.controller.ts`
- Create: `apps/api/src/approval-requests/approval-requests.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/approval-requests-create.e2e-spec.ts`

**Interfaces:**
- Consumes: `ApprovalRequest`/`ApprovalActionType`/`ApprovalStatus` models (Task 2).
- Produces: `POST /approval-requests` (KURINNYI only) → creates a `PENDING` request; snapshots the junak's current values for the relevant fields into `oldData`; requires `junakId` for every action type except `CREATE_JUNAK`; 404 if `junakId` is outside the caller's kurin; does **not** touch the actual `User` row. `ApprovalRequestsService.extractRelevantFields` — reused nowhere else, but its field mapping is mirrored by Task 18's apply logic.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/approval-requests-create.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ApprovalActionType, ApprovalStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Approval requests create (e2e)', () => {
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

  it('lets kurinnyi request a full-name change, capturing old data, without applying it yet', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinnyi);

    const response = await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: ApprovalActionType.CHANGE_FULL_NAME,
        junakId: junak.id,
        newData: { firstName: 'Новий', lastName: 'Прізвище' },
      })
      .expect(201);

    expect(response.body.status).toBe(ApprovalStatus.PENDING);
    expect(response.body.oldData).toEqual({ firstName: junak.firstName, lastName: junak.lastName });

    const stillOriginal = await prisma.user.findUnique({ where: { id: junak.id } });
    expect(stillOriginal?.firstName).toBe(junak.firstName);
  });

  it('lets kurinnyi request creating a new junak without junakId', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const token = issueTokenFor(jwtService, kurinnyi);

    const response = await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: ApprovalActionType.CREATE_JUNAK,
        newData: {
          firstName: 'Новий',
          lastName: 'Юнак',
          email: 'new-junak@example.com',
          hurtokId: hurtok.id,
        },
      })
      .expect(201);

    expect(response.body.actionType).toBe(ApprovalActionType.CREATE_JUNAK);
    expect(response.body.junakId).toBeNull();
  });

  it('returns 400 when junakId is missing for a non-CREATE_JUNAK action', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinnyi);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: ApprovalActionType.CHANGE_EMAIL, newData: { email: 'x@example.com' } })
      .expect(400);
  });

  it('returns 404 when junakId belongs to another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const kurinnyiA = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurinA.id });
    const junakB = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinB.id });
    const token = issueTokenFor(jwtService, kurinnyiA);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: ApprovalActionType.CHANGE_EMAIL,
        junakId: junakB.id,
        newData: { email: 'x@example.com' },
      })
      .expect(404);
  });

  it('forbids a zvyazkovyi from creating an approval request', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: ApprovalActionType.CHANGE_EMAIL,
        junakId: junak.id,
        newData: { email: 'x@example.com' },
      })
      .expect(403);
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- approval-requests-create`
Expected: FAIL — `POST /approval-requests` doesn't exist yet.

- [ ] **Step 2: Implement the DTO, service, controller, and module**

`apps/api/src/approval-requests/dto/create-approval-request.dto.ts`:
```ts
import { IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';
import { ApprovalActionType } from '@prisma/client';

export class CreateApprovalRequestDto {
  @IsEnum(ApprovalActionType) actionType: ApprovalActionType;
  @IsOptional() @IsUUID() junakId?: string;
  @IsObject() newData: Record<string, unknown>;
}
```

`apps/api/src/approval-requests/approval-requests.service.ts`:
```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalActionType, ApprovalStatus, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';

@Injectable()
export class ApprovalRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateApprovalRequestDto, actor: CurrentUserPayload) {
    if (dto.actionType !== ApprovalActionType.CREATE_JUNAK && !dto.junakId) {
      throw new BadRequestException('junakId is required for this action type');
    }

    let oldData: Record<string, unknown> | undefined;
    if (dto.junakId) {
      const junak = await this.prisma.user.findUnique({ where: { id: dto.junakId } });
      if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
        throw new NotFoundException('Junak not found');
      }
      oldData = this.extractRelevantFields(dto.actionType, junak);
    }

    return this.prisma.approvalRequest.create({
      data: {
        initiatedById: actor.userId,
        junakId: dto.junakId,
        actionType: dto.actionType,
        oldData,
        newData: dto.newData,
        status: ApprovalStatus.PENDING,
      },
    });
  }

  private extractRelevantFields(actionType: ApprovalActionType, junak: User) {
    switch (actionType) {
      case ApprovalActionType.CHANGE_FULL_NAME:
        return { firstName: junak.firstName, lastName: junak.lastName };
      case ApprovalActionType.CHANGE_BIRTH_DATE:
        return { birthDate: junak.birthDate };
      case ApprovalActionType.CHANGE_EMAIL:
        return { email: junak.email };
      case ApprovalActionType.CHANGE_HURTOK:
        return { hurtokId: junak.hurtokId };
      default:
        return undefined;
    }
  }
}
```

`apps/api/src/approval-requests/approval-requests.controller.ts`:
```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ApprovalRequestsService } from './approval-requests.service';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('approval-requests')
export class ApprovalRequestsController {
  constructor(private readonly service: ApprovalRequestsService) {}

  @Roles(Role.KURINNYI)
  @Post()
  create(@Body() dto: CreateApprovalRequestDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }
}
```

`apps/api/src/approval-requests/approval-requests.module.ts`:
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

Modify `apps/api/src/app.module.ts` (add `ApprovalRequestsModule` to `imports`):
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { HurtkyModule } from './hurtky/hurtky.module';
import { UsersModule } from './users/users.module';
import { VykhovnykAssignmentsModule } from './vykhovnyk-assignments/vykhovnyk-assignments.module';
import { ProbyProgressModule } from './proby-progress/proby-progress.module';
import { KurinsModule } from './kurins/kurins.module';
import { ApprovalRequestsModule } from './approval-requests/approval-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AdminModule,
    HurtkyModule,
    UsersModule,
    VykhovnykAssignmentsModule,
    ProbyProgressModule,
    KurinsModule,
    ApprovalRequestsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- approval-requests-create`
Expected: PASS (5 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/approval-requests apps/api/src/app.module.ts apps/api/test/approval-requests-create.e2e-spec.ts
git commit -m "Add kurinnyi approval-request creation"
```

---

### Task 18: ApprovalRequest — zvyazkovyi lists, approves, and rejects

**Files:**
- Modify: `apps/api/src/approval-requests/approval-requests.service.ts`
- Modify: `apps/api/src/approval-requests/approval-requests.controller.ts`
- Test: `apps/api/test/approval-requests-decide.e2e-spec.ts`

**Interfaces:**
- Consumes: `extractRelevantFields`'s field mapping (Task 17, mirrored here in reverse by `buildUpdateData`).
- Produces: `GET /approval-requests?status=PENDING` (ZVYAZKOVYI only) → requests initiated within the caller's own kurin. `POST /approval-requests/:id/approve` (ZVYAZKOVYI only) → applies the change (updates the junak's fields, or creates a new JUNAK for `CREATE_JUNAK`), marks `APPROVED`; 400 if already decided, 403 cross-tenant. `POST /approval-requests/:id/reject` → marks `REJECTED`, applies nothing.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/approval-requests-decide.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ApprovalActionType, ApprovalStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Approval requests approve/reject (e2e)', () => {
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
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    return { kurin, kurinnyi, zvyazkovyi };
  }

  it('applies a CHANGE_FULL_NAME request on approval', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_FULL_NAME,
        oldData: { firstName: junak.firstName, lastName: junak.lastName },
        newData: { firstName: 'Новий', lastName: 'Прізвище' },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(response.body.status).toBe(ApprovalStatus.APPROVED);
    expect(response.body.approvedById).toBe(zvyazkovyi.id);

    const updatedJunak = await prisma.user.findUnique({ where: { id: junak.id } });
    expect(updatedJunak?.firstName).toBe('Новий');
    expect(updatedJunak?.lastName).toBe('Прізвище');
  });

  it('creates a new junak on approval of a CREATE_JUNAK request', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        actionType: ApprovalActionType.CREATE_JUNAK,
        newData: {
          firstName: 'Новий',
          lastName: 'Юнак',
          email: 'created-via-approval@example.com',
          hurtokId: hurtok.id,
        },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const createdJunak = await prisma.user.findUnique({
      where: { email: 'created-via-approval@example.com' },
    });
    expect(createdJunak?.role).toBe(Role.JUNAK);
    expect(createdJunak?.kurinId).toBe(kurin.id);
  });

  it('rejecting a request leaves the junak untouched', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_EMAIL,
        oldData: { email: junak.email },
        newData: { email: 'rejected@example.com' },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(response.body.status).toBe(ApprovalStatus.REJECTED);

    const unchangedJunak = await prisma.user.findUnique({ where: { id: junak.id } });
    expect(unchangedJunak?.email).toBe(junak.email);
  });

  it('returns 400 when approving an already-decided request', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const decided = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_EMAIL,
        newData: { email: 'x@example.com' },
        status: ApprovalStatus.REJECTED,
        approvedById: zvyazkovyi.id,
        decidedAt: new Date(),
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${decided.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('returns 403 when a zvyazkovyi from another kurin tries to decide', async () => {
    const { kurin, kurinnyi } = await baseSetup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_EMAIL,
        newData: { email: 'x@example.com' },
        status: ApprovalStatus.PENDING,
      },
    });
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const outsider = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });
    const token = issueTokenFor(jwtService, outsider);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('forbids kurinnyi from approving (only zvyazkovyi can)', async () => {
    const { kurin, kurinnyi } = await baseSetup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_EMAIL,
        newData: { email: 'x@example.com' },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, kurinnyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it("lists only the pending requests for the caller's own kurin", async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_EMAIL,
        newData: { email: 'x@example.com' },
        status: ApprovalStatus.PENDING,
      },
    });
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const otherKurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: otherKurin.id });
    const otherJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: otherKurin.id });
    await prisma.approvalRequest.create({
      data: {
        initiatedById: otherKurinnyi.id,
        junakId: otherJunak.id,
        actionType: ApprovalActionType.CHANGE_EMAIL,
        newData: { email: 'y@example.com' },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get('/approval-requests')
      .query({ status: ApprovalStatus.PENDING })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- approval-requests-decide`
Expected: FAIL — `GET /approval-requests`, `POST /approval-requests/:id/approve`, `POST /approval-requests/:id/reject` don't exist yet.

- [ ] **Step 2: Add `list`, `approve`, `reject` to the service and controller**

Modify `apps/api/src/approval-requests/approval-requests.service.ts` (add imports for `ForbiddenException`, `ApprovalStatus` already imported; add the three methods after `create`):
```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalActionType, ApprovalStatus, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';

@Injectable()
export class ApprovalRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateApprovalRequestDto, actor: CurrentUserPayload) {
    if (dto.actionType !== ApprovalActionType.CREATE_JUNAK && !dto.junakId) {
      throw new BadRequestException('junakId is required for this action type');
    }

    let oldData: Record<string, unknown> | undefined;
    if (dto.junakId) {
      const junak = await this.prisma.user.findUnique({ where: { id: dto.junakId } });
      if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
        throw new NotFoundException('Junak not found');
      }
      oldData = this.extractRelevantFields(dto.actionType, junak);
    }

    return this.prisma.approvalRequest.create({
      data: {
        initiatedById: actor.userId,
        junakId: dto.junakId,
        actionType: dto.actionType,
        oldData,
        newData: dto.newData,
        status: ApprovalStatus.PENDING,
      },
    });
  }

  list(kurinId: string, status?: ApprovalStatus) {
    return this.prisma.approvalRequest.findMany({
      where: { status, initiatedBy: { kurinId } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(requestId: string, actor: CurrentUserPayload) {
    const req = await this.loadPendingRequestForKurin(requestId, actor.kurinId);

    if (req.actionType === ApprovalActionType.CREATE_JUNAK) {
      const data = req.newData as {
        firstName: string;
        lastName: string;
        email: string;
        hurtokId: string;
        birthDate?: string;
      };
      await this.prisma.user.create({
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
      const updateData = this.buildUpdateData(req.actionType, req.newData as Record<string, unknown>);
      await this.prisma.user.update({ where: { id: req.junakId! }, data: updateData });
    }

    return this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: ApprovalStatus.APPROVED, approvedById: actor.userId, decidedAt: new Date() },
    });
  }

  async reject(requestId: string, actor: CurrentUserPayload) {
    await this.loadPendingRequestForKurin(requestId, actor.kurinId);
    return this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: ApprovalStatus.REJECTED, approvedById: actor.userId, decidedAt: new Date() },
    });
  }

  private async loadPendingRequestForKurin(requestId: string, kurinId: string) {
    const req = await this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    const initiator = await this.prisma.user.findUnique({ where: { id: req.initiatedById } });
    if (!initiator || initiator.kurinId !== kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    if (req.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('Request already decided');
    }
    return req;
  }

  private buildUpdateData(actionType: ApprovalActionType, newData: Record<string, unknown>) {
    switch (actionType) {
      case ApprovalActionType.CHANGE_FULL_NAME:
        return { firstName: newData.firstName as string, lastName: newData.lastName as string };
      case ApprovalActionType.CHANGE_BIRTH_DATE:
        return { birthDate: new Date(newData.birthDate as string) };
      case ApprovalActionType.CHANGE_EMAIL:
        return { email: newData.email as string };
      case ApprovalActionType.CHANGE_HURTOK:
        return { hurtokId: newData.hurtokId as string };
      default:
        throw new BadRequestException('Unsupported action type');
    }
  }

  private extractRelevantFields(actionType: ApprovalActionType, junak: User) {
    switch (actionType) {
      case ApprovalActionType.CHANGE_FULL_NAME:
        return { firstName: junak.firstName, lastName: junak.lastName };
      case ApprovalActionType.CHANGE_BIRTH_DATE:
        return { birthDate: junak.birthDate };
      case ApprovalActionType.CHANGE_EMAIL:
        return { email: junak.email };
      case ApprovalActionType.CHANGE_HURTOK:
        return { hurtokId: junak.hurtokId };
      default:
        return undefined;
    }
  }
}
```

Modify `apps/api/src/approval-requests/approval-requests.controller.ts`:
```ts
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApprovalStatus, Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ApprovalRequestsService } from './approval-requests.service';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('approval-requests')
export class ApprovalRequestsController {
  constructor(private readonly service: ApprovalRequestsService) {}

  @Roles(Role.KURINNYI)
  @Post()
  create(@Body() dto: CreateApprovalRequestDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Get()
  list(@Query('status') status: ApprovalStatus | undefined, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user.kurinId, status);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.approve(id, user);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Post(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.reject(id, user);
  }
}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- approval-requests-decide`
Expected: PASS (7 passed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/approval-requests apps/api/test/approval-requests-decide.e2e-spec.ts
git commit -m "Add zvyazkovyi approve/reject/list for approval requests"
```

---

### Task 19: Direct edit of notes/phone (kurinnyi, zvyazkovyi) — no approval

**Files:**
- Create: `apps/api/src/users/dto/update-contact-info.dto.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.controller.ts`
- Test: `apps/api/test/users-contact-info.e2e-spec.ts`

**Interfaces:**
- Consumes: `notes`/`phone` fields on `User` (Task 2, assumption #3).
- Produces: `PATCH /users/:id/contact-info` (KURINNYI or ZVYAZKOVYI) → updates `notes`/`phone` on a JUNAK in the caller's own kurin immediately, no approval workflow (per spec: "другорядні дії... застосовуються без затвердження"). 404 across tenants, 403 for VYKHOVNYK/JUNAK. This is the last task of the backend plan.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/users-contact-info.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Users contact-info update (e2e)', () => {
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

  it('lets kurinnyi update notes/phone immediately, with no approval step', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinnyi);

    const response = await request(app.getHttpServer())
      .patch(`/users/${junak.id}/contact-info`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Алергія на горіхи', phone: '+380501234567' })
      .expect(200);

    expect(response.body.notes).toBe('Алергія на горіхи');
    expect(response.body.phone).toBe('+380501234567');
  });

  it('lets zvyazkovyi update notes/phone too', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/users/${junak.id}/contact-info`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+380501234567' })
      .expect(200);
  });

  it('forbids a vykhovnyk from updating contact info', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .patch(`/users/${junak.id}/contact-info`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+380501234567' })
      .expect(403);
  });

  it('returns 404 for a junak in another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const kurinnyiA = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurinA.id });
    const junakB = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinB.id });
    const token = issueTokenFor(jwtService, kurinnyiA);

    await request(app.getHttpServer())
      .patch(`/users/${junakB.id}/contact-info`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+380501234567' })
      .expect(404);
  });
});
```

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- users-contact-info`
Expected: FAIL — `PATCH /users/:id/contact-info` doesn't exist yet.

- [ ] **Step 2: Add the DTO, service method, and controller route**

`apps/api/src/users/dto/update-contact-info.dto.ts`:
```ts
import { IsOptional, IsString } from 'class-validator';

export class UpdateContactInfoDto {
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() phone?: string;
}
```

Modify `apps/api/src/users/users.service.ts` (add the `updateContactInfo` method, after `create`):
```ts
  async updateContactInfo(junakId: string, dto: UpdateContactInfoDto, actorKurinId: string) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actorKurinId) {
      throw new NotFoundException('Junak not found');
    }
    return this.prisma.user.update({
      where: { id: junakId },
      data: { notes: dto.notes, phone: dto.phone },
    });
  }
```

(add `import { UpdateContactInfoDto } from './dto/update-contact-info.dto';` alongside the existing `CreateUserDto` import at the top of the file)

Modify `apps/api/src/users/users.controller.ts`:
```ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateContactInfoDto } from './dto/update-contact-info.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Roles(Role.ZVYAZKOVYI)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user.kurinId);
  }

  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findById(user.userId);
  }

  @Roles(Role.KURINNYI, Role.ZVYAZKOVYI)
  @Patch(':id/contact-info')
  updateContactInfo(
    @Param('id') id: string,
    @Body() dto: UpdateContactInfoDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateContactInfo(id, dto, user.kurinId);
  }
}
```

- [ ] **Step 3: Run the test again, verify it passes**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e -- users-contact-info`
Expected: PASS (4 passed).

- [ ] **Step 4: Run the full e2e suite once, verify everything still passes together**

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npm run test:e2e`
Expected: PASS — every e2e spec file from Tasks 1-19 green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/users apps/api/test/users-contact-info.e2e-spec.ts
git commit -m "Add kurinnyi/zvyazkovyi direct contact-info edit"
```

---

## Spec coverage check

- Курінь/гурток structure, roles, tenant isolation → Tasks 2, 7, 10-12.
- Auth (email+password, Google SSO, JWT) → Tasks 3-6.
- Proby catalog (two mutable program versions) + progress tracking → Tasks 2, 8, 13-15.
- Program version change with point-mapping carryover, history preserved → Tasks 9, 16.
- Курінний role restricted to юнаки only, approval workflow for key fields, direct edit for notes/phone → Tasks 17-19.
- Audit log for confirm/unconfirm → Tasks 2, 14-15.
- Курінь/гурток extra fields (number, gender, псевдо) → Task 2.
- Platform-admin bootstrap (курінь + first зв'язковий, catalog population) → Tasks 7-9.
- Explicitly out of scope here (separate future plans): AI agents, акції/participation tracking, реманент, news feed, frontend, deployment.

