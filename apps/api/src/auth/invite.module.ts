import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { InviteService } from './invite.service';

// AuditService comes from the @Global() AuditModule; PrismaService is global too.
@Module({
  imports: [MailModule],
  providers: [InviteService],
  exports: [InviteService],
})
export class InviteModule {}
