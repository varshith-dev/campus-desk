// The site's tools over MCP (JSON-RPC 2.0 over HTTP POST, JSON replies). Same grants, same scopes, same ledger as the
// REST endpoint. This is not the front-agent facade from the spec: it exposes the six site actions only.
import { AGENT_CORS, bearerOf, json, preflight } from '@/lib/http';
import { getDb } from '@/lib/db';
import { GrantError, authenticateToken } from '@/lib/grants';
import { appendLedger } from '@/lib/ledger';
import { loadCampusData } from '@/lib/store';
import { ToolError, runTool, toolCatalog } from '@/lib/tools';

export const OPTIONS = preflight;
export const dynamic = 'force-dynamic';

const rpcError = (id: unknown, code: number, message: string, status = 200) => json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, status, AGENT_CORS);
const rpcResult = (id: unknown, result: unknown) => json({ jsonrpc: '2.0', id, result }, 200, AGENT_CORS);

export async function POST(req: Request) {
  let msg: { id?: unknown; method?: string; params?: Record<string, any> };
  try {
    msg = await req.json();
  } catch {
    return rpcError(null, -32700, 'Parse error', 400);
  }
  const db = await getDb();
  const catalog = toolCatalog((await loadCampusData(db)).department);
  if (msg.method === 'notifications/initialized') return new Response(null, { status: 202, headers: AGENT_CORS });
  if (msg.method === 'initialize') {
    return rpcResult(msg.id, { protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'campus-desk', version: '2.0.0' }, instructions: 'Sample data for a made-up department. Calls need a grant token from the student.' });
  }
  if (msg.method === 'ping') return rpcResult(msg.id, {});
  if (msg.method === 'tools/list') {
    return rpcResult(msg.id, { tools: catalog.map((t) => ({ name: t.name, description: `${t.purpose} Needs scope ${t.scope}.`, inputSchema: t.schema, annotations: { readOnlyHint: t.effect === 'read', destructiveHint: false } })) });
  }
  if (msg.method === 'tools/call') {
    const name = String(msg.params?.name ?? '');
    const spec = catalog.find((t) => t.name === name);
    if (!spec) return rpcError(msg.id, -32602, `Unknown tool ${name}`);
    try {
      const { grant, student } = await authenticateToken(db, bearerOf(req), req.headers.get('origin'), spec.scope, name);
      const caller = { kind: 'outside' as const, name: grant.agentName, origin: grant.origin };
      try {
        const { result } = await runTool(name, msg.params?.arguments ?? {}, { db, student, write: 'propose', source: `${grant.agentName} (MCP)`, grantId: grant.id });
        await appendLedger(db, student.id, { type: 'tool', decision: spec.effect === 'write' ? 'pending' : 'allowed', caller, tool: name, effect: spec.effect, grantId: grant.id, scopes: [spec.scope], fields: spec.reads, args: msg.params?.arguments, note: 'Over MCP.' });
        return rpcResult(msg.id, { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false });
      } catch (e) {
        if (!(e instanceof ToolError)) throw e;
        await appendLedger(db, student.id, { type: 'tool', decision: 'failed', caller, tool: name, grantId: grant.id, reason: e.message });
        return rpcResult(msg.id, { content: [{ type: 'text', text: e.message }], isError: true });
      }
    } catch (e) {
      if (e instanceof GrantError) return json({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32001, message: e.message, data: { code: e.code } } }, e.status, AGENT_CORS);
      throw e;
    }
  }
  return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
}

export async function GET() {
  return json({ ok: true, protocol: 'MCP over HTTP POST', url: '/api/mcp', methods: ['initialize', 'tools/list', 'tools/call'] }, 200, AGENT_CORS);
}
