'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowUp, Bot, CircleCheck, Handshake, KeyRound, ListTree, Loader2, RotateCcw, ScrollText, Settings2, ShieldAlert, Sparkles, Square, Zap } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { loadRuntime, type RuntimeModule } from '@/lib/client/runtime';
import { cn } from '@/lib/utils';
import type { Profile } from '@/src/data/model';
import { createActions } from '@/src/site/actions';
import type { ToolSpec } from '@/src/site/catalog';
import { DemoModel } from '@/src/site/demo-model';
import { describeEvent, type EventLine } from '@/src/site/describe-event';
import type { AiProfile, Confirm, Consent, LlmClient, Manifest, NetworkDef, RuntimeEvent } from '@aw/runtime';

interface Msg {
  id: number;
  role: 'user' | 'bot';
  text: string;
  state: 'streaming' | 'done' | 'error' | 'stopped';
  question?: string;
}
interface Line extends EventLine {
  id: number;
}
type ConfirmReq = Parameters<Confirm>[0] & { resolve: (v: boolean) => void };
type ConsentReq = Parameters<Consent>[0] & { resolve: (v: 'allow' | 'allow_session' | 'deny') => void };

const ICON: Record<string, typeof Bot> = { Agent: Bot, Action: Zap, 'Hand off': ListTree, 'Other site': Handshake, Consent: Handshake, Confirm: CircleCheck, Receipt: ScrollText, Private: ShieldAlert, Model: Sparkles, Asked: ArrowUp };

