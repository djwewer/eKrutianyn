import { PrismaService } from '../prisma/prisma.service';
import { Prisma, PositionType } from '@prisma/client';

export async function isKurinniyForUser(prisma: PrismaService | Prisma.TransactionClient, userId: string): Promise<boolean> {
  const active = await prisma.kurinPosition.findFirst({
    where: { userId, positionType: PositionType.KURINNYI, removedAt: null },
  });
  return !!active;
}
