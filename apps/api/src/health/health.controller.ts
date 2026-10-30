import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DB_TIMEOUT_MS = 2000;

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('db timeout')), DB_TIMEOUT_MS);
        }),
      ]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'db_unavailable' });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
