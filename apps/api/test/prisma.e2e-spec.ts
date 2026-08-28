import { PrismaClient, KurinGender, ProbyProgramVersion } from '@prisma/client';
import { cleanDatabase } from './utils/clean-db';

describe('Prisma smoke test (e2e)', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL_TEST } },
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  it('creates and reads back a Kurin linked to a ProbyProgram', async () => {
    const program = await prisma.probyProgram.create({
      data: { version: ProbyProgramVersion.OLD, name: 'Стара програма' },
    });

    const kurin = await prisma.kurin.create({
      data: {
        name: 'Тестовий курінь',
        kurinNumber: '1',
        gender: KurinGender.MALE,
        stanytsia: 'Тестова станиця',
        probyProgramId: program.id,
      },
    });

    const found = await prisma.kurin.findUnique({ where: { id: kurin.id } });
    expect(found?.name).toBe('Тестовий курінь');
    expect(found?.probyProgramId).toBe(program.id);
  });
});
