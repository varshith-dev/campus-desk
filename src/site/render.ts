// HTML for every page. These functions return strings so the build can pre-render pages (readable without
// scripts, and by crawlers and agents) and the browser can render them again for the saved class.
import { WEEKDAYS, WEEKDAY_NAMES, classesOn, examDates, feeDates, formatDate, money, nextClass, searchNotices, weekdayOf } from '../data/model';
import type { CampusData, ClassEntry, Profile } from '../data/model';

export const esc = (s: unknown): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const CATEGORY_LABEL: Record<string, string> = { exams: 'Exams', fees: 'Fees', academic: 'Academic', events: 'Events', placement: 'Placement', admin: 'Office' };

export interface View {
  data: CampusData;
  profile: Profile;
  today: string;
  now: string;
}

function classRow(c: ClassEntry): string {
  const state = c.status === 'cancelled' ? '<span class="tag tag-bad">Cancelled</span>' : c.status === 'moved' ? '<span class="tag tag-warn">Changed</span>' : '';
  return `<li class="class ${c.status}${c.lab ? ' lab' : ''}">
    <span class="time">${esc(c.start)} to ${esc(c.end)}</span>
    <span class="what"><strong>${esc(c.course)}</strong> ${esc(c.name)} ${state}</span>
    <span class="where">Room ${esc(c.room)}</span>
    ${c.change ? `<span class="why">${esc(c.change)}</span>` : ''}
  </li>`;
}

export function renderToday(v: View): string {
  const list = classesOn(v.data, v.today, v.profile.year, v.profile.section);
  const next = nextClass(v.data, v.now, v.profile.year, v.profile.section);
  const nextLine = next
    ? `<p class="next"><span class="label">Next class</span> <strong>${esc(next.entry.course)} ${esc(next.entry.name)}</strong> at ${esc(next.entry.start)}${next.date === v.today ? ' today' : ', ' + esc(formatDate(next.date))}, room ${esc(next.entry.room)}</p>`
    : '<p class="next">No class in the next week.</p>';
  return `${nextLine}
  ${list.length ? `<ol class="classes" aria-label="Classes today">${list.map(classRow).join('')}</ol>` : '<p>No classes today.</p>'}`;
}

