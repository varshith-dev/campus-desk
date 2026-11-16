import { ensureStudent, json } from '@/lib/http';
import { rotatePairingCode } from '@/lib/store';

export async function POST() {
  const { db, student } = await ensureStudent();
  return json({ ok: true, pairingCode: await rotatePairingCode(db, student.id) });
}
