// Discovery: which tools an agent can call, what each needs, and how to call it.
import { AGENT_CORS, json, preflight } from '@/lib/http';
import { getDb } from '@/lib/db';
import { loadCampusData } from '@/lib/store';
import { SCOPES, toolCatalog } from '@/lib/tools';

export const OPTIONS = preflight;

export async function GET() {
  const data = await loadCampusData(await getDb());
  return json(
    {
      ok: true,
      site: data.department.short,
      sample: true,
      auth: 'Authorization: Bearer <grant token>. Get one through POST /api/agent/requests and the student\u2019s approval.',
      scopes: SCOPES,
      tools: toolCatalog(data.department).map((t) => ({ name: t.name, purpose: t.purpose, effect: t.effect, scope: t.scope, reads_private_fields: t.reads, input_schema: t.schema, call: { method: 'POST', url: `/api/agent/tools/${t.name}` } })),
      mcp: { url: '/api/mcp', transport: 'streamable-http (JSON replies)' },
    },
    200,
    AGENT_CORS,
  );
}
