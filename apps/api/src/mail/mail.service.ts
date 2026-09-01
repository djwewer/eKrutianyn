import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

export interface CapturedMail {
  to: string;
  type: 'password-reset' | 'email-change-confirmation' | 'profile-change-notification';
  link?: string;
  meta?: Record<string, string | null>;
}

@Injectable()
export class MailService {
  private readonly resend: Resend | null;
  private readonly testMode = process.env.MAIL_MODE === 'test' || !process.env.RESEND_API_KEY;
  private readonly lastMailByRecipient = new Map<string, CapturedMail>();

  constructor() {
    this.resend = this.testMode ? null : new Resend(process.env.RESEND_API_KEY);
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
        html: `<p>${params.changedUserName} самостійно змінив(-ла) поле "${params.field}": "${params.oldValue ?? '—'}" → "${params.newValue ?? '—'}".</p>`,
      },
    );
  }

  getLastMailFor(to: string): CapturedMail | undefined {
    return this.lastMailByRecipient.get(to);
  }

  private async deliver(captured: CapturedMail, email: { subject: string; html: string }): Promise<void> {
    if (this.testMode) {
      this.lastMailByRecipient.set(captured.to, captured);
      return;
    }
    await this.resend!.emails.send({
      from: process.env.MAIL_FROM ?? 'onboarding@resend.dev',
      to: captured.to,
      subject: email.subject,
      html: email.html,
    });
  }
}
