import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, PositionScope, PositionType, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';

describe('Inventory (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fakeGoogleDrive: { uploadFile: jest.Mock };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    fakeGoogleDrive = { uploadFile: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleDriveService)
      .useValue(fakeGoogleDrive)
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
    fakeGoogleDrive.uploadFile.mockReset().mockResolvedValue({ fileId: 'fake-file-id', url: 'https://drive.google.com/uc?id=fake-file-id' });
  });

  async function setup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const connectedKurin = await prisma.kurin.update({
      where: { id: kurin.id },
      data: { driveFolderId: 'connected-folder-id' },
    });
    return { kurin: connectedKurin };
  }

  it('lets zvyazkovyi create an item with a photo', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Пилка')
      .field('quantity', '2')
      .attach('photos', Buffer.from('fake-image-data'), 'saw.jpg')
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.name).toBe('Пилка');
    expect(response.body.quantity).toBe(2);
    expect(response.body.photos).toHaveLength(1);
    expect(response.body.photos[0].driveFileId).toBe('fake-file-id');
  });

  it('lets an intendant create an item without a photo', async () => {
    const { kurin } = await setup();
    const intendant = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.INTENDANT,
        userId: intendant.id,
        assignedById: intendant.id,
      },
    });
    const token = issueTokenFor(jwtService, intendant);

    const response = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Сокира')
      .field('quantity', '1')
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.photos).toHaveLength(0);
  });

  it('forbids a plain junak from creating an item', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Казан')
      .field('quantity', '1')
      .expect(403);
  });

  it('lets a kurinniy view the list but forbids creating items', async () => {
    const { kurin } = await setup();
    const kurinniy = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.KURINNYI,
        userId: kurinniy.id,
        assignedById: kurinniy.id,
      },
    });
    const token = issueTokenFor(jwtService, kurinniy);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Стіл')
      .field('quantity', '1')
      .expect(403);
  });

  it('lets zvyazkovyi update an item without touching its photos', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    const created = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Стіл')
      .field('quantity', '1');

    const response = await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/inventory/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 3 })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.quantity).toBe(3);
    expect(response.body.name).toBe('Стіл');
  });

  it('deletes an item and cascades its photos', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    const created = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Стіл')
      .field('quantity', '1')
      .attach('photos', Buffer.from('fake'), 'a.jpg');

    await request(app.getHttpServer())
      .delete(`/kurins/${kurin.id}/inventory/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const remainingPhotos = await prisma.inventoryItemPhoto.findMany({ where: { itemId: created.body.id } });
    expect(remainingPhotos).toHaveLength(0);
  });

  it('lets zvyazkovyi add and remove an individual photo', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    const created = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Стіл')
      .field('quantity', '1');

    const addResponse = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory/${created.body.id}/photos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake'), 'b.jpg')
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .delete(`/kurins/${kurin.id}/inventory/${created.body.id}/photos/${addResponse.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const remaining = await prisma.inventoryItemPhoto.findMany({ where: { itemId: created.body.id } });
    expect(remaining).toHaveLength(0);
  });

  it('returns 404 for a different kurin', async () => {
    const { kurin } = await setup();
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const outsider = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });
    const token = issueTokenFor(jwtService, outsider);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('rejects a non-image file uploaded as a new item photo', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Пилка')
      .field('quantity', '1')
      .attach('photos', Buffer.from('not an image'), { filename: 'file.txt', contentType: 'text/plain' })
      .expect(400);
  });

  it('rejects a non-image file uploaded as an individual item photo', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    const created = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Стіл')
      .field('quantity', '1');

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/inventory/${created.body.id}/photos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('not an image'), { filename: 'file.txt', contentType: 'text/plain' })
      .expect(400);
  });

  it('returns 503 when creating an item with a photo on a kurin with no connected Drive folder', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const disconnectedKurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: disconnectedKurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/kurins/${disconnectedKurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Пилка')
      .field('quantity', '1')
      .attach('photos', Buffer.from('fake-image-data'), 'saw.jpg')
      .expect(503);
  });

  it('still creates an item without photos on a kurin with no connected Drive folder', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const disconnectedKurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: disconnectedKurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/kurins/${disconnectedKurin.id}/inventory`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Стіл')
      .field('quantity', '1')
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.photos).toHaveLength(0);
  });
});
