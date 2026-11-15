// Department data and the pure functions that answer questions from it.
// These run in the browser for site actions, and in Node for the build and the tests.

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_NAMES: Record<Weekday, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

export interface Department {
  sample: boolean;
  institute: string;
  department: string;
  short: string;
  semester: string;
  sample_today: string;
  sample_now: string;
  disclaimer: string;
  office: { place: string; hours: string; email: string };
  years: number[];
  sections: string[];
  fee_categories: Array<{ id: string; label: string }>;
}

export interface Course {
  code: string;
  name: string;
  year: number;
  faculty: string;
  lab?: boolean;
}

export interface Slot {
  start: string;
  end: string;
  course: string;
  room: string;
}

export interface Timetable {
  year: number;
  section: string;
  days: Partial<Record<Weekday, Slot[]>>;
}

export interface TimetableChange {
  date: string;
  year: number;
  section: string;
  course: string;
  kind: 'cancelled' | 'room' | 'time';
  detail: string;
  new_room?: string;
  new_start?: string;
  new_end?: string;
}

export interface Notice {
  id: string;
  date: string;
  category: string;
  years: number[];
  title: string;
  body: string;
  deadline?: string;
}

export interface FeeItem {
  id: string;
  name: string;
  years: number[];
  due: string;
  amounts: Record<string, number>;
  late_fee_per_day: number;
  late_fee_cap: number;
  note: string;
}

export interface ExamItem {
  year: number;
  course: string;
  type: string;
  date: string;
  start: string;
  end: string;
  venue: string;
}

export interface CampusData {
  department: Department;
  timetable: { semester: string; courses: Course[]; timetables: Timetable[]; changes: TimetableChange[] };
  notices: Notice[];
  fees: { items: FeeItem[]; currency: string };
  exams: { hall_ticket_release: string; rules: string; exams: ExamItem[] };
}

export interface Profile {
  year: number;
  section: string;
  feeCategory: string;
}

export const DEFAULT_PROFILE: Profile = { year: 2, section: 'A', feeCategory: 'general' };

// ---- Dates ----

const DAY_MS = 86_400_000;

export function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return isoDate(new Date(toDate(iso).getTime() + n * DAY_MS));
}

export function weekdayOf(iso: string): Weekday {
  return WEEKDAYS[(toDate(iso).getUTCDay() + 6) % 7] as Weekday;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toDate(toIso).getTime() - toDate(fromIso).getTime()) / DAY_MS);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon 16 Nov 2026" */
