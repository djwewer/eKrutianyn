import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, AuditAction } from '@prisma/client';
import { cleanDatabase } from './utils/clean-db';
import { bootApp } from './utils/boot-app';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';

describe('Audit events — Гроші й майно group (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    ({ app, jwtService } = await bootApp((b) =>
      b.overrideProvider(GoogleDriveService).useValue({
        uploadFile: jest.fn().mockResolvedValue({ fileId: 'f', url: 'u' }),
      }),
    ));
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
    await prisma.kurin.update({ where: { id: kurin.id }, data: { driveFolderId: 'folder' } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    return { kurin, zvyazkovyi, token };
  }

  const entriesOf = (kurinId: string, action: AuditAction) =>
    prisma.auditLog.findMany({ where: { kurinId, action }, orderBy: { createdAt: 'asc' } });

  describe('treasury', () => {
    it('logs creating and deleting a transaction', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      const created = await request(app.getHttpServer())
        .post(`/kurins/${kurin.id}/treasury/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'EXPENSE', amountCents: 12550, description: 'Намети', occurredAt: '2026-10-01T00:00:00.000Z' })
        .expect(201);
      const createdEntries = await entriesOf(kurin.id, AuditAction.TREASURY_TRANSACTION_CREATED);
      expect(createdEntries).toHaveLength(1);
      expect(createdEntries[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: created.body.id });
      expect(createdEntries[0].details).toEqual({ type: 'EXPENSE', amountCents: 12550, description: 'Намети' });

      await request(app.getHttpServer())
        .delete(`/kurins/${kurin.id}/treasury/transactions/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const deletedEntries = await entriesOf(kurin.id, AuditAction.TREASURY_TRANSACTION_DELETED);
      expect(deletedEntries).toHaveLength(1);
      expect(deletedEntries[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: created.body.id });
      expect(deletedEntries[0].details).toEqual({ type: 'EXPENSE', amountCents: 12550, description: 'Намети' });
    });

    it('logs the starting balance change with from and to', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      await prisma.kurin.update({ where: { id: kurin.id }, data: { treasuryStartingBalanceCents: 500 } });
      await request(app.getHttpServer())
        .patch(`/kurins/${kurin.id}/treasury/starting-balance`)
        .set('Authorization', `Bearer ${token}`)
        .send({ startingBalanceCents: 100000 })
        .expect(200);
      const entries = await entriesOf(kurin.id, AuditAction.TREASURY_STARTING_BALANCE_CHANGED);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorId: zvyazkovyi.id });
      expect(entries[0].details).toEqual({ from: 500, to: 100000 });
    });

    it('records nothing when a plain junak is forbidden', async () => {
      const { kurin } = await setup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
      const jt = issueTokenFor(jwtService, junak);
      await request(app.getHttpServer())
        .post(`/kurins/${kurin.id}/treasury/transactions`)
        .set('Authorization', `Bearer ${jt}`)
        .send({ type: 'INCOME', amountCents: 100, description: 'x', occurredAt: '2026-10-01T00:00:00.000Z' })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/kurins/${kurin.id}/treasury/starting-balance`)
        .set('Authorization', `Bearer ${jt}`)
        .send({ startingBalanceCents: 1 })
        .expect(403);
      expect(await prisma.auditLog.count({ where: { kurinId: kurin.id } })).toBe(0);
    });
  });

  describe('inventory', () => {
    it('logs item create (photos inside create add no photo event), update and delete', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      const created = await request(app.getHttpServer())
        .post(`/kurins/${kurin.id}/inventory`)
        .set('Authorization', `Bearer ${token}`)
        .field('name', 'Пилка')
        .field('quantity', '2')
        .attach('photos', Buffer.from('img'), 'a.jpg')
        .expect(201);
      const id = created.body.id;
      const c = await entriesOf(kurin.id, AuditAction.INVENTORY_ITEM_CREATED);
      expect(c).toHaveLength(1);
      expect(c[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: id });
      expect(c[0].details).toEqual({ itemName: 'Пилка', quantity: 2 });
      expect(await entriesOf(kurin.id, AuditAction.INVENTORY_PHOTO_ADDED)).toHaveLength(0);

      await request(app.getHttpServer())
        .patch(`/kurins/${kurin.id}/inventory/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 5 })
        .expect(200);
      const u = await entriesOf(kurin.id, AuditAction.INVENTORY_ITEM_UPDATED);
      expect(u).toHaveLength(1);
      expect(u[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: id });
      expect(u[0].details).toEqual({ itemName: 'Пилка', quantity: 5 });

      await request(app.getHttpServer())
        .delete(`/kurins/${kurin.id}/inventory/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const d = await entriesOf(kurin.id, AuditAction.INVENTORY_ITEM_DELETED);
      expect(d).toHaveLength(1);
      expect(d[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: id });
      expect(d[0].details).toEqual({ itemName: 'Пилка', quantity: 5 });
    });

    it('logs adding and removing a photo with the item name', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      const created = await request(app.getHttpServer())
        .post(`/kurins/${kurin.id}/inventory`)
        .set('Authorization', `Bearer ${token}`)
        .field('name', 'Сокира')
        .field('quantity', '1')
        .expect(201);
      const id = created.body.id;
      const added = await request(app.getHttpServer())
        .post(`/kurins/${kurin.id}/inventory/${id}/photos`)
        .set('Authorization', `Bearer ${token}`)
        .attach('photo', Buffer.from('img'), 'b.jpg')
        .expect(201);
      const a = await entriesOf(kurin.id, AuditAction.INVENTORY_PHOTO_ADDED);
      expect(a).toHaveLength(1);
      expect(a[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: id });
      expect(a[0].details).toEqual({ itemName: 'Сокира' });

      await request(app.getHttpServer())
        .delete(`/kurins/${kurin.id}/inventory/${id}/photos/${added.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const r = await entriesOf(kurin.id, AuditAction.INVENTORY_PHOTO_REMOVED);
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: id });
      expect(r[0].details).toEqual({ itemName: 'Сокира' });
    });

    it('records nothing when a plain junak is forbidden', async () => {
      const { kurin } = await setup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
      await request(app.getHttpServer())
        .post(`/kurins/${kurin.id}/inventory`)
        .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
        .field('name', 'Казан')
        .field('quantity', '1')
        .expect(403);
      expect(await prisma.auditLog.count({ where: { kurinId: kurin.id } })).toBe(0);
    });
  });
});
