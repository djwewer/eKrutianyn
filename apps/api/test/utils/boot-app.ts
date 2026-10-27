import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../../src/app.module';

export async function bootApp(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<{ app: INestApplication; jwtService: JwtService }> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (configure) builder = configure(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return { app, jwtService: moduleRef.get(JwtService, { strict: false }) };
}
