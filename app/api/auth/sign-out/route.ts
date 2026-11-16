import { clearSessionCookie, json } from '@/lib/http';
import { getDb } from '@/lib/db';
import { endSession } from '@/lib/store';

export async function POST() {
  const db = await getDb();
  await endSession(db, await clearSessionCookie());
  return json({ ok: true });
}
