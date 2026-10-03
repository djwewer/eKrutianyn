-- CreateEnum
CREATE TYPE "TreasuryTransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JunakActivityRole" AS ENUM ('PARTICIPANT', 'PROVID');

-- AlterTable
ALTER TABLE "Kurin" ADD COLUMN     "treasuryStartingBalanceCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TreasuryTransaction" (
    "id" TEXT NOT NULL,
    "kurinId" TEXT NOT NULL,
    "type" "TreasuryTransactionType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KurinCalendarEvent" (
    "id" TEXT NOT NULL,
    "kurinId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KurinCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JunakActivityEntry" (
    "id" TEXT NOT NULL,
    "junakId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "role" "JunakActivityRole" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JunakActivityEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreasuryTransaction_kurinId_occurredAt_idx" ON "TreasuryTransaction"("kurinId", "occurredAt");

-- CreateIndex
CREATE INDEX "KurinCalendarEvent_kurinId_startDate_idx" ON "KurinCalendarEvent"("kurinId", "startDate");

-- CreateIndex
CREATE INDEX "JunakActivityEntry_junakId_occurredAt_idx" ON "JunakActivityEntry"("junakId", "occurredAt");

-- AddForeignKey
ALTER TABLE "TreasuryTransaction" ADD CONSTRAINT "TreasuryTransaction_kurinId_fkey" FOREIGN KEY ("kurinId") REFERENCES "Kurin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryTransaction" ADD CONSTRAINT "TreasuryTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KurinCalendarEvent" ADD CONSTRAINT "KurinCalendarEvent_kurinId_fkey" FOREIGN KEY ("kurinId") REFERENCES "Kurin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KurinCalendarEvent" ADD CONSTRAINT "KurinCalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakActivityEntry" ADD CONSTRAINT "JunakActivityEntry_junakId_fkey" FOREIGN KEY ("junakId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
