import { AGENT_CORS } from '@/lib/http';
import { getDb } from '@/lib/db';
import { keysDocument } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(await keysDocument(await getDb()), { headers: { ...AGENT_CORS, 'Cache-Control': 'public, max-age=300' } });
}
