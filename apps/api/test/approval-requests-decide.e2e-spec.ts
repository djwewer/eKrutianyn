import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ApprovalActionType, ApprovalStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Approval requests approve/reject (e2e)', () => {
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

  async function baseSetup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    return { kurin, kurinnyi, zvyazkovyi };
  }

  it('applies a CHANGE_FULL_NAME request on approval', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_FULL_NAME,
        oldData: { firstName: junak.firstName, lastName: junak.lastName },
        newData: { firstName: 'Новий', lastName: 'Прізвище' },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(response.body.status).toBe(ApprovalStatus.APPROVED);
    expect(response.body.approvedById).toBe(zvyazkovyi.id);

    const updatedJunak = await prisma.user.findUnique({ where: { id: junak.id } });
    expect(updatedJunak?.firstName).toBe('Новий');
    expect(updatedJunak?.lastName).toBe('Прізвище');
  });

  it('creates a new junak on approval of a CREATE_JUNAK request', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        actionType: ApprovalActionType.CREATE_JUNAK,
        newData: {
          firstName: 'Новий',
          lastName: 'Юнак',
          email: 'created-via-approval@example.com',
          hurtokId: hurtok.id,
        },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const createdJunak = await prisma.user.findUnique({
      where: { email: 'created-via-approval@example.com' },
    });
    expect(createdJunak?.role).toBe(Role.JUNAK);
    expect(createdJunak?.kurinId).toBe(kurin.id);
  });

  it('rejecting a request leaves the junak untouched', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_EMAIL,
        oldData: { email: junak.email },
        newData: { email: 'rejected@example.com' },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(response.body.status).toBe(ApprovalStatus.REJECTED);

    const unchangedJunak = await prisma.user.findUnique({ where: { id: junak.id } });
    expect(unchangedJunak?.email).toBe(junak.email);
  });

  it('returns 400 when approving an already-decided request', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const decided = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_EMAIL,
        newData: { email: 'x@example.com' },
        status: ApprovalStatus.REJECTED,
        approvedById: zvyazkovyi.id,
        decidedAt: new Date(),
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${decided.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('returns 403 when a zvyazkovyi from another kurin tries to decide', async () => {
    const { kurin, kurinnyi } = await baseSetup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_EMAIL,
        newData: { email: 'x@example.com' },
        status: ApprovalStatus.PENDING,
      },
    });
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const outsider = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });
    const token = issueTokenFor(jwtService, outsider);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('forbids kurinnyi from approving (only zvyazkovyi can)', async () => {
    const { kurin, kurinnyi } = await baseSetup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_EMAIL,
        newData: { email: 'x@example.com' },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, kurinnyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it("lists only the pending requests for the caller's own kurin", async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_EMAIL,
        newData: { email: 'x@example.com' },
        status: ApprovalStatus.PENDING,
      },
    });
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const otherKurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: otherKurin.id });
    const otherJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: otherKurin.id });
    await prisma.approvalRequest.create({
      data: {
        initiatedById: otherKurinnyi.id,
        junakId: otherJunak.id,
        actionType: ApprovalActionType.CHANGE_EMAIL,
        newData: { email: 'y@example.com' },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get('/approval-requests')
      .query({ status: ApprovalStatus.PENDING })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
  });

  it('fails to create a junak if hurtokId belongs to another kurin', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const otherHurtok = await prisma.hurtok.create({ data: { name: 'Інший', kurinId: otherKurin.id } });
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        actionType: ApprovalActionType.CREATE_JUNAK,
        newData: {
          firstName: 'Новий',
          lastName: 'Юнак',
          email: 'should-not-exist@example.com',
          hurtokId: otherHurtok.id,
        },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const shouldNotExist = await prisma.user.findUnique({
      where: { email: 'should-not-exist@example.com' },
    });
    expect(shouldNotExist).toBeNull();
  });

  it('fails to change hurtok if new hurtokId belongs to another kurin', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const otherHurtok = await prisma.hurtok.create({ data: { name: 'Інший', kurinId: otherKurin.id } });
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_HURTOK,
        oldData: { hurtokId: junak.hurtokId },
        newData: { hurtokId: otherHurtok.id },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const unchangedJunak = await prisma.user.findUnique({ where: { id: junak.id } });
    expect(unchangedJunak?.hurtokId).toBe(junak.hurtokId);
  });
});
