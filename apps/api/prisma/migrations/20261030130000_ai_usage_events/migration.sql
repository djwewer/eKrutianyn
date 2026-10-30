-- CreateEnum
CREATE TYPE "AiUsageKind" AS ENUM ('NEW_CHAT', 'MESSAGE');

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AiUsageKind" NOT NULL,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsageEvent_userId_kind_createdAt_idx" ON "AiUsageEvent"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_conversationId_kind_idx" ON "AiUsageEvent"("conversationId", "kind");
