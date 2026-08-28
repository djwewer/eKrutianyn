import { GoogleTokenVerifierService } from './google-token-verifier.service';

const verifyIdTokenMock = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
}));

describe('GoogleTokenVerifierService', () => {
  let service: GoogleTokenVerifierService;

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    service = new GoogleTokenVerifierService();
  });

  it('returns email and sub when the token is valid', async () => {
    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({ email: 'a@example.com', sub: 'google-sub-1' }),
    });

    const result = await service.verify('valid-token');
    expect(result).toEqual({ email: 'a@example.com', sub: 'google-sub-1' });
  });

  it('returns null when the payload has no email', async () => {
    verifyIdTokenMock.mockResolvedValue({ getPayload: () => ({ sub: 'google-sub-1' }) });
    const result = await service.verify('token-without-email');
    expect(result).toBeNull();
  });

  it('returns null when verification throws', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('invalid token'));
    const result = await service.verify('bad-token');
    expect(result).toBeNull();
  });
});
