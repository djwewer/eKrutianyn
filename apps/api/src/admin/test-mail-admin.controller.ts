import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { MailService } from '../mail/mail.service';

@UseGuards(AdminKeyGuard)
@Controller('admin/test-mail')
export class TestMailAdminController {
  constructor(private readonly mailService: MailService) {}

  @Get()
  getLastMail(@Query('to') to: string) {
    return this.mailService.getLastMailFor(to) ?? null;
  }
}
