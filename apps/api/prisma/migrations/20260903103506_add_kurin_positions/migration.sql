-- CreateEnum
CREATE TYPE "PositionScope" AS ENUM ('KURIN', 'HURTOK');

-- CreateEnum
CREATE TYPE "PositionType" AS ENUM ('KURINNYI', 'SUDDIA', 'PYSAR', 'SKARBNYK', 'INTENDANT', 'KHORUNZHYI', 'SMM', 'HURTKOVYI');

-- CreateTable
CREATE TABLE "KurinPosition" (
    "id" TEXT NOT NULL,
    "kurinId" TEXT NOT NULL,
    "hurtokId" TEXT,
    "scope" "PositionScope" NOT NULL,
    "positionType" "PositionType" NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,

    CONSTRAINT "KurinPosition_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "KurinPosition" ADD CONSTRAINT "KurinPosition_kurinId_fkey" FOREIGN KEY ("kurinId") REFERENCES "Kurin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KurinPosition" ADD CONSTRAINT "KurinPosition_hurtokId_fkey" FOREIGN KEY ("hurtokId") REFERENCES "Hurtok"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KurinPosition" ADD CONSTRAINT "KurinPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KurinPosition" ADD CONSTRAINT "KurinPosition_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KurinPosition" ADD CONSTRAINT "KurinPosition_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
