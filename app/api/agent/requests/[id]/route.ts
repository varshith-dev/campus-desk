import { AGENT_CORS, bearerOf, json, preflight, problem, rateLimit, clientKey } from '@/lib/http';
import { getDb } from '@/lib/db';
import { GrantError, pollRequest } from '@/lib/grants';

export const OPTIONS = preflight;
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!rateLimit(`poll:${clientKey(req)}:${id}`, 120, 60_000)) return problem(429, 'rate_limited', 'Poll less often. Every 2 seconds is plenty.', AGENT_CORS);
  const secret = bearerOf(req);
  if (!secret) return problem(401, 'no_secret', 'Send the poll_secret as a bearer token.', AGENT_CORS);
  try {
    return json({ ok: true, ...(await pollRequest(await getDb(), id, secret)) }, 200, AGENT_CORS);
  } catch (e) {
    if (e instanceof GrantError) return problem(e.status, e.code, e.message, AGENT_CORS);
    throw e;
  }
}
