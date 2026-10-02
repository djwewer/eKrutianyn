import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JudgeBookSyncService } from './judge-book-sync.service';

/**
 * Nightly trigger for the Книга судді write-back sync. Kept as a thin
 * wrapper around JudgeBookSyncService so the sync logic itself stays
 * directly unit-testable and callable outside of the cron schedule (e.g.
 * from a test, or later from an admin action) without pulling in
 * @nestjs/schedule's cron machinery.
 */
@Injectable()
export class JudgeBookSyncCron {
  constructor(private readonly judgeBookSync: JudgeBookSyncService) {}

  @Cron('0 3 * * *', { timeZone: 'Europe/Kyiv' })
  async handleNightlySync(): Promise<void> {
    await this.judgeBookSync.syncAllKurins();
  }
}
