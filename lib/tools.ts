// The six site actions, as server code. The Ask page, outside agents (REST) and the MCP endpoint all call
// `runTool`, so there is one set of rules. Private context (year, section, fee category) is read from the
// student's own record here. It is never a tool argument and never goes into a ledger entry as a value.
import type { Client } from '@libsql/client';
import { checkSchema } from '@/src/runtime/schema';
import { toolCatalog, type ToolSpec } from '@/src/site/catalog';
import { WEEKDAY_NAMES, classesOn, examDates, feeDates, formatDate, nextClass, resolveDate, searchNotices, weekdayOf } from '@/src/data/model';
import type { CampusData, Department } from '@/src/data/model';
import { addReminder, loadCampusData } from './store';
import type { Student } from './store';

export { ALL_SCOPES, SCOPES, toolCatalog } from '@/src/site/catalog';
export type { Scope, ToolSpec } from '@/src/site/catalog';

/** The site clock. Fixed to the sample date so every visit gives the same answers, unless SITE_CLOCK=real. */
export function siteClock(data: CampusData, override?: string | null): { today: string; now: string } {
  if (override && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(override)) return { today: override.slice(0, 10), now: override };
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return { today: override, now: `${override}T08:00` };
  if (process.env.SITE_CLOCK === 'real') {
    const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(' ', 'T');
    return { today: parts.slice(0, 10), now: parts.slice(0, 16) };
  }
  return { today: data.department.sample_today, now: data.department.sample_now };
}

export class ToolError extends Error {
  constructor(
    readonly code: 'unknown_tool' | 'bad_arguments' | 'needs_confirmation',
    message: string,
  ) {
    super(message);
  }
}

export interface ToolContext {
  db: Client;
  student: Student;
  /** How a write is treated. 'confirmed': the student confirmed it in the page. 'propose': an outside agent proposed it. */
  write: 'confirmed' | 'propose';
  source: string;
  grantId?: string;
  clock?: string | null;
}

export async function runTool(name: string, args: unknown, ctx: ToolContext): Promise<{ result: Record<string, unknown>; spec: ToolSpec }> {
  const data = await loadCampusData(ctx.db);
  const spec = toolCatalog(data.department).find((t) => t.name === name);
  if (!spec) throw new ToolError('unknown_tool', `There is no tool called ${name}.`);
  const input = (args ?? {}) as Record<string, any>;
  const problems = checkSchema(spec.schema, input, 'arguments');
  if (problems.length) throw new ToolError('bad_arguments', problems.join('; '));
  const { today, now } = siteClock(data, ctx.clock);
  const p = ctx.student.profile;

  switch (name) {
    case 'get_timetable': {
      const explicit = input.year !== undefined || input.section !== undefined;
      const year = input.year ?? p.year;
      const section = input.section ?? p.section;
      const date = resolveDate(input.day, today);
      if (!date) return { spec, result: { ok: false, reason: `"${input.day}" is not a day I can read. Use today, tomorrow, a weekday name or a date like 2026-11-18.` } };
      const classes = classesOn(data, date, year, section);
      return { spec, result: { ok: true, scope: explicit ? `Year ${year} section ${section}` : 'the student\u2019s saved class', date, label: formatDate(date), weekday: WEEKDAY_NAMES[weekdayOf(date)], classes, note: classes.length === 0 ? 'No classes are listed for this day.' : undefined } };
    }
    case 'get_next_class': {
      const next = nextClass(data, now, p.year, p.section);
      return { spec, result: { ok: true, now, next: next ? { date: next.date, label: formatDate(next.date), ...next.entry } : null } };
    }
    case 'search_notices': {
      const found = searchNotices(data, { query: input.query, category: input.category, year: p.year, limit: input.limit ?? 5 });
      return { spec, result: { ok: true, scope: 'notices for the student\u2019s year', count: found.length, notices: found.map((n) => ({ ...n, label: formatDate(n.date), link: `/notices#${n.id}` })) } };
    }
    case 'get_fee_dates': {
      let list = feeDates(data, p.year, p.feeCategory, today);
      if (input.item) list = list.filter((f) => f.name.toLowerCase().includes(String(input.item).toLowerCase()) || f.id.includes(String(input.item).toLowerCase()));
      return { spec, result: { ok: true, today, currency: data.fees.currency, scope: 'the student\u2019s year and fee category', fees: list.map((f) => ({ ...f, dueLabel: formatDate(f.due) })) } };
    }
    case 'get_exam_dates': {
      const list = examDates(data, p.year, today, input);
      return { spec, result: { ok: true, today, scope: 'the student\u2019s year', hall_ticket_release: data.exams.hall_ticket_release, hall_ticket_label: formatDate(data.exams.hall_ticket_release), rules: data.exams.rules, exams: list.map((e) => ({ ...e, label: formatDate(e.date) })), note: list.length === 0 ? 'No exam matches that.' : undefined } };
    }
    case 'save_reminder': {
      const saved = await addReminder(ctx.db, ctx.student.id, { title: input.title, date: input.date, time: input.time, note: input.note, status: ctx.write === 'confirmed' ? 'saved' : 'pending', source: ctx.source, grantId: ctx.grantId });
      return {
        spec,
        result:
          ctx.write === 'confirmed'
            ? { ok: true, saved: { id: saved.id, title: saved.title, date: saved.date, time: saved.time }, where: 'your Campus Desk account' }
            : { ok: true, pending: true, reminder_id: saved.id, message: 'Proposed. The student has to confirm it on the Campus Desk reminders page before it is saved.' },
      };
    }
  }
  throw new ToolError('unknown_tool', `There is no tool called ${name}.`);
}
