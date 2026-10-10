import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GuardianRelation, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateGuardianContactDto } from './dto/create-guardian-contact.dto';
import { UpdateGuardianContactDto } from './dto/update-guardian-contact.dto';
import { canEditBookData } from '../common/book-access.util';

@Injectable()
export class GuardianContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertAccess(junakId: string, actor: CurrentUserPayload): Promise<void> {
    if (!canEditBookData(actor)) {
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

  /** A junak has at most one mother and one father; any number of other guardians. */
  private async assertRelationFree(junakId: string, relation: GuardianRelation, exceptId?: string) {
    if (relation === GuardianRelation.GUARDIAN) return;
    const existing = await this.prisma.guardianContact.findFirst({
      where: { junakId, relation, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (existing) {
      throw new ConflictException(
        relation === GuardianRelation.MOTHER ? 'Контакт «Мама» вже є' : 'Контакт «Тато» вже є',
      );
    }
  }

  async create(junakId: string, dto: CreateGuardianContactDto, actor: CurrentUserPayload) {
    await this.assertAccess(junakId, actor);
    const relation = dto.relation ?? GuardianRelation.GUARDIAN;
    await this.assertRelationFree(junakId, relation);
    return this.prisma.guardianContact.create({
      data: {
        junakId,
        name: dto.name,
        phone: dto.phone ?? '',
        relation,
        // The text role only clarifies a GUARDIAN; it's meaningless for mother/father.
        role: relation === GuardianRelation.GUARDIAN ? dto.role : null,
        email: dto.email,
      },
    });
  }

  async update(junakId: string, guardianId: string, dto: UpdateGuardianContactDto, actor: CurrentUserPayload) {
    await this.assertAccess(junakId, actor);
    const contact = await this.prisma.guardianContact.findUnique({ where: { id: guardianId } });
    if (!contact || contact.junakId !== junakId) {
      throw new NotFoundException('Guardian contact not found');
    }
    const relation = dto.relation ?? contact.relation;
    if (dto.relation && dto.relation !== contact.relation) {
      await this.assertRelationFree(junakId, relation, guardianId);
    }
    return this.prisma.guardianContact.update({
      where: { id: guardianId },
      data: {
        name: dto.name,
        phone: dto.phone,
        relation,
        role: relation === GuardianRelation.GUARDIAN ? dto.role : null,
        email: dto.email,
      },
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
