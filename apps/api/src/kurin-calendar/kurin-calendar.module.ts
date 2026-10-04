import { Module } from '@nestjs/common';
import { KurinCalendarController } from './kurin-calendar.controller';
import { KurinCalendarService } from './kurin-calendar.service';

@Module({
  controllers: [KurinCalendarController],
  providers: [KurinCalendarService],
})
export class KurinCalendarModule {}
