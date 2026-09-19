import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, PositionScope, PositionType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';
import { signGoogleDriveState } from '../src/kurins/google-drive-state.util';

describe('Kurin Google Drive OAuth (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fakeGoogleDrive: {
    getAuthUrl: jest.Mock;
    handleCallback: jest.Mock;
    getPickerAccessToken: jest.Mock;
  };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    fakeGoogleDrive = {
      getAuthUrl: jest.fn(),
      handleCallback: jest.fn(),
      getPickerAccessToken: jest.fn(),
    };
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
    fakeGoogleDrive.getAuthUrl.mockReset();
    fakeGoogleDrive.handleCallback.mockReset();
    fakeGoogleDrive.getPickerAccessToken.mockReset();
  });

  async function setup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    return { kurin };
  }

  it('reports not connected for a fresh kurin', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/google-drive/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ connected: false });
  });

  it('forbids a non-zvyazkovyi from checking status', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/google-drive/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns a Google auth URL for connect', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    fakeGoogleDrive.getAuthUrl.mockReturnValue('https://accounts.google.com/mock-consent');

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/google-drive/connect`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ url: 'https://accounts.google.com/mock-consent' });
    expect(fakeGoogleDrive.getAuthUrl).toHaveBeenCalledWith(expect.any(String));
  });

  it('redirects to the frontend with driveConnected=1 on a valid callback', async () => {
    const { kurin } = await setup();
    fakeGoogleDrive.handleCallback.mockResolvedValue({ email: 'test@example.com' });
    const state = signGoogleDriveState(jwtService, kurin.id);

    const response = await request(app.getHttpServer())
      .get(`/kurins/google-drive/callback?code=auth-code&state=${state}`)
      .expect(302);

    expect(response.headers.location).toContain('driveConnected=1');
    expect(fakeGoogleDrive.handleCallback).toHaveBeenCalledWith(kurin.id, 'auth-code');
  });

  it('redirects to the frontend with driveError=1 on an invalid state', async () => {
    const response = await request(app.getHttpServer())
      .get('/kurins/google-drive/callback?code=auth-code&state=not-a-real-token')
      .expect(302);

    expect(response.headers.location).toContain('driveError=1');
  });

  it('returns a picker access token for a connected kurin', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    fakeGoogleDrive.getPickerAccessToken.mockResolvedValue('picker-access-token');

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/google-drive/picker-token`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ accessToken: 'picker-access-token' });
  });

  it('saves the picked folder', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/google-drive/folder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ folderId: 'folder-abc', folderName: 'Обозництво' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const updated = await prisma.kurin.findUnique({ where: { id: kurin.id } });
    expect(updated?.driveFolderId).toBe('folder-abc');
    expect(updated?.driveFolderName).toBe('Обозництво');
  });

  it('lets an intendant check status', async () => {
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

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/google-drive/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('forbids acting on a different kurin', async () => {
    const { kurin } = await setup();
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const outsider = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });
    const token = issueTokenFor(jwtService, outsider);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/google-drive/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
