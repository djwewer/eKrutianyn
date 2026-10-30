import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, PrismaClient, ProbyProgramVersion, Role, SkillGroup } from '@prisma/client';
import { bootApp } from './utils/boot-app';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createProbyProgramTree, createSkill, createUser, issueTokenFor } from './utils/fixtures';

describe('Skills catalog and kurin custom skills (e2e)', () => {
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
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Точка']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const otherKurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const otherZvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });
    return {
      kurin,
      otherKurin,
      zvyazkovyi,
      junak,
      tokens: {
        zvyazkovyi: issueTokenFor(jwtService, zvyazkovyi),
        vykhovnyk: issueTokenFor(jwtService, vykhovnyk),
        junak: issueTokenFor(jwtService, junak),
        other: issueTokenFor(jwtService, otherZvyazkovyi),
      },
    };
  }

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const customBody = {
    name: 'Знавець компʼютерів',
    group: 'SPECIAL',
    levels: [{ level: 1, requirements: ['Знати будову компʼютера', '   ', 'Встановити операційну систему'] }],
  };
  const auditOf = (kurinId: string, action: AuditAction) => prisma.auditLog.findMany({ where: { kurinId, action } });

  describe('GET /skills', () => {
    it('returns 9 groups in fixed order with global skills and only own custom skills', async () => {
      const { kurin, otherKurin, tokens } = await setup();
      await createSkill(prisma, { name: 'Картографія', group: SkillGroup.PRACTICAL, levels: [2] });
      await createSkill(prisma, { name: 'Астрономія', group: SkillGroup.SPECIAL, levels: [3, 1, 2] });
      await createSkill(prisma, { name: 'Знавець компʼютерів', group: SkillGroup.SPECIAL, kurinId: kurin.id });
      await createSkill(prisma, { name: 'Чужа вмілість', group: SkillGroup.SPECIAL, kurinId: otherKurin.id });

      for (const token of [tokens.junak, tokens.vykhovnyk, tokens.zvyazkovyi]) {
        const res = await http().get('/skills').set(auth(token)).expect(200);
        expect(res.body.map((g: { group: string }) => g.group)).toEqual([
          'PRACTICAL', 'FIRST_AID', 'NATURE', 'SPORT', 'HOME', 'SPECIAL', 'ARTS', 'AVIATION', 'SEA',
        ]);
        const special = res.body.find((g: { group: string }) => g.group === 'SPECIAL');
        expect(special.skills.map((s: { name: string; isCustom: boolean }) => [s.name, s.isCustom])).toEqual([
          ['Астрономія', false],
          ['Знавець компʼютерів', true],
        ]);
        expect(special.skills[0].levels.map((l: { level: number }) => l.level)).toEqual([1, 2, 3]);
        expect(special.skills[0].levels[0]).toEqual({
          id: expect.any(String),
          level: 1,
          note: null,
          requirements: [{ text: '1. Вимога рівня 1' }],
        });
      }
    });

    it('requires authentication', async () => {
      await http().get('/skills').expect(401);
    });
  });

  describe('POST /skills', () => {
    it('lets the zvyazkovyi create a custom skill without blank requirement lines, and logs it', async () => {
      const { kurin, zvyazkovyi, tokens } = await setup();
      const res = await http().post('/skills').set(auth(tokens.zvyazkovyi)).send(customBody).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        name: 'Знавець компʼютерів',
        group: 'SPECIAL',
        isCustom: true,
        levels: [
          {
            id: expect.any(String),
            level: 1,
            note: null,
            requirements: [{ text: 'Знати будову компʼютера' }, { text: 'Встановити операційну систему' }],
          },
        ],
      });
      expect((await prisma.skill.findUniqueOrThrow({ where: { id: res.body.id } })).kurinId).toBe(kurin.id);
      const entries = await auditOf(kurin.id, AuditAction.CUSTOM_SKILL_CREATED);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: res.body.id });
      expect(entries[0].details).toEqual({ skillName: 'Знавець компʼютерів', group: 'SPECIAL' });
    });

    it('forbids the vykhovnyk and the junak', async () => {
      const { tokens } = await setup();
      await http().post('/skills').set(auth(tokens.vykhovnyk)).send(customBody).expect(403);
      await http().post('/skills').set(auth(tokens.junak)).send(customBody).expect(403);
    });

    it('rejects a taken name (global or own, any case), repeated or unknown levels and empty requirements', async () => {
      const { tokens } = await setup();
      await createSkill(prisma, { name: 'Картографія' });
      const post = (body: object) => http().post('/skills').set(auth(tokens.zvyazkovyi)).send(body);
      await post({ ...customBody, name: 'картографія' }).expect(409);
      await post(customBody).expect(201);
      await post(customBody).expect(409);
      await post({ ...customBody, name: 'Нова', levels: [{ level: 1, requirements: ['а'] }, { level: 1, requirements: ['б'] }] }).expect(400);
      await post({ ...customBody, name: 'Нова', levels: [{ level: 4, requirements: ['а'] }] }).expect(400);
      await post({ ...customBody, name: 'Нова', levels: [{ level: 1, requirements: ['  '] }] }).expect(400);
      await post({ ...customBody, name: 'Нова', levels: [] }).expect(400);
    });

    it('rejects a whitespace-only name', async () => {
      const { tokens } = await setup();
      await http().post('/skills').set(auth(tokens.zvyazkovyi)).send({ ...customBody, name: '   ' }).expect(400);
      expect(await prisma.skill.count()).toBe(0);
    });

    it('lets another kurin use the same custom name', async () => {
      const { tokens } = await setup();
      await http().post('/skills').set(auth(tokens.zvyazkovyi)).send(customBody).expect(201);
      await http().post('/skills').set(auth(tokens.other)).send(customBody).expect(201);
    });
  });

  describe('PATCH /skills/:id', () => {
    it('renames, regroups and replaces the levels of an own custom skill, and logs it', async () => {
      const { kurin, tokens } = await setup();
      const created = await http().post('/skills').set(auth(tokens.zvyazkovyi)).send(customBody).expect(201);
      const res = await http()
        .patch(`/skills/${created.body.id}`)
        .set(auth(tokens.zvyazkovyi))
        .send({ name: 'Компʼютерна грамотність', group: 'ARTS', levels: [{ level: 2, requirements: ['Нова вимога'], note: 'нова вмілість' }] })
        .expect(200);
      expect(res.body).toMatchObject({
        name: 'Компʼютерна грамотність',
        group: 'ARTS',
        levels: [{ level: 2, note: 'нова вмілість', requirements: [{ text: 'Нова вимога' }] }],
      });
      expect(res.body.levels).toHaveLength(1);
      const entries = await auditOf(kurin.id, AuditAction.CUSTOM_SKILL_UPDATED);
      expect(entries[0].details).toEqual({ skillName: 'Компʼютерна грамотність', group: 'ARTS' });
    });

    it('rejects a whitespace-only name and a rename that clashes with an existing name', async () => {
      const { tokens } = await setup();
      await createSkill(prisma, { name: 'Картографія' });
      const created = await http().post('/skills').set(auth(tokens.zvyazkovyi)).send(customBody).expect(201);
      const patch = (name: string) => http().patch(`/skills/${created.body.id}`).set(auth(tokens.zvyazkovyi)).send({ name });
      await patch('   ').expect(400);
      await patch('картографія').expect(409);
      await http().patch(`/skills/${created.body.id}`).set(auth(tokens.zvyazkovyi)).send({ name: null }).expect(400);
      await http().patch(`/skills/${created.body.id}`).set(auth(tokens.zvyazkovyi)).send({ group: null }).expect(400);
      expect((await prisma.skill.findUniqueOrThrow({ where: { id: created.body.id } })).name).toBe('Знавець компʼютерів');
    });

    it('refuses to drop a level a junak has already achieved', async () => {
      const { junak, zvyazkovyi, tokens } = await setup();
      const created = await http().post('/skills').set(auth(tokens.zvyazkovyi)).send(customBody).expect(201);
      await prisma.junakSkill.create({
        data: { junakId: junak.id, levelId: created.body.levels[0].id, achievedAt: new Date('2025-01-10T00:00:00.000Z'), createdById: zvyazkovyi.id },
      });
      await http()
        .patch(`/skills/${created.body.id}`)
        .set(auth(tokens.zvyazkovyi))
        .send({ levels: [{ level: 2, requirements: ['Інша'] }] })
        .expect(409);
      expect(await prisma.skillLevel.count({ where: { skillId: created.body.id, level: 1 } })).toBe(1);
    });

    it('keeps the global catalog read-only and hides other kurins custom skills', async () => {
      const { otherKurin, tokens } = await setup();
      const global = await createSkill(prisma, { name: 'Картографія' });
      const foreign = await createSkill(prisma, { name: 'Чужа', kurinId: otherKurin.id });
      await http().patch(`/skills/${global.id}`).set(auth(tokens.zvyazkovyi)).send({ name: 'Х' }).expect(403);
      await http().delete(`/skills/${global.id}`).set(auth(tokens.zvyazkovyi)).expect(403);
      await http().patch(`/skills/${foreign.id}`).set(auth(tokens.zvyazkovyi)).send({ name: 'Х' }).expect(404);
      await http().delete(`/skills/${foreign.id}`).set(auth(tokens.zvyazkovyi)).expect(404);
    });
  });

  describe('DELETE /skills/:id', () => {
    it('deletes an unused custom skill with its levels, and logs it', async () => {
      const { kurin, tokens } = await setup();
      const created = await http().post('/skills').set(auth(tokens.zvyazkovyi)).send(customBody).expect(201);
      await http().delete(`/skills/${created.body.id}`).set(auth(tokens.zvyazkovyi)).expect(200, { success: true });
      expect(await prisma.skill.count({ where: { id: created.body.id } })).toBe(0);
      expect(await prisma.skillLevel.count({ where: { skillId: created.body.id } })).toBe(0);
      const entries = await auditOf(kurin.id, AuditAction.CUSTOM_SKILL_DELETED);
      expect(entries[0].details).toEqual({ skillName: 'Знавець компʼютерів', group: 'SPECIAL' });
    });

    it('blocks deleting a custom skill a junak has achieved', async () => {
      const { junak, zvyazkovyi, tokens } = await setup();
      const created = await http().post('/skills').set(auth(tokens.zvyazkovyi)).send(customBody).expect(201);
      await prisma.junakSkill.create({
        data: { junakId: junak.id, levelId: created.body.levels[0].id, achievedAt: new Date('2025-01-10T00:00:00.000Z'), createdById: zvyazkovyi.id },
      });
      await http().delete(`/skills/${created.body.id}`).set(auth(tokens.zvyazkovyi)).expect(409);
    });
  });
});
