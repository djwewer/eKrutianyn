import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, AuditAction } from '@prisma/client';
import { cleanDatabase } from './utils/clean-db';
import { bootApp } from './utils/boot-app';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

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
});
