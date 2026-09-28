import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Junak import — direct rows endpoint (e2e)', () => {
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

  async function setup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    return { kurin };
  }

  it('creates junaky from submitted rows', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/junak-import/rows`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          { firstName: 'Іван', lastName: 'Петренко', email: `ivan-${Date.now()}@example.com`, hurtokName: 'Орли' },
        ],
      })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0].created).toBe(true);
    expect(response.body.results[0].error).toBeUndefined();

    const createdHurtok = await prisma.hurtok.findFirst({ where: { kurinId: kurin.id, name: 'Орли' } });
    expect(createdHurtok).not.toBeNull();
  });

  it('reports a per-row error without failing the whole batch', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const existing = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/junak-import/rows`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          { firstName: 'Дублікат', lastName: 'Юнак', email: existing.email },
          { firstName: 'Новий', lastName: 'Юнак', email: `new-${Date.now()}@example.com` },
        ],
      })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.results[0].error).toBeDefined();
    expect(response.body.results[1].created).toBe(true);
    expect(response.body.results[1].error).toBeUndefined();
  });

  it('forbids a non-zvyazkovyi from importing directly', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/junak-import/rows`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [] })
      .expect(403);
  });

  it('returns match candidates by exact case-insensitive first+last name', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.user.update({
      where: { id: junak.id },
      data: { firstName: 'Іван', lastName: 'Петренко' },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/match-candidates?firstName=іван&lastName=ПЕТРЕНКО`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.candidates).toHaveLength(1);
  });
});
