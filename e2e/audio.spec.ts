import { expect, test } from '@playwright/test';
import { seedSettings } from './helpers';

test('phrases play the bundled Urdu voice', async ({ page }) => {
  await seedSettings(page);
  await page.goto('/#/lesson/l1-intro');
  const req = page.waitForResponse((r) => r.url().includes('/content/audio/') && r.url().endsWith('.mp3'));
  await page.getByRole('button', { name: 'Start lesson' }).click(); // first phrase auto-plays
  await expect(page.getByText('Pakistani Urdu voice')).toBeVisible();
  expect((await req).ok()).toBe(true); // 200 or 206 (range)
});
