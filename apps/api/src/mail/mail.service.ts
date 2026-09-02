import { BadGatewayException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface CapturedMail {
  to: string;
  type: 'password-reset' | 'email-change-confirmation' | 'profile-change-notification';
  link?: string;
  meta?: Record<string, string | null>;
  html?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly captureMode = process.env.MAIL_MODE === 'test';
  private readonly transporter: Transporter | null;
  private readonly lastMailByRecipient = new Map<string, CapturedMail>();

  constructor() {
    this.transporter =
      process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
        ? nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
          })
        : null;
  }

  onModuleInit() {
    if (!this.captureMode && (!this.transporter || !process.env.FRONTEND_URL)) {
      throw new Error(
        'MailService is misconfigured: GMAIL_USER, GMAIL_APP_PASSWORD, and FRONTEND_URL must all be set unless MAIL_MODE=test.',
      );
    }
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    await this.deliver(
      { to, type: 'password-reset', link: resetUrl },
      {
        subject: 'Відновлення пароля — Пласт',
        html: `<p>Щоб встановити новий пароль, перейдіть за посиланням: <a href="${resetUrl}">${resetUrl}</a></p><p>Якщо ви не запитували відновлення пароля — просто проігноруйте цей лист.</p>`,
      },
    );
  }

  async sendEmailChangeConfirmation(to: string, confirmUrl: string): Promise<void> {
    await this.deliver(
      { to, type: 'email-change-confirmation', link: confirmUrl },
      {
        subject: 'Підтвердження нової електронної пошти — Пласт',
        html: `<p>Щоб підтвердити цю адресу для входу в застосунок, перейдіть за посиланням: <a href="${confirmUrl}">${confirmUrl}</a></p>`,
      },
    );
  }

  async sendProfileChangeNotification(
    to: string,
    params: { changedUserName: string; field: string; oldValue: string | null; newValue: string | null },
  ): Promise<void> {
    await this.deliver(
      {
        to,
        type: 'profile-change-notification',
        meta: { field: params.field, oldValue: params.oldValue, newValue: params.newValue },
      },
      {
        subject: `${params.changedUserName} змінив(-ла) особисті дані`,
        html: `<p>${escapeHtml(params.changedUserName)} самостійно змінив(-ла) поле "${params.field}": "${escapeHtml(params.oldValue ?? '—')}" → "${escapeHtml(params.newValue ?? '—')}".</p>`,
      },
    );
  }

  getLastMailFor(to: string): CapturedMail | undefined {
    return this.lastMailByRecipient.get(to);
  }

  private async deliver(captured: CapturedMail, email: { subject: string; html: string }): Promise<void> {
    if (this.captureMode) {
      this.lastMailByRecipient.set(captured.to, { ...captured, html: email.html });
      return;
    }
    try {
      await this.transporter!.sendMail({
        from: `"Пласт — Ядро і Проби" <${process.env.GMAIL_USER}>`,
        to: captured.to,
        subject: email.subject,
        html: email.html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send "${captured.type}" mail to ${captured.to}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadGatewayException('Failed to send email');
    }
  }
}
