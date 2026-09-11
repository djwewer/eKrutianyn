import { PrismaClient, Role, KurinGender, ProbyProgramVersion, PositionScope, PositionType } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

export async function createProbyProgramTree(
  prisma: PrismaClient,
  version: ProbyProgramVersion,
  pointDescriptions: string[],
) {
  const program = await prisma.probyProgram.create({
    data: { version, name: `${version} program` },
  });
  const stage = await prisma.probyStage.create({
    data: { programId: program.id, order: 1, name: 'Stage 1' },
  });
  const category = await prisma.probyCategory.create({
    data: { stageId: stage.id, name: 'Category 1' },
  });
  const points = [];
  for (let i = 0; i < pointDescriptions.length; i++) {
    points.push(
      await prisma.probyPoint.create({
        data: { categoryId: category.id, order: i + 1, description: pointDescriptions[i] },
      }),
    );
  }
  return { program, stage, category, points };
}

export async function createKurin(
  prisma: PrismaClient,
  overrides: {
    probyProgramId: string;
    name?: string;
    kurinNumber?: string;
    gender?: KurinGender;
    stanytsia?: string;
  },
) {
  return prisma.kurin.create({
    data: {
      name: overrides.name ?? 'Test Kurin',
      kurinNumber: overrides.kurinNumber ?? `T${Date.now()}${Math.floor(Math.random() * 100000)}`,
      gender: overrides.gender ?? KurinGender.MALE,
      stanytsia: overrides.stanytsia ?? 'Test Stanytsia',
      probyProgramId: overrides.probyProgramId,
    },
  });
}

export async function createUser(
  prisma: PrismaClient,
  overrides: {
    role: Role;
    kurinId: string;
    hurtokId?: string;
    email?: string;
    password?: string;
  },
) {
  const email =
    overrides.email ?? `${overrides.role.toLowerCase()}-${Date.now()}-${Math.random()}@example.com`;
  const passwordHash = overrides.password ? await argon2.hash(overrides.password) : undefined;
  return prisma.user.create({
    data: {
      firstName: 'Test',
      lastName: 'User',
      email,
      passwordHash,
      role: overrides.role,
      kurinId: overrides.kurinId,
      hurtokId: overrides.hurtokId,
    },
  });
}

export async function createKurinniyUser(
  prisma: PrismaClient,
  overrides: { kurinId: string; hurtokId?: string; email?: string; password?: string },
) {
  const user = await createUser(prisma, {
    role: Role.JUNAK,
    kurinId: overrides.kurinId,
    hurtokId: overrides.hurtokId,
    email: overrides.email,
    password: overrides.password,
  });
  await prisma.kurinPosition.create({
    data: {
      kurinId: overrides.kurinId,
      scope: PositionScope.KURIN,
      positionType: PositionType.KURINNYI,
      userId: user.id,
      assignedById: user.id,
    },
  });
  return user;
}

export function issueTokenFor(
  jwtService: JwtService,
  user: { id: string; role: Role; kurinId: string },
) {
  return jwtService.sign({ sub: user.id, role: user.role, kurinId: user.kurinId });
}
