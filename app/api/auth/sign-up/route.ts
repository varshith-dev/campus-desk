import { json, problem, rateLimit, clientKey, readJson, startSessionFor, peekStudent } from '@/lib/http';
import { getDb } from '@/lib/db';
import { AuthError, loadCampusData, mergeGuestReminders, signUp } from '@/lib/store';
import { appendLedger } from '@/lib/ledger';

export async function POST(req: Request) {
  if (!rateLimit(`signup:${clientKey(req)}`, 10, 60_000)) return problem(429, 'rate_limited', 'Too many tries. Wait a minute.');
  const b = await readJson(req);
  const name = String(b.name ?? '').trim();
  const email = String(b.email ?? '').trim();
  const password = String(b.password ?? '');
  if (name.length < 2 || name.length > 60) return problem(400, 'bad_name', 'Enter your name (2 to 60 characters).');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return problem(400, 'bad_email', 'Enter a valid email address.');
  if (password.length < 10 || password.length > 200) return problem(400, 'weak_passphrase', 'Use a passphrase of at least 10 characters. Words with dashes are fine.');
  const db = await getDb();
  const data = await loadCampusData(db);
  const year = Number(b.year ?? 2);
  const section = String(b.section ?? 'A');
  const feeCategory = String(b.feeCategory ?? 'general');
  if (!data.department.years.includes(year) || !data.department.sections.includes(section) || !data.department.fee_categories.some((c) => c.id === feeCategory)) return problem(400, 'bad_profile', 'Pick a year, section and fee category from the lists.');
  try {
    const student = await signUp(db, { name, email, password, profile: { year, section, feeCategory } });
    const guest = (await peekStudent()).student;
    if (guest?.kind === 'guest') await mergeGuestReminders(db, guest.id, student.id);
    await startSessionFor(db, student.id);
    await appendLedger(db, student.id, { type: 'consent', decision: 'allowed', caller: { kind: 'desk', name: 'Campus Desk' }, note: 'Student account created.' });
    return json({ ok: true, student: { kind: student.kind, name: student.name, email: student.email, profile: student.profile } }, 201);
  } catch (e) {
    if (e instanceof AuthError) return problem(409, 'email_taken', e.message);
    throw e;
  }
}
