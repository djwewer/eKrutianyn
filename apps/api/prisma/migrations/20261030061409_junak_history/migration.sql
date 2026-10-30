-- CreateEnum
CREATE TYPE "JunakRemarkKind" AS ENUM ('AWARD', 'WARNING');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'VFV_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'VFV_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'VFV_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'CAMP_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'CAMP_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CAMP_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'REMARK_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'REMARK_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'REMARK_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'PAST_POSITION_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'PAST_POSITION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PAST_POSITION_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'HISTORY_DATES_CHANGED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "plastOathAt" DATE,
ADD COLUMN     "upyJoinedAt" DATE;

-- CreateTable
CREATE TABLE "JunakVfv" (
    "id" TEXT NOT NULL,
    "junakId" TEXT NOT NULL,
    "achievedAt" DATE,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JunakVfv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JunakCamp" (
    "id" TEXT NOT NULL,
    "junakId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yearFrom" INTEGER NOT NULL,
    "yearTo" INTEGER,
    "role" "JunakActivityRole" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JunakCamp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JunakRemark" (
    "id" TEXT NOT NULL,
    "junakId" TEXT NOT NULL,
    "kind" "JunakRemarkKind" NOT NULL,
    "text" TEXT NOT NULL,
    "howToFix" TEXT,
    "date" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JunakRemark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JunakPastPosition" (
    "id" TEXT NOT NULL,
    "junakId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope" "PositionScope" NOT NULL,
    "yearFrom" INTEGER NOT NULL,
    "yearTo" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JunakPastPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JunakVfv_junakId_idx" ON "JunakVfv"("junakId");

-- CreateIndex
CREATE INDEX "JunakCamp_junakId_idx" ON "JunakCamp"("junakId");

-- CreateIndex
CREATE INDEX "JunakRemark_junakId_date_idx" ON "JunakRemark"("junakId", "date");

-- CreateIndex
CREATE INDEX "JunakPastPosition_junakId_idx" ON "JunakPastPosition"("junakId");

-- AddForeignKey
ALTER TABLE "JunakVfv" ADD CONSTRAINT "JunakVfv_junakId_fkey" FOREIGN KEY ("junakId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakVfv" ADD CONSTRAINT "JunakVfv_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakCamp" ADD CONSTRAINT "JunakCamp_junakId_fkey" FOREIGN KEY ("junakId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakCamp" ADD CONSTRAINT "JunakCamp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakRemark" ADD CONSTRAINT "JunakRemark_junakId_fkey" FOREIGN KEY ("junakId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakRemark" ADD CONSTRAINT "JunakRemark_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakPastPosition" ADD CONSTRAINT "JunakPastPosition_junakId_fkey" FOREIGN KEY ("junakId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakPastPosition" ADD CONSTRAINT "JunakPastPosition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
