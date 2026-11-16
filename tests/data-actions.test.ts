import { describe, expect, it } from 'vitest';
import { addDays, classesOn, examDates, feeDates, formatDate, nextClass, resolveDate, searchNotices, weekdayOf } from '../src/data/model';
import { toIcs } from '../lib/ics';
import { decideReminder, listReminders } from '../lib/store';
import { runTool, siteClock } from '../lib/tools';
import { checkSchema } from '@aw/runtime';
import { loadSample, makeDesk } from './helpers';

const data = loadSample();
const today = data.department.sample_today;

describe('dates', () => {
  it('the sample day is a Monday', () => expect(weekdayOf(today)).toBe('Mon'));
  it('resolves relative and named days', () => {
    expect(resolveDate('tomorrow', today)).toBe('2026-11-17');
    expect(resolveDate('Wednesday', today)).toBe('2026-11-18');
    expect(resolveDate('monday', today)).toBe(today);
    expect(resolveDate('2026-12-01', today)).toBe('2026-12-01');
    expect(resolveDate('someday', today)).toBeNull();
    expect(resolveDate(undefined, today)).toBe(today);
  });
  it('formats dates the way the pages show them', () => expect(formatDate('2026-11-30')).toBe('Mon 30 Nov 2026'));
  it('adds days across a month end', () => expect(addDays('2026-11-30', 1)).toBe('2026-12-01'));
});

describe('timetable', () => {
  it('lists Monday for Year 2 section A in time order', () => {
    const list = classesOn(data, today, 2, 'A');
    expect(list.map((c) => c.course)).toEqual(['CS201', 'CS203', 'MA201', 'CS201L']);
    expect(list.map((c) => c.start)).toEqual([...list.map((c) => c.start)].sort());
  });
  it('marks a cancelled class and keeps the reason', () => {
    const wed = classesOn(data, '2026-11-18', 2, 'A').find((c) => c.course === 'CS203')!;
    expect(wed).toMatchObject({ status: 'cancelled' });
    expect(wed.change).toMatch(/on leave/);
  });
  it('applies a room change to every section of a year', () => {
    for (const s of ['A', 'B']) expect(classesOn(data, '2026-11-19', 3, s).find((c) => c.course === 'CS303')).toMatchObject({ status: 'moved', room: 'C-305' });
  });
  it('applies a time change to one section only', () => {
    expect(classesOn(data, '2026-11-20', 2, 'B').find((c) => c.course === 'MA201')).toMatchObject({ status: 'moved', start: '14:00' });
    expect(classesOn(data, '2026-11-20', 2, 'A').find((c) => c.course === 'MA201')).toBeUndefined();
  });
  it('finds the next class after the sample clock and skips cancelled ones', () => {
    expect(nextClass(data, '2026-11-16T10:20', 2, 'A')!.entry.course).toBe('MA201');
    const n = nextClass(data, '2026-11-18T08:00', 2, 'A')!;
    expect(n.entry.course).toBe('CS204');
  });
  it('rolls over to the next day when nothing is left today', () => {
    const n = nextClass(data, '2026-11-16T18:00', 2, 'A')!;
    expect(n.date).toBe('2026-11-17');
  });
  it('has no classes on a Sunday', () => expect(classesOn(data, '2026-11-22', 2, 'A')).toEqual([]));
});

describe('notices, fees and exams', () => {
  it('filters notices by the visitor year and topic, newest first', () => {
    const y3 = searchNotices(data, { year: 3, limit: 50 }).map((n) => n.id);
    expect(y3).toContain('n-03');
    expect(searchNotices(data, { year: 2, limit: 50 }).map((n) => n.id)).not.toContain('n-03');
    const exams = searchNotices(data, { category: 'exams', year: 2 });
    expect(exams.map((n) => n.date)).toEqual([...exams.map((n) => n.date)].sort().reverse());
  });
  it('ranks a keyword match first', () => expect(searchNotices(data, { query: 'hall tickets collect', year: 2 })[0]!.id).toBe('n-06'));
  it('gives the fee amount for the fee category and counts days left', () => {
    const general = feeDates(data, 2, 'general', today).find((f) => f.id === 'tuition-2')!;
    const sch = feeDates(data, 2, 'scholarship', today).find((f) => f.id === 'tuition-2')!;
    expect([general.amount, sch.amount, general.daysLeft]).toEqual([42500, 0, 14]);
  });
  it('shows a fee only for the years it applies to', () => {
    expect(feeDates(data, 2, 'general', today).some((f) => f.id === 'lab-fee-3')).toBe(false);
    expect(feeDates(data, 3, 'general', today).some((f) => f.id === 'lab-fee-3')).toBe(true);
  });
  it('finds an exam by code or by name and counts days', () => {
    expect(examDates(data, 2, today, { course: 'CS201' }).map((e) => e.course)).toEqual(['CS201']);
    expect(examDates(data, 2, today, { course: 'discrete' })[0]!.course).toBe('CS203');
    expect(examDates(data, 2, today, { course: 'CS201' })[0]!.daysLeft).toBe(28);
    expect(examDates(data, 2, today, { type: 'Lab' }).map((e) => e.course)).toEqual(['CS201L']);
  });
  it('does not show another year exams', () => expect(examDates(data, 2, today).some((e) => e.course === 'CS301')).toBe(false));
});

