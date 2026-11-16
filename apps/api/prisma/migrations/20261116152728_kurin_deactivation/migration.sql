-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'KURIN_DEACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'KURIN_ACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'JUDGE_BOOK_DISCONNECTED';

-- AlterTable
ALTER TABLE "Kurin" ADD COLUMN     "deactivatedAt" TIMESTAMP(3);
