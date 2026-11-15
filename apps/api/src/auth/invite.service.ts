import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Role, TokenPurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { generateToken } from '../common/token.util';
import { kurinLabel } from '../common/kurin-label.util';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ROLE_LABELS: Record<Role, string> = {
  ZVYAZKOVYI: 'звʼязковий',
  VYKHOVNYK: 'виховник',
  JUNAK: 'юнак/юначка',
};

@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly audit: AuditService,
  ) {}

  async sendInvite(userId: string, actorId: string | null): Promise<{ sent: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { kurin: true },
    });
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, purpose: TokenPurpose.INVITE, usedAt: null },
      data: { usedAt: new Date() },
    });
    const { raw, hash } = generateToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hash,
        purpose: TokenPurpose.INVITE,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    let sent = true;
    try {
      await this.mailService.sendWelcomeInvite(user.email, {
        firstName: user.firstName,
        kurinLabel: kurinLabel(user.kurin),
        roleLabel: ROLE_LABELS[user.role],
        inviteUrl: `${process.env.FRONTEND_URL}/welcome?token=${raw}`,
      });
    } catch (err) {
      sent = false;
      this.logger.error(
        `Failed to send invite to user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await this.audit.record({
      kurinId: user.kurinId,
      actorId,
      action: AuditAction.USER_INVITED,
      subjectUserId: userId,
      details: { subjectName: personLabel(user) },
    });
    return { sent };
  }
}
