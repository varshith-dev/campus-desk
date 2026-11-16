import { json, problem, rateLimit, clientKey, readJson, startSessionFor, peekStudent } from '@/lib/http';
import { getDb } from '@/lib/db';
import { AuthError, mergeGuestReminders, signIn } from '@/lib/store';

export async function POST(req: Request) {
  const b = await readJson(req);
  const email = String(b.email ?? '').slice(0, 120);
  if (!rateLimit(`signin:${clientKey(req)}:${email.toLowerCase()}`, 8, 60_000)) return problem(429, 'rate_limited', 'Too many tries. Wait a minute.');
  try {
    const db = await getDb();
    const student = await signIn(db, email, String(b.password ?? '').slice(0, 200));
    const guest = (await peekStudent()).student;
    if (guest?.kind === 'guest') await mergeGuestReminders(db, guest.id, student.id);
    await startSessionFor(db, student.id);
    return json({ ok: true, student: { kind: student.kind, name: student.name, email: student.email, profile: student.profile } });
  } catch (e) {
    if (e instanceof AuthError) return problem(401, 'bad_credentials', e.message);
    throw e;
  }
}
