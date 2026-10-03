import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PositionType, Role, TreasuryTransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateStartingBalanceDto } from './dto/update-starting-balance.dto';

@Injectable()
export class TreasuryService {
  constructor(private readonly prisma: PrismaService) {}

  private assertKurinMatches(kurinId: string, actor: CurrentUserPayload) {
    if (kurinId !== actor.kurinId) {
      throw new NotFoundException('Kurin not found');
    }
  }

  private assertCanWrite(actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.SKARBNYK)) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private assertCanRead(actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.SKARBNYK) && !actor.isKurinniy) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  async getSummary(kurinId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanRead(actor);
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: { treasuryStartingBalanceCents: true },
    });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    const transactions = await this.prisma.treasuryTransaction.findMany({
      where: { kurinId },
      orderBy: { occurredAt: 'desc' },
    });
    // Summed here rather than via a DB aggregate — the full list is already
    // fetched for display, and a kurin's transaction history is small enough
    // (tens to low hundreds of rows) that a second round trip isn't worth it.
    const currentBalanceCents = transactions.reduce(
      (total, t) => total + (t.type === TreasuryTransactionType.INCOME ? t.amountCents : -t.amountCents),
      kurin.treasuryStartingBalanceCents,
    );
    return {
      startingBalanceCents: kurin.treasuryStartingBalanceCents,
      currentBalanceCents,
      transactions,
    };
  }

  async updateStartingBalance(kurinId: string, dto: UpdateStartingBalanceDto, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    await this.prisma.kurin.update({
      where: { id: kurinId },
      data: { treasuryStartingBalanceCents: dto.startingBalanceCents },
    });
    return this.getSummary(kurinId, actor);
  }

  async createTransaction(kurinId: string, dto: CreateTransactionDto, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    return this.prisma.treasuryTransaction.create({
      data: {
        kurinId,
        type: dto.type,
        amountCents: dto.amountCents,
        description: dto.description,
        occurredAt: new Date(dto.occurredAt),
        createdById: actor.userId,
      },
    });
  }

  async deleteTransaction(kurinId: string, transactionId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    const transaction = await this.prisma.treasuryTransaction.findUnique({ where: { id: transactionId } });
    if (!transaction || transaction.kurinId !== kurinId) {
      throw new NotFoundException('Transaction not found');
    }
    await this.prisma.treasuryTransaction.delete({ where: { id: transactionId } });
    return { success: true };
  }
}
