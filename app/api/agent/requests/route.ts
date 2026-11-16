// Step 2 of agent access: an outside agent asks a student for permission. Public, CORS open, rate limited.
import { AGENT_CORS, clientKey, json, preflight, problem, rateLimit, readJson } from '@/lib/http';
import { getDb } from '@/lib/db';
import { GrantError, createAccessRequest } from '@/lib/grants';
import { SCOPES } from '@/lib/tools';

export const OPTIONS = preflight;

export async function POST(req: Request) {
  if (!rateLimit(`access:${clientKey(req)}`, 20, 60_000)) return problem(429, 'rate_limited', 'Too many requests. Wait a minute.', AGENT_CORS);
  const b = await readJson(req);
  try {
    const { id, pollSecret } = await createAccessRequest(await getDb(), { code: b.desk_code, name: b.agent_name, origin: b.origin ?? req.headers.get('origin'), scopes: b.scopes, reason: b.reason });
    return json({ ok: true, request_id: id, poll_secret: pollSecret, status: 'pending', poll: { method: 'GET', url: `/api/agent/requests/${id}`, header: 'Authorization: Bearer <poll_secret>' }, message: 'The student has to approve this on their Campus Desk Activity page. Poll until it is approved or declined.' }, 202, AGENT_CORS);
  } catch (e) {
    if (e instanceof GrantError) return problem(e.status, e.code, e.message, AGENT_CORS);
    throw e;
  }
}

export async function GET() {
  return json({ ok: true, scopes: SCOPES, how: 'POST { desk_code, agent_name, origin, scopes, reason } to start. See /api/agent/tools for the tools each scope opens.' }, 200, AGENT_CORS);
}
