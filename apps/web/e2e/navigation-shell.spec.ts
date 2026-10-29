import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { assignVykhovnyk, createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';

async function seed() {
  const { program } = await seedProbyProgram();
  const seeded = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  return { token, seeded };
}

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

test.describe('phone', () => {
  test.use({ viewport: PHONE });

  test('junak: five-item bottom bar without діловодство, centre and avatar links', async ({ page }) => {
    const { token } = await seed();
    const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
    const { email, password } = await createOnboardedUserAs(token, {
      firstName: 'Тест',
      lastName: `Юнак${Date.now()}`,
      email: `junak-nav-${Date.now()}@example.com`,
      role: 'JUNAK',
      hurtokId: hurtok.id,
    });
    await loginAs(page, email, password);
    await page.goto('/news');

    const nav = page.getByRole('navigation', { name: 'Основна навігація' });
    await expect(nav).toBeVisible();
    for (const name of ['Новини', 'Календар', 'Моє пластування', 'Курінь', 'Налаштування']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole('button', { name: 'Діловодство' })).toHaveCount(0);
    await expect(nav.getByRole('link')).toHaveCount(5);

    // No old burger / theme toggle on the phone.
    await expect(page.getByRole('button', { name: 'Меню' })).toHaveCount(0);

    await nav.getByRole('link', { name: 'Моє пластування', exact: true }).click();
    await expect(page).toHaveURL(/\/plastuvannia$/);

    await page.getByRole('link', { name: 'Моя сторінка' }).click();
    await expect(page).toHaveURL(/\/me$/);
  });

  test('vykhovnyk: centre button is «Мій гурток»', async ({ page }) => {
    const { token } = await seed();
    const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
    const { user, email, password } = await createOnboardedUserAs(token, {
      firstName: 'Марія',
      lastName: `Мельник${Date.now()}`,
      email: `vykhovnyk-nav-${Date.now()}@example.com`,
      role: 'VYKHOVNYK',
    });
    await assignVykhovnyk(token, user.id, hurtok.id);
    await loginAs(page, email, password);
    await page.goto('/news');

    const nav = page.getByRole('navigation', { name: 'Основна навігація' });
    await nav.getByRole('link', { name: 'Мій гурток', exact: true }).click();
    await expect(page).toHaveURL(/\/my-hurtok$/);
  });

  test('zvyazkovyi: «Моя проба» centre and діловодство sheet', async ({ page }) => {
    const { seeded } = await seed();
    await loginAs(page, seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
    await page.goto('/news');

    const nav = page.getByRole('navigation', { name: 'Основна навігація' });
    await expect(nav.getByRole('link', { name: 'Моя проба', exact: true })).toHaveAttribute('href', '/plastuvannia');
    await expect(nav.getByRole('link', { name: 'Налаштування', exact: true })).toBeVisible();

    const dilovody = nav.getByRole('button', { name: 'Діловодство' });
    // Six columns: five links plus the діловодство button; adjacent labels must not touch.
    await expect(nav.getByRole('link')).toHaveCount(5);
    await expect(dilovody).toHaveCount(1);
    const dBox = await dilovody.boundingBox();
    const sBox = await nav.getByRole('link', { name: 'Налаштування', exact: true }).boundingBox();
    expect(dBox && sBox && sBox.x - (dBox.x + dBox.width)).toBeGreaterThan(0);
    await expect(dilovody).toHaveAttribute('aria-expanded', 'false');
    await dilovody.click();
    await expect(dilovody).toHaveAttribute('aria-expanded', 'true');

    const sheet = page.getByRole('dialog', { name: 'Діловодство' });
    for (const name of ['Облік реманенту', 'Суддівство', 'Писарство', 'Скарбниця']) {
      await expect(sheet.getByRole('link', { name })).toBeVisible();
    }

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(dilovody).toBeFocused();
    await dilovody.click();
    await expect(sheet.getByRole('link', { name: 'Облік реманенту' })).toBeFocused();

    await sheet.getByRole('link', { name: 'Писарство' }).click();
    await expect(page).toHaveURL(/\/pysarstvo$/);
    await expect(page.getByRole('dialog', { name: 'Діловодство' })).toBeHidden();
  });

  test('zvyazkovyi: діловодство sheet does not reopen when returning to the same path', async ({ page }) => {
    const { seeded } = await seed();
    await loginAs(page, seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
    await page.goto('/news');

    const nav = page.getByRole('navigation', { name: 'Основна навігація' });
    const dilovody = nav.getByRole('button', { name: 'Діловодство' });
    const sheet = page.getByRole('dialog', { name: 'Діловодство' });
    await dilovody.click();
    await expect(dilovody).toHaveAttribute('aria-expanded', 'true');
    await expect(sheet).toBeVisible();

    await nav.getByRole('link', { name: 'Календар', exact: true }).click();
    await expect(page).toHaveURL(/\/calendar$/);
    await expect(sheet).toBeHidden();

    // The Next dev indicator sits over the first bar item, so dispatch the click directly.
    await nav.getByRole('link', { name: 'Новини', exact: true }).dispatchEvent('click');
    await expect(page).toHaveURL(/\/news$/);
    await expect(sheet).toBeHidden();
    await expect(dilovody).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP });

  test('zvyazkovyi: sidebar with expandable діловодство and profile card, no bottom bar', async ({ page }) => {
    const { seeded } = await seed();
    await loginAs(page, seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
    await page.goto('/news');

    const navs = page.getByRole('navigation', { name: 'Основна навігація' });
    await expect(navs).toHaveCount(1);
    const nav = navs.first();
    await expect(nav).toBeVisible();
    for (const name of ['Моя проба', 'Новини', 'Календар', 'Курінь', 'Налаштування']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Моя сторінка' })).toBeVisible();

    const dilovody = nav.getByRole('button', { name: 'Діловодство' });
    await expect(dilovody).toHaveAttribute('aria-expanded', 'false');
    await expect(nav.getByRole('link', { name: 'Писарство' })).toBeHidden();
    await dilovody.click();
    await expect(dilovody).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.getByRole('link', { name: 'Писарство' })).toBeVisible();
  });
});