describe('site actions (server code, real database)', () => {
  it('has six actions, five read-only and one write', async () => {
    const { actions } = await makeDesk();
    expect(actions.map((a) => a.name)).toEqual(['get_timetable', 'get_next_class', 'search_notices', 'get_fee_dates', 'get_exam_dates', 'save_reminder']);
    expect(actions.filter((a) => a.effect === 'write').map((a) => a.name)).toEqual(['save_reminder']);
  });
  it('the data read back from the database equals the seed files', async () => {
    const { data: fromDb } = await makeDesk();
    // The seed files carry two authoring-only keys (period labels and a category list) that the database does not need.
    const { slots: _a, ...timetable } = data.timetable as typeof data.timetable & { slots?: unknown };
    const { categories: _b, ...fees } = data.fees as typeof data.fees & { categories?: unknown };
    expect(JSON.parse(JSON.stringify(fromDb))).toEqual(JSON.parse(JSON.stringify({ ...data, timetable, fees })));
  });
  it('reads the saved class from the student record when no year or section is given', async () => {
    const { call } = await makeDesk();
    const r: any = await call('get_timetable', { day: 'Wednesday' }, { confirmed: false });
    expect(r.classes.map((c: any) => c.course)).toContain('CS203');
    expect(r.scope).toMatch(/saved class/);
    expect(JSON.stringify(r)).not.toMatch(/section A|Year 2/);
  });
  it('uses an explicit year and section when asked about another class', async () => {
    const { call } = await makeDesk();
    const r: any = await call('get_timetable', { day: 'Monday', year: 3, section: 'B' }, { confirmed: false });
    expect(r.scope).toBe('Year 3 section B');
    expect(r.classes.map((c: any) => c.course)).toContain('CS302L');
  });
  it('answers for the student\u2019s own class: a Year 3 student sees Year 3 notices and no Year 2 exams', async () => {
    const { call } = await makeDesk({ year: 3, section: 'B', feeCategory: 'sponsored' });
    const ex: any = await call('get_exam_dates', {}, { confirmed: false });
    expect(ex.exams.every((e: any) => e.year === 3)).toBe(true);
    expect(ex.exams.some((e: any) => e.course === 'CS301')).toBe(true);
  });
  it('refuses a day it cannot read, and says how to ask', async () => {
    const { call } = await makeDesk();
    const r: any = await call('get_timetable', { day: 'someday' }, { confirmed: false });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Use today, tomorrow/);
  });
  it('gives the amount for the private fee category without stating the category', async () => {
    const { call } = await makeDesk({ year: 2, section: 'A', feeCategory: 'scholarship' });
    const r: any = await call('get_fee_dates', { item: 'tuition' }, { confirmed: false });
    expect(r.fees[0].amount).toBe(0);
    expect(JSON.stringify(r)).not.toMatch(/fee_category|feeCategory|scholarship/);
  });
  it('rejects bad arguments with a schema message', async () => {
    const { call } = await makeDesk();
    await expect(call('save_reminder', { title: 'Pay fee', date: '27 Nov' }, { confirmed: true })).rejects.toThrow(/does not match/);
    await expect(call('save_reminder', { date: '2026-11-27' }, { confirmed: true })).rejects.toThrow(/title is required/);
    await expect(call('search_notices', { limit: 99 }, { confirmed: false })).rejects.toThrow();
    await expect(call('nope', {}, { confirmed: false })).rejects.toThrow(/no tool called/);
  });
  it('validates reminder input with the published schema', async () => {
    const { catalog } = await makeDesk();
    const schema = catalog.find((t) => t.name === 'save_reminder')!.schema;
    expect(checkSchema(schema, { title: 'Pay fee', date: '2026-11-27', time: '09:00' })).toEqual([]);
    expect(checkSchema(schema, { title: 'Pay fee', date: '27 Nov' }).join()).toMatch(/does not match/);
  });
  it('saves a confirmed reminder once, and describes it for the confirm card', async () => {
    const { actions, db, student } = await makeDesk();
    const a = actions.find((x) => x.name === 'save_reminder')!;
    expect(a.describe!({ title: 'Pay fee', date: '2026-11-27' } as never)).toBe('Save the reminder "Pay fee" for Fri 27 Nov 2026 to your Campus Desk account.');
    await a.handler({ title: 'Pay fee', date: '2026-11-27' }, { sly: {}, origin: 'x' });
    await a.handler({ title: 'Pay fee', date: '2026-11-27' }, { sly: {}, origin: 'x' });
    expect(await listReminders(db, student.id, 'saved')).toHaveLength(1);
  });
  it('an outside proposal stays pending until the student confirms it', async () => {
    const { db, student } = await makeDesk();
    const { result } = await runTool('save_reminder', { title: 'Study OS', date: '2026-12-01' }, { db, student, write: 'propose', source: 'Planner' });
    expect(result.pending).toBe(true);
    expect(await listReminders(db, student.id, 'saved')).toHaveLength(0);
    const [p] = await listReminders(db, student.id, 'pending');
    expect((await decideReminder(db, student.id, p!.id, 'saved'))?.status).toBe('saved');
    expect(await listReminders(db, student.id, 'saved')).toHaveLength(1);
  });
});

