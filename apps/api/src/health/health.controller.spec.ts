import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok when the database answers', async () => {
    const controller = new HealthController({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as any);
    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
  });

  it('returns 503 when the database query fails', async () => {
    const controller = new HealthController({ $queryRaw: jest.fn().mockRejectedValue(new Error('down')) } as any);
    await expect(controller.check()).rejects.toThrow(ServiceUnavailableException);
  });
});
