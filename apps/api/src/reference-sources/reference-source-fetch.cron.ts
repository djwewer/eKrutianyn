import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReferenceSourceFetchService } from './reference-source-fetch.service';

/**
 * Weekly trigger for refreshing cached ReferenceSource content. Kept as a
 * thin wrapper around ReferenceSourceFetchService, same as
 * JudgeBookSyncCron, so the refresh logic stays directly unit-testable and
 * callable outside the cron schedule (e.g. the admin "Fetch now" button).
 */
@Injectable()
export class ReferenceSourceFetchCron {
  constructor(private readonly fetchService: ReferenceSourceFetchService) {}

  @Cron('0 4 * * 0', { timeZone: 'Europe/Kyiv' })
  async handleWeeklyRefresh(): Promise<void> {
    await this.fetchService.refreshAll();
  }
}
