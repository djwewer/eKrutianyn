-- AlterTable
ALTER TABLE "User" ADD COLUMN     "photoData" BYTEA,
ADD COLUMN     "photoMimeType" TEXT,
ADD COLUMN     "photoUpdatedAt" TIMESTAMP(3);
