import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { loginAs } from '../e2e/helpers/auth';
import { seedDemo, type DemoIds } from './seed-demo';
import { VISUAL_PAGES, VisualNotApplicable, VisualSkip } from './pages';

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 390, height: 844 },
} as const;
const OUT = path.resolve(__dirname, '../test-results/visual');
const PROTO_URL = `file://${path.resolve(__dirname, '../../../docs/design/polovyi-prototype/polovyi-app.built.html')}`;
const STRICT = process.env.VISUAL_STRICT === '1';
// VISUAL_QUICK=1: desktop + light only (app and proto).
const QUICK = process.env.VISUAL_QUICK === '1';
const PUBLIC_PAGES = new Set(['login', 'forgot-password']);

let ids: DemoIds;

test.beforeAll(async () => {
  ids = await seedDemo();
});

for (const vp of VISUAL_PAGES) {
  for (const role of vp.roles) {
    for (const [viewport, size] of Object.entries(VIEWPORTS) as [keyof typeof VIEWPORTS, { width: number; height: number }][]) {
      for (const theme of ['light', 'dark'] as const) {
        if (theme === 'dark' && viewport === 'phone') continue;
        if (QUICK && (theme !== 'light' || viewport !== 'desktop')) continue;

        test(`${vp.key} ${role} ${viewport} ${theme}`, async ({ browser }, testInfo) => {
          const dir = path.join(OUT, vp.key);
          const prefix = `${role}-${viewport}-${theme}`;
          const settle = async (page: import('@playwright/test').Page) => {
            await page.waitForLoadState('networkidle');
            await page.evaluate(() => document.fonts.ready);
            // Hide the Next dev indicator so it does not pollute screenshots.
            await page.addStyleTag({ content: 'nextjs-portal, [data-nextjs-toast] { display: none !important; }' });
          };

          // ---- app side ----
          const appCtx = await browser.newContext({ viewport: size, baseURL: 'http://localhost:3000' });
          try {
            await appCtx.addCookies([{ name: 'theme', value: theme, domain: 'localhost', path: '/' }]);
            await appCtx.route('https://drive.google.com/thumbnail**', async (route) => {
              const n = /id=demo-(\d)/.exec(route.request().url())?.[1] ?? '1';
              await route.fulfill({
                contentType: 'image/svg+xml',
                body: readFileSync(path.join(__dirname, 'fixtures', `photo-${n}.svg`)),
              });
            });
            const page = await appCtx.newPage();
            if (!PUBLIC_PAGES.has(vp.key)) {
              const u = ids.users[role];
              await loginAs(page, u.email, u.password);
            }
            const appPath = typeof vp.appPath === 'function' ? vp.appPath(ids) : vp.appPath;
            const goToPage = async () => {
              await page.goto(appPath);
              await settle(page);
              const expected = new URL(appPath, 'http://localhost:3000').pathname;
              const actual = new URL(page.url()).pathname;
              if (actual !== expected) {
                throw new Error(`${vp.key} as ${role}: expected ${expected} but the app redirected to ${actual} (role not allowed or wrong path)`);
              }
            };
            await goToPage();
            await page.screenshot({ path: path.join(dir, `app-${prefix}.png`), fullPage: true });

            if (theme === 'light') {
              for (const it of vp.interactions ?? []) {
                try {
                  await it.run(page);
                  await settle(page);
                  await page.waitForTimeout(400); // let open/expand animations finish
                  await page.screenshot({ path: path.join(dir, `app-${role}-${viewport}-light-${it.name}.png`), fullPage: true });
                } catch (err) {
                  if (err instanceof VisualNotApplicable) {
                    // not meaningful for this role/viewport
                  } else {
                    const kind = err instanceof VisualSkip ? 'SKIP' : 'FAILED';
                    const msg = (err as Error).message.split('\n')[0];
                    if (STRICT) throw new Error(`interaction "${it.name}" ${kind}: ${msg}`);
                    testInfo.annotations.push({ type: `${kind} ${it.name}`, description: msg });
                    console.warn(`[visual] ${kind} interaction "${it.name}" on ${vp.key} ${role} ${viewport}: ${msg}`);
                  }
                }
                // Return to a clean page for the next interaction.
                await goToPage();
              }
            }
          } finally {
            await appCtx.close();
          }

          // ---- prototype side ----
          const protoCtx = await browser.newContext({ viewport: size, colorScheme: theme });
          try {
            if (!PUBLIC_PAGES.has(vp.key)) {
              await protoCtx.addInitScript((r) => sessionStorage.setItem('plast-role', r), role);
            }
            const page = await protoCtx.newPage();
            await page.goto(`${PROTO_URL}#${vp.protoHash}`);
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(300);
            await page.screenshot({ path: path.join(dir, `proto-${prefix}.png`), fullPage: true });
          } finally {
            await protoCtx.close();
          }
        });
      }
    }
  }
}
