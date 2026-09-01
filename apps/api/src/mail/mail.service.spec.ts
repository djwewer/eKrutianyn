import { MailService } from './mail.service';

describe('MailService (test mode)', () => {
  const originalMailMode = process.env.MAIL_MODE;

  beforeAll(() => {
    process.env.MAIL_MODE = 'test';
  });

  afterAll(() => {
    process.env.MAIL_MODE = originalMailMode;
  });

  it('captures a password reset email instead of sending it', async () => {
    const service = new MailService();

    await service.sendPasswordReset('junak@example.com', 'https://example.com/reset-password?token=abc');

    expect(service.getLastMailFor('junak@example.com')).toEqual({
      to: 'junak@example.com',
      type: 'password-reset',
      link: 'https://example.com/reset-password?token=abc',
    });
  });

  it('captures a profile change notification with its meta', async () => {
    const service = new MailService();

    await service.sendProfileChangeNotification('vykhovnyk@example.com', {
      changedUserName: 'Петро Петренко',
      field: 'firstName',
      oldValue: 'Петро',
      newValue: 'Петрик',
    });

    expect(service.getLastMailFor('vykhovnyk@example.com')).toEqual({
      to: 'vykhovnyk@example.com',
      type: 'profile-change-notification',
      meta: { field: 'firstName', oldValue: 'Петро', newValue: 'Петрик' },
    });
  });

  it('returns undefined for a recipient nothing was sent to', () => {
    const service = new MailService();
    expect(service.getLastMailFor('nobody@example.com')).toBeUndefined();
  });
});
