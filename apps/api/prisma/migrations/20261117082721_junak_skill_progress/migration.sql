-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SKILL_STARTED';
ALTER TYPE "AuditAction" ADD VALUE 'SKILL_REQUIREMENT_SIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'SKILL_REQUIREMENT_UNSIGNED';

-- AlterTable
ALTER TABLE "JunakSkill" ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "startedById" TEXT,
ALTER COLUMN "achievedAt" DROP NOT NULL;

-- CreateTable
CREATE TABLE "JunakSkillRequirementSign" (
    "id" TEXT NOT NULL,
    "junakSkillId" TEXT NOT NULL,
    "requirementIndex" INTEGER NOT NULL,
    "signedById" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JunakSkillRequirementSign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JunakSkillRequirementSign_junakSkillId_idx" ON "JunakSkillRequirementSign"("junakSkillId");

-- CreateIndex
CREATE UNIQUE INDEX "JunakSkillRequirementSign_junakSkillId_requirementIndex_key" ON "JunakSkillRequirementSign"("junakSkillId", "requirementIndex");

-- AddForeignKey
ALTER TABLE "JunakSkill" ADD CONSTRAINT "JunakSkill_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakSkillRequirementSign" ADD CONSTRAINT "JunakSkillRequirementSign_junakSkillId_fkey" FOREIGN KEY ("junakSkillId") REFERENCES "JunakSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakSkillRequirementSign" ADD CONSTRAINT "JunakSkillRequirementSign_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
