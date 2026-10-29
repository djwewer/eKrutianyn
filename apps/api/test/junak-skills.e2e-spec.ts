import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, PrismaClient, Role } from '@prisma/client';
import { bootApp } from './utils/boot-app';
import { cleanDatabase } from './utils/clean-db';
import { createKurinniyUser, createSkill, issueTokenFor } from './utils/fixtures';
import { createHistoryWorld } from './utils/history-fixtures';

describe('Junak skills — achieved skill levels (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    ({ app, jwtService } = await bootApp());
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
    const world = await createHistoryWorld(prisma);
    const skill = await createSkill(prisma, { name: 'Картографія', levels: [1, 2] });
    const foreign = await createSkill(prisma, { name: 'Чужа', kurinId: world.otherKurin.id });
    const token = (user: { id: string; role: Role; kurinId: string }) => issueTokenFor(jwtService, user);
    return { ...world, skill, level1: skill.levels[0], level2: skill.levels[1], foreignLevel: foreign.levels[0], token };
  }

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const add = (junakId: string, token: string, body: Record<string, unknown>) =>
    http().post(`/users/${junakId}/skills`).set(auth(token)).send(body);
  const list = (junakId: string, token: string) => http().get(`/users/${junakId}/skills`).set(auth(token));
  const auditOf = (kurinId: string, action: AuditAction) => prisma.auditLog.findMany({ where: { kurinId, action } });

  describe('POST /users/:junakId/skills', () => {
    it('lets the zvyazkovyi record an achieved level and logs it without free text', async () => {
      const w = await setup();
      const res = await add(w.junak.id, w.token(w.zvyazkovyi), {
        levelId: w.level2.id,
        achievedAt: '2025-05-01',
        examiner: '  Остап Вишня ',
        certificateNumber: '',
      }).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        levelId: w.level2.id,
        skillId: w.skill.id,
        skillName: 'Картографія',
        group: 'PRACTICAL',
        level: 2,
        isCustom: false,
        achievedAt: '2025-05-01',
        examiner: 'Остап Вишня',
        certificateNumber: null,
      });
      const entries = await auditOf(w.kurin.id, AuditAction.SKILL_ACHIEVED);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorId: w.zvyazkovyi.id, subjectUserId: w.junak.id, entityId: res.body.id });
      expect(entries[0].details).toEqual({ subjectName: 'Test User', skillName: 'Картографія', level: 2, achievedAt: '2025-05-01' });
    });

    it('lets the vykhovnyk of the junak hurtok write; not another vykhovnyk, the junak or the kurinniy', async () => {
      const w = await setup();
      await add(w.junak.id, w.token(w.vykhovnykA), { levelId: w.level2.id, achievedAt: '2025-05-01' }).expect(201);
      await add(w.junak.id, w.token(w.vykhovnykB), { levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(403);
      await add(w.junak.id, w.token(w.junak), { levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(403);
      const kurinniy = await createKurinniyUser(prisma, { kurinId: w.kurin.id });
      await add(w.junak.id, w.token(kurinniy), { levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(403);
    });

    it('lets only the zvyazkovyi write for a junak without a hurtok', async () => {
      const w = await setup();
      await add(w.junakNoHurtok.id, w.token(w.vykhovnykA), { levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(403);
      await add(w.junakNoHurtok.id, w.token(w.zvyazkovyi), { levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(201);
    });

    it('isolates kurins: another kurin zvyazkovyi gets 404, another kurin custom level is not found', async () => {
      const w = await setup();
      await add(w.junak.id, w.token(w.otherZvyazkovyi), { levelId: w.level2.id, achievedAt: '2025-05-01' }).expect(404);
      await add(w.junak.id, w.token(w.zvyazkovyi), { levelId: w.foreignLevel.id, achievedAt: '2025-05-01' }).expect(404);
    });

    it('rejects a duplicate level, bad dates and an archived junak', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      await add(w.junak.id, zv, { levelId: w.level2.id, achievedAt: '2025-05-01' }).expect(201);
      await add(w.junak.id, zv, { levelId: w.level2.id, achievedAt: '2025-06-01' }).expect(409);
      const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await add(w.junak.id, zv, { levelId: w.level1.id, achievedAt: inThreeDays }).expect(400);
      await add(w.junak.id, zv, { levelId: w.level1.id, achievedAt: '1989-12-31' }).expect(400);
      await add(w.junak.id, zv, { levelId: w.level1.id, achievedAt: 'вчора' }).expect(400);
      await prisma.user.update({ where: { id: w.junakNoHurtok.id }, data: { archivedAt: new Date() } });
      await add(w.junakNoHurtok.id, zv, { levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(400);
    });
  });

  describe('GET /users/:junakId/skills', () => {
    it('returns canEdit for the zvyazkovyi and own vykhovnyk; read-only for the junak and the kurinniy', async () => {
      const w = await setup();
      await add(w.junak.id, w.token(w.zvyazkovyi), { levelId: w.level2.id, achievedAt: '2025-05-01' }).expect(201);
      await add(w.junak.id, w.token(w.zvyazkovyi), { levelId: w.level1.id, achievedAt: '2024-04-01' }).expect(201);

      const asZvyazkovyi = await list(w.junak.id, w.token(w.zvyazkovyi)).expect(200);
      expect(asZvyazkovyi.body.canEdit).toBe(true);
      expect(asZvyazkovyi.body.items.map((i: { level: number }) => i.level)).toEqual([2, 1]);
      expect((await list(w.junak.id, w.token(w.vykhovnykA)).expect(200)).body.canEdit).toBe(true);
      const own = await list(w.junak.id, w.token(w.junak)).expect(200);
      expect(own.body.canEdit).toBe(false);
      expect(own.body.items).toHaveLength(2);
      const kurinniy = await createKurinniyUser(prisma, { kurinId: w.kurin.id });
      expect((await list(w.junak.id, w.token(kurinniy)).expect(200)).body.canEdit).toBe(false);
    });

    it('hides the junak from another hurtok vykhovnyk, another junak and another kurin', async () => {
      const w = await setup();
      await list(w.junak.id, w.token(w.vykhovnykB)).expect(404);
      await list(w.junak.id, w.token(w.junakNoHurtok)).expect(404);
      await list(w.junak.id, w.token(w.otherZvyazkovyi)).expect(404);
    });

    it('shows a junak without hurtok to a vykhovnyk read-only, and an archived junak to the zvyazkovyi read-only', async () => {
      const w = await setup();
      expect((await list(w.junakNoHurtok.id, w.token(w.vykhovnykA)).expect(200)).body.canEdit).toBe(false);
      await prisma.user.update({ where: { id: w.junakNoHurtok.id }, data: { archivedAt: new Date() } });
      expect((await list(w.junakNoHurtok.id, w.token(w.zvyazkovyi)).expect(200)).body.canEdit).toBe(false);
    });
  });

  describe('PATCH and DELETE /users/:junakId/skills/:id', () => {
    it('updates the date, examiner and certificate number, and logs SKILL_UPDATED', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const created = await add(w.junak.id, zv, { levelId: w.level2.id, achievedAt: '2025-05-01', examiner: 'Остап' }).expect(201);
      const res = await http()
        .patch(`/users/${w.junak.id}/skills/${created.body.id}`)
        .set(auth(w.token(w.vykhovnykA)))
        .send({ achievedAt: '2025-04-20', examiner: '', certificateNumber: '17/2025' })
        .expect(200);
      expect(res.body).toMatchObject({ achievedAt: '2025-04-20', examiner: null, certificateNumber: '17/2025' });
      const entries = await auditOf(w.kurin.id, AuditAction.SKILL_UPDATED);
      expect(entries[0].details).toEqual({ subjectName: 'Test User', skillName: 'Картографія', level: 2, achievedAt: '2025-04-20' });
    });

    it('rejects clearing the achievement date', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const created = await add(w.junak.id, zv, { levelId: w.level2.id, achievedAt: '2025-05-01' }).expect(201);
      await http().patch(`/users/${w.junak.id}/skills/${created.body.id}`).set(auth(zv)).send({ achievedAt: null }).expect(400);
    });

    it('removes the record and logs SKILL_REMOVED; a record reached through another junak path is 404', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const created = await add(w.junak.id, zv, { levelId: w.level2.id, achievedAt: '2025-05-01' }).expect(201);
      await http().delete(`/users/${w.junakNoHurtok.id}/skills/${created.body.id}`).set(auth(zv)).expect(404);
      await http().delete(`/users/${w.junak.id}/skills/${created.body.id}`).set(auth(zv)).expect(200, { success: true });
      expect((await list(w.junak.id, zv).expect(200)).body.items).toEqual([]);
      const entries = await auditOf(w.kurin.id, AuditAction.SKILL_REMOVED);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ subjectUserId: w.junak.id, entityId: created.body.id });
    });
  });
});
