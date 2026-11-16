// Anyone can check a receipt. No sign-in, no data about the student is returned.
import { AGENT_CORS, json, preflight, readJson } from '@/lib/http';
import { getDb } from '@/lib/db';
import { verifyReceipt } from '@/lib/ledger';

export const OPTIONS = preflight;

export async function POST(req: Request) {
  const b = await readJson(req);
  const receipt = (b.receipt ?? b) as Parameters<typeof verifyReceipt>[1];
  const r = await verifyReceipt(await getDb(), receipt);
  return json({ ok: true, valid: r.ok, reason: r.reason }, 200, AGENT_CORS);
}
