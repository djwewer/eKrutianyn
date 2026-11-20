import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AuditAction, PositionType, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateApdDto } from './dto/create-apd.dto';
import { SetPysarstvoFolderDto } from './dto/set-pysarstvo-folder.dto';
import { buildApdHtml, cleanText } from './apd-html';

@Injectable()
export class PysarstvoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleDrive: GoogleDriveService,
    private readonly audit: AuditService,
  ) {}

  private assertKurinMatches(kurinId: string, actor: CurrentUserPayload) {
    if (kurinId !== actor.kurinId) {
      throw new NotFoundException('Kurin not found');
    }
  }

  private assertCanWrite(actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.isKurinniy && !actor.positions.includes(PositionType.PYSAR)) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  /** Only id + display name — a pysar must not get the full /users payload (emails, birth dates). */
  async listPseudoCandidates(kurinId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    const users = await this.prisma.user.findMany({
      where: { kurinId, role: Role.JUNAK, archivedAt: null },
      select: { id: true, firstName: true, lastName: true, nickname: true },
    });
    return users
      .map((u) => ({ id: u.id, label: u.nickname?.trim() || `${u.firstName} ${u.lastName}` }))
      .sort((a, b) => a.label.localeCompare(b.label, 'uk'));
  }

  async createApd(kurinId: string, dto: CreateApdDto, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);

    const title = cleanText(dto.title);
    const pseudos = dto.pseudos.map(cleanText);
    // Validators accept whitespace-only strings; re-check after cleaning.
    if (!title) {
      throw new BadRequestException('Введіть назву документа.');
    }
    if (pseudos.some((pseudo) => !pseudo)) {
      throw new BadRequestException('Псевдо не може бути порожнім.');
    }

    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin?.driveRefreshToken) {
      throw new ServiceUnavailableException(
        'Курінь ще не підключив Google Drive — це робить звʼязковий у налаштуваннях куреня',
      );
    }
    if (!kurin.pysarstvoFolderId) {
      throw new ServiceUnavailableException('Звʼязковий ще не обрав папку писарства — це робиться на сторінці «Писарство»');
    }

    const apdFolderId = await this.googleDrive.ensureSubfolder(kurinId, kurin.pysarstvoFolderId, 'АПД');
    const doc = await this.googleDrive.createDocFromHtml(kurinId, apdFolderId, title, buildApdHtml(title, pseudos));
    await this.audit.record({
      kurinId,
      actorId: actor.userId,
      action: AuditAction.APD_CREATED,
      entityId: doc.id,
      details: { title, pseudoCount: pseudos.length, url: doc.url },
    });
    return doc;
  }

  /** Whether Drive is connected and which folder Писарство writes into; readable by everyone who can create documents. */
  async getFolder(kurinId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: { driveRefreshToken: true, pysarstvoFolderId: true, pysarstvoFolderName: true },
    });
    return {
      driveConnected: !!kurin?.driveRefreshToken,
      folderId: kurin?.pysarstvoFolderId ?? undefined,
      folderName: kurin?.pysarstvoFolderName ?? undefined,
    };
  }

  /** Only the звʼязковий picks the folder: the Drive picker hands out an access token to the kurin's Drive. */
  async setFolder(kurinId: string, dto: SetPysarstvoFolderDto, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    if (actor.role !== Role.ZVYAZKOVYI) {
      throw new ForbiddenException('Insufficient role');
    }
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId }, select: { driveRefreshToken: true } });
    if (!kurin?.driveRefreshToken) {
      throw new ServiceUnavailableException('Курінь ще не підключив Google Drive — це робить звʼязковий у налаштуваннях куреня');
    }
    const folderName = cleanText(dto.folderName);
    await this.prisma.kurin.update({
      where: { id: kurinId },
      data: { pysarstvoFolderId: dto.folderId, pysarstvoFolderName: folderName },
    });
    await this.audit.record({
      kurinId,
      actorId: actor.userId,
      action: AuditAction.PYSARSTVO_FOLDER_SET,
      details: { folderName },
    });
    return this.getFolder(kurinId, actor);
  }
}
