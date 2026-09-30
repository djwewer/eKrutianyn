import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Archived rows excluded from lists (e2e)', () => {
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

  it('GET /users excludes an archived junak but GET /users/:id still finds them', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.user.update({ where: { id: junak.id }, data: { archivedAt: new Date(), archivedById: zvyazkovyi.id } });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const list = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.find((u: { id: string }) => u.id === junak.id)).toBeUndefined();

    const detail = await request(app.getHttpServer())
      .get(`/users/${junak.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.id).toBe(junak.id);
  });

  it('GET /hurtky excludes an archived hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    await prisma.hurtok.update({ where: { id: hurtok.id }, data: { archivedAt: new Date(), archivedById: zvyazkovyi.id } });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const list = await request(app.getHttpServer())
      .get('/hurtky')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.find((h: { id: string }) => h.id === hurtok.id)).toBeUndefined();
  });
});
