import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const SLOW_QUERY_MS = 200;

// Pool size and wait time are set in DATABASE_URL (?connection_limit=10&pool_timeout=20);
// without them Prisma defaults to cpu*2+1 connections, which is 3-5 on a small VPS.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'query' }] });
    (this as any).$on('query', (e: { query: string; duration: number }) => {
      if (e.duration > SLOW_QUERY_MS) {
        this.logger.warn(`Slow query ${e.duration}ms: ${e.query.slice(0, 300)}`);
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
