import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { AdminCredentialsGuard } from '../common/guards/admin-credentials.guard';
import { KurinsAdminService } from './kurins-admin.service';

@UseGuards(AdminKeyGuard, AdminCredentialsGuard)
@Controller('admin/users')
export class UsersAdminController {
  constructor(private readonly service: KurinsAdminService) {}

  @Post(':id/resend-invite')
  resendInvite(@Param('id') id: string) {
    return this.service.resendInvite(id);
  }
}
