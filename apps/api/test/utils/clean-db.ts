import { PrismaClient } from '@prisma/client';

export async function cleanDatabase(prisma: PrismaClient) {
  await prisma.$transaction([
    prisma.progressAuditLog.deleteMany(),
    prisma.approvalRequest.deleteMany(),
    prisma.junakProgress.deleteMany(),
    prisma.pointMapping.deleteMany(),
    prisma.probyPoint.deleteMany(),
    prisma.probyCategory.deleteMany(),
    prisma.probyStage.deleteMany(),
    prisma.vykhovnykHurtok.deleteMany(),
    prisma.user.deleteMany(),
    prisma.hurtok.deleteMany(),
    prisma.kurin.deleteMany(),
    prisma.probyProgram.deleteMany(),
  ]);
}
