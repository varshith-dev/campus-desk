// Queries. Plain SQL, no ORM. Everything that touches a table lives here.
import type { Client } from '@libsql/client';
import type { CampusData, Department, FeeItem, Notice, Profile, Slot, Timetable, TimetableChange, Weekday } from '@/src/data/model';
import { DEFAULT_PROFILE } from '@/src/data/model';
import { randomBytes } from 'node:crypto';
import { checkPassword, hashPassword, randomId, sha256 } from './crypto';

const str = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
const num = (v: unknown) => Number(v);
const nowIso = () => new Date().toISOString();

// ---- Department data ----

let dataCache: { db: Client; at: number; data: CampusData } | null = null;

/** The whole department as one object, which is what the answer functions in src/data/model.ts expect. */
export async function loadCampusData(db: Client, maxAgeMs = 5000): Promise<CampusData> {
  if (dataCache && dataCache.db === db && Date.now() - dataCache.at < maxAgeMs) return dataCache.data;
  const [kv, courses, slots, changes, notices, fees, exams] = await Promise.all([
    db.execute(`SELECT k, v FROM kv`),
    db.execute(`SELECT * FROM courses ORDER BY rowid`),
    db.execute(`SELECT * FROM slots ORDER BY id`),
    db.execute(`SELECT * FROM changes ORDER BY id`),
    db.execute(`SELECT * FROM notices ORDER BY rowid`),
    db.execute(`SELECT * FROM fee_items ORDER BY rowid`),
    db.execute(`SELECT * FROM exams ORDER BY id`),
  ]);
  const k = Object.fromEntries(kv.rows.map((r) => [String(r.k), String(r.v)]));
  const tts: Timetable[] = [];
  for (const s of slots.rows) {
    let tt = tts.find((t) => t.year === num(s.year) && t.section === String(s.section));
    if (!tt) tts.push((tt = { year: num(s.year), section: String(s.section), days: {} }));
    const day = String(s.day) as Weekday;
    (tt.days[day] ??= []).push({ start: String(s.start), end: String(s.end), course: String(s.course), room: String(s.room) } satisfies Slot);
  }
  const data: CampusData = {
    department: JSON.parse(k.department!) as Department,
    timetable: {
      semester: k.timetable_semester!,
      courses: courses.rows.map((c) => ({ code: String(c.code), name: String(c.name), year: num(c.year), faculty: String(c.faculty), ...(num(c.lab) ? { lab: true } : {}) })),
      timetables: tts,
      changes: changes.rows.map((c) => {
        const out: TimetableChange = { date: String(c.date), year: num(c.year), section: String(c.section), course: String(c.course), kind: String(c.kind) as TimetableChange['kind'], detail: String(c.detail) };
        if (c.new_room) out.new_room = String(c.new_room);
        if (c.new_start) out.new_start = String(c.new_start);
        if (c.new_end) out.new_end = String(c.new_end);
        return out;
      }),
    },
    notices: notices.rows.map((n): Notice => ({ id: String(n.id), date: String(n.date), category: String(n.category), years: JSON.parse(String(n.years)), title: String(n.title), body: String(n.body), ...(n.deadline ? { deadline: String(n.deadline) } : {}) })),
    fees: {
      currency: k.fees_currency!,
      items: fees.rows.map((f): FeeItem => ({ id: String(f.id), name: String(f.name), years: JSON.parse(String(f.years)), due: String(f.due), amounts: JSON.parse(String(f.amounts)), late_fee_per_day: num(f.late_fee_per_day), late_fee_cap: num(f.late_fee_cap), note: String(f.note) })),
    },
    exams: { hall_ticket_release: k.hall_ticket_release!, rules: k.exam_rules!, exams: exams.rows.map((e) => ({ year: num(e.year), course: String(e.course), type: String(e.type), date: String(e.date), start: String(e.start), end: String(e.end), venue: String(e.venue) })) },
  };
  dataCache = { db, at: Date.now(), data };
  return data;
}

export function clearDataCache(): void {
  dataCache = null;
}

// ---- Students and sessions ----

export interface Student {
  id: string;
  kind: 'guest' | 'account';
  email?: string;
  name: string;
  profile: Profile;
  pairingCode: string;
}

const rowToStudent = (r: Record<string, unknown>): Student => ({
  id: String(r.id),
  kind: String(r.kind) as Student['kind'],
  email: str(r.email),
  name: String(r.name),
  profile: { year: num(r.year), section: String(r.section), feeCategory: String(r.fee_category) },
  pairingCode: String(r.pairing_code),
});

