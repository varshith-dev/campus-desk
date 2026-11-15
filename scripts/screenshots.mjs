// Captures the README and Devpost screenshots from the built site, using the sample clock.
// Run: npm run build:site && npm run screenshots
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';

const root = join(import.meta.dirname, '..');
const out = join(root, 'docs', 'screenshots');
mkdirSync(out, { recursive: true });
const servers = [await startServer(join(root, 'dist'), 5173), await startServer(join(root, 'dist-peer'), 5174)];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
const shot = async (name, opts = {}) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.screenshot({ path: join(out, name), ...opts });
};
const go = (p) => page.goto(`http://localhost:5173/${p}`, { waitUntil: 'networkidle0' });
const send = async (q) => {
  await page.type('#msg', q);
  await page.click('#send');
};
const idle = () => page.waitForFunction(() => !document.querySelector('.msg.bot[aria-busy="true"]'), { timeout: 15000 });

await go('index.html');
await shot('01-home.png');

await go('timetable.html');
await shot('02-timetable.png');

await go('notices.html');
await page.click('[data-cat="exams"]');
await shot('03-notices.png');

await go('fees-exams.html');
await shot('04-fees-and-exams.png');

await go('ask.html');
await send('Is my Wednesday class on?');
await idle();
await send('When is the tuition fee due, and what is the late fee?');
await idle();
await send('Remind me to pay the tuition fee on 27 Nov');
await page.waitForSelector('#confirm[open]');
await shot('05-confirm-write.png');
await page.click('#confirm-yes');
await idle();
await send('Is the library open late during exams?');
await page.waitForSelector('#consent[open]');
await shot('06-consent-other-site.png');
await page.click('#consent-allow');
await idle();
await shot('07-ask-with-activity.png');

await page.click('#open-settings');
await page.waitForSelector('#settings[open]');
await shot('08-ai-settings.png');
await page.keyboard.press('Escape');

await go('agents.html');
await page.waitForFunction(() => document.querySelectorAll('#checks li').length > 5);
await shot('09-for-agents.png', { fullPage: true });

await page.setViewport({ width: 390, height: 800, deviceScaleFactor: 2, isMobile: true });
await go('index.html');
await shot('10-phone-home.png');

await browser.close();
for (const s of servers) s.close();
console.log(`Screenshots written to ${out}`);
