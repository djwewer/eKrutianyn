-- CreateEnum
CREATE TYPE "SkillGroup" AS ENUM ('PRACTICAL', 'FIRST_AID', 'NATURE', 'SPORT', 'HOME', 'SPECIAL', 'ARTS', 'AVIATION', 'SEA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SKILL_ACHIEVED';
ALTER TYPE "AuditAction" ADD VALUE 'SKILL_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SKILL_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'CUSTOM_SKILL_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CUSTOM_SKILL_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CUSTOM_SKILL_DELETED';

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "kurinId" TEXT,
    "name" TEXT NOT NULL,
    "group" "SkillGroup" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillLevel" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "requirements" JSONB NOT NULL,
    "note" TEXT,

    CONSTRAINT "SkillLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JunakSkill" (
    "id" TEXT NOT NULL,
    "junakId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "achievedAt" DATE NOT NULL,
    "examiner" TEXT,
    "certificateNumber" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JunakSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Skill_kurinId_name_key" ON "Skill"("kurinId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SkillLevel_skillId_level_key" ON "SkillLevel"("skillId", "level");

-- CreateIndex
CREATE INDEX "JunakSkill_junakId_idx" ON "JunakSkill"("junakId");

-- CreateIndex
CREATE UNIQUE INDEX "JunakSkill_junakId_levelId_key" ON "JunakSkill"("junakId", "levelId");

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_kurinId_fkey" FOREIGN KEY ("kurinId") REFERENCES "Kurin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillLevel" ADD CONSTRAINT "SkillLevel_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakSkill" ADD CONSTRAINT "JunakSkill_junakId_fkey" FOREIGN KEY ("junakId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakSkill" ADD CONSTRAINT "JunakSkill_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "SkillLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakSkill" ADD CONSTRAINT "JunakSkill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-added: Prisma cannot express a partial unique index. Global catalog
-- skills (kurinId IS NULL) must have unique names; the composite unique above
-- treats NULL kurinIds as distinct, so it does not cover them.
CREATE UNIQUE INDEX "Skill_global_name_key" ON "Skill"("name") WHERE "kurinId" IS NULL;
