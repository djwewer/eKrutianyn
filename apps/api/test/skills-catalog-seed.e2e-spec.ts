import { PrismaClient, ProbyProgramVersion, SkillGroup } from '@prisma/client';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createProbyProgramTree, createSkill } from './utils/fixtures';
import { seedSkillsCatalog } from '../src/scripts/seed-skills-catalog';
import { SkillData } from '../src/scripts/skills-catalog.data';

describe('seedSkillsCatalog (e2e)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  const small = (text: string): SkillData[] => [
    { name: 'Картографія', group: SkillGroup.PRACTICAL, levels: [{ level: 2, requirements: [{ text }] }] },
  ];

  it('loads the full catalog: 70 global skills with 108 levels in 9 groups', async () => {
    const result = await seedSkillsCatalog(prisma);
    expect(result).toEqual({ skillsCreated: 70, skillsUpdated: 0, levelsCreated: 108, levelsUpdated: 0 });
    expect(await prisma.skill.count({ where: { kurinId: null } })).toBe(70);
    expect(await prisma.skillLevel.count()).toBe(108);
    expect(await prisma.skill.findMany({ distinct: ['group'], select: { group: true } })).toHaveLength(9);
    const firstAid = await prisma.skill.findFirstOrThrow({
      where: { kurinId: null, name: 'Перша допомога' },
      include: { levels: { orderBy: { level: 'asc' } } },
    });
    expect(firstAid.levels.map((l) => l.note)).toEqual(['Виконати вимоги А або Б.', null]);
  });

  it('is idempotent and updates requirements in place', async () => {
    await seedSkillsCatalog(prisma, small('1. Стара вимога'));
    const again = await seedSkillsCatalog(prisma, small('1. Нова вимога'));
    expect(again).toEqual({ skillsCreated: 0, skillsUpdated: 0, levelsCreated: 0, levelsUpdated: 1 });
    const levels = await prisma.skillLevel.findMany();
    expect(levels).toHaveLength(1);
    expect(levels[0].requirements).toEqual([{ text: '1. Нова вимога' }]);
  });

  it('moves a skill to its new group instead of duplicating it', async () => {
    await seedSkillsCatalog(prisma, small('1. Вимога'));
    const moved = await seedSkillsCatalog(prisma, [{ ...small('1. Вимога')[0], group: SkillGroup.SPECIAL }]);
    expect(moved.skillsUpdated).toBe(1);
    const all = await prisma.skill.findMany();
    expect(all).toHaveLength(1);
    expect(all[0].group).toBe(SkillGroup.SPECIAL);
  });

  it('never deletes levels missing from the data and never touches kurin custom skills', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Точка']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const custom = await createSkill(prisma, { name: 'Картографія', kurinId: kurin.id, levels: [1] });
    await createSkill(prisma, { name: 'Картографія', levels: [3] });

    await seedSkillsCatalog(prisma, small('1. Вимога'));

    const global = await prisma.skill.findFirstOrThrow({
      where: { kurinId: null, name: 'Картографія' },
      include: { levels: { orderBy: { level: 'asc' } } },
    });
    expect(global.levels.map((l) => l.level)).toEqual([2, 3]);
    const customAfter = await prisma.skill.findUniqueOrThrow({ where: { id: custom.id }, include: { levels: true } });
    expect(customAfter.levels.map((l) => l.level)).toEqual([1]);
    expect(customAfter.levels[0].requirements).toEqual(custom.levels[0].requirements);
  });
});
