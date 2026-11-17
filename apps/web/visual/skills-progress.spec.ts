import path from 'node:path';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { loginAs } from '../e2e/helpers/auth';
import { seedDegreeProbyProgram, seedKurinWithZvyazkovyi } from '../e2e/helpers/seed';
import { seedSkillsCatalog } from '../e2e/helpers/history-seed';
import { confirmPointAs, createHurtok, createOnboardedUserAs, loginForToken } from '../e2e/helpers/proby-seed';

// Screens for the skills-progress feature: «Мої вмілості», the profile «Вмілості» and «Проба» cards, the Скоб tile.
const API_URL = 'http://localhost:3001';
const OUT = path.resolve(__dirname, '../visual-shots/skills-progress');
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, phone: { width: 360, height: 780 } } as const;

async function newPage(browser: Browser, viewport: keyof typeof VIEWPORTS, theme: 'light' | 'dark') {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[viewport], baseURL: 'http://localhost:3000', colorScheme: theme });
  await ctx.addCookies([{ name: 'theme', value: theme, domain: 'localhost', path: '/' }]);
  return { ctx, page: await ctx.newPage() };
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: 'nextjs-portal, [data-nextjs-toast] { display: none !important; }' });
  await page.waitForTimeout(600);
}

async function call(method: string, p: string, token: string, body?: unknown) {
  const res = await fetch(`${API_URL}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${p} ${res.status} ${await res.text()}`);
  return res.json();
}

async function seedJunak(token: string, hurtokId: string, lastName: string) {
  return createOnboardedUserAs(token, {
    firstName: 'Іван',
    lastName,
    email: `skills-visual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
    role: 'JUNAK',
    hurtokId,
  });
}

let seeded: Awaited<ReturnType<typeof seed>> | undefined;
async function seed() {
  seedSkillsCatalog();
  const { program, stages, points } = await seedDegreeProbyProgram();
  const z = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(z.zvyazkovyiEmail, z.zvyazkovyiPassword);
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);

  // Main junak: stage 1 closed, stage 2 fully confirmed (close control visible), skills started and achieved.
  const main = await seedJunak(token, hurtok.id, 'Петренко-Коваленко');
  await confirmPointAs(token, main.user.id, points[0].id);
  await call('POST', `/junaky/${main.user.id}/progress/stages/${stages[0].id}/close`, token, { date: '2025-06-01' });
  await confirmPointAs(token, main.user.id, points[1].id);
  const junakToken = await loginForToken(main.email, main.password);
  const groups = (await call('GET', '/skills', junakToken)) as { skills: { name: string; levels: { id: string; level: number }[] }[] }[];
  const level1 = (name: string) => groups.flatMap((g) => g.skills).find((s) => s.name === name)!.levels.slice().sort((x, y) => x.level - y.level)[0].id;
  const a = await call('POST', `/users/${main.user.id}/skills/start`, junakToken, { levelId: level1('Природознавство') });
  await call('POST', `/users/${main.user.id}/skills/start`, junakToken, { levelId: level1('Картографія') });
  const c = await call('POST', `/users/${main.user.id}/skills/start`, junakToken, { levelId: level1('Перша допомога') });
  await call('PUT', `/users/${main.user.id}/skills/${a.id}/requirements/0`, token);
  await call('PUT', `/users/${main.user.id}/skills/${a.id}/requirements/1`, token);
  await call('POST', `/users/${main.user.id}/skills/${c.id}/achieve`, token, { achievedAt: '2026-11-01' });

  // Skob junak: three degrees earned, so the current degree is Скоб.
  const skob = await seedJunak(token, hurtok.id, 'Скобенко');
  for (const [i, stage] of stages.entries()) {
    await confirmPointAs(token, skob.user.id, points[i].id);
    await call('POST', `/junaky/${skob.user.id}/progress/stages/${stage.id}/close`, token, { date: `2025-0${i + 1}-10` });
  }
  return { z, main, skob };
}

for (const viewport of ['desktop', 'phone'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    const tag = `${viewport}-${theme}`;

    test(`junak views ${tag}`, async ({ browser }) => {
      seeded ??= await seed();
      const { main, skob } = seeded;

      const j = await newPage(browser, viewport, theme);
      await loginAs(j.page, main.email, main.password);
      await j.page.goto('/skills');
      await expect(j.page.getByTestId('my-started-skill').first()).toBeVisible();
      await expect(j.page.getByTestId('my-achieved-skill').first()).toBeVisible();
      await settle(j.page);
      await j.page.getByTestId('my-started-skill').first().getByRole('button').first().click();
      await settle(j.page);
      await j.page.screenshot({ path: path.join(OUT, `catalog-my-skills-${tag}.png`), fullPage: true });
      await j.ctx.close();

      const s = await newPage(browser, viewport, theme);
      await loginAs(s.page, skob.email, skob.password);
      await s.page.goto('/plastuvannia');
      await expect(s.page.getByTestId('hub-degree-SKOB')).toContainText('в процесі');
      await settle(s.page);
      await s.page.screenshot({ path: path.join(OUT, `plastuvannia-skob-${tag}.png`), fullPage: true });
      await s.ctx.close();
    });

    test(`profile cards ${tag}`, async ({ browser }) => {
      seeded ??= await seed();
      const { z, main } = seeded;
      const { ctx, page } = await newPage(browser, viewport, theme);
      await loginAs(page, z.zvyazkovyiEmail, z.zvyazkovyiPassword);
      await page.goto(`/users/${main.user.id}`);
      const proba = page.getByTestId('junak-proba');
      const skills = page.getByTestId('junak-skills');
      await expect(proba).toBeVisible();
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `profile-collapsed-${tag}.png`), fullPage: true });

      // Скills card: expand, open the started skill with 2 signs.
      await skills.getByRole('button', { name: /^Вмілості/ }).click();
      const started = skills.getByTestId('junak-started-skill').filter({ hasText: 'Природознавство' });
      await started.getByRole('button', { name: /^Природознавство/ }).click();
      await settle(page);
      await skills.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, `profile-skills-${tag}.png`), fullPage: true });
      await skills.getByRole('button', { name: /^Вмілості/ }).click();

      // Проба: stage 2 (with the close control) and the category inside.
      await proba.getByRole('button', { name: /^Проба/ }).click();
      await proba.getByTestId('junak-proba-stage').nth(1).getByRole('button').first().click();
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `profile-proba-stage-close-${tag}.png`), fullPage: true });
      await proba.getByTestId('junak-proba-stage').nth(1).getByRole('button', { name: /^Категорія/ }).click();
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `profile-proba-category-${tag}.png`), fullPage: true });
      await ctx.close();
    });
  }
}
