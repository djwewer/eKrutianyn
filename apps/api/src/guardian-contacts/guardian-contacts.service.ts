import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateGuardianContactDto } from './dto/create-guardian-contact.dto';
import { UpdateGuardianContactDto } from './dto/update-guardian-contact.dto';

@Injectable()
export class GuardianContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertAccess(junakId: string, actor: CurrentUserPayload): Promise<void> {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.isKurinniy) {
      throw new ForbiddenException('Insufficient role');
    }
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found');
    }
  }

  async list(junakId: string, actor: CurrentUserPayload) {
    await this.assertAccess(junakId, actor);
    return this.prisma.guardianContact.findMany({
      where: { junakId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(junakId: string, dto: CreateGuardianContactDto, actor: CurrentUserPayload) {
    await this.assertAccess(junakId, actor);
    return this.prisma.guardianContact.create({
      data: { junakId, name: dto.name, phone: dto.phone, role: dto.role, email: dto.email },
    });
  }

  async update(junakId: string, guardianId: string, dto: UpdateGuardianContactDto, actor: CurrentUserPayload) {
    await this.assertAccess(junakId, actor);
    const contact = await this.prisma.guardianContact.findUnique({ where: { id: guardianId } });
    if (!contact || contact.junakId !== junakId) {
      throw new NotFoundException('Guardian contact not found');
    }
    return this.prisma.guardianContact.update({
      where: { id: guardianId },
      data: { name: dto.name, phone: dto.phone, role: dto.role, email: dto.email },
    });
  }

  async remove(junakId: string, guardianId: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    await this.assertAccess(junakId, actor);
    const contact = await this.prisma.guardianContact.findUnique({ where: { id: guardianId } });
    if (!contact || contact.junakId !== junakId) {
      throw new NotFoundException('Guardian contact not found');
    }
    await this.prisma.guardianContact.delete({ where: { id: guardianId } });
    return { success: true };
  }
}
