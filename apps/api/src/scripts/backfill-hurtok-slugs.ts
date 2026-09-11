import { PrismaClient } from '@prisma/client';
import { generateUniqueSlug } from '../hurtky/slug.util';

const prisma = new PrismaClient();

async function main() {
  const hurtky = await prisma.hurtok.findMany({ where: { slug: null } });
  for (const hurtok of hurtky) {
    const slug = await generateUniqueSlug(prisma, hurtok.kurinId, hurtok.name);
    await prisma.hurtok.update({ where: { id: hurtok.id }, data: { slug } });
    console.log(`${hurtok.name} (${hurtok.id}) -> ${slug}`);
  }
  console.log(`Backfilled ${hurtky.length} hurtok slug(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
