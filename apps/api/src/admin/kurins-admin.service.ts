import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { AuditAction, Role, TokenPurpose } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { InviteService } from '../auth/invite.service';
import { CreateKurinDto } from './dto/create-kurin.dto';
import { UpdateKurinDto } from './dto/update-kurin.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';

@Injectable()
export class KurinsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inviteService: InviteService,
    private readonly audit: AuditService,
  ) {}

  async listKurins() {
    const kurins = await this.prisma.kurin.findMany({
      orderBy: { kurinNumber: 'asc' },
      include: {
        _count: { select: { users: true, hurtky: true } },
        users: {
          where: { role: Role.ZVYAZKOVYI, archivedAt: null },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            passwordHash: true,
            googleId: true,
            passwordResetTokens: {
              where: { purpose: TokenPurpose.INVITE },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { createdAt: true },
            },
          },
        },
      },
    });
    return kurins.map((k) => ({
      id: k.id,
      name: k.name,
      kurinNumber: k.kurinNumber,
      gender: k.gender,
      stanytsia: k.stanytsia,
      probyProgramId: k.probyProgramId,
      createdAt: k.createdAt,
      deactivatedAt: k.deactivatedAt,
      userCount: k._count.users,
      hurtokCount: k._count.hurtky,
      zvyazkovyi: k.users[0]
        ? {
            id: k.users[0].id,
            firstName: k.users[0].firstName,
            lastName: k.users[0].lastName,
            email: k.users[0].email,
            activated: k.users[0].passwordHash !== null || k.users[0].googleId !== null,
            lastInviteAt: k.users[0].passwordResetTokens[0]?.createdAt ?? null,
          }
        : null,
    }));
  }

  async setDeactivated(id: string, deactivated: boolean): Promise<{ id: string; deactivatedAt: Date | null }> {
    const kurin = await this.prisma.kurin.findUnique({ where: { id }, select: { id: true, deactivatedAt: true } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    // Deactivating an already deactivated kurin keeps the original date.
    const deactivatedAt = deactivated ? (kurin.deactivatedAt ?? new Date()) : null;
    await this.prisma.kurin.update({ where: { id }, data: { deactivatedAt } });
    await this.audit.record({
      kurinId: id,
      actorId: null,
      action: deactivated ? AuditAction.KURIN_DEACTIVATED : AuditAction.KURIN_ACTIVATED,
    });
    return { id, deactivatedAt };
  }

  async updateKurin(id: string, dto: UpdateKurinDto) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    if (dto.kurinNumber && dto.kurinNumber !== kurin.kurinNumber) {
      const existing = await this.prisma.kurin.findUnique({ where: { kurinNumber: dto.kurinNumber } });
      if (existing) {
        throw new ConflictException('This kurin number is already in use');
      }
    }
    return this.prisma.kurin.update({
      where: { id },
      data: { name: dto.name, kurinNumber: dto.kurinNumber },
    });
  }

  async deleteKurin(id: string): Promise<void> {
    const kurin = await this.prisma.kurin.findUnique({
      where: { id },
      include: { _count: { select: { users: true, hurtky: true } } },
    });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    // Deleting a kurin with members or hurtky would either orphan them (FK
    // violation, since neither relation cascades) or silently delete people's
    // accounts along with it — neither is a safe default for an admin button.
    // The operator has to empty it out first (archive/move its members) so a
    // delete here is always an intentional, inert cleanup.
    if (kurin._count.users > 0 || kurin._count.hurtky > 0) {
      throw new ConflictException(
        'This kurin still has members or hurtky attached — remove or reassign them before deleting it',
      );
    }
    await this.prisma.kurin.delete({ where: { id } });
  }

  async createKurin(dto: CreateKurinDto) {
    const program = await this.prisma.probyProgram.findUnique({ where: { id: dto.probyProgramId } });
    if (!program) {
      throw new NotFoundException('Proby program not found');
    }
    if (dto.kurinNumber) {
      const existing = await this.prisma.kurin.findUnique({ where: { kurinNumber: dto.kurinNumber } });
      if (existing) {
        throw new ConflictException('This kurin number is already in use');
      }
    }
    const { zvyazkovyi, ...kurinFields } = dto;
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const kurin = await tx.kurin.create({
          data: { ...kurinFields, kurinNumber: kurinFields.kurinNumber ?? null },
        });
        const user = await tx.user.create({
          data: {
            firstName: zvyazkovyi.firstName,
            lastName: zvyazkovyi.lastName,
            email: zvyazkovyi.email,
            role: Role.ZVYAZKOVYI,
            kurinId: kurin.id,
            passwordHash: null,
            mustChangePassword: false,
          },
        });
        return { kurin, zvyazkovyiId: user.id };
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('This email is already in use');
      }
      throw err;
    }
    // Sent only after the transaction has committed.
    const { sent } = await this.inviteService.sendInvite(result.zvyazkovyiId, null);
    return { ...result.kurin, inviteSent: sent };
  }

  async createFirstZvyazkovyi(dto: CreateAdminUserDto) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: dto.kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    const existingZvyazkovyi = await this.prisma.user.findFirst({
      where: { kurinId: dto.kurinId, role: Role.ZVYAZKOVYI, archivedAt: null },
    });
    if (existingZvyazkovyi) {
      throw new ConflictException('This kurin already has an active Зв\'язковий');
    }
    let created;
    try {
      created = await this.prisma.user.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          passwordHash: null,
          role: Role.ZVYAZKOVYI,
          kurinId: dto.kurinId,
          mustChangePassword: false,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          kurinId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('This email is already in use');
      }
      throw err;
    }
    const { sent } = await this.inviteService.sendInvite(created.id, null);
    return { ...created, inviteSent: sent };
  }

  async resendInvite(userId: string): Promise<{ inviteSent: boolean }> {
    const target = await this.prisma.user.findUnique({ where: { id: userId },
      select: { passwordHash: true, googleId: true, archivedAt: true },
    });
    if (!target || target.archivedAt) {
      throw new NotFoundException('User not found');
    }
    if (target.passwordHash !== null || target.googleId !== null) {
      throw new ConflictException('Користувач уже активував акаунт');
    }
    const { sent } = await this.inviteService.sendInvite(userId, null);
    return { inviteSent: sent };
  }
}