/** Short code a student reads out to an outside agent so it can ask for access. No look-alike letters. */
export function newPairingCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return `EB-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

export async function createStudent(db: Client, opts: { kind: Student['kind']; name?: string; email?: string; password?: string; profile?: Profile }): Promise<Student> {
  const id = randomId('stu');
  const p = opts.profile ?? DEFAULT_PROFILE;
  const pw = opts.password ? await hashPassword(opts.password) : null;
  for (let i = 0; i < 5; i++) {
    const code = newPairingCode();
    try {
      await db.execute({ sql: `INSERT INTO students VALUES (?,?,?,?,?,?,?,?,?,?)`, args: [id, opts.kind, opts.email ?? null, opts.name ?? 'Guest', pw, p.year, p.section, p.feeCategory, code, nowIso()] });
      return { id, kind: opts.kind, email: opts.email, name: opts.name ?? 'Guest', profile: p, pairingCode: code };
    } catch (e) {
      if (!/UNIQUE/i.test(String(e)) || /email/i.test(String(e))) throw e;
    }
  }
  throw new Error('Could not make a pairing code.');
}

export async function studentById(db: Client, id: string): Promise<Student | null> {
  const r = await db.execute({ sql: `SELECT * FROM students WHERE id = ?`, args: [id] });
  return r.rows[0] ? rowToStudent(r.rows[0]) : null;
}

export async function studentByPairingCode(db: Client, code: string): Promise<Student | null> {
  const r = await db.execute({ sql: `SELECT * FROM students WHERE pairing_code = ?`, args: [code.trim().toUpperCase()] });
  return r.rows[0] ? rowToStudent(r.rows[0]) : null;
}

export async function rotatePairingCode(db: Client, studentId: string): Promise<string> {
  const code = newPairingCode();
  await db.execute({ sql: `UPDATE students SET pairing_code = ? WHERE id = ?`, args: [code, studentId] });
  return code;
}

export async function updateProfile(db: Client, studentId: string, p: Profile): Promise<void> {
  await db.execute({ sql: `UPDATE students SET year = ?, section = ?, fee_category = ? WHERE id = ?`, args: [p.year, p.section, p.feeCategory, studentId] });
}

const SESSION_DAYS = 30;

export async function createSession(db: Client, studentId: string): Promise<{ token: string; maxAge: number }> {
  const token = randomBytes(32).toString('base64url');
  const exp = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await db.execute({ sql: `INSERT INTO sessions VALUES (?,?,?,?)`, args: [sha256(token), studentId, nowIso(), exp] });
  return { token, maxAge: SESSION_DAYS * 86_400 };
}

/**
 * A guest tied to a session token that the browser already holds (the proxy hands one out on the first page load).
 * The student id comes from the token, so two requests that arrive at the same moment make the same student, not two.
 */
export async function guestForToken(db: Client, token: string): Promise<Student> {
  const th = sha256(token);
  const id = `stu_${th.slice(0, 16)}`;
  for (let i = 0; i < 6; i++) {
    const existing = await studentById(db, id);
    if (existing) {
      const exp = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
      await db.execute({ sql: `INSERT OR IGNORE INTO sessions VALUES (?,?,?,?)`, args: [th, id, nowIso(), exp] });
      return existing;
    }
    const p = DEFAULT_PROFILE;
    await db.execute({ sql: `INSERT OR IGNORE INTO students VALUES (?,?,?,?,?,?,?,?,?,?)`, args: [id, 'guest', null, 'Guest', null, p.year, p.section, p.feeCategory, newPairingCode(), nowIso()] });
  }
  throw new Error('Could not make a guest session.');
}

export async function studentFromSession(db: Client, token: string | undefined): Promise<Student | null> {
  if (!token) return null;
  const r = await db.execute({ sql: `SELECT s.* FROM sessions x JOIN students s ON s.id = x.student_id WHERE x.token_hash = ? AND x.expires_at > ?`, args: [sha256(token), nowIso()] });
  return r.rows[0] ? rowToStudent(r.rows[0]) : null;
}

export async function endSession(db: Client, token: string | undefined): Promise<void> {
  if (token) await db.execute({ sql: `DELETE FROM sessions WHERE token_hash = ?`, args: [sha256(token)] });
}

export async function signUp(db: Client, input: { name: string; email: string; password: string; profile: Profile }): Promise<Student> {
  const email = input.email.trim().toLowerCase();
  const existing = await db.execute({ sql: `SELECT 1 FROM students WHERE email = ?`, args: [email] });
  if (existing.rows.length) throw new AuthError('An account with that email already exists. Sign in instead.');
  return createStudent(db, { kind: 'account', name: input.name.trim(), email, password: input.password, profile: input.profile });
}

export class AuthError extends Error {}

export async function signIn(db: Client, emailRaw: string, password: string): Promise<Student> {
  const email = emailRaw.trim().toLowerCase();
  const r = await db.execute({ sql: `SELECT * FROM students WHERE email = ?`, args: [email] });
  const row = r.rows[0];
  // Same message for an unknown email and a wrong passphrase.
  if (!row || !row.pw_hash || !(await checkPassword(password, String(row.pw_hash)))) throw new AuthError('That email and passphrase do not match.');
  return rowToStudent(row);
}

export const DEMO_ACCOUNT = { name: 'Ananya Rao', email: 'ananya@eastbrook.example', password: 'chalk-and-brick-2026' };

/** A sample student so a visitor can try sign-in at once. Set SEED_DEMO_ACCOUNT=0 to turn it off. */
export async function ensureDemoAccount(db: Client): Promise<void> {
  if (process.env.SEED_DEMO_ACCOUNT === '0') return;
  const r = await db.execute({ sql: `SELECT 1 FROM students WHERE email = ?`, args: [DEMO_ACCOUNT.email] });
  if (!r.rows.length) await createStudent(db, { kind: 'account', ...DEMO_ACCOUNT, profile: DEFAULT_PROFILE });
}

// ---- Reminders ----

export interface Reminder {
  id: string;
  title: string;
  date: string;
  time?: string;
  note?: string;
  status: 'saved' | 'pending' | 'declined';
  source: string;
  grantId?: string;
}

const rowToReminder = (r: Record<string, unknown>): Reminder => ({ id: String(r.id), title: String(r.title), date: String(r.date), time: str(r.time), note: str(r.note), status: String(r.status) as Reminder['status'], source: String(r.source), grantId: str(r.grant_id) });

export async function listReminders(db: Client, studentId: string, status?: Reminder['status']): Promise<Reminder[]> {
  const r = await db.execute({ sql: `SELECT * FROM reminders WHERE student_id = ? ${status ? 'AND status = ?' : "AND status != 'declined'"} ORDER BY date, COALESCE(time, ''), created_at`, args: status ? [studentId, status] : [studentId] });
  return r.rows.map(rowToReminder);
}

export async function addReminder(db: Client, studentId: string, r: { title: string; date: string; time?: string; note?: string; status: 'saved' | 'pending'; source: string; grantId?: string }): Promise<Reminder> {
  // A repeat of the same saved reminder is not saved twice.
  const dup = await db.execute({ sql: `SELECT * FROM reminders WHERE student_id = ? AND title = ? AND date = ? AND COALESCE(time,'') = ? AND status = ?`, args: [studentId, r.title, r.date, r.time ?? '', r.status] });
  if (dup.rows[0]) return rowToReminder(dup.rows[0]);
  const id = randomId('rem');
  await db.execute({ sql: `INSERT INTO reminders VALUES (?,?,?,?,?,?,?,?,?,?)`, args: [id, studentId, r.title, r.date, r.time ?? null, r.note ?? null, r.status, r.source, r.grantId ?? null, nowIso()] });
  return { id, title: r.title, date: r.date, time: r.time, note: r.note, status: r.status, source: r.source, grantId: r.grantId };
}

export async function decideReminder(db: Client, studentId: string, id: string, decision: 'saved' | 'declined'): Promise<Reminder | null> {
  const r = await db.execute({ sql: `UPDATE reminders SET status = ? WHERE id = ? AND student_id = ? AND status = 'pending' RETURNING *`, args: [decision, id, studentId] });
  return r.rows[0] ? rowToReminder(r.rows[0]) : null;
}

export async function removeReminder(db: Client, studentId: string, id: string): Promise<boolean> {
  const r = await db.execute({ sql: `DELETE FROM reminders WHERE id = ? AND student_id = ?`, args: [id, studentId] });
  return r.rowsAffected > 0;
}

/** When a guest signs in, the reminders they saved as a guest move to their account. */
export async function mergeGuestReminders(db: Client, guestId: string, accountId: string): Promise<number> {
  if (guestId === accountId) return 0;
  const r = await db.execute({ sql: `UPDATE reminders SET student_id = ? WHERE student_id = ? AND status != 'declined'`, args: [accountId, guestId] });
  return r.rowsAffected;
}
