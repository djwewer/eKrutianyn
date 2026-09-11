import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Hurtok slug generation (e2e)', () => {
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

  it('generates a transliterated slug for a new hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post('/hurtky')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Вовки' })
      .expect(201);

    expect(response.body.slug).toBe('vovky');
  });

  it('appends a numeric suffix on a slug collision within the same kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const first = await request(app.getHttpServer())
      .post('/hurtky')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Вовки' })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/hurtky')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Вовки' })
      .expect(201);

    expect(first.body.slug).toBe('vovky');
    expect(second.body.slug).toBe('vovky_1');
  });

  it('does not collide with a same-named hurtok in a different kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const zvyazkovyiB = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinB.id });

    const responseA = await request(app.getHttpServer())
      .post('/hurtky')
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, zvyazkovyiA)}`)
      .send({ name: 'Вовки' })
      .expect(201);
    const responseB = await request(app.getHttpServer())
      .post('/hurtky')
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, zvyazkovyiB)}`)
      .send({ name: 'Вовки' })
      .expect(201);

    expect(responseA.body.slug).toBe('vovky');
    expect(responseB.body.slug).toBe('vovky');
  });
});
