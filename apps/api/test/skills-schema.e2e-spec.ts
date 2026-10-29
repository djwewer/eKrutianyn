import { PrismaClient, ProbyProgramVersion, Role } from '@prisma/client';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createProbyProgramTree, createSkill, createUser } from './utils/fixtures';

describe('Skill catalog — database constraints (e2e)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  async function twoKurins() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Точка']);
    const a = await createKurin(prisma, { probyProgramId: program.id });
    const b = await createKurin(prisma, { probyProgramId: program.id });
    return [a, b];
  }

  it('keeps global skill names unique (partial unique index on kurinId IS NULL)', async () => {
    await createSkill(prisma, { name: 'Картографія' });
    await expect(createSkill(prisma, { name: 'Картографія' })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows one custom name per kurin, in several kurins and next to a global skill', async () => {
    const [a, b] = await twoKurins();
    await createSkill(prisma, { name: 'Знавець компʼютерів' });
    await createSkill(prisma, { name: 'Знавець компʼютерів', kurinId: a.id });
    await createSkill(prisma, { name: 'Знавець компʼютерів', kurinId: b.id });
    await expect(createSkill(prisma, { name: 'Знавець компʼютерів', kurinId: a.id })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('records a skill level once per junak as a calendar date, and cascades levels with their skill', async () => {
    const [kurin] = await twoKurins();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const skill = await createSkill(prisma, { name: 'Куховарення', levels: [1, 2] });
    const data = {
      junakId: junak.id,
      levelId: skill.levels[0].id,
      achievedAt: new Date('2025-05-01T00:00:00.000Z'),
      createdById: junak.id,
    };
    const first = await prisma.junakSkill.create({ data });
    expect(first.achievedAt.toISOString()).toBe('2025-05-01T00:00:00.000Z');
    await expect(prisma.junakSkill.create({ data })).rejects.toMatchObject({ code: 'P2002' });

    const unused = await createSkill(prisma, { name: 'Сигналізація', levels: [3] });
    await prisma.skill.delete({ where: { id: unused.id } });
    expect(await prisma.skillLevel.count({ where: { skillId: unused.id } })).toBe(0);
  });
});