describe('calendar file', () => {
  it('writes a valid calendar file with escaped text', () => {
    const ics = toIcs([{ id: 'r1', title: 'Pay fee, now; ok', date: '2026-11-27', time: '09:00' }, { id: 'r2', title: 'All day', date: '2026-11-28' }]);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain('SUMMARY:Pay fee\\, now\\; ok');
    expect(ics).toContain('DTSTART:20261127T090000');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261128');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
});

describe('site clock', () => {
  it('is pinned to the sample date and can be overridden for a test', () => {
    expect(siteClock(data, '')).toEqual({ today: '2026-11-16', now: '2026-11-16T10:20' });
    expect(siteClock(data, '2026-11-18T08:30')).toEqual({ today: '2026-11-18', now: '2026-11-18T08:30' });
    expect(siteClock(data, '2026-11-20')).toEqual({ today: '2026-11-20', now: '2026-11-20T08:00' });
    expect(siteClock(data, 'garbage')).toEqual({ today: '2026-11-16', now: '2026-11-16T10:20' });
  });
});

describe('sample data is consistent', () => {
  it('every timetable change names a class that is really on that weekday', () => {
    for (const ch of data.timetable.changes) {
      const sections = ch.section === 'all' ? data.department.sections : [ch.section];
      for (const sec of sections) {
        const tt = data.timetable.timetables.find((t) => t.year === ch.year && t.section === sec)!;
        const slots = tt.days[weekdayOf(ch.date)] ?? [];
        expect(slots.some((s) => s.course === ch.course), `${ch.date} ${ch.year}${sec} ${ch.course}`).toBe(true);
      }
    }
  });
  it('every course in a timetable or exam exists, for the right year', () => {
    const codes = new Map(data.timetable.courses.map((c) => [c.code, c.year]));
    for (const tt of data.timetable.timetables) for (const slots of Object.values(tt.days)) for (const s of slots!) expect(codes.get(s.course)).toBe(tt.year);
    for (const e of data.exams.exams) expect(codes.get(e.course)).toBe(e.year);
  });
  it('no two classes overlap in one section on one day', () => {
    for (const tt of data.timetable.timetables) for (const slots of Object.values(tt.days)) {
      const sorted = [...slots!].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.start >= sorted[i - 1]!.end).toBe(true);
    }
  });
  it('notice ids are unique and deadlines are real dates', () => {
    expect(new Set(data.notices.map((n) => n.id)).size).toBe(data.notices.length);
    for (const n of data.notices) if (n.deadline) expect(Number.isNaN(Date.parse(n.deadline))).toBe(false);
  });
  it('the sample says plainly that it is made up', () => {
    expect(data.department.sample).toBe(true);
    expect(data.department.disclaimer).toMatch(/made-up/);
    expect(data.department.office.email).toMatch(/\.example$/);
  });
});
