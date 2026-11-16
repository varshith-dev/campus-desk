// The data store. One driver (libsql) covers both cases:
//   - a local SQLite file for development and tests (DATABASE_URL=file:./data/campus.db), and
//   - a hosted libSQL database such as Turso for a deployed site (DATABASE_URL=libsql://..., DATABASE_AUTH_TOKEN=...).
// The schema is created and the sample department is seeded the first time a database is opened.
import { createClient, type Client } from '@libsql/client';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ensureDemoAccount } from './store';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS courses (code TEXT PRIMARY KEY, name TEXT NOT NULL, year INTEGER NOT NULL, faculty TEXT NOT NULL, lab INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS slots (id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER NOT NULL, section TEXT NOT NULL, day TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, course TEXT NOT NULL, room TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS changes (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, year INTEGER NOT NULL, section TEXT NOT NULL, course TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL, new_room TEXT, new_start TEXT, new_end TEXT)`,
  `CREATE TABLE IF NOT EXISTS notices (id TEXT PRIMARY KEY, date TEXT NOT NULL, category TEXT NOT NULL, years TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, deadline TEXT)`,
  `CREATE TABLE IF NOT EXISTS fee_items (id TEXT PRIMARY KEY, name TEXT NOT NULL, years TEXT NOT NULL, due TEXT NOT NULL, amounts TEXT NOT NULL, late_fee_per_day INTEGER NOT NULL, late_fee_cap INTEGER NOT NULL, note TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER NOT NULL, course TEXT NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, venue TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, kind TEXT NOT NULL, email TEXT UNIQUE, name TEXT NOT NULL, pw_hash TEXT, year INTEGER NOT NULL, section TEXT NOT NULL, fee_category TEXT NOT NULL, pairing_code TEXT UNIQUE, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, student_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, title TEXT NOT NULL, date TEXT NOT NULL, time TEXT, note TEXT, status TEXT NOT NULL, source TEXT NOT NULL, grant_id TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS access_requests (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, agent_name TEXT NOT NULL, origin TEXT NOT NULL, scopes TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL, poll_secret_hash TEXT NOT NULL, grant_id TEXT, token TEXT, created_at TEXT NOT NULL, decided_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS grants (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, agent_name TEXT NOT NULL, origin TEXT NOT NULL, scopes TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS ledger (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, student_id TEXT NOT NULL, ts TEXT NOT NULL, payload TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL, sig TEXT NOT NULL, kid TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ledger_student ON ledger (student_id, seq)`,
  `CREATE INDEX IF NOT EXISTS reminders_student ON reminders (student_id)`,
];

const seedDir = join(process.cwd(), 'data', 'seed');
const readSeed = (f: string) => JSON.parse(readFileSync(join(seedDir, f), 'utf8'));

export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // A serverless host has a read-only project folder, so fall back to its temp folder.
  if (process.env.VERCEL) return 'file:/tmp/campus-desk.db';
  return `file:${join(process.cwd(), 'data', 'campus.db')}`;
}

export async function openDb(url = databaseUrl(), authToken = process.env.DATABASE_AUTH_TOKEN): Promise<Client> {
  if (url.startsWith('file:') && !url.includes(':memory:')) mkdirSync(dirname(url.slice(5)), { recursive: true });
  const db = createClient({ url, authToken });
  await db.batch(SCHEMA.map((sql) => ({ sql, args: [] })));
  await seedIfEmpty(db);
  await ensureDemoAccount(db);
  return db;
}

async function seedIfEmpty(db: Client): Promise<void> {
  const has = await db.execute(`SELECT v FROM kv WHERE k = 'seeded'`);
  if (has.rows.length) return;
  const department = readSeed('department.json');
  const tt = readSeed('timetable.json');
  const notices = readSeed('notices.json').notices as Array<Record<string, unknown>>;
  const fees = readSeed('fees.json');
  const exams = readSeed('exams.json');
  const stmts: Array<{ sql: string; args: Array<string | number | null> }> = [];
  stmts.push({ sql: `INSERT OR REPLACE INTO kv VALUES ('department', ?)`, args: [JSON.stringify(department)] });
  stmts.push({ sql: `INSERT OR REPLACE INTO kv VALUES ('timetable_semester', ?)`, args: [tt.semester] });
  stmts.push({ sql: `INSERT OR REPLACE INTO kv VALUES ('fees_currency', ?)`, args: [fees.currency] });
  stmts.push({ sql: `INSERT OR REPLACE INTO kv VALUES ('hall_ticket_release', ?)`, args: [exams.hall_ticket_release] });
  stmts.push({ sql: `INSERT OR REPLACE INTO kv VALUES ('exam_rules', ?)`, args: [exams.rules] });
  for (const c of tt.courses) stmts.push({ sql: `INSERT INTO courses VALUES (?,?,?,?,?)`, args: [c.code, c.name, c.year, c.faculty, c.lab ? 1 : 0] });
  for (const t of tt.timetables) for (const [day, slots] of Object.entries(t.days as Record<string, Array<Record<string, string>>>)) for (const s of slots) stmts.push({ sql: `INSERT INTO slots (year, section, day, start, end, course, room) VALUES (?,?,?,?,?,?,?)`, args: [t.year, t.section, day, s.start!, s.end!, s.course!, s.room!] });
  for (const c of tt.changes) stmts.push({ sql: `INSERT INTO changes (date, year, section, course, kind, detail, new_room, new_start, new_end) VALUES (?,?,?,?,?,?,?,?,?)`, args: [c.date, c.year, c.section, c.course, c.kind, c.detail, c.new_room ?? null, c.new_start ?? null, c.new_end ?? null] });
  for (const n of notices) stmts.push({ sql: `INSERT INTO notices VALUES (?,?,?,?,?,?,?)`, args: [n.id as string, n.date as string, n.category as string, JSON.stringify(n.years), n.title as string, n.body as string, (n.deadline as string | undefined) ?? null] });
  for (const f of fees.items) stmts.push({ sql: `INSERT INTO fee_items VALUES (?,?,?,?,?,?,?,?)`, args: [f.id, f.name, JSON.stringify(f.years), f.due, JSON.stringify(f.amounts), f.late_fee_per_day, f.late_fee_cap, f.note] });
  for (const e of exams.exams) stmts.push({ sql: `INSERT INTO exams (year, course, type, date, start, end, venue) VALUES (?,?,?,?,?,?,?)`, args: [e.year, e.course, e.type, e.date, e.start, e.end, e.venue] });
  stmts.push({ sql: `INSERT OR REPLACE INTO kv VALUES ('seeded', ?)`, args: [new Date().toISOString()] });
  await db.batch(stmts, 'write');
}

let shared: Promise<Client> | null = null;
/** The process-wide database. Tests call `useDb` to swap in a temporary one. */
export function getDb(): Promise<Client> {
  shared ??= openDb();
  return shared;
}
export function useDb(db: Promise<Client> | null): void {
  shared = db;
}
