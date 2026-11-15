import { describe, expect, it } from 'vitest';
import { McpClient, OpenAICompatClient, PRESETS, ProfileStore, Trace, assertSafeRouterUrl, chooseRouter, loadPeer, parsePeerUrl, readStream, registerWebMcp, scrub } from '@aw/runtime';
import type { Manifest, PeerContext } from '@aw/runtime';
import { basicManifest, fakeFetch, twoAgent } from './helpers';

describe('parsePeerUrl', () => {
  it('splits site base and network name', () => {
    expect(parsePeerUrl('https://peer.example/agents/transit')).toEqual({ url: 'https://peer.example/agents/transit', origin: 'https://peer.example', base: 'https://peer.example/agents/', name: 'transit' });
  });
  it('requires https except on localhost', () => {
    expect(() => parsePeerUrl('http://peer.example/x')).toThrow(/not https/);
    expect(parsePeerUrl('http://localhost:5174/x').origin).toBe('http://localhost:5174');
  });
  it('needs a network name', () => expect(() => parsePeerUrl('https://peer.example/')).toThrow(/name of a published network/));
  it('rejects text that is not a URL', () => expect(() => parsePeerUrl('not a url')).toThrow(/complete web address/));
});

describe('loadPeer', () => {
  const peerManifest = (names: string[]): Manifest => ({ networks: names.map((n) => ({ name: n, front_man: 'front', hocon: `./${n}.network.json` })) });
  const ctxFor = (files: Record<string, unknown>, over: Partial<PeerContext> = {}, redirects?: Record<string, string>) => {
    const f = fakeFetch(files, { redirects });
    const trace = new Trace();
    const asked: string[] = [];
    const ctx: PeerContext = {
      callerManifest: basicManifest({ allowed_peers: ['https://peer.example', 'https://other.example'] }),
      callerOrigin: 'https://site.example',
      consent: async (r) => (asked.push(r.origin), 'allow'),
      fetchImpl: f.impl,
      trace,
      approved: new Set(),
      labelFor: (u) => u,
      ...over,
    };
    return { ctx, f, trace, asked };
  };

  it('fails closed when the manifest has no network with that exact name, and does not pick another', async () => {
    const { ctx } = ctxFor({ 'https://peer.example/agent-manifest.json': peerManifest(['transit_v2', 'other']) });
    await expect(loadPeer('https://peer.example/transit', ctx, 'test')).rejects.toThrow(/no network named "transit".*Refusing to run a different one/);
  });

  it('fails closed when the network definition is invalid', async () => {
    const bad = twoAgent(['ghost']);
    const { ctx } = ctxFor({ 'https://peer.example/agent-manifest.json': peerManifest(['transit']), 'https://peer.example/transit.network.json': bad });
    await expect(loadPeer('https://peer.example/transit', ctx, 'test')).rejects.toThrow(/failed validation/);
  });

  it('reports an unreachable site in plain words', async () => {
    const { ctx } = ctxFor({});
    await expect(loadPeer('https://peer.example/transit', ctx, 'test')).rejects.toThrow(/answered HTTP 404/);
  });

  it('treats a redirect to another origin as a new destination with its own policy check', async () => {
    const files = { 'https://evil.example/agent-manifest.json': peerManifest(['transit']) };
    const { ctx } = ctxFor(files, {}, { 'https://peer.example/agent-manifest.json': 'https://evil.example/agent-manifest.json' });
    await expect(loadPeer('https://peer.example/transit', ctx, 'test')).rejects.toThrow(/redirected to https:\/\/evil.example/);
  });

  it('asks again for a redirect to an allowed but different origin', async () => {
    const files = { 'https://other.example/agent-manifest.json': peerManifest(['transit']), 'https://peer.example/transit.network.json': twoAgent() };
    const { ctx, asked } = ctxFor(files, {}, { 'https://peer.example/agent-manifest.json': 'https://other.example/agent-manifest.json' });
    await loadPeer('https://peer.example/transit', ctx, 'test').catch(() => undefined);
    expect(asked).toEqual(['https://peer.example', 'https://other.example']);
  });

  it('remembers an approval for the session, and skips the card for the same origin', async () => {
    const files = { 'https://peer.example/agent-manifest.json': peerManifest(['transit']), 'https://peer.example/transit.network.json': twoAgent() };
    const { ctx, asked, trace } = ctxFor(files, { consent: async (r) => (asked.push(r.origin), 'allow_session') });
    await loadPeer('https://peer.example/transit', ctx, 'one');
    await loadPeer('https://peer.example/transit', ctx, 'two');
    expect(asked).toHaveLength(1);
    expect(trace.events.filter((e) => e.type === 'consent').map((e: any) => e.decision)).toEqual(['allowed', 'remembered']);
    const same = ctxFor(files, { callerOrigin: 'https://peer.example' });
    await loadPeer('https://peer.example/transit', same.ctx, 'same');
    expect(same.asked).toHaveLength(0);
  });

  it('fetches with no credentials and no referrer', async () => {
    const files = { 'https://peer.example/agent-manifest.json': peerManifest(['transit']), 'https://peer.example/transit.network.json': twoAgent() };
    const { ctx, f } = ctxFor(files);
    await loadPeer('https://peer.example/transit', ctx, 'x');
    for (const r of f.log) expect(r.init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
  });
});

describe('llm client and bring-your-own-key', () => {
  it('stops with a clear setup error when the key is missing, before any network call', async () => {
    let called = false;
    const c = new OpenAICompatClient({ baseUrl: 'https://r.example/v1', model: 'm', apiKey: '', kind: 'byok', fetchImpl: (async () => ((called = true), new Response('{}'))) as typeof fetch });
    await expect(c.chat({ messages: [], tools: [], agent: 'a' })).rejects.toThrow(/No API key is set/);
    expect(called).toBe(false);
  });

  it('refuses a non-https router except on localhost', () => {
    expect(() => assertSafeRouterUrl('http://router.example/v1')).toThrow(/must use https/);
    expect(assertSafeRouterUrl('http://localhost:11434/v1').hostname).toBe('localhost');
  });

  it('never puts the key in an error message, even when the router echoes it', async () => {
    const c = new OpenAICompatClient({ baseUrl: 'https://r.example/v1', model: 'm', apiKey: 'KEY-ABCDEF-123', kind: 'byok', fetchImpl: (async () => new Response('bad key KEY-ABCDEF-123 for Bearer KEY-ABCDEF-123', { status: 401 })) as typeof fetch });
    const err = await c.chat({ messages: [], tools: [], agent: 'a' }).catch((e) => e as Error);
    expect(err.message).toMatch(/HTTP 401/);
    expect(err.message).not.toContain('KEY-ABCDEF-123');
  });

  it('explains a network failure as a possible CORS problem', async () => {
    const c = new OpenAICompatClient({ baseUrl: 'https://r.example/v1', model: 'm', apiKey: 'KEY-1234', kind: 'byok', fetchImpl: (async () => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch });
    await expect(c.chat({ messages: [], tools: [], agent: 'a' })).rejects.toThrow(/CORS/);
  });

  it('assembles streamed text and tool calls that arrive in pieces', async () => {
    const lines = [
      { choices: [{ delta: { content: 'Let me ' } }] },
      { choices: [{ delta: { content: 'check.' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'timetable_agent', arguments: '{"requ' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'est":"today"}' } }] } }] },
    ];
    const body = new Response(lines.map((l) => `data: ${JSON.stringify(l)}\r\n\r\n`).join('') + 'data: [DONE]\n\n').body!;
    const seen: string[] = [];
    const r = await readStream(body, (d) => seen.push(d));
    expect(r.content).toBe('Let me check.');
    expect(seen).toEqual(['Let me ', 'check.']);
    expect(r.tool_calls).toEqual([{ id: 'c1', type: 'function', function: { name: 'timetable_agent', arguments: '{"request":"today"}' } }]);
  });

  it('reads a plain JSON answer when the router does not stream', async () => {
    const c = new OpenAICompatClient({ baseUrl: 'https://r.example/v1', model: 'm', apiKey: 'KEY-1234', kind: 'byok', fetchImpl: (async () => Response.json({ choices: [{ message: { content: 'whole' } }] })) as typeof fetch });
    expect((await c.chat({ messages: [], tools: [], agent: 'a' })).content).toBe('whole');
  });

  it('stores, loads and deletes the profile in origin-scoped storage', () => {
    const mem = new Map<string, string>();
    const store = new ProfileStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
    expect(store.load()).toBeNull();
    store.save({ presetId: 'gemini', baseUrl: 'https://x/v1', model: 'm', apiKey: 'KEY-1' });
    expect(store.load()?.apiKey).toBe('KEY-1');
    store.clear();
    expect(store.load()).toBeNull();
    expect(mem.size).toBe(0);
  });

  it('chooses the published default without a key, and the visitor router with one; a peer manifest is never consulted', () => {
    const m = basicManifest({ llm_router: { base_url: 'browser://demo', mock: true, byok_router: 'https://m.example/v1' } });
    expect(chooseRouter(m, null)).toMatchObject({ kind: 'default', mock: true });
    const picked = chooseRouter(m, { presetId: 'gemini', baseUrl: '', model: '', apiKey: 'K-1234' });
    expect(picked).toMatchObject({ kind: 'byok', mock: false, baseUrl: PRESETS[0]!.baseUrl, model: PRESETS[0]!.model });
  });

  it('offers a Gemini preset on the OpenAI-compatible endpoint', () => {
    expect(PRESETS.find((p) => p.id === 'gemini')!.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
  });
});

