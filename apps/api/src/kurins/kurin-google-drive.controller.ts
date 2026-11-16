import { Body, Controller, Delete, ForbiddenException, Get, Logger, Param, Patch, Query, Redirect, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, PositionType, Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { SetGoogleDriveFolderDto } from './dto/set-google-drive-folder.dto';
import { signGoogleDriveState, verifyGoogleDriveState } from './google-drive-state.util';

const DRIVE_STATUS_SELECT = {
  driveRefreshToken: true,
  driveConnectedEmail: true,
  driveFolderId: true,
  driveFolderName: true,
} as const;

type DriveStatusRow = {
  driveRefreshToken: string | null;
  driveConnectedEmail: string | null;
  driveFolderId: string | null;
  driveFolderName: string | null;
};

@Controller('kurins')
export class KurinGoogleDriveController {
  private readonly logger = new Logger(KurinGoogleDriveController.name);

  constructor(
    private readonly googleDrive: GoogleDriveService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get(':kurinId/google-drive/status')
  async status(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    this.assertCanReadStatus(user);
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: DRIVE_STATUS_SELECT,
    });
    if (!kurin) {
      return { connected: false };
    }
    return this.toStatus(kurin);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ZVYAZKOVYI)
  @Get(':kurinId/google-drive/connect')
  connect(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    const state = signGoogleDriveState(this.jwtService, kurinId, user.userId);
    return { url: this.googleDrive.getAuthUrl(state) };
  }

  @Get('google-drive/callback')
  @Redirect()
  async callback(@Query('code') code: string, @Query('state') state: string) {
    try {
      const { kurinId, actorId } = verifyGoogleDriveState(this.jwtService, state);
      const { email } = await this.googleDrive.handleCallback(kurinId, code);
      await this.audit.record({ kurinId, actorId, action: AuditAction.DRIVE_CONNECTED, details: { email } });
      return { url: `${process.env.FRONTEND_URL}/inventory?driveConnected=1` };
    } catch (error) {
      this.logger.warn(`Google Drive OAuth callback failed: ${(error as Error).message}`);
      return { url: `${process.env.FRONTEND_URL}/inventory?driveError=1` };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ZVYAZKOVYI)
  @Get(':kurinId/google-drive/picker-token')
  async pickerToken(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    const accessToken = await this.googleDrive.getPickerAccessToken(kurinId);
    return { accessToken };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ZVYAZKOVYI)
  @Patch(':kurinId/google-drive/folder')
  async setFolder(
    @Param('kurinId') kurinId: string,
    @Body() dto: SetGoogleDriveFolderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertOwnKurin(kurinId, user);
    const kurin = await this.prisma.kurin.update({
      where: { id: kurinId },
      data: { driveFolderId: dto.folderId, driveFolderName: dto.folderName },
      select: DRIVE_STATUS_SELECT,
    });
    await this.audit.record({
      kurinId,
      actorId: user.userId,
      action: AuditAction.DRIVE_FOLDER_SET,
      details: { folderName: dto.folderName },
    });
    return this.toStatus(kurin);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ZVYAZKOVYI)
  @Delete(':kurinId/google-drive')
  async disconnect(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    await this.googleDrive.disconnect(kurinId);
    await this.audit.record({ kurinId, actorId: user.userId, action: AuditAction.DRIVE_DISCONNECTED, details: {} });
    return { connected: false };
  }

  private toStatus(kurin: DriveStatusRow) {
    return {
      connected: !!kurin.driveRefreshToken,
      email: kurin.driveConnectedEmail ?? undefined,
      folderId: kurin.driveFolderId ?? undefined,
      folderName: kurin.driveFolderName ?? undefined,
    };
  }

  private assertOwnKurin(kurinId: string, user: CurrentUserPayload) {
    if (kurinId !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
  }

  private assertCanReadStatus(user: CurrentUserPayload) {
    if (user.role !== Role.ZVYAZKOVYI && !user.positions.includes(PositionType.INTENDANT)) {
      throw new ForbiddenException('Insufficient role');
    }
  }
}
