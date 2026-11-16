import { json } from '@/lib/http';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    const n = await db.execute(`SELECT COUNT(*) AS n FROM notices`);
    return json({ ok: true, notices: Number(n.rows[0]!.n) });
  } catch {
    return json({ ok: false, error: 'database unavailable' }, 503);
  }
}
