import { PrismaService } from '../prisma/prisma.service';
import { PositionType } from '@prisma/client';

export async function isKurinniyForUser(prisma: PrismaService, userId: string): Promise<boolean> {
  const active = await prisma.kurinPosition.findFirst({
    where: { userId, positionType: PositionType.KURINNYI, removedAt: null },
  });
  return !!active;
}
