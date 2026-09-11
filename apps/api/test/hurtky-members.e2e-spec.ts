import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, PositionScope, PositionType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

describe('GET /hurtky/by-slug/:slug (e2e)', () => {
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

  it('lets an assigned vykhovnyk see junaky and vykhovnyky in the hurtok, with their positions', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', slug: 'orlyky', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        hurtokId: hurtok.id,
        scope: PositionScope.HURTOK,
        positionType: PositionType.HURTKOVYI,
        userId: junak.id,
        assignedById: junak.id,
      },
    });

    const token = issueTokenFor(jwtService, vykhovnyk);
    const response = await request(app.getHttpServer())
      .get('/hurtky/by-slug/orlyky')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.hurtok.slug).toBe('orlyky');
    const memberIds = response.body.members.map((m: any) => m.id).sort();
    expect(memberIds).toEqual([junak.id, vykhovnyk.id].sort());
    const junakMember = response.body.members.find((m: any) => m.id === junak.id);
    expect(junakMember.positions).toHaveLength(1);
    expect(junakMember.positions[0].positionType).toBe('HURTKOVYI');
    expect(junakMember.passwordHash).toBeUndefined();
  });

  it('includes a kurinnyi among junaky, alongside regular junaky', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', slug: 'orlyky', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id, hurtokId: hurtok.id });

    const token = issueTokenFor(jwtService, vykhovnyk);
    const response = await request(app.getHttpServer())
      .get('/hurtky/by-slug/orlyky')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const junakIds = response.body.members
      .filter((m: any) => m.role === 'JUNAK')
      .map((m: any) => m.id)
      .sort();
    expect(junakIds).toEqual([junak.id, kurinnyi.id].sort());
  });

  it('returns 404 for a vykhovnyk not assigned to the hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    await prisma.hurtok.create({ data: { name: 'Орлики', slug: 'orlyky', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get('/hurtky/by-slug/orlyky')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('lets a zvyazkovyi view any hurtok in their kurin by slug', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    await prisma.hurtok.create({ data: { name: 'Орлики', slug: 'orlyky', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .get('/hurtky/by-slug/orlyky')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('forbids a kurinniy and a junak from viewing the members list', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    await prisma.hurtok.create({ data: { name: 'Орлики', slug: 'orlyky', kurinId: kurin.id } });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });

    await request(app.getHttpServer())
      .get('/hurtky/by-slug/orlyky')
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, kurinniy)}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/hurtky/by-slug/orlyky')
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
      .expect(403);
  });

  it('returns 404 for a slug that only exists in another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    await prisma.hurtok.create({ data: { name: 'HB', slug: 'hb', kurinId: kurinB.id } });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get('/hurtky/by-slug/hb')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
