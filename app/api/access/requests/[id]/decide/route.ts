import { ensureStudent, json, problem, readJson } from '@/lib/http';
import { GrantError, decideRequest } from '@/lib/grants';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, student } = await ensureStudent();
  const b = await readJson(req);
  if (b.decision !== 'approve' && b.decision !== 'decline') return problem(400, 'bad_decision', 'decision must be "approve" or "decline".');
  try {
    const r = await decideRequest(db, student, id, b.decision, { scopes: Array.isArray(b.scopes) ? b.scopes.map(String) : undefined, ttl: typeof b.ttl === 'string' ? b.ttl : undefined });
    return json({ ok: true, grant: r.grant });
  } catch (e) {
    if (e instanceof GrantError) return problem(e.status, e.code, e.message);
    throw e;
  }
}
