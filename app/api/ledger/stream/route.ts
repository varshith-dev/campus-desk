// Server-sent events: new ledger entries as they happen. The stream ends after about 25 seconds and the browser
// reconnects on its own with Last-Event-ID, which keeps it working on hosts that cap function time.
import { ensureStudent } from '@/lib/http';
import { listLedger } from '@/lib/ledger';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  const { db, student } = await ensureStudent();
  let after = Number(req.headers.get('last-event-id') ?? new URL(req.url).searchParams.get('after') ?? 0) || 0;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const started = Date.now();
      controller.enqueue(enc.encode('retry: 1500\n\n'));
      try {
        while (Date.now() - started < 25_000 && !req.signal.aborted) {
          const fresh = (await listLedger(db, student.id, { afterSeq: after, limit: 50 })).reverse();
          for (const e of fresh) {
            after = Math.max(after, e.seq);
            controller.enqueue(enc.encode(`id: ${e.seq}\nevent: entry\ndata: ${JSON.stringify(e)}\n\n`));
          }
          if (!fresh.length) controller.enqueue(enc.encode(': keep-alive\n\n'));
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch {
        // The client went away.
      }
      try {
        controller.close();
      } catch {
        // Already closed.
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive' } });
}
