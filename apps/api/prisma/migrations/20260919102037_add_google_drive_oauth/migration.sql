-- AlterTable
ALTER TABLE "Kurin" ADD COLUMN     "driveConnectedAt" TIMESTAMP(3),
ADD COLUMN     "driveConnectedEmail" TEXT,
ADD COLUMN     "driveFolderName" TEXT,
ADD COLUMN     "driveRefreshToken" TEXT;
