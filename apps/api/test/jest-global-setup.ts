import * as path from 'path';
import * as dotenv from 'dotenv';

export default async () => {
  // This file has no other imports that would trigger Prisma's own implicit
  // .env loading, and it runs in Jest's main process before any test file
  // (and before the workers that run them) are spawned — so without loading
  // .env explicitly here, process.env.DATABASE_URL_TEST below reads as
  // undefined and this swap silently never happens: every worker then falls
  // back to the plain DATABASE_URL (the dev database) the first time it
  // imports anything that pulls in @prisma/client.
  dotenv.config({ path: path.resolve(__dirname, '../.env') });

  // In e2e tests, use the test database
  if (process.env.DATABASE_URL_TEST) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  }
  // Never send real email during tests
  process.env.MAIL_MODE = 'test';
  // OpenAiService constructs its SDK client eagerly at DI time, so every e2e spec
  // that compiles AppModule needs a value here even when it never calls the AI
  // assistant endpoints and doesn't override OpenAiService itself.
  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = 'test-openai-key';
  }
};
