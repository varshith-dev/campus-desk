'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, CircleCheck, FileJson, FileCode2, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { loadRuntime } from '@/lib/client/runtime';
import { cn } from '@/lib/utils';
import { runChecks, type Check } from '@/src/site/checks';
import type { Manifest, NetworkDef } from '@aw/runtime';

interface Node {
  id: string;
  label: string;
  col: 0 | 1 | 2 | 3;
  kind: 'front' | 'agent' | 'action' | 'peer';
  sub?: string;
}

export function AgentsClient({ peerUrl }: { peerUrl: string }) {
  const [state, setState] = useState<{ manifest: Manifest; network: NetworkDef; checks: Check[]; tools: any } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const rt = await loadRuntime();
        const [manifest, tools] = await Promise.all([fetch('/agent-manifest.json').then((r) => r.json()) as Promise<Manifest>, fetch('/api/agent/tools').then((r) => r.json())]);
        const network = (await (await fetch(manifest.networks[0]!.hocon.replace('./', '/'))).json()) as NetworkDef;
        const runtimeOk = (await fetch((manifest as any).runtime.file.replace('./', '/'), { method: 'HEAD' })).ok;
        setState({ manifest, network, tools, checks: runChecks(rt, manifest, network, runtimeOk) });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  if (error)
    return (
      <p role="alert" className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
        <AlertTriangle className="size-5 text-destructive" /> Could not read the published files: {error}
      </p>
    );
  if (!state)
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading the published files">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );

  const { manifest, network, checks, tools } = state;
  const origin = typeof location === 'undefined' ? '' : location.origin;
  return (
    <div className="space-y-12">
      <section aria-labelledby="graph-h">
        <h2 id="graph-h" className="mb-1 text-3xl font-semibold">
          The agent network
        </h2>
        <p className="mb-4 max-w-2xl text-muted-foreground">Four small agents, six site actions and one peer site, all read from the published network file. The graph below is drawn from that file, not from a picture.</p>
        <Graph manifest={manifest} network={network} />
      </section>

      <section aria-labelledby="checks-h">
        <h2 id="checks-h" className="mb-1 text-3xl font-semibold">
          Checks that ran in your browser just now
        </h2>
        <p className="mb-4 text-muted-foreground">These use the published runtime file&rsquo;s own validators on the published manifest and network. The same checks run from a terminal with <code className="mono">npm run check</code>.</p>
        <ul className="grid gap-2 md:grid-cols-2" data-testid="checks">
          {checks.map((c, i) => (
            <li key={i} className={cn('flex gap-3 rounded-lg border bg-card p-3 text-sm', c.status === 'fail' && 'border-destructive/50 bg-destructive/10')} data-status={c.status}>
              {c.status === 'pass' ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-sage" /> : c.status === 'warn' ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-mustard" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />}
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="files-h">
        <h2 id="files-h" className="mb-4 text-3xl font-semibold">
          Published files
        </h2>
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[
            ['/agent-manifest.json', 'The index: networks, router, allowed peers, actions, runtime.', FileJson],
            ['/campus_desk.network.json', 'The agent graph. Data only, no code.', FileJson],
            ['/runtime/agentic-runtime.js', 'The browser runtime. This page loads it from here.', FileCode2],
            ['/links.json', 'Named links to peer networks.', FileJson],
            ['/api/agent/tools', 'Live tool catalog: scopes, schemas, how to call.', FileJson],
            ['/.well-known/campus-desk-keys.json', 'Public key that verifies grants and receipts.', FileJson],
          ].map(([href, text, Icon]) => {
            const I = Icon as typeof FileJson;
            return (
              <li key={href as string}>
                <a href={href as string} className="flex h-full gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary">
                  <I className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span>
                    <span className="mono block text-sm font-medium">{href as string}</span>
                    <span className="text-sm text-muted-foreground">{text as string}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="use-h">
        <h2 id="use-h" className="mb-4 text-3xl font-semibold">
          Three ways to use it from your site
        </h2>
        <Tabs defaultValue="run">
          <TabsList>
            <TabsTrigger value="run">Run the agents</TabsTrigger>
            <TabsTrigger value="live">Call the live tools</TabsTrigger>
            <TabsTrigger value="mcp">Over MCP</TabsTrigger>
          </TabsList>
          <TabsContent value="run" className="space-y-3">
            <p className="text-muted-foreground">Add the network URL to one of your agents&rsquo; tools and this origin to your manifest&rsquo;s <code className="mono">allowed_peers</code>. The network runs in your visitor&rsquo;s browser, with their model, after they agree on a consent card. You get the published snapshot of the data.</p>
            <Code>{`"tools": ["${origin}/campus_desk"]\n// in your agent-manifest.json\n"allowed_peers": ["${origin}"]`}</Code>
          </TabsContent>
          <TabsContent value="live" className="space-y-3">
            <p className="text-muted-foreground">For live data, ask the student. They read you a pairing code, approve what you may read, and you collect a signed token. Every call lands on their receipt tape.</p>
            <Code>{`# 1. ask (student sees it on /activity)
curl -X POST ${origin}/api/agent/requests -H 'content-type: application/json' \\
  -d '{"desk_code":"EB-XXXXXX","agent_name":"My planner","origin":"https://my.site",
       "scopes":["timetable:read","exams:read"],"reason":"Plan study slots before exams"}'

# 2. poll with the poll_secret until status is "approved" (the token comes once)
curl ${origin}/api/agent/requests/<request_id> -H 'authorization: Bearer <poll_secret>'

# 3. call a tool
curl -X POST ${origin}/api/agent/tools/get_timetable -H 'authorization: Bearer <token>' \\
  -H 'content-type: application/json' -d '{"args":{"day":"friday"}}'`}</Code>
            <p className="text-sm text-muted-foreground">Tokens are Ed25519 signed, scoped, expire, name the caller&rsquo;s origin, and can be ended by the student at any time. A browser call from a different origin than the grant names is refused.</p>
          </TabsContent>
          <TabsContent value="mcp" className="space-y-3">
            <p className="text-muted-foreground">The same six tools are available to MCP clients at <code className="mono">/api/mcp</code>, with the same token, scopes and receipts.</p>
            <Code>{`curl -X POST ${origin}/api/mcp -H 'authorization: Bearer <token>' -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_exam_dates","arguments":{}}}'`}</Code>
          </TabsContent>
        </Tabs>
        <p className="mt-6 text-sm text-muted-foreground">
          Sample peer site for the consent hand-off: <a className="mono text-primary underline-offset-4 hover:underline" href={peerUrl}>{peerUrl}</a>. Tools published: {(tools.tools as Array<{ name: string }>).map((t) => t.name).join(', ')}.
        </p>
      </section>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mono overflow-x-auto rounded-lg bg-chalk p-4 text-xs leading-relaxed text-chalk-foreground" tabIndex={0}>
      {children}
    </pre>
  );
}

function Graph({ manifest, network }: { manifest: Manifest; network: NetworkDef }) {
  const reduce = useReducedMotion();
  const { nodes, edges } = useMemo(() => {
    const front = manifest.networks[0]!.front_man;
    const nodes: Node[] = [];
    const edges: Array<[string, string, boolean?]> = [];
    const bindings = (manifest.actions?.bindings ?? {}) as Record<string, string[]>;
    for (const a of network.tools) {
      nodes.push({ id: a.name, label: a.name, col: a.name === front ? 0 : 1, kind: a.name === front ? 'front' : 'agent' });
      for (const t of a.tools ?? []) {
        if (typeof t === 'string' && /^https?:\/\//.test(t)) {
          const id = `peer:${t}`;
          if (!nodes.some((n) => n.id === id)) nodes.push({ id, label: new URL(t).pathname.slice(1) || 'peer', sub: new URL(t).origin, col: 3, kind: 'peer' });
          edges.push([a.name, id, true]);
        } else if (typeof t === 'string') edges.push([a.name, t]);
      }
    }
    for (const [agent, acts] of Object.entries(bindings))
      for (const act of acts) {
        const id = `act:${act}`;
        if (!nodes.some((n) => n.id === id)) nodes.push({ id, label: act.replace('website_', ''), col: 2, kind: 'action' });
        edges.push([agent, id]);
      }
    return { nodes, edges };
  }, [manifest, network]);

  const colX = [90, 330, 590, 840];
  const byCol = [0, 1, 2, 3].map((c) => nodes.filter((n) => n.col === c));
  const rows = Math.max(...byCol.map((c) => c.length));
  const H = Math.max(280, rows * 54 + 40);
  const pos = new Map<string, { x: number; y: number }>();
  byCol.forEach((list, c) => list.forEach((n, i) => pos.set(n.id, { x: colX[c]!, y: (H / (list.length + 1)) * (i + 1) })));
  const fill = { front: 'var(--brick)', agent: 'var(--card)', action: 'var(--secondary)', peer: 'var(--card)' } as const;

  return (
    <div className="overflow-x-auto rounded-xl border bg-card p-3">
      <svg viewBox={`0 0 960 ${H}`} className="mx-auto min-w-[640px]" role="img" aria-label={`Agent graph: ${nodes.filter((n) => n.kind !== 'action').map((n) => n.label).join(', ')} and ${nodes.filter((n) => n.kind === 'action').length} site actions`}>
        {edges.map(([a, b, dashed], i) => {
          const p = pos.get(a);
          const q = pos.get(b);
          if (!p || !q) return null;
          const mx = (p.x + q.x) / 2;
          return <motion.path key={i} d={`M${p.x + 62} ${p.y} C ${mx} ${p.y}, ${mx} ${q.y}, ${q.x - 62} ${q.y}`} fill="none" stroke={dashed ? 'var(--pencil)' : 'var(--foreground)'} strokeOpacity={dashed ? 0.9 : 0.35} strokeWidth={dashed ? 2 : 1.5} strokeDasharray={dashed ? '6 5' : undefined} initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, delay: 0.05 * i }} />;
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!;
          const front = n.kind === 'front';
          return (
            <g key={n.id} transform={`translate(${p.x - 62} ${p.y - 18})`}>
              <rect width="124" height="36" rx="8" fill={fill[n.kind]} stroke={n.kind === 'peer' ? 'var(--pencil)' : 'var(--foreground)'} strokeWidth={n.kind === 'peer' ? 2 : 1.4} strokeDasharray={n.kind === 'peer' ? '5 4' : undefined} strokeOpacity={0.8} />
              <text x="62" y={n.sub ? 15 : 22} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill={front ? '#fff8ee' : 'var(--foreground)'}>
                {n.label.length > 17 ? `${n.label.slice(0, 16)}...` : n.label}
              </text>
              {n.sub && (
                <text x="62" y="28" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill="var(--muted-foreground)">
                  {n.sub.replace(/^https?:\/\//, '')}
                </text>
              )}
            </g>
          );
        })}
        {['Front agent', 'Specialist agents', 'Site actions (this origin)', 'Peer site (after consent)'].map((t, i) => (
          <text key={t} x={colX[i]} y="16" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" letterSpacing="1" fill="var(--muted-foreground)">
            {t.toUpperCase()}
          </text>
        ))}
      </svg>
    </div>
  );
}
