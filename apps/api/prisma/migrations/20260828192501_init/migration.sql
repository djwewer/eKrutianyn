-- CreateEnum
CREATE TYPE "Role" AS ENUM ('JUNAK', 'VYKHOVNYK', 'KURINNYI', 'ZVYAZKOVYI');

-- CreateEnum
CREATE TYPE "KurinGender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ProbyProgramVersion" AS ENUM ('OLD', 'NEW');

-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('NOT_DONE', 'DONE');

-- CreateEnum
CREATE TYPE "ProgressAction" AS ENUM ('CONFIRM', 'UNCONFIRM');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('CHANGE_FULL_NAME', 'CHANGE_BIRTH_DATE', 'CHANGE_EMAIL', 'CHANGE_HURTOK', 'CREATE_JUNAK');

-- CreateTable
CREATE TABLE "Kurin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kurinNumber" TEXT NOT NULL,
    "gender" "KurinGender" NOT NULL,
    "stanytsia" TEXT NOT NULL,
    "probyProgramId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kurin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hurtok" (
    "id" TEXT NOT NULL,
    "kurinId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT,

    CONSTRAINT "Hurtok_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nickname" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "role" "Role" NOT NULL,
    "birthDate" TIMESTAMP(3),
    "notes" TEXT,
    "phone" TEXT,
    "kurinId" TEXT NOT NULL,
    "hurtokId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VykhovnykHurtok" (
    "id" TEXT NOT NULL,
    "vykhovnykId" TEXT NOT NULL,
    "hurtokId" TEXT NOT NULL,

    CONSTRAINT "VykhovnykHurtok_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbyProgram" (
    "id" TEXT NOT NULL,
    "version" "ProbyProgramVersion" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProbyProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbyStage" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProbyStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbyCategory" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProbyCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbyPoint" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "ProbyPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointMapping" (
    "id" TEXT NOT NULL,
    "oldPointId" TEXT NOT NULL,
    "newPointId" TEXT NOT NULL,

    CONSTRAINT "PointMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JunakProgress" (
    "id" TEXT NOT NULL,
    "junakId" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'NOT_DONE',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "transferredFromPointId" TEXT,

    CONSTRAINT "JunakProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressAuditLog" (
    "id" TEXT NOT NULL,
    "junakId" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "action" "ProgressAction" NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "junakId" TEXT,
    "actionType" "ApprovalActionType" NOT NULL,
    "oldData" JSONB,
    "newData" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "VykhovnykHurtok_vykhovnykId_hurtokId_key" ON "VykhovnykHurtok"("vykhovnykId", "hurtokId");

-- CreateIndex
CREATE UNIQUE INDEX "PointMapping_oldPointId_newPointId_key" ON "PointMapping"("oldPointId", "newPointId");

-- CreateIndex
CREATE UNIQUE INDEX "JunakProgress_junakId_pointId_key" ON "JunakProgress"("junakId", "pointId");

-- AddForeignKey
ALTER TABLE "Kurin" ADD CONSTRAINT "Kurin_probyProgramId_fkey" FOREIGN KEY ("probyProgramId") REFERENCES "ProbyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hurtok" ADD CONSTRAINT "Hurtok_kurinId_fkey" FOREIGN KEY ("kurinId") REFERENCES "Kurin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_kurinId_fkey" FOREIGN KEY ("kurinId") REFERENCES "Kurin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_hurtokId_fkey" FOREIGN KEY ("hurtokId") REFERENCES "Hurtok"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VykhovnykHurtok" ADD CONSTRAINT "VykhovnykHurtok_vykhovnykId_fkey" FOREIGN KEY ("vykhovnykId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VykhovnykHurtok" ADD CONSTRAINT "VykhovnykHurtok_hurtokId_fkey" FOREIGN KEY ("hurtokId") REFERENCES "Hurtok"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbyStage" ADD CONSTRAINT "ProbyStage_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ProbyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbyCategory" ADD CONSTRAINT "ProbyCategory_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProbyStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbyPoint" ADD CONSTRAINT "ProbyPoint_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProbyCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointMapping" ADD CONSTRAINT "PointMapping_oldPointId_fkey" FOREIGN KEY ("oldPointId") REFERENCES "ProbyPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointMapping" ADD CONSTRAINT "PointMapping_newPointId_fkey" FOREIGN KEY ("newPointId") REFERENCES "ProbyPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakProgress" ADD CONSTRAINT "JunakProgress_junakId_fkey" FOREIGN KEY ("junakId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakProgress" ADD CONSTRAINT "JunakProgress_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "ProbyPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakProgress" ADD CONSTRAINT "JunakProgress_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakProgress" ADD CONSTRAINT "JunakProgress_transferredFromPointId_fkey" FOREIGN KEY ("transferredFromPointId") REFERENCES "ProbyPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressAuditLog" ADD CONSTRAINT "ProgressAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
