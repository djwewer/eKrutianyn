import { execSync } from 'node:child_process';
import path from 'node:path';

const API_URL = 'http://localhost:3001';
const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST ?? 'postgresql://plast:plast@localhost:5432/plast_test';

/** Loads the global «Вмілості УПЮ» catalog into the e2e database (idempotent seed from apps/api). */
export function seedSkillsCatalog() {
  execSync('npx ts-node src/scripts/seed-skills-catalog.ts', {
    cwd: path.resolve(__dirname, '..', '..', '..', 'api'),
    env: { ...process.env, DATABASE_URL: DATABASE_URL_TEST },
    stdio: 'pipe',
  });
}

export async function postAs<T = unknown>(token: string, apiPath: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${apiPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${apiPath} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}
