import { Body, Controller, ForbiddenException, Get, Param, Patch, Query, Redirect, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { SetGoogleDriveFolderDto } from './dto/set-google-drive-folder.dto';
import { signGoogleDriveState, verifyGoogleDriveState } from './google-drive-state.util';

@Controller('kurins')
export class KurinGoogleDriveController {
  constructor(
    private readonly googleDrive: GoogleDriveService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ZVYAZKOVYI)
  @Get(':kurinId/google-drive/status')
  async status(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    this.assertOwnKurin(kurinId, user);
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    return {
      connected: !!kurin?.driveRefreshToken,
      email: kurin?.driveConnectedEmail ?? undefined,
      folderId: kurin?.driveFolderId ?? undefined,
      folderName: kurin?.driveFolderName ?? undefined,
    };
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
    } catch {
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
    return this.prisma.kurin.update({
      where: { id: kurinId },
      data: { driveFolderId: dto.folderId, driveFolderName: dto.folderName },
    });
  }

  private assertOwnKurin(kurinId: string, user: CurrentUserPayload) {
    if (kurinId !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
  }
}