describe('scrub', () => {
  it('hides known secrets, bearer tokens and secret-looking fields, deeply', () => {
    const out = scrub({ a: 'x KEY-SECRET-1 y', headers: { Authorization: 'Bearer abcdefgh12345' }, nested: [{ apiKey: 'zzz' }] }, ['KEY-SECRET-1']);
    expect(JSON.stringify(out)).not.toMatch(/KEY-SECRET-1|abcdefgh12345|zzz/);
  });
});

describe('mcp client', () => {
  it('lists and calls tools over JSON-RPC, including an event-stream reply', async () => {
    const seen: any[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      seen.push(body.method);
      if (body.method === 'initialize') return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {} }), { headers: { 'content-type': 'application/json', 'mcp-session-id': 's1' } });
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (body.method === 'tools/list') return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'search', description: 'd', inputSchema: { type: 'object' } }] } }), { headers: { 'content-type': 'application/json' } });
      return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'found it' }] } })}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    }) as unknown as typeof fetch;
    const c = new McpClient('https://mcp.example/rpc', f);
    expect((await c.listTools()).map((t) => t.name)).toEqual(['search']);
    expect(await c.callTool('search', { q: 'x' })).toBe('found it');
    expect(seen).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
  });

  it('reports a server error, not a result', async () => {
    const f = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { message: 'nope' } }), { headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    await expect(new McpClient('https://mcp.example/rpc', f).listTools()).rejects.toThrow(/nope/);
  });
});

describe('WebMCP', () => {
  const actions = [
    { name: 'read_it', purpose: 'reads', effect: 'read' as const, schema: { type: 'object' }, handler: (_a: unknown, ctx: { sly: Record<string, unknown> }) => ({ section: ctx.sly.s }) },
    { name: 'write_it', purpose: 'writes', effect: 'write' as const, schema: { type: 'object' }, handler: () => ({}) },
  ];
  it('does nothing when the browser has no modelContext', () => expect(registerWebMcp(actions as never, () => ({}), 'https://x', {})).toEqual([]));
  it('registers read actions only, and runs them with private context', async () => {
    const tools: any[] = [];
    const done = registerWebMcp(actions as never, () => ({ s: 'A' }), 'https://x', { modelContext: { registerTool: (t: any) => tools.push(t) } });
    expect(done).toEqual(['read_it']);
    expect(JSON.parse((await tools[0].execute({})).content[0].text)).toEqual({ section: 'A' });
  });
  it('skips a tool the browser refuses', () => {
    const done = registerWebMcp(actions as never, () => ({}), 'https://x', {
      modelContext: {
        registerTool: () => {
          throw new Error('dup');
        },
      },
    });
    expect(done).toEqual([]);
  });
});
