// The Ask page reports a consent decision about another site, and gets a signed receipt back.
import { ensureStudent, json, problem, readJson } from '@/lib/http';
import { appendLedger } from '@/lib/ledger';
import { normaliseOrigin } from '@/lib/grants';

export async function POST(req: Request) {
  const { db, student } = await ensureStudent();
  const b = await readJson(req);
  if (b.kind === 'private_context') {
    // The page reports which private fields its runtime held back from another site.
    const origin = normaliseOrigin(b.origin);
    const withheld = Array.isArray(b.withheld) ? (b.withheld as unknown[]).map(String).slice(0, 10) : [];
    const receipt = await appendLedger(db, student.id, { type: 'private_context', decision: 'withheld', caller: { kind: 'desk', name: 'Campus Desk page' }, reason: `Not sent to ${origin}.`, fields: withheld });
    return json({ ok: true, receipt });
  }
  const decision = b.decision;
  if (decision !== 'allowed' && decision !== 'denied') return problem(400, 'bad_decision', 'decision must be "allowed" or "denied".');
  let origin: string;
  try {
    origin = normaliseOrigin(b.origin);
  } catch {
    return problem(400, 'bad_origin', 'origin must be a web origin.');
  }
  const withheld = Array.isArray(b.withheld) ? (b.withheld as unknown[]).map(String).slice(0, 10) : [];
  const receipt = await appendLedger(db, student.id, {
    type: 'consent',
    decision,
    caller: { kind: 'desk', name: 'Campus Desk page' },
    tool: typeof b.network === 'string' ? `load ${b.network.slice(0, 60)}` : undefined,
    reason: `Destination ${origin}. ${String(b.purpose ?? 'Run its agents in this browser').slice(0, 160)}. It never gets the model key, the class or the chat.`,
    scopes: typeof b.scope === 'string' ? [b.scope.slice(0, 40)] : ['session'],
    fields: withheld.length ? withheld : undefined,
  });
  return json({ ok: true, receipt });
}
