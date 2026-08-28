import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { Roles } from '../src/common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../src/common/decorators/current-user.decorator';

@Controller('test-protected')
class TestProtectedController {
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ZVYAZKOVYI)
  @Get('zvyazkovyi-only')
  zvyazkovyiOnly(@CurrentUser() user: CurrentUserPayload) {
    return { userId: user.userId, role: user.role, kurinId: user.kurinId };
  }

  @UseGuards(JwtAuthGuard)
  @Get('any-role')
  anyRole(@CurrentUser() user: CurrentUserPayload) {
    return { userId: user.userId };
  }
}

describe('Auth guards (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestProtectedController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = moduleRef.get(JwtService, { strict: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 with no token', async () => {
    await request(app.getHttpServer()).get('/test-protected/any-role').expect(401);
  });

  it('returns 200 with any valid token on a route with no @Roles', async () => {
    const token = jwtService.sign({ sub: 'user-1', role: Role.JUNAK, kurinId: 'kurin-1' });
    await request(app.getHttpServer())
      .get('/test-protected/any-role')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('returns 403 when the role does not match @Roles', async () => {
    const token = jwtService.sign({ sub: 'user-1', role: Role.JUNAK, kurinId: 'kurin-1' });
    await request(app.getHttpServer())
      .get('/test-protected/zvyazkovyi-only')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 200 and the decoded user when the role matches @Roles', async () => {
    const token = jwtService.sign({ sub: 'user-1', role: Role.ZVYAZKOVYI, kurinId: 'kurin-1' });
    const response = await request(app.getHttpServer())
      .get('/test-protected/zvyazkovyi-only')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ userId: 'user-1', role: Role.ZVYAZKOVYI, kurinId: 'kurin-1' });
  });
});
