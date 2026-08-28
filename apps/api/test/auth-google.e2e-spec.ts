import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { GoogleTokenVerifierService } from '../src/auth/google-token-verifier.service';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser } from './utils/fixtures';

describe('Auth Google login (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });
  const verifyMock = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleTokenVerifierService)
      .useValue({ verify: verifyMock })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    verifyMock.mockReset();
    await cleanDatabase(prisma);
  });

  it('returns an access token when the verified email matches an existing user', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, email: 'junak@example.com' });
    verifyMock.mockResolvedValue({ email: 'junak@example.com', sub: 'google-sub-1' });

    const response = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'fake-google-token' })
      .expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
  });

  it('returns 401 when no account matches the verified email', async () => {
    verifyMock.mockResolvedValue({ email: 'unknown@example.com', sub: 'google-sub-2' });

    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'fake-google-token' })
      .expect(401);
  });

  it('returns 401 when the Google token is invalid', async () => {
    verifyMock.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'bad-token' })
      .expect(401);
  });

  it('returns 400 when idToken is missing', async () => {
    await request(app.getHttpServer()).post('/auth/google').send({}).expect(400);
  });
});
