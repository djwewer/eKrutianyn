-- AlterEnum
ALTER TYPE "ApprovalActionType" ADD VALUE 'BULK_IMPORT_JUNAKY';

-- AlterTable
ALTER TABLE "Kurin" ADD COLUMN     "judgeBookSpreadsheetId" TEXT,
ADD COLUMN     "judgeBookSpreadsheetName" TEXT;

-- CreateTable
CREATE TABLE "JunakImportMapping" (
    "id" TEXT NOT NULL,
    "kurinId" TEXT NOT NULL,
    "columnMapping" JSONB NOT NULL,
    "positionValueMapping" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JunakImportMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JunakImportMapping_kurinId_key" ON "JunakImportMapping"("kurinId");

-- AddForeignKey
ALTER TABLE "JunakImportMapping" ADD CONSTRAINT "JunakImportMapping_kurinId_fkey" FOREIGN KEY ("kurinId") REFERENCES "Kurin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
