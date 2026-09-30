import { PrismaService } from '../prisma/prisma.service';
import { PositionScope, PositionType } from '@prisma/client';

export async function getActiveKurinPositions(
  prisma: PrismaService,
  userId: string,
  kurinId: string,
): Promise<PositionType[]> {
  const rows = await prisma.kurinPosition.findMany({
    where: { userId, kurinId, scope: PositionScope.KURIN, removedAt: null },
    select: { positionType: true },
  });
  return rows.map((row) => row.positionType);
}

export async function hasAnyActivePosition(prisma: PrismaService, userId: string): Promise<boolean> {
  const active = await prisma.kurinPosition.findFirst({ where: { userId, removedAt: null } });
  return !!active;
}
