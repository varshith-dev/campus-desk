// Site actions: capabilities the page owns and registers with the runtime (spec section 2.1 and 3.1).
// Each has a name, a purpose, an input schema, an effect and a handler. Handlers read the visitor's
// private context directly, so year, section and fee category are not typed into prompts.
import type { SiteAction } from '@aw/runtime';
import { DEFAULT_PROFILE, WEEKDAY_NAMES, classesOn, examDates, feeDates, formatDate, nextClass, resolveDate, searchNotices, weekdayOf } from '../data/model';
import type { CampusData, Profile } from '../data/model';
import type { ReminderStore } from './reminders';

export interface ActionEnv {
  data: CampusData;
  today: string;
  now: string;
  reminders: ReminderStore;
}

export const SLY_FIELDS = ['student_year', 'student_section', 'fee_category'] as const;

export function profileFromSly(sly: Readonly<Record<string, unknown>>): Profile {
  const year = Number(sly.student_year);
  return {
    year: Number.isInteger(year) ? year : DEFAULT_PROFILE.year,
    section: typeof sly.student_section === 'string' ? sly.student_section : DEFAULT_PROFILE.section,
    feeCategory: typeof sly.fee_category === 'string' ? sly.fee_category : DEFAULT_PROFILE.feeCategory,
  };
}

export function slyFromProfile(p: Profile): Record<string, unknown> {
  return { student_year: p.year, student_section: p.section, fee_category: p.feeCategory };
}

export function createActions(env: ActionEnv): SiteAction[] {
  const { data, today, now } = env;
  const years = data.department.years;
  const sections = data.department.sections;

  const get_timetable: SiteAction<{ day?: string; year?: number; section?: string }> = {
    name: 'get_timetable',
    purpose: "Read the class timetable for one day, including cancelled or moved classes. Uses the visitor's saved class unless a year and section are given.",
    effect: 'read',
    schema: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'today, tomorrow, a weekday name such as Friday, or a date like 2026-11-18. Default is today.' },
        year: { type: 'integer', enum: years, description: 'Only when the visitor asks about another year.' },
        section: { type: 'string', enum: sections, description: 'Only when the visitor asks about another section.' },
      },
    },
    handler: (args, ctx) => {
      const p = profileFromSly(ctx.sly);
      const explicit = args.year !== undefined || args.section !== undefined;
      const year = args.year ?? p.year;
      const section = args.section ?? p.section;
      const date = resolveDate(args.day, today);
      if (!date) return { ok: false, reason: `"${args.day}" is not a day I can read. Use today, tomorrow, a weekday name or a date like 2026-11-18.` };
      const classes = classesOn(data, date, year, section);
      return {
        ok: true,
        scope: explicit ? `Year ${year} section ${section}` : 'the visitor\u2019s saved class',
        date,
        label: formatDate(date),
        weekday: WEEKDAY_NAMES[weekdayOf(date)],
        classes,
        note: classes.length === 0 ? 'No classes are listed for this day.' : undefined,
      };
    },
  };

  const get_next_class: SiteAction<Record<string, never>> = {
    name: 'get_next_class',
    purpose: "Find the visitor's next class after the page's clock, skipping cancelled ones.",
    effect: 'read',
    schema: { type: 'object', properties: {} },
    handler: (_args, ctx) => {
      const p = profileFromSly(ctx.sly);
      const next = nextClass(data, now, p.year, p.section);
      return { ok: true, now, next: next ? { date: next.date, label: formatDate(next.date), ...next.entry } : null };
    },
  };

  const search_notices: SiteAction<{ query?: string; category?: string; limit?: number }> = {
    name: 'search_notices',
    purpose: "Search the department notices, newest first, for the visitor's year.",
    effect: 'read',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', maxLength: 120, description: 'Words to look for. Leave empty for the latest notices.' },
        category: { type: 'string', enum: ['exams', 'fees', 'academic', 'events', 'placement', 'admin'] },
        limit: { type: 'integer', minimum: 1, maximum: 10 },
      },
    },
    handler: (args, ctx) => {
      const p = profileFromSly(ctx.sly);
      const found = searchNotices(data, { query: args.query, category: args.category, year: p.year, limit: args.limit ?? 5 });
      return { ok: true, scope: 'notices for the visitor\u2019s year', count: found.length, notices: found.map((n) => ({ ...n, label: formatDate(n.date), link: `notices.html#${n.id}` })) };
    },
  };

  const get_fee_dates: SiteAction<{ item?: string }> = {
    name: 'get_fee_dates',
    purpose: "Read fee due dates, amounts for the visitor's fee category, and late fees.",
    effect: 'read',
    schema: { type: 'object', properties: { item: { type: 'string', maxLength: 60, description: 'Part of a fee name, such as exam or tuition.' } } },
    handler: (args, ctx) => {
      const p = profileFromSly(ctx.sly);
      let list = feeDates(data, p.year, p.feeCategory, today);
      if (args.item) list = list.filter((f) => f.name.toLowerCase().includes(args.item!.toLowerCase()) || f.id.includes(args.item!.toLowerCase()));
      return { ok: true, today, currency: data.fees.currency, scope: 'the visitor\u2019s year and fee category', fees: list.map((f) => ({ ...f, dueLabel: formatDate(f.due) })) };
    },
  };

  const get_exam_dates: SiteAction<{ course?: string; type?: string }> = {
    name: 'get_exam_dates',
    purpose: "Read exam dates, times and venues for the visitor's year.",
    effect: 'read',
    schema: {
      type: 'object',
      properties: {
        course: { type: 'string', maxLength: 60, description: 'A course code such as CS201 or part of a course name.' },
        type: { type: 'string', maxLength: 30, description: 'Lab practical or End-semester.' },
      },
    },
    handler: (args, ctx) => {
      const p = profileFromSly(ctx.sly);
      const list = examDates(data, p.year, today, args);
      return {
        ok: true,
        today,
        scope: 'the visitor\u2019s year',
        hall_ticket_release: data.exams.hall_ticket_release,
        hall_ticket_label: formatDate(data.exams.hall_ticket_release),
        rules: data.exams.rules,
        exams: list.map((e) => ({ ...e, label: formatDate(e.date) })),
        note: list.length === 0 ? 'No exam matches that.' : undefined,
      };
    },
  };

  const save_reminder: SiteAction<{ title: string; date: string; time?: string; note?: string }> = {
    name: 'save_reminder',
    purpose: 'Save a reminder in this browser. The visitor must confirm. Nothing is sent anywhere.',
    effect: 'write',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 80 },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'A date such as 2026-11-30.' },
        time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', description: '24 hour time such as 09:00.' },
        note: { type: 'string', maxLength: 200 },
      },
      required: ['title', 'date'],
    },
    describe: (a) => `Save the reminder "${a.title}" for ${formatDate(a.date)}${a.time ? ` at ${a.time}` : ''} in this browser only.`,
    handler: (args) => {
      const saved = env.reminders.add({ title: args.title, date: args.date, time: args.time, note: args.note });
      return { ok: true, saved: { id: saved.id, title: saved.title, date: saved.date, time: saved.time }, where: 'this browser only' };
    },
  };

  return [get_timetable, get_next_class, search_notices, get_fee_dates, get_exam_dates, save_reminder] as SiteAction[];
}
