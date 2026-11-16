import { ensureStudent } from '@/lib/http';
import { listReminders } from '@/lib/store';
import { toIcs } from '@/lib/ics';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { db, student } = await ensureStudent();
  const body = toIcs(await listReminders(db, student.id, 'saved'));
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="campus-desk-reminders.ics"', 'Cache-Control': 'no-store' } });
}
