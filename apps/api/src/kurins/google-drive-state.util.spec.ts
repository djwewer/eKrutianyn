import { JwtService } from '@nestjs/jwt';
import { BadRequestException } from '@nestjs/common';
import { signGoogleDriveState, verifyGoogleDriveState } from './google-drive-state.util';

describe('google-drive-state.util', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });

  it('signs and verifies a state round-trip, returning the original kurinId and actorId', () => {
    const state = signGoogleDriveState(jwtService, 'kurin-1', 'user-1');
    expect(verifyGoogleDriveState(jwtService, state)).toEqual({ kurinId: 'kurin-1', actorId: 'user-1' });
  });

  it('still verifies a state without an actorId (older tokens), returning a null actorId', () => {
    const state = signGoogleDriveState(jwtService, 'kurin-1');
    expect(verifyGoogleDriveState(jwtService, state)).toEqual({ kurinId: 'kurin-1', actorId: null });
  });

  it('rejects a state signed with a different secret', () => {
    const otherJwtService = new JwtService({ secret: 'other-secret' });
    const state = signGoogleDriveState(otherJwtService, 'kurin-1');
    expect(() => verifyGoogleDriveState(jwtService, state)).toThrow(BadRequestException);
  });

  it('rejects a validly-signed token that lacks the google-drive-connect purpose', () => {
    const foreignToken = jwtService.sign({ kurinId: 'kurin-1', purpose: 'something-else' });
    expect(() => verifyGoogleDriveState(jwtService, foreignToken)).toThrow(BadRequestException);
  });
});
