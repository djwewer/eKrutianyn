import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { JunakDegreesController } from './junak-degrees.controller';
import { JunakDegreesService } from './junak-degrees.service';

@Module({
  imports: [UsersModule],
  controllers: [JunakDegreesController],
  providers: [JunakDegreesService],
})
export class JunakDegreesModule {}
