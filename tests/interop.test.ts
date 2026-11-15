// The seven interoperability checks from section 6 of the MVP profile, run against the real published files.
import { describe, expect, it } from 'vitest';
import { AgentRuntime, OpenAICompatClient, Trace, validateManifest, validateNetwork } from '@aw/runtime';
import type { Manifest, NetworkDef } from '@aw/runtime';
import { createActions, slyFromProfile } from '../src/site/actions';
import { DemoModel } from '../src/site/demo-model';
import { ReminderStore } from '../src/site/reminders';
import { DEFAULT_PROFILE } from '../src/data/model';
import { fakeFetch, loadSample, readJson, say, ScriptedLlm, tc, callTools } from './helpers';

const PEER = 'http://localhost:5174';
const SITE = 'http://localhost:5173';
const manifest = readJson('public/agent-manifest.json') as Manifest;
const network = readJson('public/campus_desk.network.json') as NetworkDef;
const libManifest = readJson('peer/library-desk/agent-manifest.json') as Manifest;
const libNetwork = readJson('peer/library-desk/library_desk.network.json') as NetworkDef;
const data = loadSample();
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

const peerFiles = { [`${PEER}/agent-manifest.json`]: libManifest, [`${PEER}/library_desk.network.json`]: libNetwork };

function build(over: Partial<ConstructorParameters<typeof AgentRuntime>[0]> = {}) {
  const trace = new Trace();
  const f = fakeFetch(peerFiles);
  const actions = createActions({ data, today: data.department.sample_today, now: data.department.sample_now, reminders: new ReminderStore(memory()) });
  const rt = new AgentRuntime({
    manifest,
    siteOrigin: SITE,
    network,
    networkName: 'campus_desk',
    frontMan: 'campus_desk',
    llm: new DemoModel({ today: data.department.sample_today, office: 'Block C' }),
    actions,
    actionBindings: manifest.actions!.bindings,
    sly: slyFromProfile(DEFAULT_PROFILE),
    consent: async () => 'allow',
    confirm: async () => true,
    fetchImpl: f.impl,
    trace,
    ...over,
  });
  return { rt, trace, f };
}

describe('MVP section 6, check 1: publish a two-agent network and a manifest', () => {
  it('both published sites validate, and the manifest points at the network', () => {
    expect(validateManifest(manifest).ok).toBe(true);
    expect(validateNetwork(network, manifest.networks[0]!.front_man).ok).toBe(true);
    expect(validateManifest(libManifest).ok).toBe(true);
    expect(validateNetwork(libNetwork, 'library_desk').ok).toBe(true);
    expect(libNetwork.tools.length).toBe(2);
  });
  it('the network is data only: no code, no includes, no environment substitutions', () => {
    const text = JSON.stringify(network);
    expect(text).not.toMatch(/"class"|"command"|"toolbox"|\$\{|"include"/);
  });
});

describe('MVP section 6, checks 2 and 3: run in the browser with the default router, call an agent and a grounded capability', () => {
  it('answers a question through a specialist and a site action using the published default router', async () => {
    const { rt, trace } = build();
    const res = await rt.run('What is my next class?');
    expect(res.text).toMatch(/Your next class is MA201/);
    const calls = trace.events.filter((e) => e.type === 'tool_call').map((e: any) => e.tool);
    expect(calls).toEqual(['timetable_agent', 'website_get_next_class']);
    expect(trace.events[0]).toMatchObject({ type: 'router', kind: 'demo' });
  });

  it('the bring-your-own-key path streams from the visitor router', async () => {
    const sse = (chunks: unknown[]) => new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    const calls: Array<{ url: string; auth: string | null; body: any }> = [];
    const routerFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: (init.headers as Record<string, string>).Authorization ?? null, body: JSON.parse(String(init.body)) });
      return sse([{ choices: [{ delta: { content: 'Hello ' } }] }, { choices: [{ delta: { content: 'student' } }] }]);
    }) as unknown as typeof fetch;
    const llm = new OpenAICompatClient({ baseUrl: 'https://router.example/v1', model: 'm1', apiKey: 'KEY-123456', kind: 'byok', fetchImpl: routerFetch });
    const streamed: string[] = [];
    const { rt } = build({ llm, onText: (d) => streamed.push(d) });
    const res = await rt.run('hi');
    expect(res.text).toBe('Hello student');
    expect(streamed.join('')).toBe('Hello student');
    expect(calls[0]!.url).toBe('https://router.example/v1/chat/completions');
    expect(calls[0]!.auth).toBe('Bearer KEY-123456');
    expect(calls[0]!.body.stream).toBe(true);
  });
});

