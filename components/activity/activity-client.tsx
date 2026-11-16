'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Ban, Check, ClipboardCopy, Fingerprint, KeyRound, RefreshCw, ShieldCheck, ShieldX, Unplug, UserRoundCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/desk/bits';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface Entry {
  id: string;
  seq: number;
  ts: string;
  payload: Record<string, any>;
  prev_hash: string;
  hash: string;
  sig: string;
  kid: string;
}
interface Request {
  id: string;
  agentName: string;
  origin: string;
  scopes: string[];
  reason: string;
  createdAt: string;
}
interface Grant {
  id: string;
  agentName: string;
  origin: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}
interface Access {
  pairingCode: string | null;
  requests: Request[];
  grants: Grant[];
}
type Chain = { ok: boolean; entries: number; brokenAt?: number; reason?: string };

const DECISION: Record<string, string> = {
  allowed: 'border-sage text-sage',
  confirmed: 'border-sage text-sage',
  issued: 'border-sage text-sage',
  denied: 'border-brick text-brick',
  failed: 'border-brick text-brick',
  declined: 'border-brick text-brick',
  revoked: 'border-brick text-brick',
  pending: 'border-mustard text-[#7a5200] dark:text-mustard',
  requested: 'border-mustard text-[#7a5200] dark:text-mustard',
  withheld: 'border-pencil text-pencil',
};

