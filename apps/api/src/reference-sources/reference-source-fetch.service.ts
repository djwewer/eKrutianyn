import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { PrismaService } from '../prisma/prisma.service';

const FETCH_TIMEOUT_MS = 20_000;
// Raw extracted text sits in its own column and is truncated again (tighter)
// when it's actually folded into the AI system prompt — this cap just keeps
// a single page from bloating the DB row indefinitely.
const MAX_EXTRACTED_TEXT_LENGTH = 8_000;

/**
 * Fetches a ReferenceSource's URL, strips it down to readable text, and
 * caches the result on the row. Runs on a weekly cron (see
 * ReferenceSourceFetchCron) rather than live per chat message: the source
 * sites are mostly static reference pages, so a week-old cache is fine, and
 * it means a slow or down page never shows up as a chat-time failure.
 */
@Injectable()
export class ReferenceSourceFetchService {
  private readonly logger = new Logger(ReferenceSourceFetchService.name);

  constructor(private readonly prisma: PrismaService) {}

  extractText(html: string): string {
    const $ = cheerio.load(html);
    $('script, style, noscript, nav, header, footer, iframe, svg').remove();
    // cheerio's .text() concatenates text nodes with no separator, so two
    // adjacent block elements (e.g. </h1><p>) would otherwise run together
    // into one word — insert a space after each block-level element first.
    $('body')
      .find('p, div, h1, h2, h3, h4, h5, h6, li, br, tr, td, section, article, blockquote')
      .after(' ');
    const rawText = $('body').text();
    const collapsed = rawText.replace(/\s+/g, ' ').trim();
    return collapsed.slice(0, MAX_EXTRACTED_TEXT_LENGTH);
  }

  async fetchAndExtract(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Fetch failed with status ${response.status}`);
      }
      const html = await response.text();
      return this.extractText(html);
    } finally {
      clearTimeout(timeout);
    }
  }

  async refreshOne(sourceId: string): Promise<void> {
    const source = await this.prisma.referenceSource.findUnique({ where: { id: sourceId } });
    if (!source) return;

    try {
      const extractedText = await this.fetchAndExtract(source.url);
      await this.prisma.referenceSource.update({
        where: { id: sourceId },
        data: { extractedText, lastFetchedAt: new Date(), lastError: null },
      });
    } catch (error) {
      this.logger.error(`Failed to fetch reference source ${sourceId} (${source.url}): ${(error as Error).message}`);
      // Keep the last good extractedText cached — a transient failure (or a
      // sandbox-level egress block) shouldn't wipe out an otherwise-working
      // reference, it should just surface as a visible error to the admin.
      await this.prisma.referenceSource.update({
        where: { id: sourceId },
        data: { lastError: (error as Error).message },
      });
    }
  }

  async refreshAll(): Promise<{ succeeded: number; failed: number }> {
    const sources = await this.prisma.referenceSource.findMany({ select: { id: true } });
    let succeeded = 0;
    let failed = 0;
    for (const { id } of sources) {
      await this.refreshOne(id);
      const after = await this.prisma.referenceSource.findUnique({ where: { id }, select: { lastError: true } });
      if (after?.lastError) {
        failed++;
      } else {
        succeeded++;
      }
    }
    this.logger.log(`Weekly reference source refresh: ${succeeded} succeeded, ${failed} failed`);
    return { succeeded, failed };
  }
}