describe('MVP section 6, checks 4 and 5: load a named network from a second origin after approval, and keep the key away from it', () => {
  it('asks first, then runs the exact named peer network in this browser', async () => {
    const asked: string[] = [];
    const { rt, trace } = build({ consent: async (r) => (asked.push(r.origin), 'allow') });
    const res = await rt.run('Is the library open late during exams?');
    expect(asked).toEqual([PEER]);
    expect(res.text).toMatch(/open until 22:00/);
    expect(trace.events.find((e) => e.type === 'peer_loaded')).toMatchObject({ origin: PEER, network: 'library_desk', agents: 2 });
  });

  it('sends the visitor key only to the router, never to the peer site, and the peer cannot change the router', async () => {
    const llmCalls: Array<{ url: string; auth: string | null }> = [];
    const routerFetch = (async (url: string, init: RequestInit) => {
      llmCalls.push({ url, auth: (init.headers as Record<string, string>).Authorization ?? null });
      // First call (campus_desk): ask the peer. Later calls: plain text.
      const first = llmCalls.length === 1;
      const delta = first ? { tool_calls: [{ index: 0, id: 'c1', function: { name: 'peer_localhost_5174_library_desk', arguments: '{"request":"Is the library open late?"}' } }] } : { content: 'ok' };
      return new Response(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    }) as unknown as typeof fetch;
    const llm = new OpenAICompatClient({ baseUrl: 'https://router.example/v1', model: 'm1', apiKey: 'KEY-SECRET-999', kind: 'byok', fetchImpl: routerFetch });
    const { rt, f } = build({ llm });
    await rt.run('library?');
    // Every model call, including the peer's agents, went to the visitor's router with the visitor's key.
    expect(llmCalls.length).toBeGreaterThanOrEqual(3);
    expect(new Set(llmCalls.map((c) => c.url))).toEqual(new Set(['https://router.example/v1/chat/completions']));
    // The peer site was contacted only to read its public files, with no credentials and no key.
    expect(f.log.length).toBeGreaterThan(0);
    for (const r of f.log) {
      expect(r.url.startsWith(PEER)).toBe(true);
      expect(r.init?.credentials).toBe('omit');
      expect(JSON.stringify(r.init ?? {})).not.toContain('KEY-SECRET-999');
      expect(r.init?.method ?? 'GET').toBe('GET');
    }
  });
});

describe('MVP section 6, check 6: private context is absent at the peer unless a field is named', () => {
  const SECRET = { student_year: 2, student_section: 'Q-SECRET', fee_category: 'scholarship' };

  it('keeps every private field from the peer, in prompts and in the hand-off', async () => {
    const trace = new Trace();
    const llm = new ScriptedLlm([callTools(tc('peer_localhost_5174_library_desk', { request: 'Library hours?' })), say('library: 8:30'), say('front done')]);
    const peerFetch = fakeFetch(peerFiles);
    const rt = new AgentRuntime({ manifest, siteOrigin: SITE, network, networkName: 'campus_desk', frontMan: 'campus_desk', llm, sly: SECRET, consent: async () => 'allow', confirm: async () => true, fetchImpl: peerFetch.impl, trace });
    await rt.run('Library hours?');
    expect(trace.events.find((e) => e.type === 'private_context')).toMatchObject({ direction: 'to_peer', allowed: [], withheld: ['student_year', 'student_section', 'fee_category'] });
    expect(JSON.stringify(llm.seen)).not.toContain('Q-SECRET');
  });

  it('forwards only a field the calling agent names', async () => {
    const net: NetworkDef = structuredClone(network);
    net.tools[0]!.allow = { to_downstream: { sly_data: ['student_year'] }, from_downstream: { sly_data: [] } };
    const trace = new Trace();
    const llm = new ScriptedLlm([callTools(tc('peer_localhost_5174_library_desk', { request: 'Hours?' })), say('x'), say('y')]);
    const rt = new AgentRuntime({ manifest, siteOrigin: SITE, network: net, networkName: 'campus_desk', frontMan: 'campus_desk', llm, sly: SECRET, consent: async () => 'allow', confirm: async () => true, fetchImpl: fakeFetch(peerFiles).impl, trace });
    await rt.run('Hours?');
    expect(trace.events.find((e) => e.type === 'private_context')).toMatchObject({ allowed: ['student_year'], withheld: ['student_section', 'fee_category'] });
  });
});

describe('MVP section 6, check 7: stop an invalid network, a cycle, an over-budget request and a denied origin, visibly', () => {
  it('a denied origin: nothing is fetched and the visitor sees why', async () => {
    const { rt, trace, f } = build({ consent: async () => 'deny' });
    const res = await rt.run('Is the library open late during exams?');
    expect(f.log).toHaveLength(0);
    expect(res.text).toMatch(/did not allow contact with http:\/\/localhost:5174/);
    expect(trace.events.some((e) => e.type === 'consent' && e.decision === 'denied')).toBe(true);
  });

  it('an origin that is not in allowed_peers is refused before any card or fetch', async () => {
    let asked = false;
    const net: NetworkDef = structuredClone(network);
    net.tools[0]!.tools!.push('http://localhost:9999/other');
    const llm = new ScriptedLlm([callTools(tc('peer_localhost_9999_other', { request: 'hi' })), say('done')]);
    const f = fakeFetch({});
    const rt = new AgentRuntime({ manifest, siteOrigin: SITE, network: net, networkName: 'campus_desk', frontMan: 'campus_desk', llm, consent: async () => ((asked = true), 'allow'), confirm: async () => true, fetchImpl: f.impl });
    await rt.run('hi');
    expect(asked).toBe(false);
    expect(f.log).toHaveLength(0);
    expect(llm.seen[1]!.messages.at(-1)!.content).toMatch(/not on this site's list of allowed peers/);
  });

  it('an invalid network never reaches a model', async () => {
    const bad: NetworkDef = structuredClone(network);
    bad.tools[1]!.tools = ['campus_desk'];
    const llm = new ScriptedLlm([say('never')]);
    const rt = new AgentRuntime({ manifest, siteOrigin: SITE, network: bad, networkName: 'campus_desk', frontMan: 'campus_desk', llm, consent: async () => 'deny', confirm: async () => false });
    await expect(rt.run('x')).rejects.toThrow(/composition cycle/);
    expect(llm.seen).toHaveLength(0);
  });

  it('a peer that publishes a cycle back to a network already running is stopped', async () => {
    // The peer's front agent tries to call Campus Desk's own URL as a peer: that is already on the stack.
    const loopMan: Manifest = { ...manifest, allowed_peers: [PEER, SITE] };
    const peerNet: NetworkDef = structuredClone(libNetwork);
    peerNet.tools[0]!.tools = [...(peerNet.tools[0]!.tools ?? []), `${PEER}/library_desk`];
    const files = { [`${PEER}/agent-manifest.json`]: libManifest, [`${PEER}/library_desk.network.json`]: peerNet };
    const llm = new ScriptedLlm([
      callTools(tc('peer_localhost_5174_library_desk', { request: 'hi' })),
      callTools(tc('peer_localhost_5174_library_desk', { request: 'again' })),
      say('peer done'),
      say('front done'),
    ]);
    const trace = new Trace();
    const rt = new AgentRuntime({ manifest: loopMan, siteOrigin: SITE, network, networkName: 'campus_desk', frontMan: 'campus_desk', llm, consent: async () => 'allow', confirm: async () => true, fetchImpl: fakeFetch(files).impl, trace });
    await rt.run('hi');
    expect(trace.events.some((e) => e.type === 'error' && e.where === 'cycle')).toBe(true);
  });

  it('a peer asked twice in one question is refused the second time and the limit is reported', async () => {
    const llm = new ScriptedLlm([callTools(tc('peer_localhost_5174_library_desk', { request: 'a' }), tc('peer_localhost_5174_library_desk', { request: 'b' })), say('lib'), say('lib facts'), say('front done')]);
    const trace = new Trace();
    const rt = new AgentRuntime({ manifest, siteOrigin: SITE, network, networkName: 'campus_desk', frontMan: 'campus_desk', llm, consent: async () => 'allow', confirm: async () => true, fetchImpl: fakeFetch(peerFiles).impl, trace });
    await rt.run('hi');
    expect(trace.events.some((e) => e.type === 'limit' && e.name === 'maxPerPeer')).toBe(true);
  });
});
