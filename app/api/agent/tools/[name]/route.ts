// Step 5: an outside agent calls one tool. The token, the scope and the caller's origin are all checked, and
// every call, allowed or denied, is written to the student's ledger and answered with a signed receipt.
import { AGENT_CORS, bearerOf, clientKey, json, preflight, problem, rateLimit, readJson } from '@/lib/http';
import { getDb } from '@/lib/db';
import { GrantError, authenticateToken } from '@/lib/grants';
import { appendLedger } from '@/lib/ledger';
import { loadCampusData } from '@/lib/store';
import { ToolError, runTool, toolCatalog } from '@/lib/tools';

export const OPTIONS = preflight;
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const db = await getDb();
  const spec = toolCatalog((await loadCampusData(db)).department).find((t) => t.name === name);
  if (!spec) return problem(404, 'unknown_tool', `There is no tool called ${name}.`, AGENT_CORS);
  try {
    const { grant, student } = await authenticateToken(db, bearerOf(req), req.headers.get('origin'), spec.scope, name);
    if (!rateLimit(`tool:${grant.id}`, 60, 60_000)) {
      await appendLedger(db, student.id, { type: 'tool', decision: 'denied', caller: { kind: 'outside', name: grant.agentName, origin: grant.origin }, tool: name, grantId: grant.id, reason: 'Rate limit: 60 calls a minute.' });
      return problem(429, 'rate_limited', 'This grant is limited to 60 calls a minute.', AGENT_CORS);
    }
    const body = await readJson(req);
    const caller = { kind: 'outside' as const, name: grant.agentName, origin: grant.origin };
    try {
      const { result } = await runTool(name, body.args ?? body, { db, student, write: 'propose', source: `${grant.agentName} (${grant.origin})`, grantId: grant.id });
      const receipt = await appendLedger(db, student.id, { type: 'tool', decision: spec.effect === 'write' ? 'pending' : 'allowed', caller, tool: name, effect: spec.effect, grantId: grant.id, scopes: [spec.scope], fields: spec.reads, args: body.args ?? body });
      return json({ ok: true, result, receipt }, 200, AGENT_CORS);
    } catch (e) {
      if (!(e instanceof ToolError)) throw e;
      await appendLedger(db, student.id, { type: 'tool', decision: 'failed', caller, tool: name, grantId: grant.id, reason: e.message });
      return problem(e.code === 'unknown_tool' ? 404 : 400, e.code, e.message, AGENT_CORS);
    }
  } catch (e) {
    if (e instanceof GrantError) return problem(e.status, e.code, e.message, AGENT_CORS);
    throw e;
  }
}
