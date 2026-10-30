import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, PrismaClient, Role } from '@prisma/client';
import { bootApp } from './utils/boot-app';
import { cleanDatabase } from './utils/clean-db';
import { issueTokenFor } from './utils/fixtures';
import { createHistoryWorld } from './utils/history-fixtures';

describe('Junak history — remarks, past positions, dates (e2e)', () => {
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
  const warning = { kind: 'WARNING', text: 'Запізнився на три сходини поспіль', howToFix: 'Відвідати наступні чотири сходини вчасно', date: '2025-03-10' };

  describe('Remarks', () => {
    it('records a warning with both fields and logs only kind and date', async () => {
      const w = await setup();
      const res = await http().post(`/users/${w.junak.id}/remarks`).set(auth(w.token(w.vykhovnykA))).send(warning).expect(201);
      expect(res.body).toEqual({ id: expect.any(String), ...warning });
      const entries = await auditOf(w.kurin.id, AuditAction.REMARK_ADDED);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorId: w.vykhovnykA.id, subjectUserId: w.junak.id, entityId: res.body.id });
      expect(entries[0].details).toEqual({ subjectName: 'Test User', kind: 'WARNING', date: '2025-03-10' });
      expect(JSON.stringify(entries[0].details)).not.toMatch(/Запізнився|сходини/);
    });

    it('requires both «за що» and «як виправити» for a warning; refuses howToFix for an award', async () => {
      const w = await setup();
      const post = (body: object) => http().post(`/users/${w.junak.id}/remarks`).set(auth(w.token(w.zvyazkovyi))).send(body);
      await post({ ...warning, howToFix: undefined }).expect(400);
      await post({ ...warning, howToFix: '   ' }).expect(400);
      await post({ ...warning, text: '  ' }).expect(400);
      await post({ kind: 'AWARD', text: 'Найкращий табірник', howToFix: 'Нічого', date: '2025-08-01' }).expect(400);
      const award = await post({ kind: 'AWARD', text: 'Найкращий табірник', date: '2025-08-01' }).expect(201);
      expect(award.body).toMatchObject({ kind: 'AWARD', howToFix: null });
      const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await post({ ...warning, date: inThreeDays }).expect(400);
    });

    it('updates and removes a remark; a warning keeps its howToFix required, kind cannot change', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const created = await http().post(`/users/${w.junak.id}/remarks`).set(auth(zv)).send(warning).expect(201);
      const patch = (body: object) => http().patch(`/users/${w.junak.id}/remarks/${created.body.id}`).set(auth(zv)).send(body);
      await patch({ howToFix: '' }).expect(400);
      const updated = await patch({ kind: 'AWARD', howToFix: 'Прийти на дві сходини раніше', date: '2025-03-12' }).expect(200);
      expect(updated.body).toMatchObject({ kind: 'WARNING', howToFix: 'Прийти на дві сходини раніше', date: '2025-03-12' });
      await http().delete(`/users/${w.junak.id}/remarks/${created.body.id}`).set(auth(zv)).expect(200, { success: true });
      expect((await auditOf(w.kurin.id, AuditAction.REMARK_UPDATED))[0].details).toEqual({ subjectName: 'Test User', kind: 'WARNING', date: '2025-03-12' });
      expect((await auditOf(w.kurin.id, AuditAction.REMARK_REMOVED))[0].details).toEqual({ subjectName: 'Test User', kind: 'WARNING', date: '2025-03-12' });
    });

    it('does not let the junak, another hurtok vykhovnyk or another kurin write remarks', async () => {
      const w = await setup();
      await http().post(`/users/${w.junak.id}/remarks`).set(auth(w.token(w.junak))).send(warning).expect(403);
      await http().post(`/users/${w.junak.id}/remarks`).set(auth(w.token(w.vykhovnykB))).send(warning).expect(403);
      await http().post(`/users/${w.junak.id}/remarks`).set(auth(w.token(w.otherZvyazkovyi))).send(warning).expect(404);
    });

    it('validates the merged result and null/out-of-range values on PATCH, and rejects writes for an archived junak', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const base = `/users/${w.junak.id}/remarks`;
      const created = await http().post(base).set(auth(zv)).send(warning).expect(201);
      const award = await http().post(base).set(auth(zv)).send({ kind: 'AWARD', text: 'Найкращий табірник', date: '2025-08-01' }).expect(201);
      const patchW = (body: object) => http().patch(`${base}/${created.body.id}`).set(auth(zv)).send(body);
      const patchA = (body: object) => http().patch(`${base}/${award.body.id}`).set(auth(zv)).send(body);
      await patchW({ howToFix: null }).expect(400);
      await patchW({ text: null }).expect(400);
      await patchW({ text: '   ' }).expect(400);
      await patchW({ date: null }).expect(400);
      await patchW({ date: '1989-12-31' }).expect(400);
      const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await patchW({ date: future }).expect(400);
      await patchA({ howToFix: 'Щось' }).expect(400);
      await patchA({ howToFix: null }).expect(200);
      await http().post(base).set(auth(zv)).send({ ...warning, date: '1989-12-31' }).expect(400);
      await prisma.user.update({ where: { id: w.junak.id }, data: { archivedAt: new Date() } });
      await http().post(base).set(auth(zv)).send(warning).expect(400);
      await patchW({ text: 'Інше' }).expect(400);
      await http().delete(`${base}/${created.body.id}`).set(auth(zv)).expect(400);
      expect(await prisma.junakRemark.count({ where: { junakId: w.junak.id } })).toBe(2);
    });
  });

  describe('Past positions', () => {
    it('adds, updates and removes an archive position with year validation, and logs it', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const post = (body: object) => http().post(`/users/${w.junak.id}/past-positions`).set(auth(zv)).send(body);
      await post({ title: ' ', scope: 'HURTOK', yearFrom: 2019 }).expect(400);
      await post({ title: 'Гуртковий', scope: 'TABIR', yearFrom: 2019 }).expect(400);
      await post({ title: 'Гуртковий', scope: 'HURTOK', yearFrom: 2020, yearTo: 2019 }).expect(400);
      const created = await post({ title: ' Гуртковий ', scope: 'HURTOK', yearFrom: 2019, yearTo: 2021 }).expect(201);
      expect(created.body).toEqual({ id: expect.any(String), title: 'Гуртковий', scope: 'HURTOK', yearFrom: 2019, yearTo: 2021 });
      const updated = await http()
        .patch(`/users/${w.junak.id}/past-positions/${created.body.id}`)
        .set(auth(zv))
        .send({ title: 'Курінний суддя', scope: 'KURIN' })
        .expect(200);
      expect(updated.body).toMatchObject({ title: 'Курінний суддя', scope: 'KURIN', yearFrom: 2019, yearTo: 2021 });
      await http().delete(`/users/${w.junak.id}/past-positions/${created.body.id}`).set(auth(zv)).expect(200, { success: true });
      expect((await auditOf(w.kurin.id, AuditAction.PAST_POSITION_ADDED))[0].details).toEqual({
        subjectName: 'Test User',
        title: 'Гуртковий',
        scope: 'HURTOK',
        yearFrom: 2019,
        yearTo: 2021,
      });
      expect(await auditOf(w.kurin.id, AuditAction.PAST_POSITION_UPDATED)).toHaveLength(1);
      expect(await auditOf(w.kurin.id, AuditAction.PAST_POSITION_REMOVED)).toHaveLength(1);
    });

    it('validates years and nulls on PATCH, and rejects writes for an archived junak', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const base = `/users/${w.junak.id}/past-positions`;
      const post = (body: object) => http().post(base).set(auth(zv)).send(body);
      await post({ title: 'Гуртковий', scope: 'HURTOK', yearFrom: 1989 }).expect(400);
      await post({ title: 'Гуртковий', scope: 'HURTOK', yearFrom: new Date().getUTCFullYear() + 1 }).expect(400);
      const created = await post({ title: 'Гуртковий', scope: 'HURTOK', yearFrom: 2019, yearTo: 2021 }).expect(201);
      const patch = (body: object) => http().patch(`${base}/${created.body.id}`).set(auth(zv)).send(body);
      await patch({ title: null }).expect(400);
      await patch({ title: '  ' }).expect(400);
      await patch({ scope: null }).expect(400);
      await patch({ yearFrom: null }).expect(400);
      await patch({ yearFrom: 1989 }).expect(400);
      await patch({ yearFrom: 2022 }).expect(400);
      await patch({ yearTo: 2200 }).expect(400);
      expect((await patch({ yearTo: null }).expect(200)).body).toMatchObject({ yearFrom: 2019, yearTo: null });
      await prisma.user.update({ where: { id: w.junak.id }, data: { archivedAt: new Date() } });
      await post({ title: 'Інше', scope: 'HURTOK', yearFrom: 2019 }).expect(400);
      await patch({ title: 'Інше' }).expect(400);
      await http().delete(`${base}/${created.body.id}`).set(auth(zv)).expect(400);
    });
  });

  describe('PATCH /users/:junakId/history/dates', () => {
    it('sets and clears the UPYU join and oath dates, logging only the fields that were sent', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const patch = (body: object) => http().patch(`/users/${w.junak.id}/history/dates`).set(auth(zv)).send(body);
      expect((await patch({ upyJoinedAt: '2019-09-01', plastOathAt: '2020-02-22' }).expect(200)).body).toEqual({
        upyJoinedAt: '2019-09-01',
        plastOathAt: '2020-02-22',
      });
      expect((await patch({ plastOathAt: null }).expect(200)).body).toEqual({ upyJoinedAt: '2019-09-01', plastOathAt: null });
      await patch({}).expect(400);
      await patch({ upyJoinedAt: '1989-01-01' }).expect(400);
      const entries = await auditOf(w.kurin.id, AuditAction.HISTORY_DATES_CHANGED);
      expect(entries.map((e) => e.details)).toEqual([
        { subjectName: 'Test User', upyJoinedAt: '2019-09-01', plastOathAt: '2020-02-22' },
        { subjectName: 'Test User', plastOathAt: null },
      ]);
    });

    it('applies the write rules to dates', async () => {
      const w = await setup();
      const body = { upyJoinedAt: '2019-09-01' };
      await http().patch(`/users/${w.junak.id}/history/dates`).set(auth(w.token(w.vykhovnykA))).send(body).expect(200);
      await http().patch(`/users/${w.junak.id}/history/dates`).set(auth(w.token(w.vykhovnykB))).send(body).expect(403);
      await http().patch(`/users/${w.junak.id}/history/dates`).set(auth(w.token(w.junak))).send(body).expect(403);
      await http().patch(`/users/${w.junakNoHurtok.id}/history/dates`).set(auth(w.token(w.vykhovnykA))).send(body).expect(403);
    });

    it('rejects future dates, writes for an archived junak and keeps both dates intact on partial patch', async () => {
      const w = await setup();
      const zv = w.token(w.zvyazkovyi);
      const url = `/users/${w.junak.id}/history/dates`;
      const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await http().patch(url).set(auth(zv)).send({ plastOathAt: future }).expect(400);
      await http().patch(url).set(auth(zv)).send({ plastOathAt: '1989-12-31' }).expect(400);
      await http().patch(url).set(auth(zv)).send({ upyJoinedAt: '2019-09-01' }).expect(200);
      expect((await http().patch(url).set(auth(zv)).send({ plastOathAt: '2020-02-22' }).expect(200)).body).toEqual({
        upyJoinedAt: '2019-09-01',
        plastOathAt: '2020-02-22',
      });
      await prisma.user.update({ where: { id: w.junak.id }, data: { archivedAt: new Date() } });
      await http().patch(url).set(auth(zv)).send({ plastOathAt: null }).expect(400);
    });
  });
});
