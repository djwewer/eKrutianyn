import type { Locator, Page } from '@playwright/test';
import type { DemoIds, Role } from './seed-demo';

export type { Role };

export type VisualPage = {
  key: string;
  appPath: string | ((ids: DemoIds) => string);
  protoHash: string;
  roles: Role[];
  wide?: boolean;
  interactions?: { name: string; run: (page: Page) => Promise<void> }[];
};

const ALL: Role[] = ['JUNAK', 'VYKHOVNYK', 'ZVYAZKOVYI'];

/** The control the interaction needs does not exist yet (a later task adds it). */
export class VisualSkip extends Error {}
/** The interaction does not apply to this role/viewport: skipped silently. */
export class VisualNotApplicable extends Error {}

const T = 5_000;

/** Throw VisualSkip when the control is absent, else click it. */
async function clickIfPresent(locator: Locator, what: string) {
  const visible = locator.filter({ visible: true });
  if ((await visible.count()) === 0) throw new VisualSkip(`control not found: ${what}`);
  await visible.first().click({ timeout: T }).catch((e: Error) => {
    throw new Error(`could not click ${what}: ${e.message.split('\n')[0]}`);
  });
}

// Lightbox: click a photo, expect a visible dialog (role=dialog) containing it.
const openLightbox = async (page: Page) => {
  await clickIfPresent(page.locator('main img'), 'photo (main img)');
  const dialog = page.getByRole('dialog').first();
  await dialog.waitFor({ state: 'visible', timeout: T }).catch(() => {
    throw new Error('lightbox dialog did not open after clicking a photo');
  });
};

// Next photo: expect the carousel state (counter/active dot) to change.
const nextPhoto = async (page: Page) => {
  // Arrows are hidden on phones by design (swipe + dots).
  if ((page.viewportSize()?.width ?? 0) <= 760) throw new VisualNotApplicable('arrows hidden on phones');
  const next = page.getByRole('button', { name: /наступн/i });
  if ((await next.count()) === 0) throw new VisualSkip('control not found: next-photo arrow');
  const region = page.locator('main');
  const before = await region.innerHTML();
  await next.first().click({ timeout: T });
  await page.waitForFunction(
    (html) => document.querySelector('main')?.innerHTML !== html,
    before,
    { timeout: T },
  ).catch(() => {
    throw new Error('carousel did not change after clicking next-photo');
  });
};

export const VISUAL_PAGES: VisualPage[] = [
  { key: 'login', appPath: '/login', protoHash: 'login', roles: ['JUNAK'] },
  { key: 'forgot-password', appPath: '/forgot-password', protoHash: 'forgot', roles: ['JUNAK'] },
  {
    key: 'news',
    appPath: '/news',
    protoHash: 'news',
    roles: ALL,
    interactions: [
      { name: 'lightbox', run: openLightbox },
      {
        // Shell check: on the phone viewport the «Діловодство» sheet (ZVYAZKOVYI only).
        name: 'shell-dilovodstvo-sheet',
        run: async (page) => {
          if ((page.viewportSize()?.width ?? 0) > 600) throw new VisualNotApplicable('phone only');
          const trigger = page.getByRole('button', { name: 'Діловодство' });
          if ((await trigger.count()) === 0) throw new VisualNotApplicable('no Діловодство button for this role');
          await trigger.first().click({ timeout: T });
          await page.getByRole('dialog', { name: 'Діловодство' }).waitFor({ state: 'visible', timeout: T }).catch(() => {
            throw new Error('Діловодство sheet did not open');
          });
        },
      },
    ],
  },
  { key: 'news-new', appPath: '/news/new', protoHash: 'news-new', roles: ['ZVYAZKOVYI'] },
  {
    key: 'calendar',
    appPath: '/calendar',
    protoHash: 'calendar',
    roles: ALL,
    // Task 7 adds the previous-year control; add the click-through interaction there.
    interactions: [],
  },
  { key: 'plastuvannia', appPath: '/plastuvannia', protoHash: 'plast', roles: ['JUNAK'] },
  { key: 'proby', appPath: '/proby', protoHash: 'proby', roles: ['JUNAK'] },
  { key: 'ai-vykhovnyk', appPath: '/ai-vykhovnyk', protoHash: 'ai', roles: ['JUNAK'] },
  { key: 'my-activity', appPath: '/my-activity', protoHash: 'activity', roles: ['JUNAK'] },
  { key: 'skills', appPath: '/skills', protoHash: 'skills', roles: ['JUNAK'] },
  { key: 'my-hurtok', appPath: '/my-hurtok', protoHash: 'my-hurtok', roles: ['VYKHOVNYK'] },
  {
    key: 'kurin',
    appPath: '/kurin',
    protoHash: 'kurin',
    roles: ['ZVYAZKOVYI', 'JUNAK'],
    interactions: [
      {
        name: 'hurtky-open',
        run: async (page) => {
          await clickIfPresent(page.getByRole('button', { name: /Гуртки/ }), '«Гуртки» section');
          const hurtok = page.getByText('Беркути', { exact: true }).filter({ visible: true });
          await hurtok.first().waitFor({ state: 'visible', timeout: T }).catch(() => {
            throw new Error('«Гуртки» did not expand to show «Беркути»');
          });
          await hurtok.first().click({ timeout: T });
          await page.getByText(/Кравець/).first().waitFor({ state: 'visible', timeout: T }).catch(() => {
            throw new Error('«Беркути» did not expand to show its members');
          });
        },
      },
    ],
  },
  { key: 'users-detail', appPath: (ids) => `/users/${ids.junakId}`, protoHash: 'user-u1', roles: ['ZVYAZKOVYI'], wide: true },
  { key: 'users-new', appPath: '/users/new', protoHash: 'user-new', roles: ['ZVYAZKOVYI'] },
  {
    key: 'inventory',
    appPath: '/inventory',
    protoHash: 'inventory',
    roles: ['JUNAK', 'ZVYAZKOVYI'],
    interactions: [
      { name: 'next-photo', run: nextPhoto },
      { name: 'lightbox', run: openLightbox },
    ],
  },
  { key: 'suddivstvo', appPath: '/suddivstvo', protoHash: 'suddivstvo', roles: ['ZVYAZKOVYI'], wide: true },
  { key: 'junak-import', appPath: '/suddivstvo/junak-import', protoHash: 'import', roles: ['ZVYAZKOVYI'], wide: true },
  { key: 'pysarstvo', appPath: '/pysarstvo', protoHash: 'pysarstvo', roles: ['ZVYAZKOVYI'] },
  { key: 'treasury', appPath: '/treasury', protoHash: 'treasury', roles: ['ZVYAZKOVYI'] },
  { key: 'settings', appPath: '/settings', protoHash: 'prefs', roles: ALL },
  { key: 'approval-requests', appPath: '/approval-requests', protoHash: 'approvals', roles: ['ZVYAZKOVYI'] },
  { key: 'audit-log', appPath: '/audit-log', protoHash: 'audit', roles: ['ZVYAZKOVYI'], wide: true },
  { key: 'me', appPath: '/me', protoHash: 'me', roles: ['JUNAK', 'ZVYAZKOVYI'] },
];
