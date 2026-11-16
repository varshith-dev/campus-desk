import { ensureStudent, json, problem, readJson } from '@/lib/http';
import { decideReminder, removeReminder } from '@/lib/store';
import { appendLedger } from '@/lib/ledger';
import { getDb } from '@/lib/db';

/** Confirm or decline a reminder an outside agent proposed. This is the confirm-to-save step for agents. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, student } = await ensureStudent();
  const b = await readJson(req);
  if (b.decision !== 'saved' && b.decision !== 'declined') return problem(400, 'bad_decision', 'decision must be "saved" or "declined".');
  const r = await decideReminder(db, student.id, id, b.decision);
  if (!r) return problem(404, 'not_pending', 'That reminder is not waiting for an answer.');
  const g = r.grantId ? await db.execute({ sql: `SELECT agent_name, origin FROM grants WHERE id = ?`, args: [r.grantId] }) : null;
  const caller = g?.rows[0] ? { kind: 'outside' as const, name: String(g.rows[0].agent_name), origin: String(g.rows[0].origin) } : { kind: 'desk' as const, name: 'Reminders page' };
  await appendLedger(db, student.id, { type: 'confirm', decision: b.decision === 'saved' ? 'confirmed' : 'declined', caller, tool: 'save_reminder', effect: 'write', grantId: r.grantId, args: { title: r.title, date: r.date }, note: 'The student answered a proposed reminder.' });
  return json({ ok: true, reminder: r });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { student } = await ensureStudent();
  const db = await getDb();
  return (await removeReminder(db, student.id, id)) ? json({ ok: true }) : problem(404, 'not_found', 'No such reminder.');
}
