import { PrismaClient } from '@prisma/client';

export async function cleanDatabase(prisma: PrismaClient) {
  await prisma.$transaction([
    prisma.aiMessage.deleteMany(),
    prisma.aiConversation.deleteMany(),
    prisma.referenceSource.deleteMany(),
    prisma.progressAuditLog.deleteMany(),
    prisma.approvalRequest.deleteMany(),
    prisma.junakProgress.deleteMany(),
    prisma.junakStageProgress.deleteMany(),
    prisma.pointMapping.deleteMany(),
    prisma.probyPoint.deleteMany(),
    prisma.probyCategory.deleteMany(),
    prisma.probyStage.deleteMany(),
    prisma.vykhovnykHurtok.deleteMany(),
    prisma.kurinPosition.deleteMany(),
    prisma.guardianContact.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.emailChangeRequest.deleteMany(),
    prisma.profileChangeLog.deleteMany(),
    prisma.inventoryItemPhoto.deleteMany(),
    prisma.inventoryItem.deleteMany(),
    prisma.junakImportMapping.deleteMany(),
    prisma.treasuryTransaction.deleteMany(),
    prisma.kurinCalendarEvent.deleteMany(),
    prisma.junakActivityEntry.deleteMany(),
    // Announcements and push subscriptions reference users (no cascade), so they
    // must go first or one leftover row blocks every user deleteMany below.
    prisma.announcementReaction.deleteMany(),
    prisma.announcementImage.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.pushSubscription.deleteMany(),
    prisma.user.deleteMany(),
    prisma.hurtok.deleteMany(),
    prisma.kurin.deleteMany(),
    prisma.probyProgram.deleteMany(),
  ]);
}
