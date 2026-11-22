import { expect, test } from '@playwright/test';
import { seedSettings } from './helpers';

test('lessons play the bundled Pakistani Urdu voice', async ({ page }) => {
  await seedSettings(page);
  await page.goto('/#/lesson/l1-intro');
  await page.getByRole('button', { name: 'Start lesson' }).click();
  const req = page.waitForResponse((r) => r.url().includes('/content/audio/') && r.url().endsWith('.mp3'));
  await page.getByRole('button', { name: 'Play the conversation' }).click();
  expect((await req).ok()).toBe(true); // 200 or 206 (range)
  // past the conversation and Leni's tip, to the first new phrase
  for (let i = 0; i < 4 && !(await page.getByText('Pakistani Urdu voice').count()); i++) await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Pakistani Urdu voice')).toBeVisible();
});
