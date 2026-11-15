// End-to-end run in a real Chrome: every page, the demo beats, consent and confirm cards,
// bring-your-own-key settings with a fake key, accessibility (axe-core) and a phone-size layout.
// Needs: npm run build:site first. Uses /usr/bin/google-chrome (set CHROME to change it).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';

const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, '..');
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SITE = 'http://localhost:5173';
const PEER = 'http://localhost:5174';
const FAKE_KEY = 'FAKE-KEY-FOR-TESTS-0000000000000000';

const results = [];
let failures = 0;
async function step(name, fn) {
  try {
    await fn();
    results.push(`ok    ${name}`);
  } catch (e) {
    failures++;
    results.push(`FAIL  ${name}\n        ${String(e.message ?? e).split('\n')[0]}`);
  }
}
function must(cond, msg) {
  if (!cond) throw new Error(msg);
}
const has = (text, re, what) => must(re.test(text), `${what}: expected ${re}, got "${text.slice(0, 160)}"`);

const servers = [await startServer(join(root, 'dist'), 5173), await startServer(join(root, 'dist-peer'), 5174)];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const problems = [];

async function fresh(opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: opts.width ?? 1280, height: opts.height ?? 900 });
  page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource.*(404|net::ERR)/.test(t)) problems.push(`console.error ${t}`);
  });
  return { ctx, page };
}
const text = (page, sel) => page.$eval(sel, (n) => n.textContent ?? '');
const go = (page, path) => page.goto(`${SITE}/${path}`, { waitUntil: 'networkidle0' });

async function ask(page, q, handler) {
  await page.$eval('#msg', (n) => { n.value = ''; });
  await page.type('#msg', q);
  await page.click('#send');
  if (handler) await handler();
  await page.waitForFunction(() => !document.querySelector('.msg.bot[aria-busy="true"]') && document.querySelectorAll('.msg.bot').length > 0, { timeout: 15000 });
  return page.$$eval('.msg.bot .text', (n) => n.at(-1).textContent ?? '');
}
const activity = (page) => page.$$eval('#activity li', (n) => n.map((x) => x.textContent ?? ''));

// ---------- pages ----------
{
  const { ctx, page } = await fresh();
  await step('home shows the next class from the sample clock', async () => {
    await go(page, 'index.html');
    has(await text(page, '.next'), /MA201 Probability and Statistics at 11:15/, 'next class');
    has(await text(page, '#today'), /CS201 Data Structures/, 'today list');
    must((await page.$$('#due li')).length > 2, 'coming up list');
  });
  await step('changing the saved class changes the page and survives a reload', async () => {
    await page.select('#profile select[name=section]', 'B');
    await page.select('#profile select[name=year]', '3');
    await page.waitForFunction(() => /CS302 Database Systems/.test(document.getElementById('today')?.textContent ?? ''));
    await page.reload({ waitUntil: 'networkidle0' });
    must((await page.$eval('#profile select[name=year]', (n) => n.value)) === '3', 'year kept');
    must((await page.$eval('#profile select[name=section]', (n) => n.value)) === 'B', 'section kept');
    await page.select('#profile select[name=year]', '2');
    await page.select('#profile select[name=section]', 'A');
  });
  await step('timetable marks a cancelled class and a moved one; the viewer does not change the saved class', async () => {
    await go(page, 'timetable.html');
    const week = await text(page, '#week');
    has(week, /Cancelled/, 'cancelled');
    has(week, /The faculty member is on leave/, 'reason');
    await page.select('#view-year', '3');
    await page.waitForFunction(() => /Moved/.test(document.getElementById('week')?.textContent ?? ''));
    has(await text(page, '#week'), /C-305/, 'moved room');
    must((await page.$eval('#profile select[name=year]', (n) => n.value)) === '2', 'saved class unchanged');
  });
  await step('notices filter by topic and by search', async () => {
    await go(page, 'notices.html');
    const all = (await page.$$('#notice-list article, #notice-list li')).length;
    await page.click('[data-cat="exams"]');
    await page.waitForFunction((n) => (document.querySelectorAll('#notice-list article, #notice-list li').length || 0) < n, {}, all);
    has(await text(page, '#notice-list'), /End-semester exam timetable published/, 'exam notice');
    must((await page.$eval('[data-cat="exams"]', (n) => n.getAttribute('aria-pressed'))) === 'true', 'pressed state');
    await page.click('[data-cat=""]');
    await page.type('#q', 'hall ticket');
    await page.waitForFunction(() => /hall ticket/i.test(document.getElementById('notice-list')?.textContent ?? ''));
  });
  await step('fees and exams page shows amounts for the fee category and days left', async () => {
    await go(page, 'fees-exams.html');
    has(await text(page, '#fees'), /Rs 42,500/, 'fee amount');
    has(await text(page, '#fees'), /14 days/, 'days left');
    has(await text(page, '#exams'), /CS201 Data Structures/, 'exam row');
    await page.select('#profile select[name=fee]', 'scholarship');
    await page.waitForFunction(() => /Rs 0\b/.test(document.getElementById('fees')?.textContent ?? ''));
    await page.select('#profile select[name=fee]', 'general');
  });
  await step('agents page: live checks pass and the graph is described', async () => {
    await go(page, 'agents.html');
    await page.waitForFunction(() => document.querySelectorAll('#checks li').length > 5);
    const rows = await page.$$eval('#checks li', (n) => n.map((x) => x.textContent ?? ''));
    must(rows.every((r) => !/^\s*(Fail|FAIL)/.test(r)), `a live check failed: ${rows.join(' | ')}`);
    must((await page.$$('#checks li.fail')).length === 0, 'fail class on a check');
    has(await text(page, 'svg desc'), /timetable_agent/, 'graph description');
    must(await page.$$eval('.origin', (n, site) => n.every((x) => x.textContent === site), SITE), 'origin filled from location');
  });
  await step('the manifest and network are readable from another origin (CORS)', async () => {
    await page.goto(`${PEER}/library_desk.network.json`);
    const ok = await page.evaluate(async (site) => {
      const m = await (await fetch(`${site}/agent-manifest.json`, { credentials: 'omit' })).json();
      const n = await (await fetch(`${site}/${m.networks[0].hocon}`, { credentials: 'omit' })).json();
      return `${m.networks[0].name}:${n.tools.length}`;
    }, SITE);
    must(ok === 'campus_desk:4', `got ${ok}`);
  });
  await ctx.close();
}

