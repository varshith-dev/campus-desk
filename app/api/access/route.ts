// The student's side of agent access: pairing code, requests waiting, active grants.
import { ensureStudent, json } from '@/lib/http';
import { listGrants, pendingRequests, TTL_CHOICES } from '@/lib/grants';
import { SCOPES } from '@/lib/tools';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { db, student } = await ensureStudent();
  return json({ ok: true, pairingCode: student.pairingCode, requests: await pendingRequests(db, student.id), grants: await listGrants(db, student.id), scopes: SCOPES, ttlChoices: Object.keys(TTL_CHOICES) });
}
