import { ensureStudent, json, problem } from '@/lib/http';
import { revokeGrant } from '@/lib/grants';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, student } = await ensureStudent();
  return (await revokeGrant(db, student, id)) ? json({ ok: true }) : problem(404, 'not_found', 'No active grant with that id.');
}