export function renderDueSoon(v: View): string {
  const fees = feeDates(v.data, v.profile.year, v.profile.feeCategory, v.today).filter((f) => f.daysLeft >= 0);
  const exams = examDates(v.data, v.profile.year, v.today).filter((e) => e.daysLeft >= 0);
  const items = [
    ...fees.map((f) => ({ date: f.due, html: `<span class="what"><strong>${esc(f.name)}</strong>, ${esc(money(v.data, f.amount))}</span>`, left: f.daysLeft })),
    ...exams.map((e) => ({ date: e.date, html: `<span class="what"><strong>${esc(e.course)} ${esc(e.name)}</strong>, ${esc(e.type)}</span>`, left: e.daysLeft })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  return `<ul class="due">${items
    .map((i) => `<li>${i.html}<span class="when">${esc(formatDate(i.date))}<span class="left"> (${i.left === 0 ? 'today' : i.left + ' days'})</span></span></li>`)
    .join('')}</ul>`;
}

export function renderNoticeList(v: View, opts: { query?: string; category?: string; allYears?: boolean; limit?: number } = {}): string {
  const found = searchNotices(v.data, { query: opts.query, category: opts.category, year: opts.allYears ? undefined : v.profile.year, limit: opts.limit ?? 50 });
  if (!found.length) return '<p class="empty">No notice matches. Try fewer words or another topic.</p>';
  return `<ul class="notices">${found
    .map(
      (n) => `<li id="${esc(n.id)}" class="notice">
      <div class="meta"><span class="tag tag-${esc(n.category)}">${esc(CATEGORY_LABEL[n.category] ?? n.category)}</span> <time datetime="${esc(n.date)}">${esc(formatDate(n.date))}</time> <span class="id">${esc(n.id)}</span></div>
      <h3>${esc(n.title)}</h3>
      <p>${esc(n.body)}</p>
      ${n.deadline ? `<p class="deadline">Date to remember: <time datetime="${esc(n.deadline)}">${esc(formatDate(n.deadline))}</time></p>` : ''}
    </li>`,
    )
    .join('')}</ul>`;
}

export function renderFees(v: View): string {
  const rows = feeDates(v.data, v.profile.year, v.profile.feeCategory, v.today);
  return `<table class="data">
    <caption>Fees for Year ${esc(v.profile.year)}, ${esc(v.data.department.fee_categories.find((c) => c.id === v.profile.feeCategory)?.label ?? v.profile.feeCategory)} category</caption>
    <thead><tr><th scope="col">Fee</th><th scope="col">Amount</th><th scope="col">Due</th><th scope="col">Late fee</th></tr></thead>
    <tbody>${rows
      .map(
        (f) => `<tr><th scope="row">${esc(f.name)}<span class="note">${esc(f.note)}</span></th>
      <td>${esc(money(v.data, f.amount))}</td>
      <td><time datetime="${esc(f.due)}">${esc(formatDate(f.due))}</time><span class="left">${f.daysLeft >= 0 ? `${f.daysLeft} days left` : 'past due'}</span></td>
      <td>${esc(money(v.data, f.lateFeePerDay))} per day, up to ${esc(money(v.data, f.lateFeeCap))}</td></tr>`,
      )
      .join('')}</tbody></table>`;
}

export function renderExams(v: View): string {
  const rows = examDates(v.data, v.profile.year, v.today);
  return `<table class="data">
    <caption>Exams for Year ${esc(v.profile.year)}</caption>
    <thead><tr><th scope="col">Course</th><th scope="col">Type</th><th scope="col">Date</th><th scope="col">Time</th><th scope="col">Venue</th></tr></thead>
    <tbody>${rows
      .map(
        (e) => `<tr><th scope="row">${esc(e.course)} <span class="note">${esc(e.name)}</span></th><td>${esc(e.type)}</td>
      <td><time datetime="${esc(e.date)}">${esc(formatDate(e.date))}</time><span class="left">${e.daysLeft >= 0 ? `${e.daysLeft} days left` : 'done'}</span></td>
      <td>${esc(e.start)} to ${esc(e.end)}</td><td>${esc(e.venue)}</td></tr>`,
      )
      .join('')}</tbody></table>
    <p class="hint">Hall tickets are given out from <time datetime="${esc(v.data.exams.hall_ticket_release)}">${esc(formatDate(v.data.exams.hall_ticket_release))}</time>. ${esc(v.data.exams.rules)}</p>`;
}

/** A week grid for one class. Cancelled and moved classes show in the cell. */
export function renderWeek(v: View, year: number, section: string): string {
  const weekStart = v.today;
  // Find Monday of the current sample week.
  const idx = WEEKDAYS.indexOf(weekdayOf(weekStart));
  const monday = new Date(Date.parse(`${weekStart}T00:00:00Z`) - idx * 86_400_000).toISOString().slice(0, 10);
  const days = WEEKDAYS.slice(0, 5).map((d, i) => {
    const date = new Date(Date.parse(`${monday}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    return { d, date, list: classesOn(v.data, date, year, section) };
  });
  return `<div class="week" role="group" aria-label="Week timetable for Year ${esc(year)} section ${esc(section)}">${days
    .map(
      (day) => `<section class="day${day.date === v.today ? ' is-today' : ''}" aria-labelledby="day-${day.d}">
      <h3 id="day-${day.d}">${esc(WEEKDAY_NAMES[day.d])} <span class="date">${esc(formatDate(day.date).split(' ').slice(1).join(' '))}</span>${day.date === v.today ? ' <span class="tag">Today</span>' : ''}</h3>
      ${day.list.length ? `<ol class="classes">${day.list.map(classRow).join('')}</ol>` : '<p class="empty">No classes</p>'}
    </section>`,
    )
    .join('')}</div>`;
}

export function profileOptions(v: View): string {
  const d = v.data.department;
  const sel = (cond: boolean) => (cond ? ' selected' : '');
  return `
    <label>Year <select name="year">${d.years.map((y) => `<option value="${y}"${sel(y === v.profile.year)}>Year ${y}</option>`).join('')}</select></label>
    <label>Section <select name="section">${d.sections.map((s) => `<option value="${esc(s)}"${sel(s === v.profile.section)}>${esc(s)}</option>`).join('')}</select></label>
    <label>Fee category <select name="fee">${d.fee_categories.map((c) => `<option value="${esc(c.id)}"${sel(c.id === v.profile.feeCategory)}>${esc(c.label)}</option>`).join('')}</select></label>`;
}

export interface GraphNetwork {
  tools: Array<{ name: string; tools?: Array<string | { url: string }> }>;
  link_labels?: Record<string, string>;
}

/** A small inline SVG of the agent network: front agent on top, specialists, their actions, and the peer. */
export function renderGraphSvg(net: GraphNetwork, front: string, bindings: Record<string, string[]> = {}): string {
  const frontAgent = net.tools.find((t) => t.name === front);
  if (!frontAgent) return '';
  const children = (frontAgent.tools ?? []).map((t) => (typeof t === 'string' ? t : t.url));
  const agentChildren = children.filter((c) => net.tools.some((t) => t.name === c));
  const peers = children.filter((c) => /^https?:\/\//.test(c));
  const frontActions = bindings[front] ?? [];
  const colW = 210;
  const cols = agentChildren.length + (peers.length ? 1 : 0);
  const width = Math.max(cols * colW, 640);
  const h = 330;
  const nodes: string[] = [];
  const edges: string[] = [];
  const box = (x: number, y: number, w: number, label: string, cls: string, sub?: string) =>
    `<g class="node ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${sub ? 46 : 36}" rx="8"/><text x="${x + w / 2}" y="${y + (sub ? 20 : 23)}" text-anchor="middle" class="t1">${esc(label)}</text>${sub ? `<text x="${x + w / 2}" y="${y + 37}" text-anchor="middle" class="t2">${esc(sub)}</text>` : ''}</g>`;
  const fx = width / 2 - 100;
  nodes.push(box(fx, 12, 200, front, 'front', 'front agent'));
  const startX = (width - cols * colW) / 2 + 10;
  agentChildren.forEach((name, i) => {
    const x = startX + i * colW;
    edges.push(`<path d="M${width / 2} 58 C ${width / 2} 100, ${x + 95} 90, ${x + 95} 130" class="edge"/>`);
    nodes.push(box(x, 130, 190, name, 'agent', 'agent'));
    const acts = bindings[name] ?? [];
    acts.forEach((a, j) => {
      const y = 210 + j * 40;
      edges.push(`<path d="M${x + 95} 176 L ${x + 95} ${y}" class="edge thin"/>`);
      nodes.push(box(x + 5, y, 180, a.replace('website_', ''), 'action', undefined));
    });
  });
  if (peers.length) {
    const x = startX + agentChildren.length * colW;
    edges.push(`<path d="M${width / 2} 58 C ${width / 2} 100, ${x + 95} 90, ${x + 95} 130" class="edge dashed"/>`);
    peers.forEach((p) => nodes.push(box(x, 130, 190, net.link_labels?.[p] ?? new URL(p).host, 'peer', 'other site, after consent')));
  }
  if (frontActions.length) nodes.push(`<text x="${fx + 100}" y="${74}" text-anchor="middle" class="t3">also: ${esc(frontActions.map((a) => a.replace('website_', '')).join(', '))}</text>`);
  return `<svg viewBox="0 0 ${width} ${h}" role="img" aria-labelledby="graph-title graph-desc" class="graph"><title id="graph-title">Agent network</title><desc id="graph-desc">The front agent ${esc(front)} hands off to ${esc(agentChildren.join(', '))}${peers.length ? ' and, after the visitor agrees, to another site' : ''}. Each specialist calls read-only site actions.</desc>${edges.join('')}${nodes.join('')}</svg>`;
}
