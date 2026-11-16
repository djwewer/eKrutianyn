import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import {
  AiMessageRole,
  AiUsageKind,
  ApprovalActionType,
  AuditAction,
  GuardianRelation,
  JunakActivityRole,
  JunakRemarkKind,
  KurinGender,
  PositionScope,
  PositionType,
  PrismaClient,
  ProbyProgramVersion,
  ProgressStatus,
  ReactionEmoji,
  Role,
  TokenPurpose,
  TreasuryTransactionType,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createSkill } from './utils/fixtures';

describe('Admin kurins (e2e)', () => {
  let app: INestApplication;
  let adminKey: string;
  let adminUsername: string;
  let adminPassword: string;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    adminKey = process.env.ADMIN_API_KEY ?? 'dev-admin-key-change-me';
    adminUsername = process.env.ADMIN_USERNAME ?? 'admin';
    adminPassword = process.env.ADMIN_PASSWORD ?? 'dev-admin-password-change-me';
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  const zvyazkovyi = (overrides: Partial<Record<'firstName' | 'lastName' | 'email' | 'password', string>> = {}) => ({
    firstName: 'Іван',
    lastName: 'Франко',
    email: `zvyazkovyi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: 'secret123',
    ...overrides,
  });

  describe('POST /admin/kurins', () => {
    it('creates a kurin together with its first zvyazkovyi, who can then log in', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const zv = zvyazkovyi({ email: 'zvyazkovyi-bootstrap@example.com' });

      const response = await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Курінь Тестовий',
          kurinNumber: '5',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zv,
        })
        .expect(201);

      expect(response.body.id).toEqual(expect.any(String));
      expect(response.body.name).toBe('Курінь Тестовий');

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: zv.email, password: zv.password })
        .expect(201);
      expect(loginResponse.body.accessToken).toEqual(expect.any(String));

      const created = await prisma.user.findUniqueOrThrow({ where: { email: zv.email } });
      expect(created.role).toBe('ZVYAZKOVYI');
      expect(created.kurinId).toBe(response.body.id);
      expect(created.mustChangePassword).toBe(true);
    });

    it('returns 401 with a missing or wrong admin key', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const payload = {
        name: 'Курінь Тестовий',
        kurinNumber: '5',
        gender: KurinGender.MALE,
        stanytsia: 'Львів',
        probyProgramId: program.id,
        zvyazkovyi: zvyazkovyi(),
      };

      await request(app.getHttpServer()).post('/admin/kurins').send(payload).expect(401);
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', 'wrong-key')
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send(payload)
        .expect(401);
    });

    it('returns 401 with a correct admin key but a missing or wrong username/password (both factors required)', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const payload = {
        name: 'Курінь Тестовий',
        kurinNumber: '5',
        gender: KurinGender.MALE,
        stanytsia: 'Львів',
        probyProgramId: program.id,
        zvyazkovyi: zvyazkovyi(),
      };

      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .send(payload)
        .expect(401);
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', 'wrong-password')
        .send(payload)
        .expect(401);
    });

    it('returns 404 when probyProgramId does not exist', async () => {
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Курінь Тестовий',
          kurinNumber: '5',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: '00000000-0000-0000-0000-000000000000',
          zvyazkovyi: zvyazkovyi(),
        })
        .expect(404);
    });

    it('returns 400 when zvyazkovyi is missing', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);

      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({ name: 'Курінь Підготовчий', gender: KurinGender.MALE, stanytsia: 'Львів', probyProgramId: program.id })
        .expect(400);
    });

    it('leaves kurinNumber null when omitted (preparatory kurin, no synthetic placeholder)', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);

      const response = await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Курінь Підготовчий',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zvyazkovyi(),
        })
        .expect(201);

      expect(response.body.kurinNumber).toBeNull();
    });

    it('returns 409 when an explicitly provided kurinNumber is already taken, and creates neither kurin nor zvyazkovyi', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Перший',
          kurinNumber: '75',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zvyazkovyi(),
        })
        .expect(201);

      const secondZv = zvyazkovyi({ email: 'second-zvyazkovyi@example.com' });
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Другий',
          kurinNumber: '75',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: secondZv,
        })
        .expect(409);

      expect(await prisma.user.findUnique({ where: { email: secondZv.email } })).toBeNull();
    });

    it('returns 409 when the zvyazkovyi email is already in use, and does not create the kurin (atomic)', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const dupeEmail = 'dupe-zvyazkovyi@example.com';
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Перший',
          kurinNumber: '80',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zvyazkovyi({ email: dupeEmail }),
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Другий',
          kurinNumber: '81',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zvyazkovyi({ email: dupeEmail }),
        })
        .expect(409);

      expect(await prisma.kurin.findUnique({ where: { kurinNumber: '81' } })).toBeNull();
    });

    it('returns 400 when an explicitly provided kurinNumber contains a slash', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);

      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Курінь Тестовий',
          kurinNumber: '/evil.com',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zvyazkovyi(),
        })
        .expect(400);
    });
  });

  describe('POST /admin/kurins/zvyazkovyi', () => {
    it('creates a zvyazkovyi for a kurin that has none yet, who can then log in', async () => {
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
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          firstName: 'Іван',
          lastName: 'Франко',
          email: 'zvyazkovyi-bootstrap@example.com',
          password: 'secret123',
          kurinId: kurin.id,
        })
        .expect(201);

      expect(response.body.role).toBe('ZVYAZKOVYI');
      expect(response.body.passwordHash).toBeUndefined();

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
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          firstName: 'Іван',
          lastName: 'Франко',
          email: 'nobody@example.com',
          password: 'secret123',
          kurinId: '00000000-0000-0000-0000-000000000000',
        })
        .expect(404);
    });

    it('returns 409 when the kurin already has an active zvyazkovyi', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const zv = zvyazkovyi();
      const createResponse = await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Курінь',
          kurinNumber: '90',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zv,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/admin/kurins/zvyazkovyi')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          firstName: 'Другий',
          lastName: 'Зв\'язковий',
          email: 'second@example.com',
          password: 'secret123',
          kurinId: createResponse.body.id,
        })
        .expect(409);
    });
  });

  describe('GET /admin/kurins', () => {
    it('lists all kurins with member/hurtok counts, ordered by kurinNumber', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurinB = await createKurin(prisma, { probyProgramId: program.id, kurinNumber: 'B', name: 'Курінь Б' });
      await createKurin(prisma, { probyProgramId: program.id, kurinNumber: 'A', name: 'Курінь А' });
      await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinB.id });

      const response = await request(app.getHttpServer())
        .get('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .expect(200);

      expect(response.body.map((k: any) => k.kurinNumber)).toEqual(['A', 'B']);
      const b = response.body.find((k: any) => k.id === kurinB.id);
      expect(b.userCount).toBe(1);
      expect(b.hurtokCount).toBe(0);
    });

    it('returns 401 without admin credentials', async () => {
      await request(app.getHttpServer()).get('/admin/kurins').expect(401);
    });
  });

  describe('PATCH /admin/kurins/:id', () => {
    it("updates a kurin's name and number", async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id, kurinNumber: '7' });

      const response = await request(app.getHttpServer())
        .patch(`/admin/kurins/${kurin.id}`)
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({ name: 'Новий Курінь', kurinNumber: '42' })
        .expect(200);

      expect(response.body.name).toBe('Новий Курінь');
      expect(response.body.kurinNumber).toBe('42');
    });

    it('returns 409 when the new kurinNumber is already taken by another kurin', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      await createKurin(prisma, { probyProgramId: program.id, kurinNumber: '1' });
      const kurin2 = await createKurin(prisma, { probyProgramId: program.id, kurinNumber: '2' });

      await request(app.getHttpServer())
        .patch(`/admin/kurins/${kurin2.id}`)
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({ kurinNumber: '1' })
        .expect(409);
    });

    it('returns 404 for a nonexistent kurin', async () => {
      await request(app.getHttpServer())
        .patch('/admin/kurins/00000000-0000-0000-0000-000000000000')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({ name: 'X' })
        .expect(404);
    });
  });

  describe('DELETE /admin/kurins/:id', () => {
    it('deletes an empty kurin (no users, no hurtky)', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });

      await request(app.getHttpServer())
        .delete(`/admin/kurins/${kurin.id}`)
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .expect(204);

      expect(await prisma.kurin.findUnique({ where: { id: kurin.id } })).toBeNull();
    });

    it('refuses to delete a kurin that still has members (409), and does not delete it', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });

      await request(app.getHttpServer())
        .delete(`/admin/kurins/${kurin.id}`)
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .expect(409);

      expect(await prisma.kurin.findUnique({ where: { id: kurin.id } })).not.toBeNull();
    });

    it('returns 404 for a nonexistent kurin', async () => {
      await request(app.getHttpServer())
        .delete('/admin/kurins/00000000-0000-0000-0000-000000000000')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .expect(404);
    });
  });

  describe('force delete', () => {
    const adminReq = (method: 'get' | 'post' | 'delete', path: string) =>
      request(app.getHttpServer())
        [method](path)
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword);

    // Seeds a kurin with data in every model that references User or Kurin.
    async function seedRichKurin() {
      const { program, stage, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id, name: 'Курінь Видалюваний' });
      const kurinId = kurin.id;
      const zv = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId });
      const vyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId });
      const hurtok = await prisma.hurtok.create({ data: { kurinId, name: 'Гурток', archivedById: zv.id } });
      const j1 = await createUser(prisma, { role: Role.JUNAK, kurinId, hurtokId: hurtok.id });
      const j2 = await createUser(prisma, { role: Role.JUNAK, kurinId, hurtokId: hurtok.id });
      await prisma.user.update({ where: { id: j2.id }, data: { archivedById: zv.id } });
      await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vyk.id, hurtokId: hurtok.id } });
      await prisma.kurinPosition.create({
        data: { kurinId, scope: PositionScope.KURIN, positionType: PositionType.KURINNYI, userId: j1.id, assignedById: zv.id },
      });
      const ann = await prisma.announcement.create({
        data: { kurinId, authorId: zv.id, title: 'A', content: {} },
      });
      await prisma.announcementReaction.create({ data: { announcementId: ann.id, userId: j1.id, emoji: ReactionEmoji.HEART } });
      await prisma.announcementImage.create({
        data: { announcementId: ann.id, kurinId, uploaderId: zv.id, data: Buffer.from('x'), mimeType: 'image/png' },
      });
      await prisma.kurinCalendarEvent.create({ data: { kurinId, title: 'E', startDate: new Date(), createdById: zv.id } });
      const item = await prisma.inventoryItem.create({ data: { kurinId, name: 'Намет', quantity: 1, createdById: zv.id } });
      await prisma.inventoryItemPhoto.create({ data: { itemId: item.id, driveFileId: 'd', url: 'u' } });
      await prisma.treasuryTransaction.create({
        data: { kurinId, type: TreasuryTransactionType.INCOME, amountCents: 100, description: 'd', occurredAt: new Date(), createdById: zv.id },
      });
      const skill = await createSkill(prisma, { name: 'Власна вмілість', kurinId });
      await prisma.junakSkill.create({
        data: { junakId: j1.id, levelId: skill.levels[0].id, achievedAt: new Date(), createdById: zv.id },
      });
      await prisma.junakProgress.create({
        data: { junakId: j1.id, pointId: points[0].id, status: ProgressStatus.DONE, confirmedById: vyk.id, confirmedAt: new Date() },
      });
      await prisma.junakStageProgress.create({
        data: { junakId: j1.id, stageId: stage.id, closedAt: new Date(), closedById: vyk.id },
      });
      await prisma.junakActivityEntry.create({
        data: { junakId: j1.id, title: 'T', occurredAt: new Date(), role: JunakActivityRole.PARTICIPANT },
      });
      await prisma.junakVfv.create({ data: { junakId: j1.id, createdById: zv.id } });
      await prisma.junakCamp.create({
        data: { junakId: j1.id, name: 'C', yearFrom: 2020, role: JunakActivityRole.PARTICIPANT, createdById: zv.id },
      });
      await prisma.junakRemark.create({
        data: { junakId: j1.id, kind: JunakRemarkKind.AWARD, text: 't', date: new Date(), createdById: zv.id },
      });
      await prisma.junakPastPosition.create({
        data: { junakId: j1.id, title: 'Гуртковий', scope: PositionScope.HURTOK, yearFrom: 2020, createdById: zv.id },
      });
      await prisma.guardianContact.create({
        data: { junakId: j1.id, name: 'Мама', phone: '1', relation: GuardianRelation.MOTHER },
      });
      const conv = await prisma.aiConversation.create({ data: { userId: j1.id } });
      await prisma.aiMessage.create({ data: { conversationId: conv.id, role: AiMessageRole.USER, content: 'hi' } });
      await prisma.aiUsageEvent.create({ data: { userId: j1.id, kind: AiUsageKind.MESSAGE, conversationId: conv.id } });
      await prisma.pushSubscription.create({ data: { userId: j1.id, endpoint: `e-${kurinId}`, p256dh: 'p', auth: 'a' } });
      const exp = new Date(Date.now() + 3600_000);
      await prisma.passwordResetToken.create({
        data: { userId: j1.id, tokenHash: `h1-${kurinId}`, purpose: TokenPurpose.RESET, expiresAt: exp },
      });
      await prisma.emailChangeRequest.create({ data: { userId: j1.id, newEmail: 'n@example.com', tokenHash: `h2-${kurinId}`, expiresAt: exp } });
      await prisma.profileChangeLog.create({ data: { userId: j1.id, field: 'f' } });
      await prisma.approvalRequest.create({
        data: { initiatedById: vyk.id, approvedById: zv.id, actionType: ApprovalActionType.CHANGE_FULL_NAME, newData: {} },
      });
      await prisma.auditLog.create({ data: { kurinId, actorId: zv.id, action: AuditAction.PROBY_POINT_CONFIRMED } });
      await prisma.junakImportMapping.create({ data: { kurinId, columnMapping: {}, positionValueMapping: {} } });
      return { kurin, program, users: [zv, vyk, j1, j2] };
    }

    it('delete-preview returns counts matching the seed', async () => {
      const { kurin } = await seedRichKurin();
      const res = await adminReq('get', `/admin/kurins/${kurin.id}/delete-preview`).expect(200);
      expect(res.body).toEqual({
        users: 4,
        hurtky: 1,
        announcements: 1,
        calendarEvents: 1,
        inventoryItems: 1,
        treasuryTransactions: 1,
      });
    });

    it('delete-preview returns 404 for an unknown kurin', async () => {
      await adminReq('get', '/admin/kurins/00000000-0000-0000-0000-000000000000/delete-preview').expect(404);
    });

    it('refuses to force-delete an active kurin (409)', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id, name: 'Активний' });
      await adminReq('delete', `/admin/kurins/${kurin.id}/force`).send({ confirmName: 'Активний' }).expect(409);
      expect(await prisma.kurin.findUnique({ where: { id: kurin.id } })).not.toBeNull();
    });

    it('refuses a wrong confirmName (400) and keeps the data', async () => {
      const { kurin } = await seedRichKurin();
      await adminReq('post', `/admin/kurins/${kurin.id}/deactivate`).expect(200);
      await adminReq('delete', `/admin/kurins/${kurin.id}/force`).send({ confirmName: 'Інша назва' }).expect(400);
      expect(await prisma.kurin.findUnique({ where: { id: kurin.id } })).not.toBeNull();
      expect(await prisma.user.count({ where: { kurinId: kurin.id } })).toBe(4);
    });

    it('deletes a deactivated kurin with all its data and leaves other kurins and global data intact', async () => {
      const { kurin, program } = await seedRichKurin();
      const other = await createKurin(prisma, { probyProgramId: program.id, name: 'Інший' });
      const otherUser = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: other.id });
      const otherAnn = await prisma.announcement.create({
        data: { kurinId: other.id, authorId: otherUser.id, title: 'Other', content: {} },
      });
      const globalSkill = await createSkill(prisma, { name: 'Глобальна вмілість', kurinId: null });

      await adminReq('post', `/admin/kurins/${kurin.id}/deactivate`).expect(200);
      await adminReq('delete', `/admin/kurins/${kurin.id}/force`).send({ confirmName: ' Курінь Видалюваний ' }).expect(204);

      expect(await prisma.kurin.findUnique({ where: { id: kurin.id } })).toBeNull();
      expect(await prisma.user.count({ where: { kurinId: kurin.id } })).toBe(0);
      expect(await prisma.hurtok.count({ where: { kurinId: kurin.id } })).toBe(0);
      expect(await prisma.skill.count({ where: { kurinId: kurin.id } })).toBe(0);
      expect(await prisma.announcement.count({ where: { kurinId: kurin.id } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { kurinId: kurin.id } })).toBe(0);
      expect(await prisma.aiConversation.count()).toBe(0);
      expect(await prisma.aiUsageEvent.count()).toBe(0);
      expect(await prisma.approvalRequest.count()).toBe(0);

      expect(await prisma.user.findUnique({ where: { id: otherUser.id } })).not.toBeNull();
      expect(await prisma.announcement.findUnique({ where: { id: otherAnn.id } })).not.toBeNull();
      expect(await prisma.skill.findUnique({ where: { id: globalSkill.id } })).not.toBeNull();
      expect(await prisma.probyProgram.findUnique({ where: { id: program.id } })).not.toBeNull();
      expect(await prisma.probyPoint.count()).toBe(1);
    });
  });
});