const fmtTime = (ts: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(ts));
const fmtDay = (ts: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(new Date(ts));

function line(e: Entry): string {
  const p = e.payload;
  const who = p.caller?.name ?? 'Unknown';
  switch (p.type) {
    case 'tool':
      return `${who} ${p.decision === 'denied' ? 'was refused' : p.decision === 'failed' ? 'failed on' : p.decision === 'pending' ? 'proposed' : 'called'} ${p.tool ?? 'a tool'}`;
    case 'consent':
      return `${p.decision === 'allowed' ? 'You allowed' : 'You denied'} ${p.tool ?? 'a request'}`;
    case 'confirm':
      return `${p.decision === 'confirmed' ? 'You confirmed' : 'You declined'} ${p.tool ?? 'a write'}${p.caller?.kind === 'outside' ? ` from ${who}` : ''}`;
    case 'access_request':
      return `${who} asked for access`;
    case 'grant':
      return p.decision === 'issued' ? `You approved ${who}` : `You declined ${who}`;
    case 'revoke':
      return `You ended access for ${who}`;
    case 'private_context':
      return 'Private fields held back from another site';
    default:
      return String(p.type);
  }
}

export function ActivityClient({ initialEntries, initialChain, initialAccess, scopes, ttlChoices, peerUrl }: { initialEntries: Entry[]; initialChain: Chain; initialAccess: Access; scopes: Record<string, string>; ttlChoices: string[]; peerUrl: string }) {
  const reduce = useReducedMotion();
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [access, setAccess] = useState<Access>(initialAccess);
  const [chain, setChain] = useState<Chain>(initialChain);
  const [filter, setFilter] = useState<'all' | 'outside' | 'denied'>('all');
  const [live, setLive] = useState(false);
  const [checking, setChecking] = useState(false);
  const lastSeq = useRef(initialEntries[0]?.seq ?? 0);
  const [now, setNow] = useState(() => Date.now());

  const loadAccess = useCallback(async () => {
    const r = await (await fetch('/api/access')).json();
    setAccess({ pairingCode: r.pairingCode, requests: r.requests, grants: r.grants });
  }, []);

  // Live tape: server-sent events. The stream closes every 25 seconds and the browser reconnects with Last-Event-ID.
  useEffect(() => {
    void loadAccess();
    const es = new EventSource(`/api/ledger/stream?after=${lastSeq.current}`);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener('entry', (ev) => {
      const e = JSON.parse((ev as MessageEvent).data) as Entry;
      lastSeq.current = Math.max(lastSeq.current, e.seq);
      setEntries((p) => (p.some((x) => x.id === e.id) ? p : [e, ...p].slice(0, 200)));
      if (['access_request', 'grant', 'revoke'].includes(e.payload.type)) void loadAccess();
    });
    const tick = setInterval(() => setNow(Date.now()), 15000);
    const poll = setInterval(() => void loadAccess(), 6000);
    return () => {
      es.close();
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [loadAccess]);

  const shown = entries.filter((e) => (filter === 'all' ? true : filter === 'outside' ? e.payload.caller?.kind === 'outside' : ['denied', 'failed', 'declined', 'revoked'].includes(e.payload.decision)));

  async function verifyAll() {
    setChecking(true);
    const r = await (await fetch('/api/ledger/verify')).json();
    setChain(r.report);
    setChecking(false);
    r.report.ok ? toast.success(`Chain intact: ${r.report.entries} signed entries.`) : toast.error(`Chain broken at entry ${r.report.brokenAt}. ${r.report.reason}`);
  }
  async function verifyOne(e: Entry) {
    const r = await (await fetch('/api/receipts/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receipt: e }) })).json();
    r.valid ? toast.success('This receipt is genuine: the hash matches and the signature verifies.') : toast.error(r.reason ?? 'Not valid.');
  }
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied.`);
    } catch {
      toast.error('Copy is blocked in this browser.');
    }
  }
  async function newCode() {
    const r = await (await fetch('/api/access/pair', { method: 'POST' })).json();
    setAccess((a) => ({ ...a, pairingCode: r.pairingCode }));
    toast('New pairing code. The old one no longer works.');
  }
  async function revoke(id: string) {
    const res = await fetch(`/api/access/grants/${id}`, { method: 'DELETE' });
    res.ok ? toast('Access ended. Calls with that token are refused now.') : toast.error('Could not end it.');
    void loadAccess();
  }

  const active = access.grants.filter((g) => !g.revokedAt && new Date(g.expiresAt).getTime() > now);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
      <section aria-labelledby="tape-h" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 id="tape-h" className="text-2xl font-semibold">
            The tape
          </h2>
          <span className={cn('inline-flex items-center gap-1.5 font-mono text-xs', live ? 'text-sage' : 'text-muted-foreground')} role="status">
            <span className={cn('size-2 rounded-full', live ? 'bg-sage' : 'bg-muted-foreground', live && !reduce && 'animate-pulse')} /> {live ? 'Live' : 'Reconnecting'}
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5" role="group" aria-label="Filter">
            {([['all', 'Everything'], ['outside', 'Outside agents'], ['denied', 'Refused']] as const).map(([k, t]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn('rounded-full border px-3 py-1 text-sm', filter === k ? 'border-foreground bg-foreground text-background' : 'bg-card text-muted-foreground hover:border-primary')}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className={cn('mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3', chain.ok ? 'border-sage/50 bg-sage/10' : 'border-destructive/50 bg-destructive/10')} data-testid="chain">
          {chain.ok ? <ShieldCheck className="size-5 text-sage" /> : <ShieldX className="size-5 text-destructive" />}
          <p className="flex-1 text-sm">
            {chain.ok ? (
              <>
                <strong>{chain.entries}</strong> signed {chain.entries === 1 ? 'entry' : 'entries'}, each linked to the one before. Chain intact.
              </>
            ) : (
              <>
                Chain broken at entry {chain.brokenAt}. {chain.reason}
              </>
            )}
          </p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={verifyAll} disabled={checking}>
            <Fingerprint className="size-3.5" /> {checking ? 'Checking...' : 'Verify the whole chain'}
          </Button>
        </div>

        {shown.length === 0 ? (
          <EmptyState title="The tape is empty." icon={<KeyRound className="size-8" />}>
            Ask a question on the Ask page, or connect an outside agent with your pairing code. Each step prints a receipt here.
          </EmptyState>
        ) : (
          <ol className="space-y-2" aria-label="Receipts, newest first" data-testid="tape">
            <AnimatePresence initial={false}>
              {shown.map((e) => {
                const p = e.payload;
                const outside = p.caller?.kind === 'outside';
                return (
                  <motion.li key={e.id} layout={!reduce} initial={reduce ? false : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={cn('tape rounded-lg border bg-card p-3 pl-4', outside && 'border-l-4 border-l-pencil')} data-decision={p.decision} data-type={p.type}>
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                      <span className="mono w-[4.2rem] shrink-0 pt-0.5 text-xs text-muted-foreground" title={`${fmtDay(e.ts)} IST`}>
                        {fmtTime(e.ts)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug">{line(e)}</p>
                        <p className="mono mt-0.5 break-words text-xs text-muted-foreground">
                          {outside ? `${p.caller.origin ?? 'no origin'}` : 'this site'}
                          {p.scopes?.length ? ` · ${p.scopes.join(', ')}` : ''}
                          {p.args ? ` · ${p.args}` : ''}
                        </p>
                        {p.reason && <p className="mt-1 text-sm text-muted-foreground">{p.reason}</p>}
                        {p.fields?.length > 0 && (
                          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {p.type === 'private_context' ? 'Held back:' : 'Read from your record:'}
                            {p.fields.map((f: string) => (
                              <span key={f} className="mono rounded-sm bg-secondary px-1.5 py-0.5">
                                {f}
                              </span>
                            ))}
                            <span>(names only, never the values)</span>
                          </p>
                        )}
                      </div>
                      <span className={cn('stamp shrink-0', DECISION[p.decision] ?? 'border-border text-muted-foreground')}>{p.decision}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-dashed pt-2">
                      <span className="mono text-[0.7rem] text-muted-foreground" title={e.hash}>
                        {e.id} · #{e.hash.slice(0, 10)}
                      </span>
                      <span className="ml-auto flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => verifyOne(e)}>
                          <Check className="size-3" /> Verify
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => copy(JSON.stringify(e, null, 2), 'Receipt')}>
                          <ClipboardCopy className="size-3" /> Copy
                        </Button>
                      </span>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        )}
      </section>

      <div className="space-y-6">
        <section aria-labelledby="pair-h" className="chalk-panel rounded-2xl p-5 shadow-[5px_5px_0_0_var(--mustard)]">
          <h2 id="pair-h" className="font-display text-xl font-semibold">
            Your pairing code
          </h2>
          <p className="mt-1 text-sm text-chalk-foreground/75">Read this to an outside agent so it can ask you for access. Only someone who has it can send you a request.</p>
          <p className="mono my-4 rounded-md bg-black/25 py-3 text-center text-3xl font-medium tracking-[0.2em]" data-testid="pairing-code">
            {access.pairingCode ?? '...'}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => access.pairingCode && copy(access.pairingCode, 'Code')}>
              <ClipboardCopy className="size-3.5" /> Copy
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-chalk-foreground hover:bg-white/10 hover:text-chalk-foreground" onClick={newCode}>
              <RefreshCw className="size-3.5" /> New code
            </Button>
          </div>
        </section>

        <section aria-labelledby="req-h" className="rounded-xl border bg-card p-5">
          <h2 id="req-h" className="mb-3 flex items-center gap-2 text-xl font-semibold">
            <UserRoundCheck className="size-5" /> Waiting for your answer
            {access.requests.length > 0 && <span className="mono rounded-full bg-primary px-2 text-xs text-primary-foreground">{access.requests.length}</span>}
          </h2>
          {access.requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests. When an outside agent uses your code, it appears here and nothing is shared until you approve.</p>
          ) : (
            <ul className="space-y-4">
              {access.requests.map((r) => (
                <RequestCard key={r.id} r={r} scopes={scopes} ttlChoices={ttlChoices} onDone={() => void loadAccess()} />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="grants-h" className="rounded-xl border bg-card p-5">
          <h2 id="grants-h" className="mb-3 flex items-center gap-2 text-xl font-semibold">
            <Unplug className="size-5" /> Active access
          </h2>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agent can call this desk right now.</p>
          ) : (
            <ul className="space-y-3" data-testid="grants">
              {active.map((g) => (
                <li key={g.id} className="rounded-lg border p-3">
                  <p className="font-medium">{g.agentName}</p>
                  <p className="mono break-all text-xs text-muted-foreground">{g.origin}</p>
                  <p className="mt-1.5 flex flex-wrap gap-1">
                    {g.scopes.map((s) => (
                      <span key={s} className="mono rounded-sm bg-secondary px-1.5 py-0.5 text-[0.68rem]">
                        {s}
                      </span>
                    ))}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="mono text-xs text-muted-foreground">ends in {Math.max(1, Math.round((new Date(g.expiresAt).getTime() - now) / 60000))} min</span>
                    <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => revoke(g.id)}>
                      <Ban className="size-3.5" /> End access
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="try-h" className="rounded-xl border bg-secondary/50 p-5 text-sm">
          <h2 id="try-h" className="mb-2 text-xl font-semibold">
            Try it from another site
          </h2>
          <p className="text-muted-foreground">
            The sample library site runs a study planner on its own origin. Open it, paste your code, and watch the request land here.
          </p>
          <Button asChild className="mt-3" size="sm">
            <a href={`${peerUrl}/study-planner.html`} target="_blank" rel="noreferrer">
              Open the library study planner
            </a>
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Or from a terminal: <code className="mono">npm run agent:demo -- {access.pairingCode ?? 'EB-XXXXXX'}</code>
          </p>
        </section>
      </div>
    </div>
  );
}

function RequestCard({ r, scopes, ttlChoices, onDone }: { r: Request; scopes: Record<string, string>; ttlChoices: string[]; onDone: () => void }) {
  const [chosen, setChosen] = useState<string[]>(r.scopes);
  const [ttl, setTtl] = useState('1h');
  const [busy, setBusy] = useState(false);
  async function decide(decision: 'approve' | 'decline') {
    setBusy(true);
    const res = await fetch(`/api/access/requests/${r.id}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, scopes: chosen, ttl }) });
    setBusy(false);
    if (!res.ok) return toast.error((await res.json())?.error?.message ?? 'Could not save your answer.');
    toast(decision === 'approve' ? 'Approved. A signed grant was issued once to that agent.' : 'Declined.');
    onDone();
  }
  return (
    <li className="rounded-lg border-2 border-mustard/70 bg-mustard/10 p-3" data-testid="request">
      <p className="font-medium">{r.agentName}</p>
      <p className="mono break-all text-xs text-muted-foreground">{r.origin}</p>
      <blockquote className="my-2 border-l-2 pl-3 text-sm italic text-muted-foreground">&ldquo;{r.reason}&rdquo;</blockquote>
      <fieldset className="space-y-1.5">
        <legend className="eyebrow mb-1">It asks to</legend>
        {r.scopes.map((s) => (
          <label key={s} className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 size-4 accent-[var(--brick)]" checked={chosen.includes(s)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s] : c.filter((x) => x !== s)))} />
            <span>
              {scopes[s] ?? s} <span className="mono text-[0.68rem] text-muted-foreground">{s}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          For
          <Select value={ttl} onValueChange={setTtl}>
            <SelectTrigger size="sm" className="h-8 w-24" aria-label="How long">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ttlChoices.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Button size="sm" className="ml-auto" disabled={busy || chosen.length === 0} onClick={() => decide('approve')}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => decide('decline')}>
          Decline
        </Button>
      </div>
    </li>
  );
}
