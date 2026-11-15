import { registerWebMcp } from '@aw/runtime';
import { loadCampusData } from '../data/load';
import type { Profile } from '../data/model';
import { createActions, slyFromProfile } from './actions';
import { initAgents } from './agents-page';
import { initAsk } from './ask';
import { ReminderStore } from './reminders';
import { renderDueSoon, renderExams, renderFees, renderNoticeList, renderToday, renderWeek } from './render';
import type { View } from './render';
import { ProfileState, siteClock } from './state';

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

async function boot(): Promise<void> {
  const base = new URL('./', location.href).href;
  const page = document.body.dataset.page ?? 'home';
  const data = await loadCampusData(base);
  const { today, now } = siteClock(data, location.search);
  const profileState = new ProfileState(localStorage);
  const view = (): View => ({ data, profile: profileState.load(), today, now });

  // Profile form: the saved class. It is private context for the agents.
  const form = $<HTMLFormElement>('profile');
  const setForm = (p: Profile) => {
    (form?.elements.namedItem('year') as HTMLSelectElement).value = String(p.year);
    (form?.elements.namedItem('section') as HTMLSelectElement).value = p.section;
    (form?.elements.namedItem('fee') as HTMLSelectElement).value = p.feeCategory;
  };
  setForm(profileState.load());

  const set = (id: string, html: string) => {
    const n = $(id);
    if (n) n.innerHTML = html;
  };
  const paint = () => {
    const v = view();
    set('today', renderToday(v));
    set('due', renderDueSoon(v));
    set('latest', renderNoticeList(v, { limit: 3 }));
    set('fees', renderFees(v));
    set('exams', renderExams(v));
    if (page === 'timetable') {
      (document.getElementById('view-year') as HTMLSelectElement).value = String(v.profile.year);
      (document.getElementById('view-section') as HTMLSelectElement).value = v.profile.section;
      set('week', renderWeek(v, v.profile.year, v.profile.section));
    }
    if (page === 'notices') paintNotices();
  };
  form?.addEventListener('change', () => {
    const f = form.elements;
    profileState.save({
      year: Number((f.namedItem('year') as HTMLSelectElement).value),
      section: (f.namedItem('section') as HTMLSelectElement).value,
      feeCategory: (f.namedItem('fee') as HTMLSelectElement).value,
    });
    paint();
  });
  form?.addEventListener('submit', (e) => e.preventDefault());

  // Timetable view selectors
  if (page === 'timetable') {
    const go = () => {
      const y = Number((document.getElementById('view-year') as HTMLSelectElement).value);
      const s = (document.getElementById('view-section') as HTMLSelectElement).value;
      set('week', renderWeek(view(), y, s));
    };
    document.getElementById('viewer')?.addEventListener('change', go);
    document.getElementById('viewer')?.addEventListener('submit', (e) => e.preventDefault());
  }

  // Notices filters
  let category = '';
  function paintNotices() {
    const q = (document.getElementById('q') as HTMLInputElement | null)?.value ?? '';
    const all = (document.getElementById('all-years') as HTMLInputElement | null)?.checked ?? false;
    set('notice-list', renderNoticeList(view(), { query: q, category: category || undefined, allYears: all }));
  }
  if (page === 'notices') {
    document.getElementById('q')?.addEventListener('input', paintNotices);
    document.getElementById('all-years')?.addEventListener('change', paintNotices);
    document.getElementById('notice-filters')?.addEventListener('submit', (e) => e.preventDefault());
    for (const b of document.querySelectorAll<HTMLButtonElement>('.pill')) {
      b.addEventListener('click', () => {
        category = b.dataset.cat ?? '';
        for (const o of document.querySelectorAll<HTMLButtonElement>('.pill')) o.setAttribute('aria-pressed', String(o === b));
        paintNotices();
      });
    }
  }
  paint();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();

  // Offer the read-only actions to browser agents through WebMCP when the browser supports it.
  const actions = createActions({ data, today, now, reminders: new ReminderStore(localStorage) });
  registerWebMcp(actions, () => slyFromProfile(profileState.load()), location.origin);

  if (page === 'ask') await initAsk({ data, base, today, now, profileState, storage: localStorage });
  if (page === 'agents') await initAgents(base);
}

boot().catch((err) => {
  const main = document.getElementById('main');
  if (main) {
    const p = document.createElement('p');
    p.setAttribute('role', 'alert');
    p.textContent = `This page could not load its data: ${(err as Error).message}`;
    main.prepend(p);
  }
});
