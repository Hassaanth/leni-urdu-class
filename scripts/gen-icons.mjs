// Renders PNG app icons from public/icons/icon.svg using a locally installed Chrome/Edge via Playwright.
// Usage: npm run icons
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'public', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');

const channel = process.env.PW_CHANNEL ?? 'msedge';
const browser = await chromium.launch({ channel });
const page = await browser.newPage();

async function render(size, file, { maskable = false, flatten = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  // Maskable icons need the artwork inside the central safe zone, on a full-bleed background.
  const inner = maskable ? Math.round(size * 0.78) : size;
  const html = `<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${maskable || flatten ? '#0b7a64' : 'transparent'}">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`;
  await page.setContent(html);
  const buf = await page.screenshot({ omitBackground: !(maskable || flatten), type: 'png' });
  writeFileSync(join(dir, file), buf);
  console.log('wrote', file);
}

await render(192, 'icon-192.png');
await render(512, 'icon-512.png');
await render(512, 'icon-maskable-512.png', { maskable: true });
await render(180, 'apple-touch-icon.png', { flatten: true }); // iOS ignores transparency
await browser.close();