export function formatDate(iso: string): string {
  const d = toDate(iso);
  return `${weekdayOf(iso)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatTime(hhmm: string): string {
  return hhmm;
}

/**
 * Turn "today", "tomorrow", a weekday name, or an ISO date into an ISO date.
 * A weekday name means its next occurrence, counting today.
 */
export function resolveDate(spec: string | undefined, today: string): string | null {
  if (!spec) return today;
  const s = spec.trim().toLowerCase();
  if (s === 'today') return today;
  if (s === 'tomorrow') return addDays(today, 1);
  if (s === 'yesterday') return addDays(today, -1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Number.isNaN(toDate(s).getTime()) ? null : s;
  const idx = WEEKDAYS.findIndex((w) => WEEKDAY_NAMES[w].toLowerCase() === s || w.toLowerCase() === s);
  if (idx < 0) return null;
  const todayIdx = WEEKDAYS.indexOf(weekdayOf(today));
  return addDays(today, (idx - todayIdx + 7) % 7);
}

// ---- Timetable ----

export interface ClassEntry {
  start: string;
  end: string;
  course: string;
  name: string;
  faculty: string;
  room: string;
  lab: boolean;
  status: 'on' | 'cancelled' | 'moved';
  change?: string;
}

function courseOf(data: CampusData, code: string): Course {
  return data.timetable.courses.find((c) => c.code === code) ?? { code, name: code, year: 0, faculty: '' };
}

export function classesOn(data: CampusData, date: string, year: number, section: string): ClassEntry[] {
  const tt = data.timetable.timetables.find((t) => t.year === year && t.section === section);
  const base = tt?.days[weekdayOf(date)] ?? [];
  const changes = data.timetable.changes.filter((c) => c.date === date && c.year === year && (c.section === 'all' || c.section === section));
  const out: ClassEntry[] = base.map((s) => {
    const course = courseOf(data, s.course);
    const ch = changes.find((c) => c.course === s.course);
    const entry: ClassEntry = { start: s.start, end: s.end, course: s.course, name: course.name, faculty: course.faculty, room: s.room, lab: !!course.lab, status: 'on' };
    if (ch?.kind === 'cancelled') {
      entry.status = 'cancelled';
      entry.change = ch.detail;
    } else if (ch?.kind === 'room') {
      entry.status = 'moved';
      entry.room = ch.new_room ?? s.room;
      entry.change = ch.detail;
    } else if (ch?.kind === 'time') {
      entry.status = 'moved';
      entry.start = ch.new_start ?? s.start;
      entry.end = ch.new_end ?? s.end;
      entry.change = ch.detail;
    }
    return entry;
  });
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export function nextClass(data: CampusData, nowIso: string, year: number, section: string): { date: string; entry: ClassEntry } | null {
  const [today, time = '00:00'] = nowIso.split('T') as [string, string?];
  for (let i = 0; i < 8; i++) {
    const date = addDays(today, i);
    const list = classesOn(data, date, year, section).filter((c) => c.status !== 'cancelled' && (i > 0 || c.start >= (time ?? '00:00')));
    if (list[0]) return { date, entry: list[0] };
  }
  return null;
}

// ---- Notices ----

export function searchNotices(data: CampusData, opts: { query?: string; category?: string; year?: number; limit?: number }): Notice[] {
  const words = (opts.query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const scored = data.notices
    .filter((n) => (!opts.category || n.category === opts.category) && (!opts.year || n.years.includes(opts.year)))
    .map((n) => {
      const hay = `${n.title} ${n.body} ${n.category}`.toLowerCase();
      const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
      return { n, score };
    })
    .filter((x) => words.length === 0 || x.score > 0);
  scored.sort((a, b) => b.score - a.score || b.n.date.localeCompare(a.n.date));
  return scored.slice(0, opts.limit ?? 5).map((x) => x.n);
}

const STOP = new Set(['the', 'and', 'for', 'any', 'are', 'was', 'what', 'when', 'about', 'notice', 'notices', 'there', 'new', 'latest', 'show', 'tell', 'with', 'has', 'have', 'from', 'that', 'this', 'does', 'much', 'many', 'which']);

// ---- Fees ----

export interface FeeEntry {
  id: string;
  name: string;
  due: string;
  daysLeft: number;
  amount: number;
  lateFeePerDay: number;
  lateFeeCap: number;
  note: string;
}

export function feeDates(data: CampusData, year: number, category: string, today: string): FeeEntry[] {
  return data.fees.items
    .filter((f) => f.years.includes(year))
    .map((f) => ({
      id: f.id,
      name: f.name,
      due: f.due,
      daysLeft: daysBetween(today, f.due),
      amount: f.amounts[category] ?? f.amounts.general ?? 0,
      lateFeePerDay: f.late_fee_per_day,
      lateFeeCap: f.late_fee_cap,
      note: f.note,
    }))
    .sort((a, b) => a.due.localeCompare(b.due));
}

// ---- Exams ----

export interface ExamEntry extends ExamItem {
  name: string;
  daysLeft: number;
}

export function examDates(data: CampusData, year: number, today: string, opts: { course?: string; type?: string } = {}): ExamEntry[] {
  const q = (opts.course ?? '').toLowerCase().trim();
  return data.exams.exams
    .filter((e) => e.year === year)
    .filter((e) => !opts.type || e.type.toLowerCase().includes(opts.type.toLowerCase()))
    .map((e) => ({ ...e, name: courseOf(data, e.course).name, daysLeft: daysBetween(today, e.date) }))
    .filter((e) => !q || e.course.toLowerCase() === q || e.name.toLowerCase().includes(q) || q.includes(e.course.toLowerCase()))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function money(data: CampusData, amount: number): string {
  return amount === 0 ? `${data.fees.currency} 0` : `${data.fees.currency} ${amount.toLocaleString('en-IN')}`;
}
