import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const SVG_WITH_SCRIPT = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>');

describe('Profile photo upload/serve (e2e)', () => {
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

  it('rejects an upload whose declared mimetype is not in the allowed list', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, user);

    await request(app.getHttpServer())
      .patch('/users/me/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', SVG_WITH_SCRIPT, { filename: 'evil.svg', contentType: 'image/svg+xml' })
      .expect(400);
  });

  it('rejects an SVG whose request falsely declares an allowed image mimetype (magic-byte sniff)', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, user);

    await request(app.getHttpServer())
      .patch('/users/me/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', SVG_WITH_SCRIPT, { filename: 'evil.png', contentType: 'image/png' })
      .expect(400);

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored?.photoData).toBeNull();
  });

  it('accepts a valid PNG upload and serves it back with hardening headers', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, user);

    await request(app.getHttpServer())
      .patch('/users/me/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', PNG_SIGNATURE, { filename: 'me.png', contentType: 'image/png' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/users/${user.id}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['cache-control']).toContain('private');
  });

  it('blocks fetching another kurin\'s member photo', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id });
    const userA = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinA.id });
    const userB = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinB.id });
    const tokenA = issueTokenFor(jwtService, userA);
    const tokenB = issueTokenFor(jwtService, userB);

    await request(app.getHttpServer())
      .patch('/users/me/photo')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('photo', PNG_SIGNATURE, { filename: 'me.png', contentType: 'image/png' })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/users/${userA.id}/photo`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('removes the photo so it is no longer servable', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, user);

    await request(app.getHttpServer())
      .patch('/users/me/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', PNG_SIGNATURE, { filename: 'me.png', contentType: 'image/png' })
      .expect(200);

    await request(app.getHttpServer())
      .delete('/users/me/photo')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/users/${user.id}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
