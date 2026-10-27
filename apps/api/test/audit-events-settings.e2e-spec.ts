import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, AuditAction } from '@prisma/client';
import { cleanDatabase } from './utils/clean-db';
import { bootApp } from './utils/boot-app';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';
import { PushNotificationsService } from '../src/push-notifications/push-notifications.service';
import { JudgeBookSyncService } from '../src/kurins/judge-book-sync.service';
import { signGoogleDriveState } from '../src/kurins/google-drive-state.util';

describe('Audit events — Налаштування та інтеграції group (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });
  const fakeDrive = {
    getAuthUrl: jest.fn(),
    handleCallback: jest.fn(),
    disconnect: jest.fn(),
    ensureSubfolder: jest.fn(),
    createDocFromHtml: jest.fn(),
    readSheetValues: jest.fn(),
    updateCellValues: jest.fn(),
  };

  beforeAll(async () => {
    ({ app, jwtService } = await bootApp((b) =>
      b
        .overrideProvider(GoogleDriveService)
        .useValue(fakeDrive)
        .overrideProvider(PushNotificationsService)
        .useValue({ sendToKurin: jest.fn().mockResolvedValue(undefined) }),
    ));
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    Object.values(fakeDrive).forEach((m) => m.mockReset());
    fakeDrive.getAuthUrl.mockReturnValue('https://accounts.google.com/auth');
    fakeDrive.handleCallback.mockResolvedValue({ email: 'drive@example.com' });
    fakeDrive.disconnect.mockResolvedValue(undefined);
    fakeDrive.ensureSubfolder.mockImplementation(async (_k, _p, name) => `${name}-id`);
    fakeDrive.createDocFromHtml.mockResolvedValue({ id: 'doc1', url: 'https://docs.google.com/document/d/doc1/edit' });
    fakeDrive.updateCellValues.mockResolvedValue(undefined);
  });

  async function setup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    await prisma.kurin.update({
      where: { id: kurin.id },
      data: { driveRefreshToken: 'rt', driveFolderId: 'main-folder' },
    });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    return { kurin, zvyazkovyi, token };
  }

  const entriesOf = (kurinId: string, action: AuditAction) =>
    prisma.auditLog.findMany({ where: { kurinId, action }, orderBy: { createdAt: 'asc' } });

  describe('Google Drive', () => {
    it('logs the connection with the actor taken from the signed OAuth state', async () => {
      const { kurin, zvyazkovyi } = await setup();
      const state = signGoogleDriveState(jwtService, kurin.id, zvyazkovyi.id);
      await request(app.getHttpServer())
        .get('/kurins/google-drive/callback')
        .query({ code: 'abc', state })
        .expect(302);
      const entries = await entriesOf(kurin.id, AuditAction.DRIVE_CONNECTED);
      expect(entries).toHaveLength(1);
      expect(entries[0].actorId).toBe(zvyazkovyi.id);
      expect(entries[0].details).toEqual({ email: 'drive@example.com' });
    });

    it('the connect endpoint puts the acting user into the state it hands to Google', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      await request(app.getHttpServer())
        .get(`/kurins/${kurin.id}/google-drive/connect`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const state = fakeDrive.getAuthUrl.mock.calls[0][0];
      expect(jwtService.verify(state)).toMatchObject({ kurinId: kurin.id, actorId: zvyazkovyi.id });
    });

    it('logs nothing when the OAuth callback fails', async () => {
      const { kurin, zvyazkovyi } = await setup();
      fakeDrive.handleCallback.mockRejectedValue(new Error('boom'));
      const state = signGoogleDriveState(jwtService, kurin.id, zvyazkovyi.id);
      await request(app.getHttpServer()).get('/kurins/google-drive/callback').query({ code: 'x', state }).expect(302);
      expect(await entriesOf(kurin.id, AuditAction.DRIVE_CONNECTED)).toHaveLength(0);
    });

    it('logs the folder choice', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      await request(app.getHttpServer())
        .patch(`/kurins/${kurin.id}/google-drive/folder`)
        .set('Authorization', `Bearer ${token}`)
        .send({ folderId: 'f-1', folderName: 'Куріньська папка' })
        .expect(200);
      const entries = await entriesOf(kurin.id, AuditAction.DRIVE_FOLDER_SET);
      expect(entries).toHaveLength(1);
      expect(entries[0].actorId).toBe(zvyazkovyi.id);
      expect(entries[0].details).toEqual({ folderName: 'Куріньська папка' });
    });

    it('logs the disconnect', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      await request(app.getHttpServer())
        .delete(`/kurins/${kurin.id}/google-drive`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const entries = await entriesOf(kurin.id, AuditAction.DRIVE_DISCONNECTED);
      expect(entries).toHaveLength(1);
      expect(entries[0].actorId).toBe(zvyazkovyi.id);
      expect(entries[0].details).toEqual({});
    });

    it('records nothing for a forbidden request', async () => {
      const { kurin } = await setup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
      await request(app.getHttpServer())
        .delete(`/kurins/${kurin.id}/google-drive`)
        .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/kurins/${kurin.id}/google-drive/folder`)
        .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
        .send({ folderId: 'f', folderName: 'n' })
        .expect(403);
      expect(await prisma.auditLog.count({ where: { kurinId: kurin.id } })).toBe(0);
    });
  });

  describe('Книга судді', () => {
    async function setupBook() {
      const ctx = await setup();
      await prisma.kurin.update({ where: { id: ctx.kurin.id }, data: { judgeBookSpreadsheetId: 'sheet-1' } });
      await prisma.junakImportMapping.create({
        data: {
          kurinId: ctx.kurin.id,
          columnMapping: [
            { column: 'A', header: 'ПІБ', field: 'FIRST_LAST_NAME' },
            { column: 'B', header: 'Телефон', field: 'PHONE' },
          ],
          positionValueMapping: [],
        },
      });
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: ctx.kurin.id });
      await prisma.user.update({
        where: { id: junak.id },
        data: { firstName: 'Іван', lastName: 'Петренко', phone: '0501112233', judgeBookRowNumber: 2 },
      });
      return ctx;
    }

    it('logs connecting a spreadsheet with its name but not its id', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      await request(app.getHttpServer())
        .patch(`/kurins/${kurin.id}/junak-import/spreadsheet`)
        .set('Authorization', `Bearer ${token}`)
        .send({ spreadsheetId: 'secret-sheet-id', spreadsheetName: 'Книга судді 2026' })
        .expect(200);
      const entries = await entriesOf(kurin.id, AuditAction.JUDGE_BOOK_CONNECTED);
      expect(entries).toHaveLength(1);
      expect(entries[0].actorId).toBe(zvyazkovyi.id);
      expect(entries[0].details).toEqual({ spreadsheetName: 'Книга судді 2026' });
    });

    it('logs a direct import with rows and failed counts', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      const res = await request(app.getHttpServer())
        .post(`/kurins/${kurin.id}/junak-import/rows`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rows: [
            { rowIndex: 0, firstName: 'Іван', lastName: 'Петренко', email: `a-${Date.now()}@example.com` },
            { rowIndex: 1, firstName: 'Петро', lastName: 'Сидоренко', email: `b-${Date.now()}@example.com`, matchedUserId: 'does-not-exist' },
          ],
        })
        .expect((r) => expect([200, 201]).toContain(r.status));
      const failed = res.body.results.filter((r: { error?: string }) => r.error).length;
      expect(failed).toBe(1);
      const entries = await entriesOf(kurin.id, AuditAction.JUDGE_BOOK_IMPORTED);
      expect(entries).toHaveLength(1);
      expect(entries[0].actorId).toBe(zvyazkovyi.id);
      expect(entries[0].details).toEqual({ rows: 2, failed: 1 });
    });

    it('logs a manual sync with updated cells and skipped count', async () => {
      const { kurin, zvyazkovyi, token } = await setupBook();
      fakeDrive.readSheetValues.mockResolvedValue([['ПІБ', 'Телефон'], ['Іван Петренко', '']]);
      await request(app.getHttpServer())
        .post(`/kurins/${kurin.id}/junak-import/sync`)
        .set('Authorization', `Bearer ${token}`)
        .expect((r) => expect([200, 201]).toContain(r.status));
      const entries = await entriesOf(kurin.id, AuditAction.JUDGE_BOOK_SYNCED);
      expect(entries).toHaveLength(1);
      expect(entries[0].actorId).toBe(zvyazkovyi.id);
      expect(entries[0].details).toEqual({ updated: 1, skipped: 0 });
      expect(await entriesOf(kurin.id, AuditAction.JUDGE_BOOK_SYNCED_NIGHTLY)).toHaveLength(0);
    });

    it('records no manual-sync event when the sync is refused', async () => {
      const { kurin, token } = await setup(); // no spreadsheet connected
      await request(app.getHttpServer())
        .post(`/kurins/${kurin.id}/junak-import/sync`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      expect(await entriesOf(kurin.id, AuditAction.JUDGE_BOOK_SYNCED)).toHaveLength(0);
    });

    it('logs one nightly event with a null actor, and nothing for a run that did nothing', async () => {
      const { kurin } = await setupBook();
      const nightly = app.get(JudgeBookSyncService);

      fakeDrive.readSheetValues.mockResolvedValue([['ПІБ', 'Телефон'], ['Іван Петренко', '0501112233']]);
      await nightly.syncAllKurins();
      expect(await entriesOf(kurin.id, AuditAction.JUDGE_BOOK_SYNCED_NIGHTLY)).toHaveLength(0);

      fakeDrive.readSheetValues.mockResolvedValue([['ПІБ', 'Телефон'], ['Іван Петренко', '']]);
      await nightly.syncAllKurins();
      const entries = await entriesOf(kurin.id, AuditAction.JUDGE_BOOK_SYNCED_NIGHTLY);
      expect(entries).toHaveLength(1);
      expect(entries[0].actorId).toBeNull();
      expect(entries[0].details).toEqual({ updated: 1, skipped: 0 });
    });
  });

  describe('APD', () => {
    it('logs creating an APD document', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      await request(app.getHttpServer())
        .post(`/kurins/${kurin.id}/pysarstvo/apd`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'АПД сходини', pseudos: ['Орел', 'Вовк'] })
        .expect(201);
      const entries = await entriesOf(kurin.id, AuditAction.APD_CREATED);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: 'doc1' });
      expect(entries[0].details).toEqual({
        title: 'АПД сходини',
        pseudoCount: 2,
        url: 'https://docs.google.com/document/d/doc1/edit',
      });
    });

    it('logs nothing when Drive is not connected', async () => {
      const { kurin, token } = await setup();
      await prisma.kurin.update({ where: { id: kurin.id }, data: { driveRefreshToken: null } });
      await request(app.getHttpServer())
        .post(`/kurins/${kurin.id}/pysarstvo/apd`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'АПД', pseudos: ['Орел'] })
        .expect(503);
      expect(await entriesOf(kurin.id, AuditAction.APD_CREATED)).toHaveLength(0);
    });
  });

  describe('announcements', () => {
    const content = { type: 'doc', content: [] };

    it('logs publishing, editing and deleting an announcement', async () => {
      const { kurin, zvyazkovyi, token } = await setup();
      const created = await request(app.getHttpServer())
        .post(`/kurins/${kurin.id}/announcements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Збір у суботу', content, imageIds: [] })
        .expect(201);
      const published = await entriesOf(kurin.id, AuditAction.ANNOUNCEMENT_PUBLISHED);
      expect(published).toHaveLength(1);
      expect(published[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: created.body.id });
      expect(published[0].details).toEqual({ title: 'Збір у суботу' });

      await request(app.getHttpServer())
        .patch(`/kurins/${kurin.id}/announcements/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Збір у неділю', content, imageIds: [] })
        .expect(200);
      const updated = await entriesOf(kurin.id, AuditAction.ANNOUNCEMENT_UPDATED);
      expect(updated).toHaveLength(1);
      expect(updated[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: created.body.id });
      expect(updated[0].details).toEqual({ title: 'Збір у неділю' });

      await request(app.getHttpServer())
        .delete(`/kurins/${kurin.id}/announcements/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const deleted = await entriesOf(kurin.id, AuditAction.ANNOUNCEMENT_DELETED);
      expect(deleted).toHaveLength(1);
      expect(deleted[0]).toMatchObject({ actorId: zvyazkovyi.id, entityId: created.body.id });
      expect(deleted[0].details).toEqual({ title: 'Збір у неділю' });
    });

    it('logs nothing when a plain junak tries to publish', async () => {
      const { kurin } = await setup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
      await request(app.getHttpServer())
        .post(`/kurins/${kurin.id}/announcements`)
        .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
        .send({ title: 'x', content, imageIds: [] })
        .expect(403);
      expect(await entriesOf(kurin.id, AuditAction.ANNOUNCEMENT_PUBLISHED)).toHaveLength(0);
    });
  });
});
