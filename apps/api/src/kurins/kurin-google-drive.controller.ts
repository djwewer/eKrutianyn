import { Body, Controller, ForbiddenException, Get, Logger, Param, Patch, Query, Redirect, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PositionType, Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
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
    const state = signGoogleDriveState(this.jwtService, kurinId);
    return { url: this.googleDrive.getAuthUrl(state) };
  }

  @Get('google-drive/callback')
  @Redirect()
  async callback(@Query('code') code: string, @Query('state') state: string) {
    try {
      const kurinId = verifyGoogleDriveState(this.jwtService, state);
      await this.googleDrive.handleCallback(kurinId, code);
      return { url: `${process.env.FRONTEND_URL}/kurin?driveConnected=1` };
    } catch (error) {
      this.logger.warn(`Google Drive OAuth callback failed: ${(error as Error).message}`);
      return { url: `${process.env.FRONTEND_URL}/kurin?driveError=1` };
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
    return this.toStatus(kurin);
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
