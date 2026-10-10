import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { KurinsModule } from '../kurins/kurins.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, MailModule, KurinsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
