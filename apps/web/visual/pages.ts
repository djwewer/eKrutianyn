import type { Page } from '@playwright/test';
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

const click = (page: Page, locator: ReturnType<Page['locator']>) => locator.first().click({ timeout: 5_000 });

// The photo carousel/lightbox does not exist in the app until a later task
// restyles it, so these interactions are tolerant (the spec skips a failed one).
const openLightbox = async (page: Page) => {
  await click(page, page.locator('main img, [data-slot="carousel"] img').first());
  await page.waitForTimeout(300);
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
          if ((page.viewportSize()?.width ?? 0) > 600) throw new Error('phone only');
          await click(page, page.getByRole('button', { name: 'Діловодство' }));
          await page.getByRole('dialog', { name: 'Діловодство' }).waitFor({ timeout: 5_000 });
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
          await click(page, page.getByText('Гуртки', { exact: true }));
          await page.waitForTimeout(200);
          await click(page, page.getByText('Беркути', { exact: true }));
          await page.waitForTimeout(300);
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
      {
        name: 'next-photo',
        run: async (page) => {
          await click(page, page.getByRole('button', { name: /наступн/i }));
          await page.waitForTimeout(300);
        },
      },
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
