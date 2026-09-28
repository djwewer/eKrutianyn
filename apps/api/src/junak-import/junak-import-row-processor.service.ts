import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HurtkyService } from '../hurtky/hurtky.service';
import { ResolvedJunakRow, JunakImportRowResult } from './junak-import-row.types';

@Injectable()
export class JunakImportRowProcessorService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly hurtky: HurtkyService,
  ) {}

  async processRow(kurinId: string, row: ResolvedJunakRow, rowIndex: number, actorId: string): Promise<JunakImportRowResult> {
    const result: JunakImportRowResult = { row: rowIndex, succeededSteps: [] };
    try {
      const junakId = await this.upsertUserHurtokContacts(kurinId, row, actorId, result);
      result.junakId = junakId;
    } catch (error) {
      result.error = (error as Error).message;
    }
    return result;
  }

  private async upsertUserHurtokContacts(
    kurinId: string,
    row: ResolvedJunakRow,
    actorId: string,
    result: JunakImportRowResult,
  ): Promise<string> {
    let hurtokId: string | undefined;
    if (row.hurtokName) {
      const existing = await this.hurtky.listForKurin(kurinId);
      const match = existing.find((h) => h.name === row.hurtokName);
      hurtokId = match ? match.id : (await this.hurtky.create({ name: row.hurtokName, number: undefined }, kurinId)).id;
      result.succeededSteps.push('hurtok');
    }

    const junakId = await this.prisma.$transaction(async (tx) => {
      let userId: string;
      if (row.matchedUserId) {
        const updateData: Record<string, unknown> = {};
        if (row.firstName) updateData.firstName = row.firstName;
        if (row.lastName) updateData.lastName = row.lastName;
        if (row.nickname) updateData.nickname = row.nickname;
        if (row.birthDate) updateData.birthDate = new Date(row.birthDate);
        if (row.email) updateData.email = row.email;
        if (row.phone) updateData.phone = row.phone;
        if (hurtokId) updateData.hurtokId = hurtokId;
        const updated = await tx.user.update({ where: { id: row.matchedUserId }, data: updateData });
        userId = updated.id;
        result.created = false;
      } else {
        const created = await tx.user.create({
          data: {
            firstName: row.firstName,
            lastName: row.lastName,
            nickname: row.nickname,
            birthDate: row.birthDate ? new Date(row.birthDate) : undefined,
            email: row.email,
            phone: row.phone,
            role: Role.JUNAK,
            kurinId,
            hurtokId,
          },
        });
        userId = created.id;
        result.created = true;
      }

      for (const guardian of row.guardians ?? []) {
        const existingContact = await tx.guardianContact.findFirst({ where: { junakId: userId, name: guardian.name } });
        if (existingContact) {
          await tx.guardianContact.update({
            where: { id: existingContact.id },
            data: { phone: guardian.phone, email: guardian.email },
          });
        } else {
          await tx.guardianContact.create({
            data: { junakId: userId, name: guardian.name, phone: guardian.phone ?? '', email: guardian.email },
          });
        }
      }
      if ((row.guardians ?? []).length > 0) {
        result.succeededSteps.push('contacts');
      }

      return userId;
    });

    result.succeededSteps.push('user');
    void actorId;
    return junakId;
  }
}
