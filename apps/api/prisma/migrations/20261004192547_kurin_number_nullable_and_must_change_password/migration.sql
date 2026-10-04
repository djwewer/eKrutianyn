-- AlterTable
ALTER TABLE "Kurin" ALTER COLUMN "kurinNumber" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
