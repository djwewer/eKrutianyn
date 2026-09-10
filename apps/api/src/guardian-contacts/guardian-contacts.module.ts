import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GuardianContactsController } from './guardian-contacts.controller';
import { GuardianContactsService } from './guardian-contacts.service';

@Module({
  imports: [AuthModule],
  controllers: [GuardianContactsController],
  providers: [GuardianContactsService],
})
export class GuardianContactsModule {}
