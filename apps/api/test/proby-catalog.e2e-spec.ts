import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Proby catalog (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
  });

  it("returns the proby program tree active for the caller's kurin, not other programs", async () => {
    const { program: programA } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, [
      'Point A1',
      'Point A2',
    ]);
    await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Point B1']);
    const kurin = await createKurin(prisma, { probyProgramId: programA.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    const response = await request(app.getHttpServer())
      .get('/proby-programs/current')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(programA.id);
    expect(response.body.stages).toHaveLength(1);
    expect(response.body.stages[0].categories).toHaveLength(1);
    const descriptions = response.body.stages[0].categories[0].points.map((p: any) => p.description);
    expect(descriptions.sort()).toEqual(['Point A1', 'Point A2']);
  });

  it('allows a kurinniy to read the catalog', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinniy);

    await request(app.getHttpServer())
      .get('/proby-programs/current')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer()).get('/proby-programs/current').expect(401);
  });
});
