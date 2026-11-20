import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, PositionScope, PositionType, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';

describe('Pysarstvo APD (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fakeDrive: { ensureSubfolder: jest.Mock; createDocFromHtml: jest.Mock };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    fakeDrive = { ensureSubfolder: jest.fn(), createDocFromHtml: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleDriveService)
      .useValue(fakeDrive)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwtService = moduleRef.get(JwtService, { strict: false });
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    fakeDrive.ensureSubfolder.mockReset().mockImplementation(async (_k, _parent, name) => `${name}-id`);
    fakeDrive.createDocFromHtml
      .mockReset()
      .mockResolvedValue({ id: 'doc1', url: 'https://docs.google.com/document/d/doc1/edit' });
  });

  async function setup(connected = true) {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const updated = await prisma.kurin.update({
      where: { id: kurin.id },
      data: connected
        ? { driveRefreshToken: 'rt', driveFolderId: 'inventory-folder', pysarstvoFolderId: 'pysar-folder', pysarstvoFolderName: 'Писарство куреня' }
        : {},
    });
    return { kurin: updated };
  }

  const body = { title: 'АПД сходини', pseudos: ['Орел', 'Вовк'] };

  it('lets a pysar create an APD in АПД inside the chosen Писарство folder (not the inventory folder)', async () => {
    const { kurin } = await setup();
    const pysar = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.PYSAR,
        userId: pysar.id,
        assignedById: pysar.id,
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/pysarstvo/apd`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, pysar)}`)
      .send(body)
      .expect(201);

    expect(response.body).toEqual({ id: 'doc1', url: 'https://docs.google.com/document/d/doc1/edit' });
    expect(fakeDrive.ensureSubfolder).toHaveBeenCalledTimes(1);
    expect(fakeDrive.ensureSubfolder).toHaveBeenCalledWith(kurin.id, 'pysar-folder', 'АПД');
    const [, folderId, title, html] = fakeDrive.createDocFromHtml.mock.calls[0];
    expect(folderId).toBe('АПД-id');
    expect(title).toBe('АПД сходини');
    expect(html).toContain('<h2>Орел</h2>');
  });

  it('lets zvyazkovyi create an APD', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/pysarstvo/apd`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, zvyazkovyi)}`)
      .send(body)
      .expect(201);
  });

  it('forbids a junak without the pysar position', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/pysarstvo/apd`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
      .send(body)
      .expect(403);
    expect(fakeDrive.createDocFromHtml).not.toHaveBeenCalled();
  });

  it('returns 404 for another kurin', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    await request(app.getHttpServer())
      .post(`/kurins/some-other-kurin/pysarstvo/apd`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, zvyazkovyi)}`)
      .send(body)
      .expect(404);
  });

  it('rejects an empty title or an empty pseudo list', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    const url = `/kurins/${kurin.id}/pysarstvo/apd`;
    await request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send({ ...body, title: '' }).expect(400);
    await request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send({ ...body, pseudos: [] }).expect(400);
    await request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send({ ...body, pseudos: ['  '] }).expect(400);
    await request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send({ ...body, title: ' \u0007 ' }).expect(400);
  });

  it('returns 503 when Drive is not connected or no folder is chosen', async () => {
    const { kurin } = await setup(false);
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/pysarstvo/apd`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, zvyazkovyi)}`)
      .send(body)
      .expect(503);
  });

  it('returns 503 when Drive is connected but no Писарство folder is chosen, even with an inventory folder', async () => {
    const { kurin } = await setup();
    await prisma.kurin.update({ where: { id: kurin.id }, data: { pysarstvoFolderId: null, pysarstvoFolderName: null } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const response = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/pysarstvo/apd`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, zvyazkovyi)}`)
      .send(body)
      .expect(503);
    expect(response.body.message).toContain('папку писарства');
    expect(fakeDrive.createDocFromHtml).not.toHaveBeenCalled();
  });

  describe('Писарство folder', () => {
    async function pysarIn(kurinId: string) {
      const pysar = await createUser(prisma, { role: Role.JUNAK, kurinId });
      await prisma.kurinPosition.create({
        data: { kurinId, scope: PositionScope.KURIN, positionType: PositionType.PYSAR, userId: pysar.id, assignedById: pysar.id },
      });
      return pysar;
    }
    const folderBody = { folderId: 'new-folder', folderName: 'Документи куреня' };

    it('shows the folder status to a pysar, but not to a plain junak', async () => {
      const { kurin } = await setup();
      const pysar = await pysarIn(kurin.id);
      const res = await request(app.getHttpServer())
        .get(`/kurins/${kurin.id}/pysarstvo/folder`)
        .set('Authorization', `Bearer ${issueTokenFor(jwtService, pysar)}`)
        .expect(200);
      expect(res.body).toEqual({ driveConnected: true, folderId: 'pysar-folder', folderName: 'Писарство куреня' });
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
      await request(app.getHttpServer())
        .get(`/kurins/${kurin.id}/pysarstvo/folder`)
        .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
        .expect(403);
    });

    it('lets only the zvyazkovyi set the folder, without touching the inventory folder, and audits it', async () => {
      const { kurin } = await setup();
      const pysar = await pysarIn(kurin.id);
      await request(app.getHttpServer())
        .patch(`/kurins/${kurin.id}/pysarstvo/folder`)
        .set('Authorization', `Bearer ${issueTokenFor(jwtService, pysar)}`)
        .send(folderBody)
        .expect(403);
      const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
      const res = await request(app.getHttpServer())
        .patch(`/kurins/${kurin.id}/pysarstvo/folder`)
        .set('Authorization', `Bearer ${issueTokenFor(jwtService, zvyazkovyi)}`)
        .send(folderBody)
        .expect(200);
      expect(res.body).toEqual({ driveConnected: true, folderId: 'new-folder', folderName: 'Документи куреня' });
      const after = await prisma.kurin.findUniqueOrThrow({ where: { id: kurin.id } });
      expect(after.driveFolderId).toBe('inventory-folder');
      expect(after.pysarstvoFolderId).toBe('new-folder');
      const audit = await prisma.auditLog.findFirst({ where: { kurinId: kurin.id, action: 'PYSARSTVO_FOLDER_SET' } });
      expect(audit?.details).toEqual({ folderName: 'Документи куреня' });
    });

    it('rejects setting the folder when Drive is not connected, and for another kurin', async () => {
      const { kurin } = await setup(false);
      const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
      const token = issueTokenFor(jwtService, zvyazkovyi);
      await request(app.getHttpServer())
        .patch(`/kurins/${kurin.id}/pysarstvo/folder`)
        .set('Authorization', `Bearer ${token}`)
        .send(folderBody)
        .expect(503);
      await request(app.getHttpServer())
        .patch(`/kurins/some-other-kurin/pysarstvo/folder`)
        .set('Authorization', `Bearer ${token}`)
        .send(folderBody)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/kurins/${kurin.id}/pysarstvo/folder`)
        .set('Authorization', `Bearer ${token}`)
        .send({ folderId: '', folderName: 'x' })
        .expect(400);
    });
  });

  it('lists active junaky as id + pseudo/name for a pysar, without other user fields', async () => {
    const { kurin } = await setup();
    const pysar = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.PYSAR,
        userId: pysar.id,
        assignedById: pysar.id,
      },
    });
    const withNick = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.user.update({ where: { id: withNick.id }, data: { nickname: 'Орел' } });
    const archived = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.user.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/pysarstvo/pseudos`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, pysar)}`)
      .expect(200);

    const ids = response.body.map((u: { id: string }) => u.id);
    expect(ids).toContain(withNick.id);
    expect(ids).not.toContain(archived.id);
    expect(response.body.find((u: { id: string }) => u.id === withNick.id)).toEqual({ id: withNick.id, label: 'Орел' });
  });

  it('forbids a plain junak from listing pseudo candidates', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/pysarstvo/pseudos`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
      .expect(403);
  });
});
