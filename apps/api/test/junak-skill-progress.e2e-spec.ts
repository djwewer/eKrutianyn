import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, PrismaClient, Role } from '@prisma/client';
import { bootApp } from './utils/boot-app';
import { cleanDatabase } from './utils/clean-db';
import { createSkill, issueTokenFor } from './utils/fixtures';
import { createHistoryWorld } from './utils/history-fixtures';

describe('Junak skills in progress — start, sign, credit, remove (e2e)', () => {
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
    // two requirements on level 2
    await prisma.skillLevel.update({
      where: { id: skill.levels[1].id },
      data: { requirements: [{ text: '1. Перша' }, { text: '2. Друга', items: ['а) x'] }] },
    });
    const foreign = await createSkill(prisma, { name: 'Чужа', kurinId: world.otherKurin.id });
    const token = (user: { id: string; role: Role; kurinId: string }) => issueTokenFor(jwtService, user);
    return { ...world, level1: skill.levels[0], level2: skill.levels[1], foreignLevel: foreign.levels[0], token };
  }

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const start = (junakId: string, t: string, levelId: string) =>
    http().post(`/users/${junakId}/skills/start`).set(auth(t)).send({ levelId });
  const sign = (junakId: string, t: string, id: string, i: number | string) =>
    http().put(`/users/${junakId}/skills/${id}/requirements/${i}`).set(auth(t));
  const unsign = (junakId: string, t: string, id: string, i: number | string) =>
    http().delete(`/users/${junakId}/skills/${id}/requirements/${i}`).set(auth(t));
  const achieve = (junakId: string, t: string, id: string, body: Record<string, unknown>) =>
    http().post(`/users/${junakId}/skills/${id}/achieve`).set(auth(t)).send(body);
  const remove = (junakId: string, t: string, id: string) => http().delete(`/users/${junakId}/skills/${id}`).set(auth(t));
  const list = (junakId: string, t: string) => http().get(`/users/${junakId}/skills`).set(auth(t));
  const audit = (kurinId: string, action: AuditAction) => prisma.auditLog.findMany({ where: { kurinId, action } });

  describe('start', () => {
    it('lets the junak, the zvyazkovyi and the assigned vykhovnyk start; returns the started view and audits', async () => {
      const w = await setup();
      const res = await start(w.junak.id, w.token(w.junak), w.level2.id).expect(201);
      expect(res.body).toMatchObject({
        levelId: w.level2.id,
        skillName: 'Картографія',
        level: 2,
        status: 'STARTED',
        achievedAt: null,
        startedAt: expect.any(String),
        requirements: [{ text: '1. Перша' }, { text: '2. Друга', items: ['а) x'] }],
        signs: [],
      });
      await start(w.junak.id, w.token(w.zvyazkovyi), w.level1.id).expect(201);
      await prisma.junakSkill.deleteMany({});
      await start(w.junak.id, w.token(w.vykhovnykA), w.level1.id).expect(201);
      const entries = await audit(w.kurin.id, AuditAction.SKILL_STARTED);
      expect(entries).toHaveLength(3);
      expect(entries[0]).toMatchObject({ subjectUserId: w.junak.id });
    });

    it('forbids an unassigned vykhovnyk; a junak cannot start for another junak', async () => {
      const w = await setup();
      await start(w.junak.id, w.token(w.vykhovnykB), w.level1.id).expect(403);
      await start(w.junakNoHurtok.id, w.token(w.junak), w.level1.id).expect(403);
    });

    it('409 with the exact message on duplicate (started or achieved); 404 for unknown / foreign custom level', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      await start(w.junak.id, zv, w.level1.id).expect(201);
      const dup = await start(w.junak.id, zv, w.level1.id).expect(409);
      expect(dup.body.message).toBe('Цю вмілість уже розпочато або здобуто');
      await http().post(`/users/${w.junak.id}/skills`).set(auth(zv)).send({ levelId: w.level2.id, achievedAt: '2025-05-01' }).expect(201);
      const dup2 = await start(w.junak.id, zv, w.level2.id).expect(409);
      expect(dup2.body.message).toBe('Цю вмілість уже розпочато або здобуто');
      const dup3 = await http().post(`/users/${w.junak.id}/skills`).set(auth(zv)).send({ levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(409);
      expect(dup3.body.message).toBe('Цю вмілість уже розпочато або здобуто');
      await start(w.junak.id, zv, w.foreignLevel.id).expect(404);
      await start(w.junak.id, zv, '00000000-0000-4000-8000-000000000000').expect(404);
    });

    it('an archived junak is read-only (cannot start for self)', async () => {
      const w = await setup();
      await prisma.user.update({ where: { id: w.junak.id }, data: { archivedAt: new Date() } });
      // an archived junak cannot even authenticate; writers get 400
      await start(w.junak.id, w.token(w.junak), w.level1.id).expect(401);
      await start(w.junak.id, w.token(w.zvyazkovyi), w.level1.id).expect(400);
    });
  });

  describe('list', () => {
    it('returns started and achieved items, canEdit and canStart', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      await start(w.junak.id, zv, w.level1.id).expect(201);
      await http().post(`/users/${w.junak.id}/skills`).set(auth(zv)).send({ levelId: w.level2.id, achievedAt: '2025-05-01' }).expect(201);
      const own = (await list(w.junak.id, w.token(w.junak)).expect(200)).body;
      expect(own).toMatchObject({ canEdit: false, canStart: true });
      expect(own.items.map((i: { status: string }) => i.status).sort()).toEqual(['ACHIEVED', 'STARTED']);
      const asZv = (await list(w.junak.id, zv).expect(200)).body;
      expect(asZv).toMatchObject({ canEdit: true, canStart: true });
      const asAssigned = await list(w.junak.id, w.token(w.vykhovnykA)).expect(200);
      expect(asAssigned.body).toMatchObject({ canEdit: true, canStart: true });
      // an unassigned vykhovnyk cannot see this junak at all; one who can see but not write gets canStart false
      const noHurtok = await list(w.junakNoHurtok.id, w.token(w.vykhovnykA)).expect(200);
      expect(noHurtok.body).toMatchObject({ canEdit: false, canStart: false });
      expect(own.items[0].status).toBe('STARTED');
      expect(asZv.items[0].status).toBe('STARTED');
    });
  });

  describe('sign / unsign', () => {
    it('signs and unsigns by the vykhovnyk with names and audits', async () => {
      const w = await setup();
      const created = await start(w.junak.id, w.token(w.junak), w.level2.id).expect(201);
      const id = created.body.id;
      const res = await sign(w.junak.id, w.token(w.vykhovnykA), id, 1).expect(200);
      expect(res.body.signs).toEqual([{ index: 1, signedAt: expect.any(String), signedByName: expect.any(String) }]);
      await sign(w.junak.id, w.token(w.vykhovnykA), id, 1).expect(200); // idempotent
      expect((await prisma.junakSkillRequirementSign.count())).toBe(1);
      const un = await unsign(w.junak.id, w.token(w.vykhovnykA), id, 1).expect(200);
      expect(un.body.signs).toEqual([]);
      expect(await audit(w.kurin.id, AuditAction.SKILL_REQUIREMENT_SIGNED)).toHaveLength(1);
      expect(await audit(w.kurin.id, AuditAction.SKILL_REQUIREMENT_UNSIGNED)).toHaveLength(1);
    });

    it('403 for the junak and an unassigned vykhovnyk; 400 for a bad index; 409 on achieved', async () => {
      const w = await setup();
      const id = (await start(w.junak.id, w.token(w.junak), w.level2.id).expect(201)).body.id;
      await sign(w.junak.id, w.token(w.junak), id, 0).expect(403);
      await unsign(w.junak.id, w.token(w.junak), id, 0).expect(403);
      await sign(w.junak.id, w.token(w.vykhovnykB), id, 0).expect(403);
      const zv = w.token(w.zvyazkovyi);
      await sign(w.junak.id, zv, id, 2).expect(400);
      await sign(w.junak.id, zv, id, -1).expect(400);
      await sign(w.junak.id, zv, id, 'abc').expect(400);
      await achieve(w.junak.id, zv, id, { achievedAt: '2025-05-01' }).expect(201);
      await sign(w.junak.id, zv, id, 0).expect(409);
      await unsign(w.junak.id, zv, id, 0).expect(409);
    });
  });

  describe('achieve', () => {
    it('credits with fewer than all signed, audits SKILL_ACHIEVED; 409 again; 400 for a future date; 403 for the junak', async () => {
      const w = await setup();
      const id = (await start(w.junak.id, w.token(w.junak), w.level2.id).expect(201)).body.id;
      const vk = w.token(w.vykhovnykA);
      const future = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
      await achieve(w.junak.id, vk, id, { achievedAt: future }).expect(400);
      await achieve(w.junak.id, w.token(w.junak), id, { achievedAt: '2025-05-01' }).expect(403);
      await achieve(w.junak.id, w.token(w.vykhovnykB), id, { achievedAt: '2025-05-01' }).expect(403);
      const res = await achieve(w.junak.id, vk, id, { achievedAt: '2025-05-01', examiner: ' Остап ', certificateNumber: '7' }).expect(201);
      expect(res.body).toMatchObject({ status: 'ACHIEVED', achievedAt: '2025-05-01', examiner: 'Остап', certificateNumber: '7' });
      await achieve(w.junak.id, vk, id, { achievedAt: '2025-05-02' }).expect(409);
      expect(await audit(w.kurin.id, AuditAction.SKILL_ACHIEVED)).toHaveLength(1);
    });
  });

  describe('update (PATCH) on a started record', () => {
    it('409', async () => {
      const w = await setup();
      const id = (await start(w.junak.id, w.token(w.zvyazkovyi), w.level1.id).expect(201)).body.id;
      await http().patch(`/users/${w.junak.id}/skills/${id}`).set(auth(w.token(w.zvyazkovyi))).send({ examiner: 'x' }).expect(409);
    });
  });

  describe('remove', () => {
    it('junak removes own started record with zero signs (200, SKILL_REMOVED) but not with a sign (403)', async () => {
      const w = await setup();
      const jt = w.token(w.junak);
      const a = (await start(w.junak.id, jt, w.level1.id).expect(201)).body.id;
      await remove(w.junak.id, jt, a).expect(200, { success: true });
      expect(await audit(w.kurin.id, AuditAction.SKILL_REMOVED)).toHaveLength(1);
      const b = (await start(w.junak.id, jt, w.level2.id).expect(201)).body.id;
      await sign(w.junak.id, w.token(w.vykhovnykA), b, 0).expect(200);
      const res = await remove(w.junak.id, jt, b).expect(403);
      expect(res.body.message).toBe('Розпочату вмілість з підписами може прибрати лише виховник');
      await remove(w.junak.id, w.token(w.vykhovnykA), b).expect(200);
      expect(await prisma.junakSkill.count()).toBe(0);
      expect(await prisma.junakSkillRequirementSign.count()).toBe(0);
    });

    it('the junak cannot remove an achieved record or another junak record; unassigned vykhovnyk is 403', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const ach = await http().post(`/users/${w.junak.id}/skills`).set(auth(zv)).send({ levelId: w.level1.id, achievedAt: '2025-05-01' }).expect(201);
      await remove(w.junak.id, w.token(w.junak), ach.body.id).expect(403);
      const st = (await start(w.junak.id, zv, w.level2.id).expect(201)).body.id;
      await remove(w.junak.id, w.token(w.vykhovnykB), st).expect(403);
      await remove(w.junakNoHurtok.id, w.token(w.junak), st).expect(403);
      await remove(w.junak.id, zv, ach.body.id).expect(200);
      expect(await audit(w.kurin.id, AuditAction.SKILL_REMOVED)).toHaveLength(1);
      await remove(w.junak.id, zv, st).expect(200);
      expect(await audit(w.kurin.id, AuditAction.SKILL_REMOVED)).toHaveLength(2);
    });
  });

  describe('cross-junak, archived, no-op and stale cases', () => {
    it('another junak record id is 404 for self-remove, sign and achieve', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const other = (await start(w.junakNoHurtok.id, zv, w.level1.id).expect(201)).body.id;
      await remove(w.junak.id, w.token(w.junak), other).expect(404);
      await sign(w.junak.id, w.token(w.vykhovnykA), other, 0).expect(404);
      await achieve(w.junak.id, w.token(w.vykhovnykA), other, { achievedAt: '2025-05-01' }).expect(404);
      expect(await prisma.junakSkill.count()).toBe(1);
    });

    it('an archived junak: sign, achieve and writer remove are 400', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const id = (await start(w.junak.id, zv, w.level2.id).expect(201)).body.id;
      await prisma.user.update({ where: { id: w.junak.id }, data: { archivedAt: new Date() } });
      await sign(w.junak.id, zv, id, 0).expect(400);
      await achieve(w.junak.id, zv, id, { achievedAt: '2025-05-01' }).expect(400);
      await remove(w.junak.id, zv, id).expect(400);
    });

    it('unsigning an unsigned index is a no-op without audit', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const id = (await start(w.junak.id, zv, w.level2.id).expect(201)).body.id;
      await unsign(w.junak.id, zv, id, 0).expect(200);
      expect(await audit(w.kurin.id, AuditAction.SKILL_REQUIREMENT_UNSIGNED)).toHaveLength(0);
    });

    it('stale signs: hidden in the view, but still removable', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const id = (await start(w.junak.id, zv, w.level2.id).expect(201)).body.id;
      await sign(w.junak.id, zv, id, 1).expect(200);
      await prisma.skillLevel.update({ where: { id: w.level2.id }, data: { requirements: [{ text: '1. Перша' }] } });
      const view = (await list(w.junak.id, zv).expect(200)).body.items[0];
      expect(view.signs).toEqual([]);
      await unsign(w.junak.id, zv, id, 1).expect(200);
      expect(await prisma.junakSkillRequirementSign.count()).toBe(0);
      await sign(w.junak.id, zv, id, 1).expect(400);
    });

    it('concurrent first signs do not 500 and audit once', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const id = (await start(w.junak.id, zv, w.level2.id).expect(201)).body.id;
      const results = await Promise.all([sign(w.junak.id, zv, id, 0), sign(w.junak.id, zv, id, 0), sign(w.junak.id, zv, id, 0)]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(await prisma.junakSkillRequirementSign.count()).toBe(1);
      expect(await audit(w.kurin.id, AuditAction.SKILL_REQUIREMENT_SIGNED)).toHaveLength(1);
    });
  });
});
