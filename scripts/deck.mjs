// Renders docs/deck/deck.html to docs/deck/campus-desk-deck.pdf and one PNG per slide.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const dir = join(import.meta.dirname, '..', 'docs', 'deck');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(pathToFileURL(join(dir, 'deck.html')).href, { waitUntil: 'networkidle0' });
const slides = await page.$$('.slide');
for (const [i, s] of slides.entries()) await s.screenshot({ path: join(dir, `slide-${i + 1}.png`) });
await page.pdf({ path: join(dir, 'campus-desk-deck.pdf'), width: '1280px', height: '720px', printBackground: true });
await browser.close();
console.log(`Deck written: ${slides.length} slides in ${dir}`);
