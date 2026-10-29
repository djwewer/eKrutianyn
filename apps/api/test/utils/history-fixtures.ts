import { PrismaClient, ProbyProgramVersion, Role } from '@prisma/client';
import { createKurin, createProbyProgramTree, createUser } from './fixtures';

/**
 * A kurin with hurtky A and B, a vykhovnyk assigned to each, a junak in hurtok A,
 * a junak without a hurtok, and a second kurin with its own zvyazkovyi.
 */
export async function createHistoryWorld(prisma: PrismaClient) {
  const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Точка']);
  const kurin = await createKurin(prisma, { probyProgramId: program.id });
  const hurtokA = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
  const hurtokB = await prisma.hurtok.create({ data: { name: 'Соколи', kurinId: kurin.id } });
  const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
  const vykhovnykA = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
  const vykhovnykB = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
  await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnykA.id, hurtokId: hurtokA.id } });
  await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnykB.id, hurtokId: hurtokB.id } });
  const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtokA.id });
  const junakNoHurtok = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
  const otherKurin = await createKurin(prisma, { probyProgramId: program.id });
  const otherZvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });
  return { program, kurin, hurtokA, hurtokB, zvyazkovyi, vykhovnykA, vykhovnykB, junak, junakNoHurtok, otherKurin, otherZvyazkovyi };
}
