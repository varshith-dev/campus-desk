// Shared by e2e.mjs and screenshots.mjs: starts Campus Desk (next start, with a throwaway database) and the sample library site.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';

export const root = join(import.meta.dirname, '..');
export const SITE = 'http://localhost:5173';
export const PEER = 'http://localhost:5174';

export async function startStack() {
  const dir = mkdtempSync(join(tmpdir(), 'campus-desk-e2e-'));
  const proc = spawn(join(root, 'node_modules/.bin/next'), ['start', '-p', '5173'], { cwd: root, env: { ...process.env, DATABASE_URL: `file:${dir}/e2e.db`, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${SITE}/api/health`)).ok) break;
    } catch {
      // not up yet
    }
    if (i === 59) throw new Error(`Campus Desk did not start (is it built? run npm run build:site).\n${log}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  const peer = await startServer(join(root, 'dist-peer'), 5174);
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  return {
    browser,
    async stop() {
      await browser.close();
      peer.close();
      proc.kill('SIGTERM');
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const text = (page, sel) => page.$eval(sel, (n) => n.textContent ?? '');
export const go = (page, path) => page.goto(`${SITE}/${path}`, { waitUntil: 'domcontentloaded' });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click a button, link or tab by its visible text. */
export async function clickText(page, re, scope = 'body') {
  const h = await page.waitForFunction(
    (src, flags, scopeSel) => {
      const rx = new RegExp(src, flags);
      const root = document.querySelector(scopeSel) ?? document.body;
      return [...root.querySelectorAll('button, a, [role=tab], [role=option], [role=menuitem]')].find((n) => rx.test((n.textContent ?? '').trim()) && !n.disabled && n.getAttribute('aria-disabled') !== 'true');
    },
    { timeout: 10000 },
    re.source,
    re.flags,
    scope,
  );
  await h.asElement().click();
}

/** Pick an option in a Radix select by the trigger's selector and the option text. */
export async function choose(page, triggerSel, re) {
  await page.click(triggerSel);
  await page.waitForSelector('[role=option]');
  await clickText(page, re, '[role=listbox]');
  await page.waitForFunction(() => !document.querySelector('[role=listbox]'));
}

export async function ask(page, q) {
  await page.waitForFunction(() => { const t = document.querySelector('#msg'); return t && !t.disabled; }, { timeout: 15000 });
  await page.type('#msg', q);
  await page.keyboard.press('Enter');
  await sleep(150);
  await page.waitForFunction(() => !document.querySelector('[aria-label="Thinking"]') && !document.querySelector('button[aria-label="Stop"]') && document.querySelectorAll('[role=log] p.whitespace-pre-wrap').length >= 2, { timeout: 20000 });
  return page.$$eval('[role=log] p.whitespace-pre-wrap', (n) => n.at(-1).textContent ?? '');
}
export const activity = (page) => page.$$eval('[data-testid=activity] li', (n) => n.map((x) => x.textContent ?? ''));