// ---------- the ask page, demo mode ----------
{
  const { ctx, page } = await fresh();
  const outbound = [];
  page.on('request', (r) => outbound.push(`${r.method()} ${r.url()}`));
  await go(page, 'ask.html');
  await step('ask page starts in demo mode and says so', async () => {
    has(await text(page, '#mode'), /Demo mode, no key/, 'mode');
    has(await text(page, '#mode-text'), /not an LLM|rule-based/i, 'honest label');
    must((await page.$$('#examples button')).length >= 6, 'example chips');
  });
  await step('an example chip sends its question and gets an answer', async () => {
    await page.click('#examples button');
    await page.waitForFunction(() => document.querySelectorAll('.msg.user').length === 1 && !document.querySelector('.msg.bot[aria-busy="true"]'), { timeout: 10000 });
    has(await page.$$eval('.msg.bot .text', (n) => n.at(-1).textContent ?? ''), /Your .*class/i, 'chip answer');
  });
  let a;
  await step('next class, in order, with the activity trail', async () => {
    a = await ask(page, 'What is my next class?');
    has(a, /Your next class is MA201 Probability and Statistics.*11:15.*C-201/s, 'answer');
    const act = (await activity(page)).join('\n');
    has(act, /timetable_agent/, 'agent in activity');
    has(act, /get_next_class/, 'action in activity');
  });
  await step('a cancelled class is reported with its reason', async () => {
    a = await ask(page, 'Is my Wednesday class on?');
    has(a, /CANCELLED.*on leave/s, 'cancelled');
  });
  await step('fee amount and late fee', async () => {
    a = await ask(page, 'When is the tuition fee due, and what is the late fee?');
    has(a, /Rs 42,500.*Mon 30 Nov 2026.*Late fee Rs 100 per day/s, 'fee');
  });
  await step('reminder: confirm card shows exact action and args, Confirm saves, and it survives a reload', async () => {
    a = await ask(page, 'Remind me to pay the tuition fee on 27 Nov', async () => {
      await page.waitForSelector('#confirm[open]', { timeout: 10000 });
      has(await text(page, '#confirm-action'), /save_reminder/, 'action name');
      has(await text(page, '#confirm-origin'), /localhost:5173/, 'origin');
      has(await text(page, '#confirm-args'), /2026-11-27/, 'args');
      await page.click('#confirm-yes');
    });
    has(a, /Saved:/, 'saved reply');
    has(await text(page, '#reminders'), /Pay the tuition fee/, 'reminder listed');
    must(!(await page.$eval('#download-ics', (n) => n.hidden)), 'calendar button shown');
    await page.reload({ waitUntil: 'networkidle0' });
    has(await text(page, '#reminders'), /Pay the tuition fee/, 'reminder kept after reload');
  });
  await step('reminder: Cancel saves nothing, and the model is told so', async () => {
    a = await ask(page, 'Remind me to collect hall tickets on 10 Dec', async () => {
      await page.waitForSelector('#confirm[open]');
      await page.click('#confirm-no');
    });
    has(a, /did not save anything/, 'declined');
    must(!/hall tickets/i.test(await text(page, '#reminders')), 'nothing saved');
  });
  await step('the other site is contacted only after consent; Deny stops it visibly', async () => {
    const before = outbound.filter((u) => u.includes(':5174')).length;
    a = await ask(page, 'Is the library open late during exams?', async () => {
      await page.waitForSelector('#consent[open]');
      has(await text(page, '#consent-origin'), /localhost:5174/, 'origin named');
      has(await text(page, '#consent-sent'), /./, 'purpose named');
      must(outbound.filter((u) => u.includes(':5174')).length === before, 'peer contacted before consent');
      await page.click('#consent-deny');
    });
    has((await activity(page)).join('\n'), /denied|not allowed|refused/i, 'denial in activity');
    must(outbound.filter((u) => u.includes(':5174')).length === before, 'peer contacted after deny');
  });
  await step('after Allow, the peer network runs here and answers from its own data', async () => {
    a = await ask(page, 'Is the library open late during exams?', async () => {
      await page.waitForSelector('#consent[open]');
      await page.click('#consent-allow');
    });
    has(a, /open until 22:00/, 'library answer');
    const act = (await activity(page)).join('\n');
    has(act, /localhost:5174/, 'peer origin in activity');
    has(act, /private|not sent|no private/i, 'private-context decision shown');
  });
  await step('declines what the site cannot do', async () => {
    a = await ask(page, 'Can you pay my fees for me?');
    has(a, /cannot do that from this site/, 'decline');
  });
  await step('Stop button is hidden at rest', async () => must(await page.$eval('#stop', (n) => n.hidden), 'stop visible at rest'));
  await step('keyboard: the first Tab stop is the skip link', async () => {
    await go(page, 'ask.html');
    await page.keyboard.press('Tab');
    must(await page.evaluate(() => document.activeElement?.classList.contains('skip')), 'skip link not first');
  });
  await ctx.close();
}