export function AskClient({ today, now, office, profile, catalog, clockOverride }: { today: string; now: string; office: string; profile: Profile; catalog: ToolSpec[]; clockOverride: string | null }) {
  const reduce = useReducedMotion();
  const params = useSearchParams();
  const [rt, setRt] = useState<RuntimeModule | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [network, setNetwork] = useState<NetworkDef | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmReq, setConfirmReq] = useState<ConfirmReq | null>(null);
  const [consentReq, setConsentReq] = useState<ConsentReq | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiProfile, setAiProfile] = useState<AiProfile | null>(null);
  const [reminders, setReminders] = useState<Array<{ id: string; title: string; date: string; time?: string }>>([]);
  const abort = useRef<AbortController | null>(null);
  const counter = useRef(0);
  const history = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const logEnd = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const nextId = () => ++counter.current;
  const addLine = useCallback((l: EventLine) => setLines((p) => [...p, { ...l, id: ++counter.current }]), []);

  // Load the published runtime, manifest and network, then check them before any model call.
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const mod = await loadRuntime();
        const m = (await (await fetch('/agent-manifest.json')).json()) as Manifest;
        const entry = m.networks[0]!;
        const n = (await (await fetch(new URL(entry.hocon, location.origin + '/'))).json()) as NetworkDef;
        const mv = mod.validateManifest(m);
        const nv = mod.validateNetwork(n, entry.front_man);
        if (!mv.ok || !nv.ok) throw new Error(`The published agent network did not load: ${[...mv.errors, ...nv.errors].join('; ')}`);
        if (dead) return;
        setAiProfile(new mod.ProfileStore(localStorage).load());
        setRt(mod);
        setManifest(m);
        setNetwork(n);
      } catch (e) {
        if (!dead) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  const refreshReminders = useCallback(async () => {
    try {
      const r = await (await fetch('/api/reminders')).json();
      setReminders(r.saved ?? []);
    } catch {
      /* the list is a convenience */
    }
  }, []);
  useEffect(() => {
    void refreshReminders();
  }, [refreshReminders]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  }, [messages, reduce]);

  function currentLlm(): { llm: LlmClient; demo: boolean } {
    if (rt && manifest) {
      const choice = rt.chooseRouter(manifest, aiProfile);
      if (choice.kind === 'byok' && aiProfile) return { llm: rt.makeByokClient(choice, aiProfile.apiKey), demo: false };
    }
    return { llm: new DemoModel({ today, office }), demo: true };
  }
  const mode = aiProfile?.apiKey ? { label: 'Using your key', text: `${rt?.PRESETS.find((p) => p.id === aiProfile.presetId)?.name ?? 'Your router'}, model ${aiProfile.model}. The key stays in this browser.` } : { label: 'Demo mode, no key', text: 'A small rule-based model runs in this page. It understands a fixed set of questions. Add a key for open-ended ones.' };

  const ask = useCallback(
    async (text: string) => {
      if (!rt || !manifest || !network || busy) return;
      setBusy(true);
      const botId = nextId();
      setMessages((p) => [...p, { id: nextId(), role: 'user', text, state: 'done' }, { id: botId, role: 'bot', text: '', state: 'streaming', question: text }]);
      addLine({ kind: 'Asked', text: text.length > 70 ? `${text.slice(0, 70)}...` : text });
      const ctl = new AbortController();
      abort.current = ctl;
      const trace = new rt.Trace(() => (aiProfile?.apiKey ? [aiProfile.apiKey] : []));
      const frontMan = manifest.networks[0]!.front_man;
      trace.on((e: RuntimeEvent) => {
        if (e.type === 'model_call' && e.agent === frontMan) setMessages((p) => p.map((m) => (m.id === botId ? { ...m, text: '' } : m)));
        const d = describeEvent(e);
        if (d) addLine(d);
        // Report decisions about other sites to the server, which signs a receipt for each.
        if (e.type === 'private_context' && e.direction === 'to_peer') void report({ kind: 'private_context', origin: lastOrigin.current, withheld: e.withheld });
      });
      const lastOrigin = { current: location.origin };
      const call = async (name: string, args: Record<string, unknown>, o: { confirmed: boolean }) => {
        const res = await fetch(`/api/actions/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args, confirmed: o.confirmed, now: clockOverride }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? `The site refused ${name}.`);
        addLine({ kind: 'Receipt', text: `${name} signed ${String(body.receipt?.id ?? '').slice(0, 14)}`, tone: 'good' });
        return body.result;
      };
      const { llm } = currentLlm();
      const runtime = new rt.AgentRuntime({
        manifest,
        siteOrigin: location.origin,
        network,
        networkName: manifest.networks[0]!.name,
        frontMan,
        llm,
        actions: createActions(catalog, call),
        actionBindings: manifest.actions?.bindings as Record<string, string[]> | undefined,
        sly: { student_year: profile.year, student_section: profile.section, fee_category: profile.feeCategory },
        consent: (req) =>
          new Promise((resolve) => {
            lastOrigin.current = req.origin;
            setConsentReq({
              ...req,
              resolve: (v) => {
                setConsentReq(null);
                void report({ origin: req.origin, network: req.label, purpose: req.purpose, decision: v === 'deny' ? 'denied' : 'allowed', scope: v === 'allow_session' ? 'session' : 'once' });
                resolve(v);
              },
            });
          }),
        confirm: (req) =>
          new Promise((resolve) => {
            setConfirmReq({
              ...req,
              resolve: (v) => {
                setConfirmReq(null);
                resolve(v);
              },
            });
          }),
        trace,
        onText: (d) => setMessages((p) => p.map((m) => (m.id === botId ? { ...m, text: m.text + d } : m))),
      });
      try {
        const res = await runtime.run(text, history.current, ctl.signal);
        const out = res.text || 'I have no answer for that.';
        setMessages((p) => p.map((m) => (m.id === botId ? { ...m, text: out, state: 'done' } : m)));
        history.current.push({ role: 'user', content: text }, { role: 'assistant', content: out });
        void refreshReminders();
      } catch (err) {
        const aborted = (err as Error).name === 'AbortError';
        setMessages((p) => p.map((m) => (m.id === botId ? { ...m, text: aborted ? 'Stopped.' : err instanceof Error ? err.message : String(err), state: aborted ? 'stopped' : 'error' } : m)));
      } finally {
        setBusy(false);
        abort.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rt, manifest, network, busy, aiProfile, catalog, clockOverride, profile, today, office, addLine, refreshReminders],
  );

  // A question can arrive in the address (?q=...&go=1) from the home page.
  useEffect(() => {
    const q = params.get('q');
    if (!q || started.current || !rt) return;
    started.current = true;
    if (params.get('go') === '1') void ask(q.slice(0, 600));
    else setDraft(q.slice(0, 600));
  }, [params, rt, ask]);

  const [view, setView] = useState<'chat' | 'ran'>('chat');
  const examples = ((network?.metadata?.sample_queries as string[] | undefined) ?? []).slice(0, 6);

  const chat = (
    <section aria-label="Conversation" className="flex min-h-[28rem] flex-col rounded-xl border bg-card lg:h-[calc(100vh-15rem)] lg:min-h-[34rem]">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <p className="min-w-0 text-sm">
          <span className="font-medium">{mode.label}</span> <span className="hidden text-muted-foreground sm:inline">· {mode.text}</span>
        </p>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => setSettingsOpen(true)}>
          <Settings2 className="size-3.5" /> AI settings
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5" role="log" aria-live="polite" aria-label="Messages">
        {loadError ? (
          <div role="alert" className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">The agent network could not be loaded.</p>
              <p className="text-muted-foreground">{loadError}</p>
            </div>
          </div>
        ) : !rt ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading the agent network">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="ml-auto h-10 w-1/2" />
            <Skeleton className="h-16 w-2/3" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-4">
            <p className="font-display text-2xl font-semibold">What do you want to know?</p>
            <p className="mt-1 max-w-lg text-muted-foreground">Try one of these. The answers come from the department data on the server, for Year {profile.year}, section {profile.section}.</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {examples.map((q) => (
                <li key={q}>
                  <button type="button" className="rounded-full border bg-background px-3 py-1.5 text-left text-sm hover:border-primary" onClick={() => void ask(q)}>
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div key={m.id} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('flex', m.role === 'user' && 'justify-end')}>
                <div className={cn('max-w-[88%] rounded-2xl px-4 py-2.5', m.role === 'user' ? 'rounded-br-sm bg-foreground text-background' : 'rounded-bl-sm border bg-secondary/60', m.state === 'error' && 'border-destructive/50 bg-destructive/10')} data-state={m.state}>
                  <p className="eyebrow mb-0.5 text-[0.6rem] opacity-70">{m.role === 'user' ? 'You' : 'Campus Desk'}</p>
                  {m.role === 'bot' && m.state === 'streaming' && !m.text ? (
                    <span className="flex items-center gap-1 py-1.5" aria-label="Thinking">
                      {[0, 1, 2].map((i) => (
                        <motion.span key={i} className="size-1.5 rounded-full bg-muted-foreground" animate={reduce ? undefined : { opacity: [0.25, 1, 0.25] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }} />
                      ))}
                    </span>
                  ) : (
                    <p className="whitespace-pre-wrap text-pretty leading-relaxed">{m.text}</p>
                  )}
                  {m.state === 'error' && m.question && (
                    <Button variant="outline" size="sm" className="mt-2 gap-1.5" disabled={busy} onClick={() => void ask(m.question!)}>
                      <RotateCcw className="size-3.5" /> Try again
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={logEnd} />
      </div>

      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const t = draft.trim();
          if (!t || busy) return;
          setDraft('');
          void ask(t);
        }}
      >
        <Label htmlFor="msg" className="sr-only">
          Your question
        </Label>
        <Textarea
          id="msg"
          value={draft}
          rows={1}
          disabled={!rt || !!loadError}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Is my Wednesday class on?"
          className="max-h-32 min-h-10 resize-none bg-background"
          maxLength={600}
        />
        {busy ? (
          <Button type="button" variant="outline" onClick={() => abort.current?.abort()} aria-label="Stop" className="gap-1.5">
            <Square className="size-3.5 fill-current" /> Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!draft.trim() || !rt} aria-label="Send" className="gap-1.5">
            <ArrowUp className="size-4" /> Send
          </Button>
        )}
      </form>
    </section>
  );

  const activity = (
    <div className="space-y-5">
      <section aria-label="What ran" className="rounded-xl border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="font-display text-lg font-semibold">What ran</h2>
          <Link href="/activity" className="text-xs text-primary underline-offset-4 hover:underline">
            Signed receipt tape
          </Link>
        </header>
        <ol className="max-h-[24rem] space-y-1 overflow-y-auto p-3 lg:max-h-[calc(100vh-30rem)]" aria-label="Activity" data-testid="activity">
          {lines.length === 0 && <li className="px-1 py-6 text-center text-sm text-muted-foreground">Nothing yet. Ask a question and each agent call shows up here.</li>}
          {lines.map((l) => {
            const Icon = ICON[l.kind] ?? Bot;
            return (
              <motion.li key={l.id} initial={reduce ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className={cn('flex gap-2.5 rounded-md px-2 py-1.5 text-sm', l.tone === 'bad' && 'bg-destructive/10', l.tone === 'warn' && 'bg-mustard/15', l.kind === 'Asked' && 'bg-secondary/70 font-medium')}>
                <Icon className={cn('mt-0.5 size-3.5 shrink-0', l.tone === 'good' ? 'text-sage' : l.tone === 'bad' ? 'text-destructive' : 'text-muted-foreground')} />
                <span className="min-w-0">
                  <span className="eyebrow mr-2 text-[0.6rem]">{l.kind}</span>
                  <span className="break-words">{l.text}</span>
                </span>
              </motion.li>
            );
          })}
        </ol>
      </section>
      <section aria-label="Your reminders" className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 flex items-baseline justify-between font-display text-lg font-semibold">
          Reminders
          <Link href="/reminders" className="text-xs font-normal text-primary underline-offset-4 hover:underline">
            Manage
          </Link>
        </h2>
        {reminders.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. Try: &ldquo;Remind me to pay the tuition fee on 27 Nov&rdquo;.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {reminders.slice(0, 4).map((r) => (
              <li key={r.id} className="mono flex justify-between gap-2">
                <span className="truncate">{r.title}</span>
                <span className="shrink-0 text-muted-foreground">{r.date}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  return (
    <>
      {/* One copy of each panel. Wide screens show both side by side. Phones show one at a time, with two tabs. */}
      <div role="tablist" aria-label="Chat or what ran" className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:hidden">
        {(
          [
            ['chat', 'Chat'],
            ['ran', `What ran${lines.length ? ` (${lines.length})` : ''}`],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', view === id ? 'bg-background text-foreground shadow-sm' : 'text-foreground/75 hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>
      <div className="gap-6 lg:grid lg:grid-cols-[1.5fr_1fr]">
        <div className={cn(view !== 'chat' && 'hidden lg:block')}>{chat}</div>
        <div className={cn(view !== 'ran' && 'hidden lg:block')}>{activity}</div>
      </div>

      <Dialog open={!!confirmReq} onOpenChange={(o) => !o && confirmReq?.resolve(false)}>
        <DialogContent data-testid="confirm-card">
          <DialogHeader>
            <DialogTitle>Confirm before saving</DialogTitle>
            <DialogDescription>The agent wants to change something. Nothing happens until you say yes.</DialogDescription>
          </DialogHeader>
          {confirmReq && (
            <div className="space-y-3 text-sm">
              <p className="rounded-md bg-secondary/70 p-3 text-base">{confirmReq.text}</p>
              <dl className="mono grid grid-cols-[6rem_1fr] gap-y-1 text-xs">
                <dt className="text-muted-foreground">Action</dt>
                <dd>
                  {confirmReq.action} ({confirmReq.effect})
                </dd>
                <dt className="text-muted-foreground">Site</dt>
                <dd>{confirmReq.origin}</dd>
                <dt className="text-muted-foreground">Details</dt>
                <dd className="break-all">{JSON.stringify(confirmReq.args)}</dd>
              </dl>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => confirmReq?.resolve(false)}>
              Do not save
            </Button>
            <Button onClick={() => confirmReq?.resolve(true)}>Confirm and save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!consentReq} onOpenChange={(o) => !o && consentReq?.resolve('deny')}>
        <DialogContent data-testid="consent-card">
          <DialogHeader>
            <DialogTitle>Ask another site?</DialogTitle>
            <DialogDescription>The agent wants to ask {consentReq?.label}, a network published by another site. Its agents would run in this browser, with your model. Nothing is sent until you allow it.</DialogDescription>
          </DialogHeader>
          {consentReq && (
            <dl className="mono grid grid-cols-[7rem_1fr] gap-y-2 rounded-md bg-secondary/70 p-3 text-xs">
              <dt className="text-muted-foreground">Site</dt>
              <dd>{consentReq.origin}</dd>
              <dt className="text-muted-foreground">It gets</dt>
              <dd className="font-sans text-sm">{consentReq.purpose}. Only the short request text is sent.</dd>
              <dt className="text-muted-foreground">It never gets</dt>
              <dd className="font-sans text-sm">Your model key, your year, section or fee category, or this chat.</dd>
            </dl>
          )}
          <p className="text-xs text-muted-foreground">Whatever you choose is written to your receipt tape and signed.</p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => consentReq?.resolve('deny')}>
              Deny
            </Button>
            <Button variant="secondary" onClick={() => consentReq?.resolve('allow')}>
              Allow once
            </Button>
            <Button onClick={() => consentReq?.resolve('allow_session')}>Allow this visit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {rt && <SettingsDialog rt={rt} open={settingsOpen} onOpenChange={setSettingsOpen} current={aiProfile} onChange={setAiProfile} />}
    </>
  );
}

async function report(body: Record<string, unknown>) {
  try {
    await fetch('/api/consents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    /* The receipt is a record. A network blip must not block the student's choice. */
  }
}

function SettingsDialog({ rt, open, onOpenChange, current, onChange }: { rt: RuntimeModule; open: boolean; onOpenChange: (o: boolean) => void; current: AiProfile | null; onChange: (p: AiProfile | null) => void }) {
  const [preset, setPreset] = useState(current?.presetId ?? 'gemini');
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? '');
  const [model, setModel] = useState(current?.model ?? '');
  const [key, setKey] = useState('');
  const [hint, setHint] = useState('');
  const store = () => new rt.ProfileStore(localStorage);

  useEffect(() => {
    if (!open) return;
    const p = rt.PRESETS.find((x) => x.id === preset)!;
    if (!current || current.presetId !== preset) {
      setBaseUrl(p.baseUrl);
      setModel(p.model);
    }
    setHint(p.keyHint);
  }, [preset, open, current, rt]);

  function save() {
    const k = key.trim() || current?.apiKey || '';
    if (!k) return setHint('Paste a key first, or choose demo mode.');
    try {
      const u = new URL(baseUrl);
      if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error('not https');
    } catch {
      return setHint('The router URL must be a full https address (http only for localhost).');
    }
    const p = { presetId: preset, baseUrl: baseUrl.trim(), model: model.trim(), apiKey: k };
    store().save(p);
    onChange(p);
    setKey('');
    onOpenChange(false);
    toast.success('Saved in this browser. Your key goes only to that router.');
  }
  function drop() {
    store().clear();
    onChange(null);
    setKey('');
    onOpenChange(false);
    toast('Key deleted. Demo mode is on.');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="settings">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5" /> AI settings
          </DialogTitle>
          <DialogDescription>Demo mode needs no key. For open-ended questions, bring your own. It stays in this browser and goes only to the router below. Use a key with a low limit.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="provider">Provider</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger id="provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rt.PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="base-url">Router URL</Label>
            <Input id="base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="model">Model</Label>
            <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} className="mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="api-key">API key</Label>
            <Input id="api-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={current ? 'A key is stored. Leave blank to keep it.' : ''} />
            <p className="text-xs text-muted-foreground" role="status" id="key-hint">
              {hint}
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" className="text-destructive" onClick={drop}>
            Delete key, use demo mode
          </Button>
          <span className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save}>
              Save
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
