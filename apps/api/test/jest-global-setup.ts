export default async () => {
  // In e2e tests, use the test database
  if (process.env.DATABASE_URL_TEST) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  }
};
