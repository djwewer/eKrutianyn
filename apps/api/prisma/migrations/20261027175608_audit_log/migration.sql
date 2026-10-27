/*
  Warnings:

  - You are about to drop the `ProgressAuditLog` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('PROBY_POINT_CONFIRMED', 'PROBY_POINT_UNCONFIRMED', 'PROBY_STAGE_CLOSED', 'PROBY_STAGE_REOPENED', 'DEGREE_DATE_CHANGED', 'USER_CREATED', 'USER_ARCHIVED', 'USER_CONTACT_UPDATED', 'USER_HURTOK_CHANGED', 'POSITION_ASSIGNED', 'POSITION_REMOVED', 'HURTOK_CREATED', 'HURTOK_UPDATED', 'HURTOK_ARCHIVED', 'VYKHOVNYK_ASSIGNED', 'VYKHOVNYK_UNASSIGNED', 'GUARDIAN_CREATED', 'GUARDIAN_UPDATED', 'GUARDIAN_DELETED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED', 'TREASURY_TRANSACTION_CREATED', 'TREASURY_TRANSACTION_DELETED', 'TREASURY_STARTING_BALANCE_CHANGED', 'INVENTORY_ITEM_CREATED', 'INVENTORY_ITEM_UPDATED', 'INVENTORY_ITEM_DELETED', 'INVENTORY_PHOTO_ADDED', 'INVENTORY_PHOTO_REMOVED', 'KURIN_PROBY_PROGRAM_CHANGED', 'DRIVE_CONNECTED', 'DRIVE_DISCONNECTED', 'DRIVE_FOLDER_SET', 'JUDGE_BOOK_CONNECTED', 'JUDGE_BOOK_IMPORTED', 'JUDGE_BOOK_SYNCED', 'JUDGE_BOOK_SYNCED_NIGHTLY', 'APD_CREATED', 'ANNOUNCEMENT_PUBLISHED', 'ANNOUNCEMENT_UPDATED', 'ANNOUNCEMENT_DELETED');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "kurinId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "AuditAction" NOT NULL,
    "subjectUserId" TEXT,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_kurinId_createdAt_id_idx" ON "AuditLog"("kurinId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AuditLog_kurinId_subjectUserId_idx" ON "AuditLog"("kurinId", "subjectUserId");

-- CreateIndex
CREATE INDEX "AuditLog_kurinId_action_idx" ON "AuditLog"("kurinId", "action");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_kurinId_fkey" FOREIGN KEY ("kurinId") REFERENCES "Kurin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Carry the existing proby confirm/unconfirm history over into the new log.
INSERT INTO "AuditLog" ("id", "kurinId", "actorId", "action", "subjectUserId", "entityId", "details", "createdAt")
SELECT
  p."id",
  u."kurinId",
  p."actorId",
  (CASE p."action" WHEN 'CONFIRM' THEN 'PROBY_POINT_CONFIRMED' ELSE 'PROBY_POINT_UNCONFIRMED' END)::"AuditAction",
  p."junakId",
  p."pointId",
  jsonb_build_object(
    'pointTitle', pt."description",
    'subjectName', COALESCE(NULLIF(BTRIM(u."nickname"), ''), u."firstName" || ' ' || u."lastName")
  ),
  p."createdAt"
FROM "ProgressAuditLog" p
JOIN "User" u ON u."id" = p."junakId"
LEFT JOIN "ProbyPoint" pt ON pt."id" = p."pointId";

-- DropForeignKey
ALTER TABLE "ProgressAuditLog" DROP CONSTRAINT "ProgressAuditLog_actorId_fkey";

-- DropTable
DROP TABLE "ProgressAuditLog";

-- DropEnum
DROP TYPE "ProgressAction";
