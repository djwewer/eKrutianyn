import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PositionScope, PositionType, PrismaClient, Role } from '@prisma/client';
import { bootApp } from './utils/boot-app';
import { cleanDatabase } from './utils/clean-db';
import { createKurinSuddiaUser, createSkill, issueTokenFor } from './utils/fixtures';
import { createHistoryWorld } from './utils/history-fixtures';

describe('GET /users/:junakId/history — aggregate (e2e)', () => {
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

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function setupWithHistory() {
    const w = await createHistoryWorld(prisma);
    const token = (user: { id: string; role: Role; kurinId: string }) => issueTokenFor(jwtService, user);
    const zv = token(w.zvyazkovyi);
    const skill = await createSkill(prisma, { name: 'Картографія', levels: [2] });
    const post = (path: string, body: object) => http().post(`/users/${w.junak.id}/${path}`).set(auth(zv)).send(body).expect(201);
    await post('skills', { levelId: skill.levels[0].id, achievedAt: '2025-05-01' });
    await post('vfv', { note: 'без дати' });
    await post('vfv', { achievedAt: '2024-06-01' });
    await post('camps', { name: 'Вовча тропа', yearFrom: 2021, yearTo: 2022, role: 'PARTICIPANT' });
    await post('camps', { name: 'Говерла', yearFrom: 2024, role: 'PROVID' });
    await post('remarks', { kind: 'AWARD', text: 'Найкращий табірник', date: '2024-08-01' });
    await post('remarks', { kind: 'WARNING', text: 'Запізнення', howToFix: 'Приходити вчасно', date: '2025-03-10' });
    await post('past-positions', { title: 'Скарбник гуртка', scope: 'HURTOK', yearFrom: 2018, yearTo: 2019 });
    await http().patch(`/users/${w.junak.id}/history/dates`).set(auth(zv)).send({ upyJoinedAt: '2018-09-01', plastOathAt: '2019-02-22' }).expect(200);
    await prisma.kurinPosition.create({
      data: {
        kurinId: w.kurin.id,
        hurtokId: w.hurtokA.id,
        scope: PositionScope.HURTOK,
        positionType: PositionType.HURTKOVYI,
        userId: w.junak.id,
        assignedById: w.zvyazkovyi.id,
        assignedAt: new Date('2023-09-01T10:00:00.000Z'),
        removedAt: new Date('2024-09-01T10:00:00.000Z'),
        removedById: w.zvyazkovyi.id,
      },
    });
    await prisma.kurinPosition.create({
      data: {
        kurinId: w.kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.PYSAR,
        userId: w.junak.id,
        assignedById: w.zvyazkovyi.id,
        assignedAt: new Date('2025-01-15T10:00:00.000Z'),
      },
    });
    return { ...w, token };
  }

  it('returns every section, sorted, with current and removed positions', async () => {
    const w = await setupWithHistory();
    const res = await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(w.zvyazkovyi))).expect(200);
    expect(res.body).toMatchObject({ canEdit: true, upyJoinedAt: '2018-09-01', plastOathAt: '2019-02-22' });
    expect(res.body.skills).toEqual([expect.objectContaining({ skillName: 'Картографія', level: 2, achievedAt: '2025-05-01' })]);
    expect(res.body.vfv.map((v: { achievedAt: string | null }) => v.achievedAt)).toEqual(['2024-06-01', null]);
    expect(res.body.camps.map((c: { name: string }) => c.name)).toEqual(['Говерла', 'Вовча тропа']);
    expect(res.body.remarks.map((r: { kind: string }) => r.kind)).toEqual(['WARNING', 'AWARD']);
    expect(res.body.pastPositions).toEqual([
      { id: expect.any(String), title: 'Скарбник гуртка', scope: 'HURTOK', yearFrom: 2018, yearTo: 2019 },
    ]);
    expect(res.body.positions).toEqual([
      {
        id: expect.any(String),
        positionType: 'PYSAR',
        scope: 'KURIN',
        hurtokName: null,
        assignedAt: '2025-01-15T10:00:00.000Z',
        removedAt: null,
      },
      {
        id: expect.any(String),
        positionType: 'HURTKOVYI',
        scope: 'HURTOK',
        hurtokName: 'Орлики',
        assignedAt: '2023-09-01T10:00:00.000Z',
        removedAt: '2024-09-01T10:00:00.000Z',
      },
    ]);
  });

  it('shows the junak his own history read-only, warnings included in full', async () => {
    const w = await setupWithHistory();
    const res = await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(w.junak))).expect(200);
    expect(res.body.canEdit).toBe(false);
    expect(res.body.remarks[0]).toMatchObject({ kind: 'WARNING', text: 'Запізнення', howToFix: 'Приходити вчасно', date: '2025-03-10' });
  });

  it('follows profile visibility: own vykhovnyk and suddia read, others get 404', async () => {
    const w = await setupWithHistory();
    expect((await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(w.vykhovnykA))).expect(200)).body.canEdit).toBe(true);
    const suddia = await createKurinSuddiaUser(prisma, { kurinId: w.kurin.id });
    expect((await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(suddia))).expect(200)).body.canEdit).toBe(false);
    await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(w.vykhovnykB))).expect(404);
    await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(w.junakNoHurtok))).expect(404);
    await http().get(`/users/${w.junak.id}/history`).set(auth(w.token(w.otherZvyazkovyi))).expect(404);
    await http().get(`/users/${w.zvyazkovyi.id}/history`).set(auth(w.token(w.zvyazkovyi))).expect(404);
  });

  it('returns an empty history for a junak with nothing recorded, read-only once archived', async () => {
    const w = await createHistoryWorld(prisma);
    await prisma.user.update({ where: { id: w.junakNoHurtok.id }, data: { archivedAt: new Date() } });
    const res = await http()
      .get(`/users/${w.junakNoHurtok.id}/history`)
      .set(auth(issueTokenFor(jwtService, w.zvyazkovyi)))
      .expect(200);
    expect(res.body).toEqual({
      canEdit: false,
      upyJoinedAt: null,
      plastOathAt: null,
      skills: [],
      vfv: [],
      camps: [],
      remarks: [],
      pastPositions: [],
      positions: [],
    });
  });
});
