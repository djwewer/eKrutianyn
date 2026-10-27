import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, PrismaClient, ProbyProgramVersion, Role } from '@prisma/client';
import { cleanDatabase } from './utils/clean-db';
import { bootApp } from './utils/boot-app';
import { createKurin, createKurinniyUser, createProbyProgramTree, createUser, issueTokenFor } from './utils/fixtures';

describe('Audit log read (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    ({ app, jwtService } = await bootApp());
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
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    return { kurin, zvyazkovyi, token: issueTokenFor(jwtService, zvyazkovyi) };
  }

  const url = (kurinId: string, qs = '') => `/kurins/${kurinId}/audit-log${qs}`;

  it('returns newest-first events with the actor name', async () => {
    const { kurin, zvyazkovyi, token } = await setup();
    await prisma.user.update({ where: { id: zvyazkovyi.id }, data: { nickname: 'Орел' } });
    await prisma.auditLog.create({
      data: { kurinId: kurin.id, actorId: zvyazkovyi.id, action: AuditAction.APD_CREATED, details: { title: 'Старий' }, createdAt: new Date('2026-01-01') },
    });
    await prisma.auditLog.create({
      data: { kurinId: kurin.id, actorId: null, action: AuditAction.JUDGE_BOOK_SYNCED_NIGHTLY, createdAt: new Date('2026-02-01') },
    });

    const res = await request(app.getHttpServer()).get(url(kurin.id)).set('Authorization', `Bearer ${token}`).expect(200);

    expect(res.body.items.map((i: any) => i.action)).toEqual([
      AuditAction.JUDGE_BOOK_SYNCED_NIGHTLY,
      AuditAction.APD_CREATED,
    ]);
    expect(res.body.items[0].actor).toBeNull();
    expect(res.body.items[1].actor).toEqual({ id: zvyazkovyi.id, name: 'Орел' });
    expect(res.body.nextCursor).toBeNull();
  });

  it('paginates with a cursor', async () => {
    const { kurin, zvyazkovyi, token } = await setup();
    for (let i = 0; i < 5; i++) {
      await prisma.auditLog.create({
        data: { kurinId: kurin.id, actorId: zvyazkovyi.id, action: AuditAction.APD_CREATED, createdAt: new Date(2026, 0, i + 1) },
      });
    }
    const first = await request(app.getHttpServer()).get(url(kurin.id, '?limit=2')).set('Authorization', `Bearer ${token}`).expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await request(app.getHttpServer())
      .get(url(kurin.id, `?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(second.body.items).toHaveLength(2);
    const third = await request(app.getHttpServer())
      .get(url(kurin.id, `?limit=2&cursor=${encodeURIComponent(second.body.nextCursor)}`))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(third.body.items).toHaveLength(1);
    expect(third.body.nextCursor).toBeNull();
    const ids = [...first.body.items, ...second.body.items, ...third.body.items].map((i: any) => i.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('filters by group, actor, subject and period', async () => {
    const { kurin, zvyazkovyi, token } = await setup();
    const other = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.auditLog.createMany({
      data: [
        { kurinId: kurin.id, actorId: zvyazkovyi.id, action: AuditAction.PROBY_POINT_CONFIRMED, subjectUserId: other.id, createdAt: new Date('2026-03-01') },
        { kurinId: kurin.id, actorId: other.id, action: AuditAction.TREASURY_TRANSACTION_CREATED, createdAt: new Date('2026-03-05') },
        { kurinId: kurin.id, actorId: zvyazkovyi.id, action: AuditAction.APD_CREATED, createdAt: new Date('2026-04-01') },
      ],
    });
    const get = (qs: string) => request(app.getHttpServer()).get(url(kurin.id, qs)).set('Authorization', `Bearer ${token}`).expect(200);

    expect((await get('?group=PROBY')).body.items).toHaveLength(1);
    expect((await get('?group=MONEY')).body.items[0].action).toBe(AuditAction.TREASURY_TRANSACTION_CREATED);
    expect((await get(`?actorId=${other.id}`)).body.items).toHaveLength(1);
    expect((await get(`?subjectUserId=${other.id}`)).body.items).toHaveLength(1);
    expect((await get('?from=2026-03-02&to=2026-03-31')).body.items).toHaveLength(1);
  });

  it('rejects an invalid group or limit', async () => {
    const { kurin, token } = await setup();
    await request(app.getHttpServer()).get(url(kurin.id, '?group=NOPE')).set('Authorization', `Bearer ${token}`).expect(400);
    await request(app.getHttpServer()).get(url(kurin.id, '?limit=0')).set('Authorization', `Bearer ${token}`).expect(400);
    await request(app.getHttpServer()).get(url(kurin.id, '?limit=500')).set('Authorization', `Bearer ${token}`).expect(400);
  });

  it('is zvyazkovyi-only', async () => {
    const { kurin } = await setup();
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    for (const user of [kurinniy, vykhovnyk]) {
      await request(app.getHttpServer())
        .get(url(kurin.id))
        .set('Authorization', `Bearer ${issueTokenFor(jwtService, user)}`)
        .expect(403);
    }
    await request(app.getHttpServer()).get(url(kurin.id)).expect(401);
  });

  it('does not leak events across kurins', async () => {
    const { kurin, token } = await setup();
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Q']);
    const otherKurin = await createKurin(prisma, { probyProgramId: program.id });
    await prisma.auditLog.create({ data: { kurinId: otherKurin.id, actorId: null, action: AuditAction.APD_CREATED } });

    const own = await request(app.getHttpServer()).get(url(kurin.id)).set('Authorization', `Bearer ${token}`).expect(200);
    expect(own.body.items).toHaveLength(0);
    await request(app.getHttpServer()).get(url(otherKurin.id)).set('Authorization', `Bearer ${token}`).expect(404);
  });
});
