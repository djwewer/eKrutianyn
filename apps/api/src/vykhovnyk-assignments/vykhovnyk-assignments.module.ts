import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VykhovnykAssignmentsController } from './vykhovnyk-assignments.controller';
import { VykhovnykAssignmentsService } from './vykhovnyk-assignments.service';

@Module({
  imports: [AuthModule],
  controllers: [VykhovnykAssignmentsController],
  providers: [VykhovnykAssignmentsService],
})
export class VykhovnykAssignmentsModule {}
