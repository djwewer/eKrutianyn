import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { PositionType, Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { JudgeBookSyncService } from './judge-book-sync.service';
import { SaveJunakImportMappingDto } from './dto/save-junak-import-mapping.dto';
import { SetJunakImportSpreadsheetDto } from './dto/set-junak-import-spreadsheet.dto';

@UseGuards(JwtAuthGuard)
@Controller('kurins')
export class KurinJunakImportController {
  private readonly logger = new Logger(KurinJunakImportController.name);

  constructor(
    private readonly googleDrive: GoogleDriveService,
    private readonly prisma: PrismaService,
    private readonly judgeBookSync: JudgeBookSyncService,
  ) {}

  @Get(':kurinId/junak-import/status')
  async status(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    this.assertCanAccessWizard(user);
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: { judgeBookSpreadsheetId: true, judgeBookSpreadsheetName: true },
    });
    const mapping = await this.prisma.junakImportMapping.findUnique({ where: { kurinId } });
    return {
      connectedSpreadsheetId: kurin?.judgeBookSpreadsheetId ?? undefined,
      connectedSpreadsheetName: kurin?.judgeBookSpreadsheetName ?? undefined,
      mapping: mapping
        ? { columnMapping: mapping.columnMapping, positionValueMapping: mapping.positionValueMapping }
        : undefined,
    };
  }

  @Patch(':kurinId/junak-import/spreadsheet')
  async setSpreadsheet(
    @Param('kurinId') kurinId: string,
    @Body() dto: SetJunakImportSpreadsheetDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertOwnKurin(kurinId, user);
    this.assertZvyazkovyi(user);
    const current = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: { judgeBookSpreadsheetId: true },
    });
    const spreadsheetChanged = current?.judgeBookSpreadsheetId !== dto.spreadsheetId;

    await this.prisma.$transaction([
      this.prisma.kurin.update({
        where: { id: kurinId },
        data: { judgeBookSpreadsheetId: dto.spreadsheetId, judgeBookSpreadsheetName: dto.spreadsheetName },
      }),
      // A different spreadsheet has a different column layout and different
      // row positions. The saved column mapping and every junak's
      // judgeBookRowNumber describe the OLD file, so keeping them would make
      // the write-back sync push values into the wrong columns/rows of the
      // new one. Re-connecting the same file leaves both intact.
      ...(spreadsheetChanged
        ? [
            this.prisma.junakImportMapping.deleteMany({ where: { kurinId } }),
            this.prisma.user.updateMany({
              where: { kurinId, judgeBookRowNumber: { not: null } },
              data: { judgeBookRowNumber: null },
            }),
          ]
        : []),
    ]);
    return { success: true };
  }

  @Get(':kurinId/junak-import/sheet-data')
  async sheetData(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    this.assertCanAccessWizard(user);
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: { judgeBookSpreadsheetId: true },
    });
    if (!kurin?.judgeBookSpreadsheetId) {
      throw new ForbiddenException('Книга судді ще не підключена');
    }
    try {
      const rows = await this.googleDrive.readSheetValues(kurinId, kurin.judgeBookSpreadsheetId);
      return { rows };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Failed to read Книга судді sheet for kurin ${kurinId}: ${message}`, (error as Error).stack);
      throw new ServiceUnavailableException(`Не вдалося прочитати таблицю з Google Sheets: ${message}`);
    }
  }

  /**
   * Manual run of the nightly write-back (degree dates, phone, email → the
   * connected Книга судді) so the zvyazkovyi can verify it on demand. Returns
   * what happened, including who was skipped and why.
   */
  @Post(':kurinId/junak-import/sync')
  async syncNow(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    this.assertZvyazkovyi(user);
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: { judgeBookSpreadsheetId: true, driveRefreshToken: true },
    });
    if (!kurin?.judgeBookSpreadsheetId) {
      throw new BadRequestException('Книга судді ще не підключена');
    }
    if (!kurin.driveRefreshToken) {
      throw new ServiceUnavailableException('Курінь ще не підключив Google Drive');
    }
    const mapping = await this.prisma.junakImportMapping.findUnique({ where: { kurinId } });
    if (!mapping) {
      throw new BadRequestException(
        'Не налаштовано відповідність стовпців таблиці. Один раз пройдіть майстер імпорту, щоб її зберегти',
      );
    }
    try {
      return await this.judgeBookSync.syncKurinToSheet(kurinId);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Manual Книга судді sync failed for kurin ${kurinId}: ${message}`, (error as Error).stack);
      throw new ServiceUnavailableException(`Не вдалося записати в таблицю Google Sheets: ${message}`);
    }
  }

  @Put(':kurinId/junak-import/mapping')
  async saveMapping(
    @Param('kurinId') kurinId: string,
    @Body() dto: SaveJunakImportMappingDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertOwnKurin(kurinId, user);
    this.assertCanAccessWizard(user);
    await this.prisma.junakImportMapping.upsert({
      where: { kurinId },
      create: { kurinId, columnMapping: dto.columnMapping as any, positionValueMapping: dto.positionValueMapping as any },
      update: { columnMapping: dto.columnMapping as any, positionValueMapping: dto.positionValueMapping as any },
    });
    return { success: true };
  }

  private assertOwnKurin(kurinId: string, user: CurrentUserPayload) {
    if (kurinId !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
  }

  private assertZvyazkovyi(user: CurrentUserPayload) {
    if (user.role !== Role.ZVYAZKOVYI) {
      throw new ForbiddenException('Only zvyazkovyi can perform this action');
    }
  }

  private assertCanAccessWizard(user: CurrentUserPayload) {
    const canAccess =
      user.role === Role.ZVYAZKOVYI || user.isKurinniy || user.positions.includes(PositionType.SUDDIA);
    if (!canAccess) {
      throw new ForbiddenException('Only zvyazkovyi, kurinniy, or suddya can access the import wizard');
    }
  }
}
