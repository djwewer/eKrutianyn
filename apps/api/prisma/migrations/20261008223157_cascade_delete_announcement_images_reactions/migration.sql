-- DropForeignKey
ALTER TABLE "AnnouncementImage" DROP CONSTRAINT "AnnouncementImage_announcementId_fkey";

-- DropForeignKey
ALTER TABLE "AnnouncementReaction" DROP CONSTRAINT "AnnouncementReaction_announcementId_fkey";

-- AddForeignKey
ALTER TABLE "AnnouncementImage" ADD CONSTRAINT "AnnouncementImage_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementReaction" ADD CONSTRAINT "AnnouncementReaction_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
