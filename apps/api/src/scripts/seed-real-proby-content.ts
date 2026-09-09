import { PrismaClient, ProbyProgramVersion } from '@prisma/client';
import { REAL_PROBY_CONTENT } from './real-proby-content.data';

const prisma = new PrismaClient();

async function main() {
  const programs = await prisma.probyProgram.findMany({
    where: { version: ProbyProgramVersion.NEW },
  });
  if (programs.length !== 1) {
    throw new Error(
      `Expected exactly one ProbyProgram with version=NEW, found ${programs.length}. Aborting without changes.`,
    );
  }
  const program = programs[0];

  const progressCount = await prisma.junakProgress.count({
    where: {
      OR: [
        { point: { category: { stage: { programId: program.id } } } },
        { transferredFromPoint: { category: { stage: { programId: program.id } } } },
      ],
    },
  });
  if (progressCount > 0) {
    throw new Error(
      `Refusing to proceed: ${progressCount} JunakProgress row(s) already reference points under program ${program.id}. This program is no longer an empty placeholder — do not run this script against it.`,
    );
  }

  const mappingCount = await prisma.pointMapping.count({
    where: {
      OR: [
        { oldPoint: { category: { stage: { programId: program.id } } } },
        { newPoint: { category: { stage: { programId: program.id } } } },
      ],
    },
  });
  if (mappingCount > 0) {
    throw new Error(
      `Refusing to proceed: ${mappingCount} PointMapping row(s) already reference points under program ${program.id}.`,
    );
  }

  await prisma.probyPoint.deleteMany({ where: { category: { stage: { programId: program.id } } } });
  await prisma.probyCategory.deleteMany({ where: { stage: { programId: program.id } } });
  await prisma.probyStage.deleteMany({ where: { programId: program.id } });

  for (const stage of REAL_PROBY_CONTENT) {
    await prisma.probyStage.create({
      data: {
        programId: program.id,
        order: stage.order,
        name: stage.name,
        categories: {
          create: stage.categories.map((category) => ({
            name: category.name,
            points: {
              create: category.points.map((description, index) => ({
                order: index + 1,
                description,
              })),
            },
          })),
        },
      },
    });
  }

  const stageCount = await prisma.probyStage.count({ where: { programId: program.id } });
  const categoryCount = await prisma.probyCategory.count({ where: { stage: { programId: program.id } } });
  const pointCount = await prisma.probyPoint.count({ where: { category: { stage: { programId: program.id } } } });

  console.log(
    `Seeded program ${program.id} (${program.name}): ${stageCount} stages, ${categoryCount} categories, ${pointCount} points.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
