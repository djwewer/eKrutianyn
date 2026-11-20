-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PYSARSTVO_FOLDER_SET';

-- AlterTable
ALTER TABLE "Kurin" ADD COLUMN     "pysarstvoFolderId" TEXT,
ADD COLUMN     "pysarstvoFolderName" TEXT;
