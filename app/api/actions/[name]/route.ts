// The Ask page's site actions. The page's browser runtime calls these with the student's session cookie.
import { ensureStudent, json, problem, readJson } from '@/lib/http';
import { appendLedger } from '@/lib/ledger';
import { loadCampusData } from '@/lib/store';
import { ToolError, runTool, toolCatalog } from '@/lib/tools';
import { ACTION_BINDINGS } from '@/network/campus-desk';

export const dynamic = 'force-dynamic';

/** Which published agent owns a tool, for the ledger's "who called it" column. */
const agentFor = (tool: string) => Object.entries(ACTION_BINDINGS).find(([, tools]) => tools.includes(`website_${tool}`))?.[0] ?? 'campus_desk';

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const { db, student } = await ensureStudent();
  const body = await readJson(req);
  const caller = { kind: 'desk' as const, name: agentFor(name) };
  try {
    const wanted = toolCatalog((await loadCampusData(db)).department).find((t) => t.name === name);
    if (wanted?.effect === 'write' && body.confirmed !== true) throw new ToolError('needs_confirmation', 'A write needs the student to confirm it first.');
    const { result, spec } = await runTool(name, body.args ?? {}, { db, student, write: 'confirmed', source: 'Ask page', clock: typeof body.now === 'string' ? body.now : null });
    const receipt = await appendLedger(db, student.id, { type: spec.effect === 'write' ? 'confirm' : 'tool', decision: spec.effect === 'write' ? 'confirmed' : 'allowed', caller, tool: name, effect: spec.effect, fields: spec.reads, args: body.args, scopes: [spec.scope] });
    return json({ ok: true, result, receipt: { id: receipt.id, hash: receipt.hash } });
  } catch (e) {
    if (e instanceof ToolError) {
      const status = e.code === 'unknown_tool' ? 404 : e.code === 'needs_confirmation' ? 409 : 400;
      await appendLedger(db, student.id, { type: 'tool', decision: 'failed', caller, tool: name, reason: e.message });
      return problem(status, e.code, e.message);
    }
    throw e;
  }
}
