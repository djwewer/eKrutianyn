/*
  Warnings:

  - Added the required column `updatedAt` to the `AiConversation` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "AiConversation_userId_key";

-- AlterTable
ALTER TABLE "AiConversation" ADD COLUMN     "title" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AiConversation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "AiConversation_userId_updatedAt_idx" ON "AiConversation"("userId", "updatedAt");
