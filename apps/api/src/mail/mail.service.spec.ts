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

    expect(service.getLastMailFor('junak@example.com')).toMatchObject({
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

    expect(service.getLastMailFor('vykhovnyk@example.com')).toMatchObject({
      to: 'vykhovnyk@example.com',
      type: 'profile-change-notification',
      meta: { field: 'firstName', oldValue: 'Петро', newValue: 'Петрик' },
    });
  });

  it('returns undefined for a recipient nothing was sent to', () => {
    const service = new MailService();
    expect(service.getLastMailFor('nobody@example.com')).toBeUndefined();
  });

  it('escapes HTML in the profile-change-notification body', async () => {
    const service = new MailService();

    await service.sendProfileChangeNotification('vykhovnyk2@example.com', {
      changedUserName: '<script>alert(1)</script>',
      field: 'firstName',
      oldValue: 'Стара назва',
      newValue: '<img src=x onerror=alert(2)>',
    });

    const captured = service.getLastMailFor('vykhovnyk2@example.com');
    expect(captured?.html).not.toContain('<script>');
    expect(captured?.html).not.toContain('<img src=x');
    expect(captured?.html).toContain('&lt;script&gt;');
    expect(captured?.html).toContain('&lt;img src=x onerror=alert(2)&gt;');
  });

  describe('onModuleInit', () => {
    const ORIGINAL = {
      MAIL_MODE: process.env.MAIL_MODE,
      GMAIL_USER: process.env.GMAIL_USER,
      GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,
      FRONTEND_URL: process.env.FRONTEND_URL,
    };

    function setEnv(key: keyof typeof ORIGINAL, value: string | undefined) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    afterEach(() => {
      setEnv('MAIL_MODE', ORIGINAL.MAIL_MODE);
      setEnv('GMAIL_USER', ORIGINAL.GMAIL_USER);
      setEnv('GMAIL_APP_PASSWORD', ORIGINAL.GMAIL_APP_PASSWORD);
      setEnv('FRONTEND_URL', ORIGINAL.FRONTEND_URL);
    });

    it('throws if not in test mode and Gmail credentials are missing', () => {
      setEnv('MAIL_MODE', undefined);
      setEnv('GMAIL_USER', undefined);
      setEnv('GMAIL_APP_PASSWORD', undefined);
      setEnv('FRONTEND_URL', 'https://example.com');
      const service = new MailService();
      expect(() => service.onModuleInit()).toThrow(/misconfigured/);
    });

    it('throws if not in test mode and only one of GMAIL_USER/GMAIL_APP_PASSWORD is set', () => {
      setEnv('MAIL_MODE', undefined);
      setEnv('GMAIL_USER', 'test@gmail.com');
      setEnv('GMAIL_APP_PASSWORD', undefined);
      setEnv('FRONTEND_URL', 'https://example.com');
      const service = new MailService();
      expect(() => service.onModuleInit()).toThrow(/misconfigured/);
    });

    it('throws if not in test mode and FRONTEND_URL is missing', () => {
      setEnv('MAIL_MODE', undefined);
      setEnv('GMAIL_USER', 'test@gmail.com');
      setEnv('GMAIL_APP_PASSWORD', 'app-password');
      setEnv('FRONTEND_URL', undefined);
      const service = new MailService();
      expect(() => service.onModuleInit()).toThrow(/misconfigured/);
    });

    it('does not throw in test mode even with no Gmail credentials or FRONTEND_URL configured', () => {
      setEnv('MAIL_MODE', 'test');
      setEnv('GMAIL_USER', undefined);
      setEnv('GMAIL_APP_PASSWORD', undefined);
      setEnv('FRONTEND_URL', undefined);
      const service = new MailService();
      expect(() => service.onModuleInit()).not.toThrow();
    });
  });
});
