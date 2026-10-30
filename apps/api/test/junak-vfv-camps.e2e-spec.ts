import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, PrismaClient, Role } from '@prisma/client';
import { bootApp } from './utils/boot-app';
import { cleanDatabase } from './utils/clean-db';
import { issueTokenFor } from './utils/fixtures';
import { createHistoryWorld } from './utils/history-fixtures';

describe('Junak history — VFV and camps (e2e)', () => {
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
    const token = (user: { id: string; role: Role; kurinId: string }) => issueTokenFor(jwtService, user);
    return { ...world, token };
  }

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const auditOf = (kurinId: string, action: AuditAction) =>
    prisma.auditLog.findMany({ where: { kurinId, action }, orderBy: { createdAt: 'asc' } });
  const currentYear = new Date().getUTCFullYear();

  describe('VFV', () => {
    it('adds, updates and removes a VFV record, logging each step without the note', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const created = await http()
        .post(`/users/${w.junak.id}/vfv`)
        .set(auth(zv))
        .send({ achievedAt: '2024-06-01', note: '  Склав усі норми ' })
        .expect(201);
      expect(created.body).toEqual({ id: expect.any(String), achievedAt: '2024-06-01', note: 'Склав усі норми' });

      const updated = await http()
        .patch(`/users/${w.junak.id}/vfv/${created.body.id}`)
        .set(auth(w.token(w.vykhovnykA)))
        .send({ achievedAt: null, note: '' })
        .expect(200);
      expect(updated.body).toEqual({ id: created.body.id, achievedAt: null, note: null });

      await http().delete(`/users/${w.junak.id}/vfv/${created.body.id}`).set(auth(zv)).expect(200, { success: true });
      expect(await prisma.junakVfv.count()).toBe(0);

      const added = await auditOf(w.kurin.id, AuditAction.VFV_ADDED);
      expect(added[0]).toMatchObject({ actorId: w.zvyazkovyi.id, subjectUserId: w.junak.id, entityId: created.body.id });
      expect(added[0].details).toEqual({ subjectName: 'Test User', achievedAt: '2024-06-01' });
      expect((await auditOf(w.kurin.id, AuditAction.VFV_UPDATED))[0].details).toEqual({ subjectName: 'Test User', achievedAt: null });
      expect(await auditOf(w.kurin.id, AuditAction.VFV_REMOVED)).toHaveLength(1);
    });

    it('accepts a VFV record without a date, rejects a future date', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      await http().post(`/users/${w.junak.id}/vfv`).set(auth(zv)).send({}).expect(201);
      const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await http().post(`/users/${w.junak.id}/vfv`).set(auth(zv)).send({ achievedAt: inThreeDays }).expect(400);
    });

    it('rejects out-of-range dates on PATCH as well, and writes for an archived junak', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const created = await http().post(`/users/${w.junak.id}/vfv`).set(auth(zv)).send({}).expect(201);
      const url = `/users/${w.junak.id}/vfv/${created.body.id}`;
      const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await http().patch(url).set(auth(zv)).send({ achievedAt: inThreeDays }).expect(400);
      await http().patch(url).set(auth(zv)).send({ achievedAt: '1989-12-31' }).expect(400);
      await http().post(`/users/${w.junak.id}/vfv`).set(auth(zv)).send({ achievedAt: '1989-12-31' }).expect(400);
      await prisma.user.update({ where: { id: w.junak.id }, data: { archivedAt: new Date() } });
      await http().post(`/users/${w.junak.id}/vfv`).set(auth(zv)).send({}).expect(400);
      await http().patch(url).set(auth(zv)).send({ note: 'x' }).expect(400);
      await http().delete(url).set(auth(zv)).expect(400);
      expect(await prisma.junakVfv.count()).toBe(1);
    });

    it('applies the write rules: other vykhovnyk 403, junak 403, other kurin 404, foreign record 404', async () => {
      const w = await setup();
      await http().post(`/users/${w.junak.id}/vfv`).set(auth(w.token(w.vykhovnykB))).send({}).expect(403);
      await http().post(`/users/${w.junak.id}/vfv`).set(auth(w.token(w.junak))).send({}).expect(403);
      await http().post(`/users/${w.junak.id}/vfv`).set(auth(w.token(w.otherZvyazkovyi))).send({}).expect(404);
      const created = await http().post(`/users/${w.junak.id}/vfv`).set(auth(w.token(w.zvyazkovyi))).send({}).expect(201);
      await http()
        .patch(`/users/${w.junakNoHurtok.id}/vfv/${created.body.id}`)
        .set(auth(w.token(w.zvyazkovyi)))
        .send({ note: 'x' })
        .expect(404);
    });
  });

  describe('Camps', () => {
    it('adds, updates and removes a camp, logging name, years and role', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const created = await http()
        .post(`/users/${w.junak.id}/camps`)
        .set(auth(zv))
        .send({ name: ' Вовча тропа ', yearFrom: 2021, yearTo: 2024, role: 'PROVID' })
        .expect(201);
      expect(created.body).toEqual({ id: expect.any(String), name: 'Вовча тропа', yearFrom: 2021, yearTo: 2024, role: 'PROVID' });

      const updated = await http()
        .patch(`/users/${w.junak.id}/camps/${created.body.id}`)
        .set(auth(zv))
        .send({ yearTo: null, role: 'PARTICIPANT' })
        .expect(200);
      expect(updated.body).toMatchObject({ yearFrom: 2021, yearTo: null, role: 'PARTICIPANT' });

      await http().delete(`/users/${w.junak.id}/camps/${created.body.id}`).set(auth(zv)).expect(200, { success: true });

      expect((await auditOf(w.kurin.id, AuditAction.CAMP_ADDED))[0].details).toEqual({
        subjectName: 'Test User',
        campName: 'Вовча тропа',
        yearFrom: 2021,
        yearTo: 2024,
        role: 'PROVID',
      });
      expect((await auditOf(w.kurin.id, AuditAction.CAMP_UPDATED))[0].details).toMatchObject({ yearTo: null, role: 'PARTICIPANT' });
      expect(await auditOf(w.kurin.id, AuditAction.CAMP_REMOVED)).toHaveLength(1);
    });

    it('validates name and years, including a PATCH that would put yearTo before yearFrom', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const post = (body: object) => http().post(`/users/${w.junak.id}/camps`).set(auth(zv)).send(body);
      await post({ name: '   ', yearFrom: 2021, role: 'PARTICIPANT' }).expect(400);
      await post({ name: 'Табір', yearFrom: 1989, role: 'PARTICIPANT' }).expect(400);
      await post({ name: 'Табір', yearFrom: currentYear + 1, role: 'PARTICIPANT' }).expect(400);
      await post({ name: 'Табір', yearFrom: 2023, yearTo: 2022, role: 'PARTICIPANT' }).expect(400);
      await post({ name: 'Табір', yearFrom: 2023, role: 'GUEST' }).expect(400);
      const created = await post({ name: 'Табір', yearFrom: 2023, role: 'PARTICIPANT' }).expect(201);
      await http()
        .patch(`/users/${w.junak.id}/camps/${created.body.id}`)
        .set(auth(zv))
        .send({ yearFrom: 2025, yearTo: 2024 })
        .expect(400);
    });

    it('validates years and blank name on PATCH, with null not slipping through, and rejects writes on an archived junak', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const created = await http()
        .post(`/users/${w.junak.id}/camps`)
        .set(auth(zv))
        .send({ name: 'Табір', yearFrom: 2023, role: 'PARTICIPANT' })
        .expect(201);
      const url = `/users/${w.junak.id}/camps/${created.body.id}`;
      const patch = (body: object) => http().patch(url).set(auth(zv)).send(body);
      await patch({ name: '   ' }).expect(400);
      await patch({ yearFrom: 1989 }).expect(400);
      await patch({ yearFrom: currentYear + 1 }).expect(400);
      await patch({ yearTo: currentYear + 1 }).expect(400);
      await patch({ yearTo: 2022 }).expect(400);
      await patch({ name: null }).expect(400);
      await patch({ yearFrom: null }).expect(400);
      await patch({ role: null }).expect(400);
      await patch({ role: 'GUEST' }).expect(400);
      expect(await prisma.junakCamp.findUnique({ where: { id: created.body.id } })).toMatchObject({
        name: 'Табір',
        yearFrom: 2023,
        yearTo: null,
        role: 'PARTICIPANT',
      });
      await prisma.user.update({ where: { id: w.junak.id }, data: { archivedAt: new Date() } });
      await patch({ name: 'Інший' }).expect(400);
      await http().delete(url).set(auth(zv)).expect(400);
      expect(await prisma.junakCamp.count()).toBe(1);
    });

    it('lets only the zvyazkovyi write for a junak without hurtok and nobody for an archived junak', async () => {
      const w = await setup();
      const body = { name: 'Табір', yearFrom: 2023, role: 'PARTICIPANT' };
      await http().post(`/users/${w.junakNoHurtok.id}/camps`).set(auth(w.token(w.vykhovnykA))).send(body).expect(403);
      await http().post(`/users/${w.junakNoHurtok.id}/camps`).set(auth(w.token(w.zvyazkovyi))).send(body).expect(201);
      await prisma.user.update({ where: { id: w.junakNoHurtok.id }, data: { archivedAt: new Date() } });
      await http().post(`/users/${w.junakNoHurtok.id}/camps`).set(auth(w.token(w.zvyazkovyi))).send(body).expect(400);
    });
  });
});
