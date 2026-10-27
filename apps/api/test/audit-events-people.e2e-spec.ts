import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, AuditAction } from '@prisma/client';
import { cleanDatabase } from './utils/clean-db';
import { bootApp } from './utils/boot-app';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

describe('Audit events — Люди й ролі group (e2e)', () => {
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
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    return { kurin, hurtok, zvyazkovyi, token };
  }

  const entriesOf = (kurinId: string, action: AuditAction) =>
    prisma.auditLog.findMany({ where: { kurinId, action }, orderBy: { createdAt: 'asc' } });

  describe('users', () => {
    it('logs creating a user', async () => {
      const { kurin, hurtok, zvyazkovyi, token } = await setup();
      const res = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Іван', lastName: 'Коваль', email: 'ivan@example.com', role: 'JUNAK', hurtokId: hurtok.id })
        .expect(201);
      const entries = await entriesOf(kurin.id, AuditAction.USER_CREATED);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: res.body.id });
      expect(entries[0].details).toEqual({ subjectName: 'Іван Коваль', role: 'JUNAK' });
    });

    it('logs a contact-info update with the changed field names only', async () => {
      const { kurin, hurtok, zvyazkovyi, token } = await setup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
      await request(app.getHttpServer())
        .patch(`/users/${junak.id}/contact-info`)
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '+380501234567', residence: 'Львів' })
        .expect(200);
      const entries = await entriesOf(kurin.id, AuditAction.USER_CONTACT_UPDATED);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id });
      expect(entries[0].details).toEqual({ subjectName: 'Test User', changed: ['phone', 'residence'] });
      expect(JSON.stringify(entries[0].details)).not.toContain('380501234567');
    });

    it('logs a hurtok change with old and new hurtok names', async () => {
      const { kurin, hurtok, zvyazkovyi, token } = await setup();
      const other = await prisma.hurtok.create({ data: { name: 'Вовки', kurinId: kurin.id } });
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
      await request(app.getHttpServer())
        .patch(`/users/${junak.id}/hurtok`)
        .set('Authorization', `Bearer ${token}`)
        .send({ hurtokId: other.id })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/users/${junak.id}/hurtok`)
        .set('Authorization', `Bearer ${token}`)
        .send({ hurtokId: null })
        .expect(200);
      const entries = await entriesOf(kurin.id, AuditAction.USER_HURTOK_CHANGED);
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id });
      expect(entries[0].details).toEqual({ subjectName: 'Test User', from: 'Орлики', to: 'Вовки' });
      expect(entries[1].details).toEqual({ subjectName: 'Test User', from: 'Вовки', to: null });
    });

    it('logs archiving a user', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
      await request(app.getHttpServer())
        .patch(`/users/${junak.id}/archive`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const entries = await entriesOf(kurin.id, AuditAction.USER_ARCHIVED);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id });
      expect(entries[0].details).toEqual({ subjectName: 'Test User', role: 'JUNAK' });
    });
  });

  describe('kurin positions', () => {
    it('logs assigning and removing a kurin position', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
      const res = await request(app.getHttpServer())
        .post('/kurin-positions')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: junak.id, scope: 'KURIN', positionType: 'PYSAR' })
        .expect(201);
      const assigned = await entriesOf(kurin.id, AuditAction.POSITION_ASSIGNED);
      expect(assigned).toHaveLength(1);
      expect(assigned[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id, entityId: res.body.id });
      expect(assigned[0].details).toEqual({
        subjectName: 'Test User',
        positionType: 'PYSAR',
        scope: 'KURIN',
        hurtokName: null,
      });

      await request(app.getHttpServer())
        .delete(`/kurin-positions/${res.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const removed = await entriesOf(kurin.id, AuditAction.POSITION_REMOVED);
      expect(removed).toHaveLength(1);
      expect(removed[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id, entityId: res.body.id });
      expect(removed[0].details).toEqual({
        subjectName: 'Test User',
        positionType: 'PYSAR',
        scope: 'KURIN',
        hurtokName: null,
      });
    });

    it('includes the hurtok name for a hurtok-scoped position', async () => {
      const { kurin, hurtok, token } = await setup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
      await request(app.getHttpServer())
        .post('/kurin-positions')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: junak.id, scope: 'HURTOK', positionType: 'HURTKOVYI', hurtokId: hurtok.id })
        .expect(201);
      const [entry] = await entriesOf(kurin.id, AuditAction.POSITION_ASSIGNED);
      expect(entry.details).toMatchObject({ positionType: 'HURTKOVYI', scope: 'HURTOK', hurtokName: 'Орлики' });
    });

    it('records the replaced position as removed when a new one is assigned', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
      const first = await request(app.getHttpServer())
        .post('/kurin-positions')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: junak.id, scope: 'KURIN', positionType: 'PYSAR' })
        .expect(201);
      const second = await request(app.getHttpServer())
        .post('/kurin-positions')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: junak.id, scope: 'KURIN', positionType: 'SKARBNYK' })
        .expect(201);

      const removed = await entriesOf(kurin.id, AuditAction.POSITION_REMOVED);
      expect(removed).toHaveLength(1);
      expect(removed[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id, entityId: first.body.id });
      expect(removed[0].details).toMatchObject({ positionType: 'PYSAR', scope: 'KURIN' });

      const assigned = await entriesOf(kurin.id, AuditAction.POSITION_ASSIGNED);
      expect(assigned).toHaveLength(2);
      expect(assigned[1]).toMatchObject({ subjectUserId: junak.id, entityId: second.body.id });
      expect(assigned[1].details).toMatchObject({ positionType: 'SKARBNYK', scope: 'KURIN' });
    });
  });

  describe('hurtky', () => {
    it('logs creating, updating and archiving a hurtok', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      const res = await request(app.getHttpServer())
        .post('/hurtky')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Лисиці', number: '3' })
        .expect(201);
      const created = await entriesOf(kurin.id, AuditAction.HURTOK_CREATED);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: res.body.id });
      expect(created[0].details).toEqual({ hurtokName: 'Лисиці' });

      await request(app.getHttpServer())
        .patch(`/hurtky/${res.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ foundedAt: '2020-05-01' })
        .expect(200);
      const updated = await entriesOf(kurin.id, AuditAction.HURTOK_UPDATED);
      expect(updated).toHaveLength(1);
      expect(updated[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: res.body.id });
      expect(updated[0].details).toMatchObject({ hurtokName: 'Лисиці' });
      expect((updated[0].details as any).foundedAt).toEqual(expect.stringContaining('2020-05-01'));

      await request(app.getHttpServer())
        .patch(`/hurtky/${res.body.id}/archive`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const archived = await entriesOf(kurin.id, AuditAction.HURTOK_ARCHIVED);
      expect(archived).toHaveLength(1);
      expect(archived[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: res.body.id });
      expect(archived[0].details).toEqual({ hurtokName: 'Лисиці' });
    });
  });

  describe('vykhovnyk assignments', () => {
    it('logs assigning and unassigning a vykhovnyk', async () => {
      const { kurin, hurtok, zvyazkovyi, token } = await setup();
      const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
      const res = await request(app.getHttpServer())
        .post('/vykhovnyk-assignments')
        .set('Authorization', `Bearer ${token}`)
        .send({ vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id })
        .expect(201);
      const assigned = await entriesOf(kurin.id, AuditAction.VYKHOVNYK_ASSIGNED);
      expect(assigned).toHaveLength(1);
      expect(assigned[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: vykhovnyk.id, entityId: hurtok.id });
      expect(assigned[0].details).toEqual({ subjectName: 'Test User', hurtokName: 'Орлики' });

      await request(app.getHttpServer())
        .delete(`/vykhovnyk-assignments/${res.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const unassigned = await entriesOf(kurin.id, AuditAction.VYKHOVNYK_UNASSIGNED);
      expect(unassigned).toHaveLength(1);
      expect(unassigned[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: vykhovnyk.id, entityId: hurtok.id });
      expect(unassigned[0].details).toEqual({ subjectName: 'Test User', hurtokName: 'Орлики' });
    });
  });
  describe('guardian contacts', () => {
    it('logs creating, updating and deleting a guardian contact without phone or email', async () => {
      const { kurin, hurtok, zvyazkovyi, token } = await setup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
      const res = await request(app.getHttpServer())
        .post(`/users/${junak.id}/guardian-contacts`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Марія Коваль', phone: '+380671112233', email: 'maria@example.com', relation: 'MOTHER' })
        .expect(201);
      const created = await entriesOf(kurin.id, AuditAction.GUARDIAN_CREATED);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id, entityId: res.body.id });
      expect(created[0].details).toEqual({ subjectName: 'Test User', guardianName: 'Марія Коваль', relation: 'MOTHER' });

      await request(app.getHttpServer())
        .patch(`/users/${junak.id}/guardian-contacts/${res.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Марія Петренко', phone: '+380679998877' })
        .expect(200);
      const updated = await entriesOf(kurin.id, AuditAction.GUARDIAN_UPDATED);
      expect(updated).toHaveLength(1);
      expect(updated[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id, entityId: res.body.id });
      expect(updated[0].details).toEqual({ subjectName: 'Test User', guardianName: 'Марія Петренко', relation: 'MOTHER' });

      await request(app.getHttpServer())
        .delete(`/users/${junak.id}/guardian-contacts/${res.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const deleted = await entriesOf(kurin.id, AuditAction.GUARDIAN_DELETED);
      expect(deleted).toHaveLength(1);
      expect(deleted[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id, entityId: res.body.id });
      expect(deleted[0].details).toEqual({ subjectName: 'Test User', guardianName: 'Марія Петренко', relation: 'MOTHER' });

      const all = await prisma.auditLog.findMany({ where: { kurinId: kurin.id } });
      const dump = JSON.stringify(all.map((a) => a.details));
      for (const secret of ['380671112233', '380679998877', 'maria@example.com']) {
        expect(dump).not.toContain(secret);
      }
    });
  });

  describe('approval requests', () => {
    async function approvalSetup() {
      const base = await setup();
      const kurinniy = await createKurinniyUser(prisma, { kurinId: base.kurin.id });
      const kurinniyToken = issueTokenFor(jwtService, kurinniy);
      const createRequest = async (body: Record<string, unknown>) =>
        (
          await request(app.getHttpServer())
            .post('/approval-requests')
            .set('Authorization', `Bearer ${kurinniyToken}`)
            .send(body)
            .expect(201)
        ).body;
      const decide = (id: string, verb: 'approve' | 'reject') =>
        request(app.getHttpServer()).post(`/approval-requests/${id}/${verb}`).set('Authorization', `Bearer ${base.token}`);
      return { ...base, kurinniy, createRequest, decide };
    }

    it('logs approving an ARCHIVE_JUNAK request (plus the archive itself)', async () => {
      const { kurin, zvyazkovyi, kurinniy, createRequest, decide } = await approvalSetup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
      const req = await createRequest({ actionType: 'ARCHIVE_JUNAK', junakId: junak.id, newData: {} });
      await decide(req.id, 'approve').expect(201);
      const approved = await entriesOf(kurin.id, AuditAction.APPROVAL_APPROVED);
      expect(approved).toHaveLength(1);
      expect(approved[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id, entityId: req.id });
      expect(approved[0].details).toEqual({ requestType: 'ARCHIVE_JUNAK', requestedBy: kurinniy.id });
      expect(await entriesOf(kurin.id, AuditAction.USER_ARCHIVED)).toHaveLength(1);
    });

    it('logs approving a CREATE_JUNAK request', async () => {
      const { kurin, hurtok, zvyazkovyi, kurinniy, createRequest, decide } = await approvalSetup();
      const req = await createRequest({
        actionType: 'CREATE_JUNAK',
        newData: { firstName: 'Новий', lastName: 'Юнак', email: 'new.junak@example.com', hurtokId: hurtok.id },
      });
      await decide(req.id, 'approve').expect(201);
      const approved = await entriesOf(kurin.id, AuditAction.APPROVAL_APPROVED);
      expect(approved).toHaveLength(1);
      expect(approved[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: null, entityId: req.id });
      expect(approved[0].details).toEqual({ requestType: 'CREATE_JUNAK', requestedBy: kurinniy.id });
    });

    it('logs approving a CHANGE_FULL_NAME request', async () => {
      const { kurin, zvyazkovyi, kurinniy, createRequest, decide } = await approvalSetup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
      const req = await createRequest({
        actionType: 'CHANGE_FULL_NAME',
        junakId: junak.id,
        newData: { firstName: 'Петро', lastName: 'Іваненко' },
      });
      await decide(req.id, 'approve').expect(201);
      const approved = await entriesOf(kurin.id, AuditAction.APPROVAL_APPROVED);
      expect(approved).toHaveLength(1);
      expect(approved[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id, entityId: req.id });
      expect(approved[0].details).toEqual({ requestType: 'CHANGE_FULL_NAME', requestedBy: kurinniy.id });
    });

    it('logs approving a BULK_IMPORT_JUNAKY request with row and failure counts', async () => {
      const { kurin, zvyazkovyi, kurinniy, createRequest, decide } = await approvalSetup();
      const req = await createRequest({
        actionType: 'BULK_IMPORT_JUNAKY',
        newData: {
          rows: [
            { rowIndex: 0, firstName: 'Іван', lastName: 'Петренко', email: 'bulk.ok@example.com' },
            {
              rowIndex: 1,
              matchedUserId: '00000000-0000-0000-0000-000000000000',
              firstName: 'Хтось',
              lastName: 'Інший',
              email: 'bulk.bad@example.com',
            },
          ],
        },
      });
      await decide(req.id, 'approve').expect(201);
      const approved = await entriesOf(kurin.id, AuditAction.APPROVAL_APPROVED);
      expect(approved).toHaveLength(1);
      expect(approved[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: null, entityId: req.id });
      expect(approved[0].details).toEqual({
        requestType: 'BULK_IMPORT_JUNAKY',
        requestedBy: kurinniy.id,
        rows: 2,
        failed: 1,
      });
    });

    it('logs rejecting a request', async () => {
      const { kurin, zvyazkovyi, kurinniy, createRequest, decide } = await approvalSetup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
      const req = await createRequest({ actionType: 'ARCHIVE_JUNAK', junakId: junak.id, newData: {} });
      await decide(req.id, 'reject').expect(201);
      const rejected = await entriesOf(kurin.id, AuditAction.APPROVAL_REJECTED);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id, entityId: req.id });
      expect(rejected[0].details).toEqual({ requestType: 'ARCHIVE_JUNAK', requestedBy: kurinniy.id });
      expect(await entriesOf(kurin.id, AuditAction.APPROVAL_APPROVED)).toHaveLength(0);
    });

    it('records nothing when a request was already decided', async () => {
      const { kurin, createRequest, decide } = await approvalSetup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
      const req = await createRequest({ actionType: 'CHANGE_FULL_NAME', junakId: junak.id, newData: { firstName: 'А', lastName: 'Б' } });
      await decide(req.id, 'reject').expect(201);
      await decide(req.id, 'approve').expect(400);
      await decide(req.id, 'reject').expect(400);
      expect(await entriesOf(kurin.id, AuditAction.APPROVAL_REJECTED)).toHaveLength(1);
      expect(await entriesOf(kurin.id, AuditAction.APPROVAL_APPROVED)).toHaveLength(0);
    });
  });
});
