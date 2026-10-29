import { Prisma, PrismaClient } from '@prisma/client';
import { SKILLS_CATALOG, SkillData } from './skills-catalog.data';

export interface SeedSkillsResult {
  skillsCreated: number;
  skillsUpdated: number;
  levelsCreated: number;
  levelsUpdated: number;
}

/**
 * Upserts the global «Вмілості УПЮ» catalog (kurinId = null), keyed by skill
 * name (unique among global skills) and level. Updates group, requirements and
 * notes in place; never deletes anything and never touches kurin custom skills.
 */
export async function seedSkillsCatalog(
  prisma: PrismaClient,
  catalog: SkillData[] = SKILLS_CATALOG,
): Promise<SeedSkillsResult> {
  const result: SeedSkillsResult = { skillsCreated: 0, skillsUpdated: 0, levelsCreated: 0, levelsUpdated: 0 };
  for (const data of catalog) {
    let skill = await prisma.skill.findFirst({ where: { kurinId: null, name: data.name } });
    if (!skill) {
      skill = await prisma.skill.create({ data: { name: data.name, group: data.group } });
      result.skillsCreated++;
    } else if (skill.group !== data.group) {
      skill = await prisma.skill.update({ where: { id: skill.id }, data: { group: data.group } });
      result.skillsUpdated++;
    }
    for (const level of data.levels) {
      const requirements = level.requirements as unknown as Prisma.InputJsonValue;
      const note = level.note ?? null;
      const existing = await prisma.skillLevel.findUnique({
        where: { skillId_level: { skillId: skill.id, level: level.level } },
      });
      if (existing) {
        await prisma.skillLevel.update({ where: { id: existing.id }, data: { requirements, note } });
        result.levelsUpdated++;
      } else {
        await prisma.skillLevel.create({ data: { skillId: skill.id, level: level.level, requirements, note } });
        result.levelsCreated++;
      }
    }
  }
  return result;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await seedSkillsCatalog(prisma);
    const skills = await prisma.skill.count({ where: { kurinId: null } });
    const levels = await prisma.skillLevel.count({ where: { skill: { kurinId: null } } });
    console.log(
      `Skills catalog: +${result.skillsCreated} skills (${result.skillsUpdated} regrouped), ` +
        `+${result.levelsCreated} levels (${result.levelsUpdated} updated). Global now: ${skills} skills, ${levels} levels.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
