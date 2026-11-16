import { ensureStudent, json, problem, readJson } from '@/lib/http';
import { addReminder, listReminders } from '@/lib/store';
import { appendLedger } from '@/lib/ledger';
import { checkSchema } from '@/src/runtime/schema';
import { toolCatalog } from '@/lib/tools';
import { loadCampusData } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { db, student } = await ensureStudent();
  return json({ ok: true, saved: await listReminders(db, student.id, 'saved'), pending: await listReminders(db, student.id, 'pending'), signedIn: student.kind === 'account' });
}

/** The student adds a reminder by hand on the Reminders page. This is the student's own act, so it saves at once. */
export async function POST(req: Request) {
  const { db, student } = await ensureStudent();
  const b = await readJson(req);
  const spec = toolCatalog((await loadCampusData(db)).department).find((t) => t.name === 'save_reminder')!;
  const input = { title: b.title, date: b.date, ...(b.time ? { time: b.time } : {}), ...(b.note ? { note: b.note } : {}) };
  const errs = checkSchema(spec.schema, input, 'reminder');
  if (errs.length) return problem(400, 'bad_reminder', errs.join('; '));
  const r = await addReminder(db, student.id, { ...(input as { title: string; date: string; time?: string; note?: string }), status: 'saved', source: 'Reminders page' });
  await appendLedger(db, student.id, { type: 'confirm', decision: 'confirmed', caller: { kind: 'desk', name: 'Reminders page' }, tool: 'save_reminder', effect: 'write', args: input });
  return json({ ok: true, reminder: r }, 201);
}
