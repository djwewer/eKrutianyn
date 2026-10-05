-- AlterTable
ALTER TABLE "AiConversation" ADD COLUMN     "probyPointId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AiConversation_userId_probyPointId_key" ON "AiConversation"("userId", "probyPointId");

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_probyPointId_fkey" FOREIGN KEY ("probyPointId") REFERENCES "ProbyPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
