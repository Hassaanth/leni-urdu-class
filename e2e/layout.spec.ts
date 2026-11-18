import { expect, test } from '@playwright/test';
import { seedSettings } from './helpers';

const ROUTES = [
  '/learn',
  '/practice',
  '/speak',
  '/talk',
  '/words',
  '/progress',
  '/settings',
  '/lesson/l1-intro',
  '/speak/repeat/l1-intro',
  '/speak/pronunciation/pr-throat',
  '/speak/qa',
  '/speak/read/r-story',
  '/speak/game/shadow',
  '/talk/c-visit-home',
];

test('no horizontal overflow and Urdu text is right-to-left', async ({ page }) => {
  await seedSettings(page);
  for (const r of ROUTES) {
    await page.goto('/#' + r);
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `overflow on ${r}`).toBeLessThanOrEqual(1);
  }
  await page.goto('/#/lesson/l1-intro');
  const urdu = page.locator('.urdu').first();
  await expect(urdu).toHaveAttribute('dir', 'rtl');
  await expect(urdu).toHaveAttribute('lang', 'ur');
  expect(await urdu.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  await expect(page.locator('.roman').first()).toHaveAttribute('lang', 'ur-Latn');
});
