import { ensureStudent, json } from '@/lib/http';
import { listLedger } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { db, student } = await ensureStudent();
  const u = new URL(req.url);
  return json({ ok: true, entries: await listLedger(db, student.id, { afterSeq: Number(u.searchParams.get('after') ?? 0) || 0, limit: Number(u.searchParams.get('limit') ?? 100) || 100 }) });
}
