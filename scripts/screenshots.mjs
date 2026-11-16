// Captures the README and Devpost screenshots from the built app, using the sample clock.
// Run: npm run build:site && npm run build:peer && npm run screenshots
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clickText, go, PEER, SITE, sleep, startStack, text, root } from './e2e-lib.mjs';

const out = join(root, 'docs', 'screenshots');
mkdirSync(out, { recursive: true });
const stack = await startStack();
try {
  const ctx = await stack.browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  const shot = async (name, opts = {}) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(900);
    return page.screenshot({ path: join(out, name), ...opts });
  };
  const ready = async (path, sel = 'main h1') => {
    await go(page, path);
    await page.waitForSelector(sel);
    await sleep(500);
  };
  const typeAndSend = async (q) => {
    await page.waitForFunction(() => { const t = document.querySelector('#msg'); return t && !t.disabled; }, { timeout: 20000 });
    await page.type('#msg', q);
    await page.keyboard.press('Enter');
  };
  const idle = () => page.waitForFunction(() => !document.querySelector('[aria-label="Thinking"]') && !document.querySelector('button[aria-label="Stop"]'), { timeout: 20000 });

  await ready('');
  await shot('01-home.png');
  await ready('timetable');
  await shot('02-timetable.png');
  await ready('notices');
  await clickText(page, /^Exams$/i, 'main');
  await sleep(600);
  await shot('03-notices.png');
  await ready('fees-exams');
  await shot('04-fees-and-exams.png');

  await ready('ask');
  await typeAndSend('Is my Wednesday class on?');
  await idle();
  await typeAndSend('When is the tuition fee due, and what is the late fee?');
  await idle();
  await typeAndSend('Remind me to pay the tuition fee on 27 Nov');
  await page.waitForSelector('[data-testid=confirm-card]');
  await shot('05-confirm-write.png');
  await clickText(page, /Confirm and save/, '[data-testid=confirm-card]');
  await idle();
  await typeAndSend('Is the library open late during exams?');
  await page.waitForSelector('[data-testid=consent-card]');
  await shot('06-consent-other-site.png');
  await clickText(page, /^Allow once$/, '[data-testid=consent-card]');
  await idle();
  await shot('07-ask-with-activity.png');
  await clickText(page, /AI settings/, 'main');
  await page.waitForSelector('[data-testid=settings]');
  await shot('08-ai-settings.png');
  await page.keyboard.press('Escape');

  await ready('agents');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=checks] li').length > 5, { timeout: 20000 });
  await sleep(600);
  await shot('09-for-agents.png', { fullPage: true });

  // The hand-off: the library site's study planner asks, the student approves, receipts appear.
  await ready('activity');
  await page.waitForFunction(() => /^EB-/.test(document.querySelector('[data-testid=pairing-code]')?.textContent ?? ''));
  const code = (await text(page, '[data-testid=pairing-code]')).trim();
  const peerCtx = await stack.browser.createBrowserContext();
  const peer = await peerCtx.newPage();
  await peer.setViewport({ width: 1000, height: 760, deviceScaleFactor: 1 });
  await peer.goto(`${PEER}/study-planner.html`, { waitUntil: 'domcontentloaded' });
  await peer.type('#code', code);
  await peer.click('#go');
  await page.waitForSelector('[data-testid=request]', { timeout: 15000 });
  await sleep(700);
  await shot('11-access-request.png');
  await clickText(page, /^Approve$/, '[data-testid=request]');
  await peer.waitForFunction(() => !document.getElementById('result').hidden, { timeout: 20000 });
  await peer.screenshot({ path: join(out, '12-library-study-planner.png') });
  await page.waitForFunction(() => /get_exam_dates/.test(document.querySelector('[data-testid=tape]')?.textContent ?? ''), { timeout: 15000 });
  await clickText(page, /Verify the whole chain/, 'main');
  await sleep(5500);
  await shot('13-activity-receipts.png');

  // A receipt on the public verifier.
  const cookie = (await page.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const ledger = await (await fetch(`${SITE}/api/ledger?limit=3`, { headers: { cookie } })).json();
  await ready('verify');
  await page.click('#receipt');
  await page.evaluate((t) => { const n = document.querySelector('#receipt'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, t); n.dispatchEvent(new Event('input', { bubbles: true })); }, JSON.stringify(ledger.entries[0], null, 2));
  await clickText(page, /^Verify$/, 'main');
  await page.waitForSelector('[data-testid=verify-result]');
  await shot('14-verify-receipt.png');

  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await ready('');
  await shot('15-home-dark.png');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

  const phone = await ctx.newPage();
  await phone.setViewport({ width: 390, height: 800, deviceScaleFactor: 2, isMobile: true });
  await phone.goto(`${SITE}/`, { waitUntil: 'domcontentloaded' });
  await phone.waitForSelector('main h1');
  await sleep(900);
  await phone.screenshot({ path: join(out, '10-phone-home.png') });
  await phone.goto(`${SITE}/activity`, { waitUntil: 'domcontentloaded' });
  await phone.waitForSelector('[data-testid=tape] li');
  await sleep(900);
  await phone.screenshot({ path: join(out, '16-phone-activity.png') });
  await phone.goto(`${SITE}/ask`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await phone.screenshot({ path: join(out, '17-phone-ask.png') });
  console.log(`Screenshots written to ${out}`);
} finally {
  await stack.stop();
}
