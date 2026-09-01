import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../mail/mail.service';
import { generateToken } from '../common/token.util';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PROBY_TRACKING_ROLES } from '../common/proby-tracking-roles';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateContactInfoDto } from './dto/update-contact-info.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { USER_SELECT } from './user-select.const';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateUserDto, actorKurinId: string) {
    if (dto.role === Role.ZVYAZKOVYI) {
      throw new BadRequestException('Cannot self-service create another zvyazkovyi');
    }
    if (PROBY_TRACKING_ROLES.includes(dto.role) && !dto.hurtokId) {
      throw new BadRequestException('hurtokId is required for this role');
    }
    if (dto.hurtokId) {
      const hurtok = await this.prisma.hurtok.findUnique({ where: { id: dto.hurtokId } });
      if (!hurtok || hurtok.kurinId !== actorKurinId) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }
    const passwordHash = dto.password ? await this.authService.hashPassword(dto.password) : undefined;
    return this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        role: dto.role,
        passwordHash,
        kurinId: actorKurinId,
        hurtokId: dto.hurtokId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        email: true,
        role: true,
        birthDate: true,
        kurinId: true,
        hurtokId: true,
      },
    });
  }

  async updateContactInfo(junakId: string, dto: UpdateContactInfoDto, actorKurinId: string) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actorKurinId) {
      throw new NotFoundException('Junak not found');
    }
    return this.prisma.user.update({
      where: { id: junakId },
      data: { notes: dto.notes, phone: dto.phone },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        email: true,
        role: true,
        birthDate: true,
        kurinId: true,
        hurtokId: true,
        notes: true,
        phone: true,
      },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { ...USER_SELECT, notes: true, phone: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async list(actor: CurrentUserPayload, filters: { role?: Role; hurtokId?: string }) {
    if (actor.role === Role.JUNAK) {
      throw new ForbiddenException('Junak cannot list users');
    }
    if (actor.role === Role.VYKHOVNYK && filters.role && filters.role !== Role.JUNAK) {
      throw new ForbiddenException('Vykhovnyk can only list junaky');
    }
    if (actor.role === Role.KURINNYI && filters.role === Role.KURINNYI) {
      throw new ForbiddenException('Kurinnyi cannot list other kurinni');
    }
    if (filters.hurtokId) {
      const hurtok = await this.prisma.hurtok.findUnique({ where: { id: filters.hurtokId } });
      if (!hurtok || hurtok.kurinId !== actor.kurinId) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }

    if (actor.role === Role.VYKHOVNYK) {
      const assignments = await this.prisma.vykhovnykHurtok.findMany({
        where: { vykhovnykId: actor.userId },
        select: { hurtokId: true },
      });
      const assignedHurtokIds = assignments.map((a) => a.hurtokId);

      if (filters.hurtokId) {
        if (!assignedHurtokIds.includes(filters.hurtokId)) {
          throw new NotFoundException('Hurtok not found in this kurin');
        }
        return this.prisma.user.findMany({
          where: {
            kurinId: actor.kurinId,
            role: Role.JUNAK,
            hurtokId: filters.hurtokId,
          },
          select: USER_SELECT,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });
      }

      return this.prisma.user.findMany({
        where: {
          kurinId: actor.kurinId,
          role: Role.JUNAK,
          OR: [{ hurtokId: { in: assignedHurtokIds } }, { hurtokId: null }],
        },
        select: USER_SELECT,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    }

    if (actor.role === Role.KURINNYI) {
      return this.prisma.user.findMany({
        where: {
          kurinId: actor.kurinId,
          role: filters.role ?? Role.JUNAK,
          ...(filters.hurtokId ? { hurtokId: filters.hurtokId } : {}),
        },
        select: USER_SELECT,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    }

    // ZVYAZKOVYI — sees every role in their kurin
    return this.prisma.user.findMany({
      where: {
        kurinId: actor.kurinId,
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.hurtokId ? { hurtokId: filters.hurtokId } : {}),
      },
      select: USER_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findScoped(id: string, actor: CurrentUserPayload) {
    if (actor.role === Role.JUNAK) {
      if (actor.userId !== id) {
        throw new NotFoundException('User not found');
      }
      return this.findById(id);
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { ...USER_SELECT, notes: true, phone: true },
    });
    if (!user || user.kurinId !== actor.kurinId) {
      throw new NotFoundException('User not found');
    }

    const visible = await this.isVisibleTo(actor, user);
    if (!visible) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async isVisibleTo(
    actor: CurrentUserPayload,
    target: { role: Role; hurtokId: string | null },
  ): Promise<boolean> {
    if (actor.role === Role.ZVYAZKOVYI) {
      return true;
    }
    if (actor.role === Role.KURINNYI) {
      return target.role !== Role.KURINNYI;
    }
    if (actor.role === Role.VYKHOVNYK) {
      if (target.role !== Role.JUNAK) return false;
      if (target.hurtokId === null) return true;
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId: target.hurtokId },
      });
      return !!assigned;
    }
    return false;
  }

  async changeOwnPassword(userId: string, dto: ChangePasswordDto): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.passwordHash) {
      if (!dto.currentPassword) {
        throw new BadRequestException('currentPassword is required');
      }
      const valid = await this.authService.validatePassword(dto.currentPassword, user.passwordHash);
      if (!valid) {
        throw new ForbiddenException('Invalid current password');
      }
    }
    const passwordHash = await this.authService.hashPassword(dto.newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { ok: true };
  }

  async requestEmailChange(userId: string, dto: ChangeEmailDto): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.passwordHash) {
      throw new BadRequestException('Set a password before changing email');
    }
    const valid = await this.authService.validatePassword(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new ForbiddenException('Invalid current password');
    }
    const existing = await this.prisma.user.findUnique({ where: { email: dto.newEmail } });
    if (existing) {
      throw new BadRequestException('Email already in use');
    }
    const { raw, hash } = generateToken();
    await this.prisma.emailChangeRequest.create({
      data: {
        userId,
        newEmail: dto.newEmail,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const confirmUrl = `${process.env.FRONTEND_URL}/confirm-email-change?token=${raw}`;
    await this.mailService.sendEmailChangeConfirmation(dto.newEmail, confirmUrl);
    return { ok: true };
  }

  async updateOwnProfile(userId: string, dto: UpdateOwnProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const sensitiveFields: { field: 'firstName' | 'lastName' | 'birthDate'; oldValue: string | null; newValue: string | undefined }[] = [
      { field: 'firstName', oldValue: user.firstName, newValue: dto.firstName },
      { field: 'lastName', oldValue: user.lastName, newValue: dto.lastName },
      { field: 'birthDate', oldValue: user.birthDate ? user.birthDate.toISOString() : null, newValue: dto.birthDate },
    ];

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        nickname: dto.nickname,
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      },
      select: { ...USER_SELECT, notes: true, phone: true },
    });

    if (PROBY_TRACKING_ROLES.includes(user.role)) {
      const changedFields = sensitiveFields.filter((f) => f.newValue !== undefined && f.newValue !== f.oldValue);

      for (const change of changedFields) {
        await this.prisma.profileChangeLog.create({
          data: { userId, field: change.field, oldValue: change.oldValue, newValue: change.newValue ?? null },
        });
      }

      if (changedFields.length > 0 && user.hurtokId) {
        const assignments = await this.prisma.vykhovnykHurtok.findMany({
          where: { hurtokId: user.hurtokId },
          include: { vykhovnyk: true },
        });
        for (const change of changedFields) {
          for (const assignment of assignments) {
            await this.mailService.sendProfileChangeNotification(assignment.vykhovnyk.email, {
              changedUserName: `${updated.firstName} ${updated.lastName}`,
              field: change.field,
              oldValue: change.oldValue,
              newValue: change.newValue ?? null,
            });
          }
        }
      }
    }

    return updated;
  }
}
