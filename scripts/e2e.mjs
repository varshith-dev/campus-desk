// End-to-end run in a real Chrome against the built app (next start, a throwaway database) and the sample library site.
// Needs: npm run build:site && npm run build:peer. Uses /usr/bin/google-chrome (set CHROME to change it).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { McpClient } from '../src/runtime/mcp.ts';
import { activity, ask, choose, clickText, go, PEER, root, SITE, sleep, startStack, text } from './e2e-lib.mjs';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
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
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const has = (t, re, what) => must(re.test(t), `${what}: expected ${re}, got "${t.slice(0, 200)}"`);

const stack = await startStack();
const { browser } = stack;
const problems = [];

async function fresh(opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: opts.width ?? 1280, height: opts.height ?? 900 });
  if (opts.reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/.test(t)) problems.push(`console.error ${t}`);
  });
  return { ctx, page };
}
const jget = async (path, init) => {
  const res = await fetch(SITE + path, init);
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
};

try {
  // ---------- pages ----------
  {
    const { ctx, page } = await fresh();
    await step('home shows the next class, today, the next fee and a ruled-paper layout', async () => {
      await go(page, '');
      await page.waitForSelector('h1');
      const body = await text(page, 'main');
      has(body, /Probability and Statistics/, 'next class');
      has(body, /11:15/, 'time');
      has(body, /Data Structures/, 'today list');
      has(body, /End-semester exam fee/, 'next fee');
      has(await text(page, 'body'), /SAMPLE DATA|Sample data/i, 'sample banner');
    });
    await step('security headers: nonce CSP on pages, nosniff and no framing', async () => {
      const r = await fetch(SITE + '/');
      const csp = r.headers.get('content-security-policy') ?? '';
      has(csp, /script-src 'self' 'nonce-/, 'nonce');
      must(!/unsafe-eval|unsafe-inline.*script-src/.test(csp.split(';').find((d) => d.includes('script-src')) ?? ''), 'unsafe script');
      has(csp, /frame-ancestors 'none'/, 'framing');
      must(r.headers.get('x-content-type-options') === 'nosniff', 'nosniff');
    });
    await step('changing the saved class changes the page, is saved on the server and survives a reload', async () => {
      await go(page, '');
      await choose(page, '#p-section', /Section B/);
      await choose(page, '#p-year', /Year 3/);
      await page.waitForFunction(() => /Database Systems/.test(document.querySelector('main')?.textContent ?? ''), { timeout: 10000 });
      const s = await jget('/api/session', { headers: { cookie: (await page.cookies()).map((c) => `${c.name}=${c.value}`).join('; ') } });
      must(s.body.student.profile.year === 3 && s.body.student.profile.section === 'B', 'profile not saved on the server');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => /Database Systems/.test(document.querySelector('main')?.textContent ?? ''));
      await choose(page, '#p-year', /Year 2/);
      await choose(page, '#p-section', /Section A/);
      await page.waitForFunction(() => /Data Structures/.test(document.querySelector('main')?.textContent ?? ''));
    });
    await step('timetable shows a cancelled class with its reason', async () => {
      await go(page, 'timetable');
      await page.waitForSelector('main h1');
      const t = await text(page, 'main');
      has(t, /Cancelled|CANCELLED/, 'cancelled');
      has(t, /on leave/i, 'reason');
    });
    await step('notices filter by topic and search', async () => {
      await go(page, 'notices');
      await page.waitForSelector('main article, main li');
      await clickText(page, /^Exams$/i, 'main');
      await page.waitForFunction(() => /End-semester exam timetable published/.test(document.body.textContent ?? ''));
      await clickText(page, /^All$/i, 'main');
      await page.type('input[type=search], input[name=q], main input', 'hall ticket');
      await page.waitForFunction(() => /hall ticket/i.test(document.querySelector('main')?.textContent ?? ''));
    });
    await step('fees and exams show the amount for the fee category and exam rows', async () => {
      await go(page, 'fees-exams');
      await page.waitForSelector('main h1');
      const t = await text(page, 'main');
      has(t, /Rs 42,500/, 'fee amount');
      has(t, /Data Structures/, 'exam row');
      await choose(page, '#p-fee', /scholarship/i);
      await page.waitForFunction(() => /Rs 0(?![\d,])/.test(document.querySelector('main')?.textContent ?? ''), { timeout: 10000 });
      await choose(page, '#p-fee', /general/i);
    });
    await step('agents page: the published runtime runs the live checks and all pass', async () => {
      await go(page, 'agents');
      await page.waitForFunction(() => document.querySelectorAll('[data-testid=checks] li').length > 5, { timeout: 20000 });
      const rows = await page.$$eval('[data-testid=checks] li', (n) => n.map((x) => `${x.getAttribute('data-status')}|${x.textContent}`));
      must(rows.every((r) => /^(pass|warn)\|/.test(r)), `a live check failed: ${rows.filter((r) => !/^(pass|warn)\|/.test(r)).join(' | ')}`);
      must(rows.filter((r) => r.startsWith('pass|')).length >= 8, 'too few passing checks');
      has(await page.$eval('svg[role=img]', (n) => n.getAttribute('aria-label') ?? ''), /timetable_agent/, 'graph label');
    });
    await step('404 page is on brand and links home', async () => {
      const r = await page.goto(`${SITE}/no-such-page`, { waitUntil: 'domcontentloaded' });
      must(r.status() === 404, `status ${r.status()}`);
      has(await text(page, 'body'), /Campus Desk/, 'brand');
    });
    await ctx.close();
  }

  // ---------- published agentic artifacts ----------
  {
    await step('manifest, network, links and agent-mcp are served with CORS and the right content type', async () => {
      for (const f of ['agent-manifest.json', 'campus_desk.network.json', 'links.json', 'agent-mcp.json', 'runtime/agentic-runtime.js', '.well-known/campus-desk-keys.json']) {
        const r = await fetch(`${SITE}/${f}`, { headers: { Origin: 'https://other.example' } });
        must(r.status === 200, `${f} ${r.status}`);
        must(r.headers.get('access-control-allow-origin') === '*', `${f} has no CORS header`);
      }
      const m = await (await fetch(`${SITE}/agent-manifest.json`)).json();
      must(m.networks[0].name === 'campus_desk', 'network name');
      must(m.deployment?.mode === 'server', 'deployment mode');
    });
    await step('the terminal checker passes against the running site (npm run check:live)', async () => {
      const r = spawnSync(process.execPath, ['--import', 'tsx', 'tools/agentic-check.ts', `${SITE}/`], { cwd: root, encoding: 'utf8' });
      must(r.status === 0, `exit ${r.status}: ${(r.stdout + r.stderr).split('\n').filter((l) => /FAIL/.test(l)).join(' | ')}`);
      has(r.stdout, /14 passed, 0 failed/, 'summary');
    });
    await step('the health endpoint reports the seeded notices', async () => {
      const h = await jget('/api/health');
      must(h.body.ok && h.body.notices > 5, JSON.stringify(h.body));
    });
  }

  // ---------- ask page, demo mode ----------
  {
    const { ctx, page } = await fresh();
    const outbound = [];
    page.on('request', (r) => outbound.push(`${r.method()} ${r.url()}`));
    await go(page, 'ask');
    await step('ask page starts in demo mode and says so', async () => {
      await page.waitForFunction(() => /Demo mode, no key/.test(document.body.textContent ?? ''), { timeout: 20000 });
      has(await text(page, 'main'), /rule-based/i, 'honest label');
    });
    await step('an example chip sends its question and gets an answer', async () => {
      await page.waitForFunction(() => { const t = document.querySelector('#msg'); return t && !t.disabled; }, { timeout: 20000 });
      await clickText(page, /What classes do I have today\?/, 'main');
      await page.waitForFunction(() => document.querySelectorAll('[role=log] p.whitespace-pre-wrap').length >= 2 && !document.querySelector('[aria-label="Thinking"]'), { timeout: 15000 });
      has(await page.$$eval('[role=log] p.whitespace-pre-wrap', (n) => n.at(-1).textContent ?? ''), /Classes for today.*your class/s, 'chip answer');
    });
    let a;
    await step('next class, in order, with the activity trail', async () => {
      a = await ask(page, 'What is my next class?');
      has(a, /MA201 Probability and Statistics.*11:15.*C-201/s, 'answer');
      const act = (await activity(page)).join('\n');
      has(act, /timetable_agent/, 'agent in activity');
      has(act, /get_next_class/, 'action in activity');
    });
    await step('a cancelled class is reported with its reason', async () => {
      a = await ask(page, 'Is my Wednesday class on?');
      has(a, /CANCELLED.*on leave/is, 'cancelled');
    });
    await step('fee amount and late fee', async () => {
      a = await ask(page, 'When is the tuition fee due, and what is the late fee?');
      has(a, /Rs 42,500.*Mon 30 Nov 2026.*Late fee Rs 100 per day/s, 'fee');
    });
    await step('reminder: the confirm card shows the exact action, Confirm saves it on the server and it survives a reload', async () => {
      await page.type('#msg', 'Remind me to pay the tuition fee on 27 Nov');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid=confirm-card]', { timeout: 15000 });
      const card = await text(page, '[data-testid=confirm-card]');
      has(card, /save_reminder/, 'action name');
      has(card, /localhost:5173/, 'origin');
      has(card, /2026-11-27/, 'args');
      await clickText(page, /Confirm and save/, '[data-testid=confirm-card]');
      await page.waitForFunction(() => !document.querySelector('[data-testid=confirm-card]') && !document.querySelector('button[aria-label="Stop"]'), { timeout: 15000 });
      has(await page.$$eval('[role=log] p.whitespace-pre-wrap', (n) => n.at(-1).textContent ?? ''), /Saved/, 'saved reply');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => /Pay the tuition fee/.test(document.querySelector('[aria-label="Your reminders"]')?.textContent ?? ''), { timeout: 15000 });
    });
    await step('reminder: Do not save saves nothing, and the model is told so', async () => {
      await page.waitForFunction(() => { const t = document.querySelector('#msg'); return t && !t.disabled; }, { timeout: 20000 });
      await page.type('#msg', 'Remind me to collect hall tickets on 10 Dec');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid=confirm-card]', { timeout: 15000 });
      await clickText(page, /Do not save/, '[data-testid=confirm-card]');
      await page.waitForFunction(() => !document.querySelector('[data-testid=confirm-card]') && !document.querySelector('button[aria-label="Stop"]'), { timeout: 15000 });
      has(await page.$$eval('[role=log] p.whitespace-pre-wrap', (n) => n.at(-1).textContent ?? ''), /did not save anything/i, 'declined');
      must(!/hall tickets/i.test(await text(page, '[aria-label="Your reminders"]')), 'nothing saved');
    });
    await step('the other site is contacted only after consent; Deny stops it visibly', async () => {
      const before = outbound.filter((u) => u.includes(':5174')).length;
      await page.type('#msg', 'Is the library open late during exams?');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid=consent-card]', { timeout: 15000 });
      const card = await text(page, '[data-testid=consent-card]');
      has(card, /localhost:5174/, 'origin named');
      has(card, /never gets/i, 'what it never gets');
      must(outbound.filter((u) => u.includes(':5174')).length === before, 'peer contacted before consent');
      await clickText(page, /^Deny$/, '[data-testid=consent-card]');
      await page.waitForFunction(() => !document.querySelector('button[aria-label="Stop"]'), { timeout: 15000 });
      has((await activity(page)).join('\n'), /denied|not allowed|refused|declined/i, 'denial in activity');
      must(outbound.filter((u) => u.includes(':5174')).length === before, 'peer contacted after deny');
    });
    await step('after Allow once, the peer network runs here and answers from its own data', async () => {
      await page.type('#msg', 'Is the library open late during exams?');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid=consent-card]', { timeout: 15000 });
      await clickText(page, /^Allow once$/, '[data-testid=consent-card]');
      await page.waitForFunction(() => !document.querySelector('[aria-label="Thinking"]') && !document.querySelector('button[aria-label="Stop"]'), { timeout: 20000 });
      has(await page.$$eval('[role=log] p.whitespace-pre-wrap', (n) => n.at(-1).textContent ?? ''), /open until 22:00/, 'library answer');
      const act = (await activity(page)).join('\n');
      has(act, /localhost:5174/, 'peer origin in activity');
    });
    await step('the consent choices and tool calls are on the signed tape, and the chain verifies', async () => {
      const cookie = (await page.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
      const v = await jget('/api/ledger/verify', { headers: { cookie } });
      must(v.body.report.ok && v.body.report.entries >= 6, JSON.stringify(v.body));
      const l = await jget('/api/ledger?limit=100', { headers: { cookie } });
      const types = l.body.entries.map((e) => `${e.payload.type}:${e.payload.decision}`);
      must(types.some((t) => t === 'consent:denied') && types.some((t) => t.startsWith('consent:allowed')), `consent entries missing: ${types.join(',')}`);
      const raw = JSON.stringify(l.body);
      must(!/scholarship|"section":"A"|"year":2/.test(raw), 'private context value in the ledger');
    });
    await step('declines what the site cannot do', async () => {
      await page.waitForFunction(() => { const t = document.querySelector('#msg'); return t && !t.disabled; });
      a = await ask(page, 'Can you pay my fees for me?');
      has(a, /cannot do that from this site/, 'decline');
    });
    await step('keyboard: the first Tab stop is the skip link', async () => {
      await go(page, 'ask');
      await page.keyboard.press('Tab');
      must(await page.evaluate(() => /skip/i.test(document.activeElement?.textContent ?? '')), 'skip link not first');
    });
    await ctx.close();
  }

  // ---------- bring your own key, against a fake router ----------
  {
    const { ctx, page } = await fresh();
    const seen = [];
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      seen.push({ url, auth: req.headers().authorization ?? '', body: req.postData() ?? '', method: req.method() });
      if (url.startsWith('https://generativelanguage.googleapis.com/')) {
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
        if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
        const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: 'Fake router says hello.' }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`;
        return req.respond({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: sse });
      }
      if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return req.continue();
      return req.abort();
    });
    await go(page, 'ask');
    await step('settings: needs a key, rejects a non-https router, then saves', async () => {
      await page.waitForFunction(() => /Demo mode/.test(document.body.textContent ?? ''), { timeout: 20000 });
      await clickText(page, /AI settings/, 'main');
      await page.waitForSelector('[data-testid=settings]');
      has(await text(page, '#provider'), /Gemini/, 'gemini preset first');
      must((await page.$eval('#base-url', (n) => n.value)).startsWith('https://generativelanguage.googleapis.com'), 'router url prefilled');
      await clickText(page, /^Save$/, '[data-testid=settings]');
      has(await text(page, '#key-hint'), /key/i, 'missing key hint');
      must(!!(await page.$('[data-testid=settings]')), 'dialog stays open');
      await page.type('#api-key', FAKE_KEY);
      await page.$eval('#base-url', (n) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(n, 'http://router.example/v1'); n.dispatchEvent(new Event('input', { bubbles: true })); });
      await clickText(page, /^Save$/, '[data-testid=settings]');
      has(await text(page, '#key-hint'), /https/, 'https hint');
      await page.$eval('#base-url', (n) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(n, 'https://generativelanguage.googleapis.com/v1beta/openai'); n.dispatchEvent(new Event('input', { bubbles: true })); });
      await clickText(page, /^Save$/, '[data-testid=settings]');
      await page.waitForFunction(() => !document.querySelector('[data-testid=settings]'));
      await page.waitForFunction(() => /Using your key/.test(document.body.textContent ?? ''));
    });
    await step('the key never appears in the page text', async () => {
      must(!(await page.content()).includes(FAKE_KEY), 'key in DOM');
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
      must(router.every((r) => !/scholarship|sponsored|fee_category|"section"\s*:\s*"A"/.test(r.body)), 'saved class reached the model request');
      must(router.every((r) => /timetable_agent/.test(r.body)), 'agent tools not offered to the model');
      must(!(await activity(page)).join('\n').includes(FAKE_KEY), 'key in activity');
    });
    await step('the key stays after reload, and Delete key returns to demo mode and removes it', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => /Using your key/.test(document.body.textContent ?? ''), { timeout: 20000 });
      await clickText(page, /AI settings/, 'main');
      await clickText(page, /Delete key/, '[data-testid=settings]');
      await page.waitForFunction(() => /Demo mode/.test(document.body.textContent ?? ''));
      must(!(await page.evaluate(() => JSON.stringify({ ...localStorage }))).includes('FAKE-KEY'), 'key left in storage');
    });
    await step('an unreachable router gives a readable error with a retry button, not a crash', async () => {
      await page.evaluate((key) => localStorage.setItem('campus-desk:ai-profile:v1', JSON.stringify({ presetId: 'custom', baseUrl: 'http://127.0.0.1:9/v1', model: 'm', apiKey: key })), FAKE_KEY);
      await page.reload({ waitUntil: 'domcontentloaded' });
      const a = await ask(page, 'hello');
      has(a, /could not reach|network|CORS|Failed|fetch/i, 'error message');
      must(!a.includes(FAKE_KEY), 'key in error');
      must(!!(await page.$$eval('button', (b) => b.find((x) => /Try again/.test(x.textContent ?? '')) ? 1 : 0)), 'retry button');
    });
    await ctx.close();
  }

  // ---------- the hand-off: an outside site asks, the student decides, every call is a receipt ----------
  {
    const { ctx, page } = await fresh();
    const cookie = async () => (await page.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    await go(page, 'activity');
    await page.waitForFunction(() => /^EB-/.test(document.querySelector('[data-testid=pairing-code]')?.textContent ?? ''), { timeout: 15000 });
    const code = (await text(page, '[data-testid=pairing-code]')).trim();
    await step('the Activity page shows a pairing code, an empty tape and a live stream', async () => {
      must(/^EB-[A-Z0-9]{6}$/.test(code), `code ${code}`);
      has(await text(page, 'main'), /tape is empty/i, 'empty state');
      has(await text(page, 'main'), /Live/, 'live indicator');
    });
    await step('a wrong code is refused and a call without a token is refused', async () => {
      const bad = await jget('/api/agent/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ desk_code: 'EB-ZZZZZZ', agent_name: 'X agent', origin: PEER, scopes: ['exams:read'], reason: 'Testing a wrong code' }) });
      must(bad.status === 404, `wrong code ${bad.status}`);
      const noTok = await jget('/api/agent/tools/get_exam_dates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      must(noTok.status === 401, `no token ${noTok.status}`);
    });

    // The real sample peer page does the asking.
    const peerCtx = await browser.createBrowserContext();
    const peerPage = await peerCtx.newPage();
    peerPage.on('pageerror', (e) => problems.push(`peer pageerror ${e.message}`));
    peerPage.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`peer console.error ${m.text()}`); });
    await peerPage.goto(`${PEER}/study-planner.html`, { waitUntil: 'domcontentloaded' });
    await step('the library study planner (another origin) asks Campus Desk, and nothing is shared until the student approves', async () => {
      await peerPage.type('#code', code);
      await peerPage.click('#go');
      await page.waitForSelector('[data-testid=request]', { timeout: 15000 });
      const req = await text(page, '[data-testid=request]');
      has(req, /Library study planner/, 'agent name');
      has(req, /localhost:5174/, 'origin');
      has(req, /exams:read/, 'scope');
      must(await peerPage.$eval('#result', (n) => n.hidden), 'result shown before approval');
      has(await text(peerPage, '#log'), /Waiting for you/, 'waiting message');
    });
    await step('approving gives the planner exam dates only, and it suggests library days', async () => {
      await clickText(page, /^Approve$/, '[data-testid=request]');
      await peerPage.waitForFunction(() => !document.getElementById('result').hidden, { timeout: 20000 });
      const plans = await text(peerPage, '#plans');
      has(plans, /CS201 Data Structures/, 'exam named');
      has(plans, /open until/, 'library hours used');
      must(!/section|scholarship|fee category/i.test(plans + (await text(peerPage, '#log'))), 'private context on the planner page');
    });
    await step('the tape shows request, grant and the read as signed receipts, and the chain verifies', async () => {
      await page.waitForFunction(() => /get_exam_dates/.test(document.querySelector('[data-testid=tape]')?.textContent ?? ''), { timeout: 15000 });
      const tape = await text(page, '[data-testid=tape]');
      has(tape, /Library study planner/, 'caller');
      await clickText(page, /Verify the whole chain/, 'main');
      await page.waitForFunction(() => /Chain intact|verified|intact/i.test(document.querySelector('main')?.textContent ?? ''), { timeout: 10000 });
    });
    await step('Active access lists the grant with its scope and an End access button', async () => {
      const g = await text(page, '[data-testid=grants]');
      has(g, /Library study planner/, 'agent');
      has(g, /exams:read/, 'scope');
      must(!/timetable:read/.test(g), 'scope that was not granted');
    });

    // A second, terminal-style agent with a token: scope, pending write, revoke.
    const api = async (path, body, token) => jget(path, { method: 'POST', headers: { 'content-type': 'application/json', Origin: PEER, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const rq = await api('/api/agent/requests', { desk_code: code, agent_name: 'Terminal agent', origin: PEER, scopes: ['timetable:read', 'reminders:propose', 'fees:read'], reason: 'Checking the scoped hand-off from a test' });
    let token;
    await step('the student can approve fewer scopes than asked for; the agent collects the token once', async () => {
      must(rq.status === 202, `request ${rq.status}`);
      await page.waitForFunction(() => document.querySelectorAll('[data-testid=request]').length === 1, { timeout: 15000 });
      await page.$$eval('[data-testid=request] input[type=checkbox]', (boxes) => boxes.filter((b) => /fees:read/.test(b.parentElement.textContent)).forEach((b) => b.click()));
      await clickText(page, /^Approve$/, '[data-testid=request]');
      await page.waitForFunction(() => document.querySelectorAll('[data-testid=request]').length === 0, { timeout: 10000 });
      const poll = () => jget(`/api/agent/requests/${rq.body.request_id}`, { headers: { authorization: `Bearer ${rq.body.poll_secret}` } });
      const first = await poll();
      token = first.body.token;
      must(/^cdg1\./.test(token ?? ''), 'no token');
      must(first.body.grant.scopes.join() === 'timetable:read,reminders:propose', `scopes ${first.body.grant.scopes}`);
      must(!(await poll()).body.token, 'token handed out twice');
    });
    await step('the granted tool works; an ungranted one, a wrong origin and a forged token are refused', async () => {
      const ok = await api('/api/agent/tools/get_timetable', { args: { day: 'friday' } }, token);
      must(ok.status === 200 && ok.body.result.classes.length >= 3, JSON.stringify(ok.body).slice(0, 200));
      must(ok.body.receipt?.sig && ok.body.receipt?.hash, 'no receipt');
      const fee = await api('/api/agent/tools/get_fee_dates', { args: {} }, token);
      must(fee.status === 403, `fees ${fee.status}`);
      const wrong = await jget('/api/agent/tools/get_timetable', { method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://evil.example', authorization: `Bearer ${token}` }, body: '{}' });
      must(wrong.status === 403, `wrong origin ${wrong.status}`);
      const forged = await api('/api/agent/tools/get_timetable', {}, token.slice(0, -4) + 'AAAA');
      must(forged.status === 401, `forged ${forged.status}`);
    });
    await step('the same tools work over MCP (tools/list, tools/call) with the same grant', async () => {
      const rpc = (method, params) => api('/api/mcp', { jsonrpc: '2.0', id: 1, method, params }, token);
      const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
      must(init.body.result?.serverInfo, 'initialize');
      const list = await rpc('tools/list', {});
      const names = list.body.result.tools.map((t) => t.name);
      must(names.includes('get_timetable') && names.includes('save_reminder'), names.join());
      const call = await rpc('tools/call', { name: 'get_next_class', arguments: {} });
      must(!call.body.result.isError, JSON.stringify(call.body).slice(0, 200));
      const denied = await rpc('tools/call', { name: 'get_fee_dates', arguments: {} });
      must(denied.body.result?.isError || denied.body.error, 'ungranted tool allowed over MCP');
    });
    await step('the runtime\'s own MCP client lists and calls the tools with the grant', async () => {
      const authed = (url, init) => fetch(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}`, origin: PEER } });
      const client = new McpClient(`${SITE}/api/mcp`, authed);
      const tools = await client.listTools();
      must(tools.some((t) => t.name === 'get_next_class'), `tools: ${tools.map((t) => t.name).join()}`);
      const out = await client.callTool('get_next_class', {});
      has(out, /Probability and Statistics|MA201/, 'tool text');
    });
    await step('an outside write stays pending until the student confirms it on the Reminders page', async () => {
      const w = await api('/api/agent/tools/save_reminder', { args: { title: 'Revise Operating Systems', date: '2026-12-01', time: '18:00' } }, token);
      must(w.status === 200 && w.body.result.pending === true, JSON.stringify(w.body).slice(0, 200));
      const before = await jget('/api/reminders', { headers: { cookie: await cookie() } });
      must(!before.body.saved.some((r) => /Revise Operating/.test(r.title)), 'saved without a yes');
      await go(page, 'reminders');
      await page.waitForSelector('[data-testid=pending]');
      has(await text(page, '[data-testid=pending]'), /Revise Operating Systems.*Terminal agent/s, 'source named');
      await clickText(page, /^Confirm$/, '[data-testid=pending]');
      await page.waitForFunction(() => !document.querySelector('[data-testid=pending]') && /Revise Operating Systems/.test(document.querySelector('main')?.textContent ?? ''), { timeout: 10000 });
      const after = await jget('/api/reminders', { headers: { cookie: await cookie() } });
      must(after.body.saved.some((r) => /Revise Operating/.test(r.title)), 'not saved after confirm');
    });
    await step('ending access stops the token at once, and the denial is on the tape', async () => {
      await go(page, 'activity');
      await page.waitForSelector('[data-testid=grants] li');
      await page.$$eval('[data-testid=grants] li', (lis) => lis.find((l) => /Terminal agent/.test(l.textContent))?.querySelector('button')?.click());
      await page.waitForFunction(() => !/Terminal agent/.test(document.querySelector('[data-testid=grants]')?.textContent ?? ''), { timeout: 10000 });
      const r = await api('/api/agent/tools/get_timetable', {}, token);
      must(r.status === 401 && /ended|revoked/i.test(JSON.stringify(r.body)), `after revoke ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
      await page.waitForFunction(() => /refused|denied/i.test(document.querySelector('[data-testid=tape]')?.textContent ?? ''), { timeout: 10000 });
    });
    await step('a receipt copied from the tape verifies on the public page, and an edited one does not', async () => {
      const l = await jget('/api/ledger?limit=5', { headers: { cookie: await cookie() } });
      const receipt = l.body.entries[0];
      await go(page, 'verify');
      const verify = async (obj) => {
        await page.$eval('#receipt', (n) => { n.value = ''; });
        await page.click('#receipt');
        await page.evaluate((t) => { const n = document.querySelector('#receipt'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, t); n.dispatchEvent(new Event('input', { bubbles: true })); }, JSON.stringify(obj));
        await clickText(page, /^Verify$/, 'main');
        await page.waitForSelector('[data-testid=verify-result]');
        return page.$eval('[data-testid=verify-result]', (n) => n.getAttribute('data-ok'));
      };
      must((await verify(receipt)) === 'true', 'real receipt failed');
      const forged = structuredClone(receipt);
      forged.payload.decision = forged.payload.decision === 'allowed' ? 'denied' : 'allowed';
      await page.reload({ waitUntil: 'domcontentloaded' });
      must((await verify(forged)) === 'false', 'edited receipt passed');
    });
    await peerCtx.close();
    await ctx.close();
  }

  // ---------- sign-in and sign-up ----------
  {
    const { ctx, page } = await fresh();
    await step('a guest reminder moves into the account when the demo student signs in', async () => {
      await go(page, 'reminders');
      await page.waitForSelector('#r-title');
      await page.type('#r-title', 'Guest reminder');
      await page.$eval('#r-date', (n) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(n, '2026-12-05'); n.dispatchEvent(new Event('input', { bubbles: true })); });
      await clickText(page, /Save reminder|Add reminder|^Save$/, 'form[aria-label="Add a reminder"]');
      await page.waitForFunction(() => /Guest reminder/.test(document.querySelector('main')?.textContent ?? ''), { timeout: 10000 });
      await go(page, 'sign-in');
      await clickText(page, /Fill it in/, 'main');
      await page.$$eval('button[type=submit]', (b) => b.find((x) => /^Sign in$/.test(x.textContent.trim()))?.click());
      await page.waitForFunction(() => location.pathname !== '/sign-in', { timeout: 15000 });
      await go(page, 'reminders');
      await page.waitForFunction(() => /Guest reminder/.test(document.querySelector('main')?.textContent ?? ''), { timeout: 10000 });
      has(await text(page, 'header'), /Ananya/, 'name in header');
    });
    await step('a wrong passphrase shows one plain message and no session', async () => {
      const { ctx: c2, page: p2 } = await fresh();
      await go(p2, 'sign-in');
      await p2.type('#si-email', 'ananya@eastbrook.example');
      await p2.type('#si-pw', 'not the passphrase');
      await p2.$$eval('button[type=submit]', (b) => b.find((x) => /^Sign in$/.test(x.textContent.trim()))?.click());
      await p2.waitForFunction(() => /do not match/i.test(document.body.textContent ?? ''), { timeout: 10000 });
      await c2.close();
    });
    await step('creating an account signs the student in; sign-out ends the session', async () => {
      const { ctx: c3, page: p3 } = await fresh();
      await go(p3, 'sign-in');
      await clickText(p3, /^Create account$/, 'main');
      await p3.waitForSelector('#su-name');
      await p3.type('#su-name', 'Test Student');
      await p3.type('#su-email', `test${Date.now()}@eastbrook.example`);
      await p3.type('#su-pw', 'a long test passphrase');
      await p3.$$eval('button[type=submit]', (b) => b.find((x) => /Create account/.test(x.textContent.trim()))?.click());
      await p3.waitForFunction(() => location.pathname !== '/sign-in', { timeout: 15000 });
      const cookie = (await p3.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
      must((await jget('/api/session', { headers: { cookie } })).body.student.kind === 'account', 'not an account');
      const out = await fetch(`${SITE}/api/auth/sign-out`, { method: 'POST', headers: { cookie } });
      must(out.ok, 'sign-out');
      must((await jget('/api/session', { headers: { cookie } })).body.student.kind === 'guest', 'still signed in');
      await c3.close();
    });
    await step('a short passphrase is refused by the server', async () => {
      const r = await jget('/api/auth/sign-up', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Short', email: 'short@eastbrook.example', password: 'short', year: 2, section: 'A', feeCategory: 'general' }) });
      must(r.status === 400, `status ${r.status}`);
    });
    await ctx.close();
  }

  // ---------- accessibility, layout and motion ----------
  const PAGES = ['', 'timetable', 'notices', 'fees-exams', 'ask', 'reminders', 'activity', 'agents', 'sign-in', 'verify'];
  async function axe(page) {
    await page.evaluate(axeSource);
    return page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] });
      return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join('; ')}`);
    });
  }
  {
    const { ctx, page } = await fresh();
    for (const theme of ['light', 'dark']) {
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
      await step(`axe: no WCAG 2.1 AA violations on any page (${theme})`, async () => {
        const bad = [];
        for (const p of PAGES) {
          await go(page, p);
          await page.waitForSelector('main h1');
          must((await page.evaluate(() => document.documentElement.classList.contains('dark'))) === (theme === 'dark'), `theme ${theme} not applied`);
          if (p === 'agents') await page.waitForFunction(() => document.querySelectorAll('[data-testid=checks] li').length > 5, { timeout: 20000 });
          if (p === 'ask') await page.waitForFunction(() => { const t = document.querySelector('#msg'); return t && !t.disabled; }, { timeout: 20000 });
          await sleep(900);
          const v = await axe(page);
          if (v.length) bad.push(`/${p}: ${v.join(' | ')}`);
        }
        must(!bad.length, bad.join('\n          '));
      });
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh();
    await step('no page has a repeated id or a repeated test id', async () => {
      const bad = [];
      for (const p of PAGES) {
        await go(page, p);
        await page.waitForSelector('main h1');
        await sleep(800);
        const dup = await page.evaluate(() => {
          const seen = new Map();
          for (const n of document.querySelectorAll('[id], [data-testid]')) {
            for (const k of ['id', 'data-testid']) { const v = n.getAttribute(k); if (v) seen.set(`${k}=${v}`, (seen.get(`${k}=${v}`) ?? 0) + 1); }
          }
          return [...seen].filter(([, c]) => c > 1).map(([k]) => k);
        });
        if (dup.length) bad.push(`/${p}: ${dup.join(', ')}`);
      }
      must(!bad.length, bad.join('; '));
    });
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh({ width: 390, height: 800 });
    await step('phone width (390px): no sideways scroll on any page, bottom bar present, tap targets are big enough', async () => {
      const bad = [];
      for (const p of PAGES) {
        await go(page, p);
        await page.waitForSelector('main h1');
        await sleep(700);
        const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        if (w.sw > w.cw + 1) bad.push(`/${p} scrolls sideways (${w.sw} > ${w.cw})`);
      }
      must(!bad.length, bad.join('; '));
      await go(page, '');
      must(!!(await page.$('nav[aria-label*="Main" i][class*="fixed"], nav.fixed, nav[class*="bottom"]')), 'bottom bar');
      const small = await page.$$eval('nav a, nav button', (n) => n.filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && (r.height < 40 || r.width < 40); }).map((x) => x.textContent.trim()));
      must(!small.length, `small tap targets: ${small.join(', ')}`);
    });
    await step('phone: the Ask page shows one panel at a time and the tabs switch between chat and what ran', async () => {
      await go(page, 'ask');
      await page.waitForFunction(() => { const t = document.querySelector('#msg'); return t && !t.disabled; }, { timeout: 20000 });
      const a = await ask(page, 'What is my next class?');
      has(a, /Probability and Statistics/, 'answer');
      must(!(await page.$eval('[aria-label="Messages"]', (n) => n.offsetParent === null)), 'chat hidden');
      await clickText(page, /^What ran/, '[role=tablist]');
      await page.waitForFunction(() => document.querySelector('[data-testid=activity]')?.offsetParent !== null, { timeout: 5000 });
      has((await activity(page)).join(' '), /get_next_class/, 'activity visible');
    });
    await step('phone: the More sheet opens and reaches Activity', async () => {
      await go(page, '');
      await clickText(page, /^More$/, 'nav.fixed');
      await sleep(700);
      await clickText(page, /Agent activity/i, '[role=dialog]');
      await page.waitForFunction(() => location.pathname === '/activity', { timeout: 10000 });
    });
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh({ reducedMotion: true });
    await step('reduced motion: pages render fully and the chat still works', async () => {
      await go(page, 'ask');
      const a = await ask(page, 'What is my next class?');
      has(a, /Probability and Statistics/, 'answer');
      const dur = await page.evaluate(() => getComputedStyle(document.querySelector('main')).animationDuration);
      must(parseFloat(dur) < 0.01 || dur === 'normal', `animation ${dur}`);
    });
    await ctx.close();
  }
  await step('no page errors or console errors were raised during the whole run', async () => {
    must(!problems.length, problems.slice(0, 4).join(' | '));
  });
} finally {
  await stack.stop();
}

console.log(results.join('\n'));
console.log(`\n${results.length - failures} of ${results.length} checks passed.`);
process.exit(failures ? 1 : 0);