// ---------- bring your own key, with a fake router ----------
{
  const { ctx, page } = await fresh();
  const seen = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const headers = req.headers();
    seen.push({ url, auth: headers.authorization ?? '', body: req.postData() ?? '', method: req.method() });
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
      const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: 'Fake router says hello.' }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`;
      return req.respond({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: sse });
    }
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return req.continue();
    return req.abort();
  });
  await go(page, 'ask.html');
  await step('settings dialog: needs a key, rejects a non-https router, then saves', async () => {
    await page.click('#open-settings');
    await page.waitForSelector('#settings[open]');
    must((await page.$eval('#provider', (n) => n.value)) === 'gemini', 'gemini preset first');
    must((await page.$eval('#base-url', (n) => n.value)).startsWith('https://generativelanguage.googleapis.com'), 'router url prefilled');
    await page.click('#save-settings');
    has(await text(page, '#key-hint'), /Paste a key first/, 'missing key hint');
    must(await page.$eval('#settings', (n) => n.open), 'dialog stays open');
    await page.type('#api-key', FAKE_KEY);
    await page.$eval('#base-url', (n) => { n.value = 'http://router.example/v1'; });
    await page.click('#save-settings');
    has(await text(page, '#key-hint'), /https/, 'https hint');
    await page.$eval('#base-url', (n) => { n.value = 'https://generativelanguage.googleapis.com/v1beta/openai'; });
    await page.click('#save-settings');
    await page.waitForFunction(() => !document.getElementById('settings')?.open);
    has(await text(page, '#mode'), /Using your key/, 'mode changed');
    has(await text(page, '#mode-text'), /Gemini/, 'provider named');
  });
  await step('the key never appears on the page, in the activity list or in the mode text', async () => {
    const html = await page.content();
    must(!html.includes(FAKE_KEY), 'key in DOM');
  });
  await step('a question goes to the chosen router with the key, and nowhere else', async () => {
    const a = await ask(page, 'What is my next class?');
    has(a, /Fake router says hello/, 'streamed reply shown');
    const router = seen.filter((r) => r.url.includes('generativelanguage') && r.method === 'POST');
    must(router.length >= 1, 'router not called');
    must(router.every((r) => r.auth === `Bearer ${FAKE_KEY}`), 'router call without the key');
    must(router.every((r) => r.url.endsWith('/chat/completions')), 'unexpected router path');
    const others = seen.filter((r) => !r.url.includes('generativelanguage'));
    must(others.every((r) => !r.auth && !r.url.includes(FAKE_KEY) && !r.body.includes(FAKE_KEY)), 'key sent somewhere else');
    must(router.every((r) => !/student_section|student_year|fee_category|scholarship|sponsored/.test(r.body)), 'saved class reached the model request');
    must(router.every((r) => /timetable_agent/.test(r.body)), 'agent tools not offered to the model');
    has((await activity(page)).join('\n'), /router|model|Gemini|gemini/i, 'router shown in activity');
    must(!(await activity(page)).join('\n').includes(FAKE_KEY), 'key in activity');
  });
  await step('the key stays after reload; Delete stored key returns to demo mode and removes it', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    has(await text(page, '#mode'), /Using your key/, 'still byok');
    await page.click('#open-settings');
    await page.waitForSelector('#settings[open]');
    await page.click('#delete-key');
    await page.waitForFunction(() => /Demo mode/.test(document.getElementById('mode')?.textContent ?? ''));
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    must(!stored.includes('FAKE-KEY'), 'key left in storage');
  });
  await step('an unreachable router gives a readable error, not a crash', async () => {
    await page.evaluate((key) => localStorage.setItem('campus-desk:ai-profile:v1', JSON.stringify({ presetId: 'custom', baseUrl: 'http://127.0.0.1:9/v1', model: 'm', apiKey: key })), FAKE_KEY);
    await page.reload({ waitUntil: 'networkidle0' });
    const a = await ask(page, 'hello');
    has(a, /could not reach|network|CORS|Failed/i, 'error message');
    must(!a.includes(FAKE_KEY), 'key in error');
  });
  await ctx.close();
}

// ---------- accessibility and layout ----------
const PAGES = ['index.html', 'timetable.html', 'notices.html', 'fees-exams.html', 'ask.html', 'agents.html'];
async function axe(page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`);
  });
}
for (const scheme of ['light', 'dark']) {
  const { ctx, page } = await fresh();
  await page.setBypassCSP(true); // only so axe-core can be injected; CSP is exercised in the other runs
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  for (const p of PAGES) {
    await step(`axe-core, ${scheme} theme: ${p} has no violations`, async () => {
      await go(page, p);
      if (p === 'agents.html') await page.waitForFunction(() => document.querySelectorAll('#checks li').length > 5);
      const v = await axe(page);
      must(v.length === 0, v.join(' | '));
    });
  }
  if (scheme === 'light') {
    for (const dlg of ['settings', 'consent', 'confirm']) {
      await step(`axe-core: the ${dlg} dialog open has no violations`, async () => {
        await go(page, 'ask.html');
        await page.evaluate((id) => document.getElementById(id).showModal(), dlg);
        const v = await axe(page);
        must(v.length === 0, v.join(' | '));
      });
    }
  }
  await ctx.close();
}
{
  const { ctx, page } = await fresh({ width: 375, height: 800 });
  for (const p of PAGES) {
    await step(`phone width 375: ${p} has no sideways scroll`, async () => {
      await go(page, p);
      const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      must(w[0] <= w[1] + 1, `scrollWidth ${w[0]} > ${w[1]}`);
    });
  }
  await ctx.close();
}
{
  const { ctx, page } = await fresh();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await step('reduced motion: no running animations on the home page', async () => {
    await go(page, 'index.html');
    const n = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    must(n === 0, `${n} animations running`);
  });
  await ctx.close();
}

await step('no uncaught errors or console errors in any run', async () => must(problems.length === 0, problems.slice(0, 3).join(' | ')));

console.log(results.join('\n'));
console.log(`\n${results.length - failures} of ${results.length} end-to-end checks passed.`);
await browser.close();
for (const s of servers) s.close();
process.exit(failures ? 1 : 0);
