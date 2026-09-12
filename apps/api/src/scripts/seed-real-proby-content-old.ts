import { PrismaClient, ProbyProgramVersion } from '@prisma/client';
import { REAL_PROBY_CONTENT_OLD } from './real-proby-content-old.data';

const prisma = new PrismaClient();

async function main() {
  const programs = await prisma.probyProgram.findMany({
    where: { version: ProbyProgramVersion.OLD },
  });
  if (programs.length !== 1) {
    throw new Error(
      `Expected exactly one ProbyProgram with version=OLD, found ${programs.length}. Aborting without changes.`,
    );
  }
  const program = programs[0];

  await prisma.probyPoint.deleteMany({ where: { category: { stage: { programId: program.id } } } });
  await prisma.probyCategory.deleteMany({ where: { stage: { programId: program.id } } });
  await prisma.probyStage.deleteMany({ where: { programId: program.id } });

  for (const stage of REAL_PROBY_CONTENT_OLD) {
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
