import { Body, Controller, ForbiddenException, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { SaveJunakImportMappingDto } from './dto/save-junak-import-mapping.dto';
import { SetJunakImportSpreadsheetDto } from './dto/set-junak-import-spreadsheet.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ZVYAZKOVYI)
@Controller('kurins')
export class KurinJunakImportController {
  constructor(
    private readonly googleDrive: GoogleDriveService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':kurinId/junak-import/status')
  async status(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
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
    await this.prisma.kurin.update({
      where: { id: kurinId },
      data: { judgeBookSpreadsheetId: dto.spreadsheetId, judgeBookSpreadsheetName: dto.spreadsheetName },
    });
    return { success: true };
  }

  @Get(':kurinId/junak-import/sheet-data')
  async sheetData(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: { judgeBookSpreadsheetId: true },
    });
    if (!kurin?.judgeBookSpreadsheetId) {
      throw new ForbiddenException('Книга судді ще не підключена');
    }
    const rows = await this.googleDrive.readSheetValues(kurinId, kurin.judgeBookSpreadsheetId);
    return { rows };
  }

  @Put(':kurinId/junak-import/mapping')
  async saveMapping(
    @Param('kurinId') kurinId: string,
    @Body() dto: SaveJunakImportMappingDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertOwnKurin(kurinId, user);
    await this.prisma.junakImportMapping.upsert({
      where: { kurinId },
      create: { kurinId, columnMapping: dto.columnMapping, positionValueMapping: dto.positionValueMapping },
      update: { columnMapping: dto.columnMapping, positionValueMapping: dto.positionValueMapping },
    });
    return { success: true };
  }

  private assertOwnKurin(kurinId: string, user: CurrentUserPayload) {
    if (kurinId !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
  }
}
