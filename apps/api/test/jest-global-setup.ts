export default async () => {
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
