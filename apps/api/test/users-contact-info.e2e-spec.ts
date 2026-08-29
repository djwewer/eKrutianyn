import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Users contact-info update (e2e)', () => {
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

  it('lets kurinnyi update notes/phone immediately, with no approval step', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinnyi);

    const response = await request(app.getHttpServer())
      .patch(`/users/${junak.id}/contact-info`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Алергія на горіхи', phone: '+380501234567' })
      .expect(200);

    expect(response.body.notes).toBe('Алергія на горіхи');
    expect(response.body.phone).toBe('+380501234567');
    expect(response.body.passwordHash).toBeUndefined();
  });

  it('lets zvyazkovyi update notes/phone too', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .patch(`/users/${junak.id}/contact-info`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+380501234567' })
      .expect(200);

    expect(response.body.phone).toBe('+380501234567');
    expect(response.body.passwordHash).toBeUndefined();
  });

  it('forbids a vykhovnyk from updating contact info', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .patch(`/users/${junak.id}/contact-info`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+380501234567' })
      .expect(403);
  });

  it('returns 404 for a junak in another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const kurinnyiA = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurinA.id });
    const junakB = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinB.id });
    const token = issueTokenFor(jwtService, kurinnyiA);

    await request(app.getHttpServer())
      .patch(`/users/${junakB.id}/contact-info`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+380501234567' })
      .expect(404);
  });
});
