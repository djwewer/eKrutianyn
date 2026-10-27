import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PositionType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateApdDto } from './dto/create-apd.dto';
import { buildApdHtml, cleanText } from './apd-html';

@Injectable()
export class PysarstvoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleDrive: GoogleDriveService,
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
    if (!kurin?.driveRefreshToken || !kurin.driveFolderId) {
      throw new ServiceUnavailableException(
        'Курінь ще не підключив Google Drive або не обрав головну папку — це робить звʼязковий у налаштуваннях куреня',
      );
    }

    const pysarstvoFolderId = await this.googleDrive.ensureSubfolder(kurinId, kurin.driveFolderId, 'Писарство');
    const apdFolderId = await this.googleDrive.ensureSubfolder(kurinId, pysarstvoFolderId, 'АПД');
    return this.googleDrive.createDocFromHtml(kurinId, apdFolderId, title, buildApdHtml(title, pseudos));
  }
}
