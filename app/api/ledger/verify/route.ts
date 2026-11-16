import { ensureStudent, json } from '@/lib/http';
import { verifyChain } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { db, student } = await ensureStudent();
  return json({ ok: true, report: await verifyChain(db, student.id) });
}
