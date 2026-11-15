-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('RESET', 'INVITE');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'USER_INVITED';

-- AlterTable
ALTER TABLE "PasswordResetToken" ADD COLUMN     "purpose" "TokenPurpose" NOT NULL DEFAULT 'RESET';
