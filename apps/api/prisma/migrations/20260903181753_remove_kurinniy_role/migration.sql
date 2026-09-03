-- Data fix: convert any remaining KURINNYI roles to JUNAK
UPDATE "User" SET "role" = 'JUNAK' WHERE "role" = 'KURINNYI';

-- CreateEnum
CREATE TYPE "Role_new" AS ENUM ('JUNAK', 'VYKHOVNYK', 'ZVYAZKOVYI');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");

-- DropEnum
DROP TYPE "Role";

-- RenameEnum
ALTER TYPE "Role_new" RENAME TO "Role";
