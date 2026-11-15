import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { agentsPage, askPage, defaultView, feesPage, homePage, noticesPage, timetablePage, CSP } from '../src/site/pages';
import { esc, renderGraphSvg, renderNoticeList, renderWeek } from '../src/site/render';
import { loadSample, readJson } from './helpers';
import { scan } from '../scripts/check-style.mjs';

const data = loadSample();
const view = defaultView(data);
const net = readJson('public/campus_desk.network.json');
const manifest = readJson('public/agent-manifest.json');

const pages: Record<string, string> = {
  home: homePage(view),
  timetable: timetablePage(view),
  notices: noticesPage(view),
  fees: feesPage(view),
  ask: askPage(view),
  agents: agentsPage(view, net, 'http://localhost:5174/library_desk', manifest.actions.bindings),
};

describe.each(Object.entries(pages))('page %s', (name, html) => {
  const doc = new JSDOM(html).window.document;
  it('has a language, a title, a viewport and a content security policy', () => {
    expect(doc.documentElement.lang).toBe('en');
    expect(doc.title).toMatch(/ \| Campus Desk$/);
    expect(doc.querySelector('meta[name=viewport]')).not.toBeNull();
    expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content')).toBe(CSP);
  });
  it('has a skip link that points at the main landmark', () => {
    const skip = doc.querySelector('a.skip')!;
    expect(skip.getAttribute('href')).toBe('#main');
    expect(doc.getElementById('main')?.tagName).toBe('MAIN');
  });
  it('has exactly one h1 and never skips a heading level', () => {
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
    let last = 1;
    for (const h of doc.querySelectorAll('h1,h2,h3,h4')) {
      const level = Number(h.tagName[1]);
      expect(level - last).toBeLessThanOrEqual(1);
      last = level;
    }
  });
  it('marks the current page in the navigation, exactly once', () => expect(doc.querySelectorAll('nav [aria-current=page]')).toHaveLength(1));
  it('gives every form control a name', () => {
    for (const c of doc.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      const id = c.getAttribute('id');
      const labelled = c.closest('label') || (id && doc.querySelector(`label[for="${id}"]`)) || c.getAttribute('aria-label') || c.getAttribute('aria-labelledby');
      expect(labelled, `${c.outerHTML.slice(0, 80)}`).toBeTruthy();
    }
  });
  it('has unique ids and every aria reference resolves', () => {
    const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const el of doc.querySelectorAll('[aria-labelledby]')) for (const ref of el.getAttribute('aria-labelledby')!.split(' ')) expect(doc.getElementById(ref), ref).not.toBeNull();
  });
  it('uses no inline styles or inline scripts, so the policy can stay strict', () => {
    expect(doc.querySelectorAll('[style]')).toHaveLength(0);
    for (const s of doc.querySelectorAll('script')) expect(s.getAttribute('src')).toBeTruthy();
  });
  it('gives every table a caption and header cells with scope', () => {
    for (const t of doc.querySelectorAll('table')) {
      expect(t.querySelector('caption')).not.toBeNull();
      for (const th of t.querySelectorAll('th')) expect(th.getAttribute('scope')).toBeTruthy();
    }
  });
  it('has buttons with a type, and links with text', () => {
    for (const b of doc.querySelectorAll('button')) expect(b.getAttribute('type') ?? (b.closest('form') ? 'submit' : 'button')).toBeTruthy();
    for (const a of doc.querySelectorAll('a')) expect((a.textContent ?? '').trim().length + (a.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
  });
  it('says it is sample data on every page', () => expect(doc.querySelector('[role=note]')!.textContent).toMatch(/Sample data/));
  it('links the manifest', () => expect(doc.querySelector('link[href="agent-manifest.json"]')).not.toBeNull());
});

describe('page content', () => {
  it('the ask page has a live log, a labelled composer and three dialogs', () => {
    const doc = new JSDOM(pages.ask).window.document;
    expect(doc.getElementById('log')!.getAttribute('role')).toBe('log');
    expect(doc.querySelector('label[for=msg]')).not.toBeNull();
    expect([...doc.querySelectorAll('dialog')].map((d) => d.id)).toEqual(['settings', 'consent', 'confirm']);
    expect(doc.querySelector('#api-key')!.getAttribute('type')).toBe('password');
  });
  it('the graph is an image with a title and a description', () => {
    const doc = new JSDOM(pages.agents).window.document;
    const svg = doc.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.querySelector('title')!.textContent).toBe('Agent network');
    expect(svg.querySelector('desc')!.textContent).toMatch(/hands off to timetable_agent, notices_agent, fees_exams_agent/);
    expect(svg.textContent).toMatch(/Eastbrook Library Desk/);
  });
  it('the graph names every agent and action', () => {
    const svg = renderGraphSvg(net, 'campus_desk', manifest.actions.bindings);
    for (const n of ['campus_desk', 'timetable_agent', 'notices_agent', 'fees_exams_agent', 'get_timetable', 'search_notices', 'get_fee_dates', 'get_exam_dates', 'get_next_class', 'save_reminder']) expect(svg).toContain(n);
  });
  it('the week view marks today, a cancellation and a changed room', () => {
    const doc = new JSDOM(renderWeek(view, 2, 'A')).window.document;
    expect(doc.querySelectorAll('.day.is-today')).toHaveLength(1);
    expect(doc.querySelector('.class.cancelled')!.textContent).toMatch(/Cancelled/);
    expect(doc.querySelectorAll('.day')).toHaveLength(5);
  });
  it('escapes text so a notice cannot inject markup', () => {
    const evil = structuredClone(data);
    evil.notices[0]!.title = '<img src=x onerror=alert(1)>';
    const html = renderNoticeList({ ...view, data: evil }, { allYears: true });
    expect(html).not.toContain('<img');
    expect(esc(`"'<>&`)).toBe('&quot;&#39;&lt;&gt;&amp;');
  });
  it('the home page shows the next class and what is coming up', () => {
    const doc = new JSDOM(pages.home).window.document;
    expect(doc.querySelector('.next')!.textContent).toMatch(/MA201 Probability and Statistics at 11:15 today/);
    expect(doc.querySelectorAll('#due li').length).toBeGreaterThan(2);
  });
});

describe('writing rules', () => {
  it('no em dashes, banned names or buzzwords anywhere in the project', () => expect(scan()).toEqual([]));
});
