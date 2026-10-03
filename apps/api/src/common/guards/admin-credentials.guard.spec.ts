import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminCredentialsGuard } from './admin-credentials.guard';

function makeContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('AdminCredentialsGuard', () => {
  const originalUsername = process.env.ADMIN_USERNAME;
  const originalPassword = process.env.ADMIN_PASSWORD;
  let guard: AdminCredentialsGuard;

  beforeEach(() => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';
    guard = new AdminCredentialsGuard();
  });

  afterAll(() => {
    process.env.ADMIN_USERNAME = originalUsername;
    process.env.ADMIN_PASSWORD = originalPassword;
  });

  it('allows the request when both username and password match exactly', () => {
    const context = makeContext({ 'x-admin-username': 'admin', 'x-admin-password': 'correct-horse-battery-staple' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const context = makeContext({ 'x-admin-username': 'admin', 'x-admin-password': 'wrong' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a wrong username', () => {
    const context = makeContext({ 'x-admin-username': 'someone-else', 'x-admin-password': 'correct-horse-battery-staple' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects missing headers', () => {
    const context = makeContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects when ADMIN_USERNAME or ADMIN_PASSWORD is not configured on the server', () => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    const context = makeContext({ 'x-admin-username': 'admin', 'x-admin-password': 'correct-horse-battery-staple' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
