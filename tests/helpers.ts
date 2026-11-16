import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatRequest, ChatResult, LlmClient, Manifest, ModelToolCall, NetworkDef } from '@aw/runtime';
import { loadSample } from './sample';

export const root = join(import.meta.dirname, '..');
export const readJson = (rel: string) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
export { loadSample };

let n = 0;
export const tc = (name: string, args: unknown): ModelToolCall => ({ id: `t${++n}`, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } });

/** A model that follows a script: one function per turn. Records every request it sees. */
export class ScriptedLlm implements LlmClient {
  readonly label = 'scripted test model';
  readonly router = 'https://router.example/v1';
  readonly kind: 'byok' | 'default' | 'demo' = 'default';
  readonly seen: ChatRequest[] = [];
  constructor(private script: Array<(req: ChatRequest) => ChatResult>) {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    this.seen.push(structuredClone({ ...req, signal: undefined, onText: undefined }) as ChatRequest);
    const step = this.script.shift();
    if (!step) return { content: 'script ended', tool_calls: [] };
    return step(req);
  }
}

export const say = (content: string) => (): ChatResult => ({ content, tool_calls: [] });
export const callTools = (...calls: ModelToolCall[]) => (): ChatResult => ({ content: '', tool_calls: calls });

/** A fetch that serves a map of URL to JSON, and records every request. */
export function fakeFetch(files: Record<string, unknown>, opts: { redirects?: Record<string, string> } = {}) {
  const log: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    log.push({ url, init });
    const finalUrl = opts.redirects?.[url] ?? url;
    if (!(finalUrl in files)) return new Response('not found', { status: 404 });
    const res = new Response(JSON.stringify(files[finalUrl]), { status: 200, headers: { 'content-type': 'application/json' } });
    if (finalUrl !== url) Object.defineProperty(res, 'url', { value: finalUrl });
    else Object.defineProperty(res, 'url', { value: url });
    return res;
  }) as typeof fetch;
  return { impl, log };
}

export const basicManifest = (over: Partial<Manifest> = {}): Manifest => ({
  networks: [{ name: 'home', front_man: 'front', hocon: './home.network.json' }],
  llm_router: { base_url: 'browser://demo', mock: true },
  allowed_peers: [],
  peer_policy: { mode: 'closed' },
  ...over,
});

export const twoAgent = (extraFrontTools: NetworkDef['tools'][number]['tools'] = []): NetworkDef => ({
  metadata: { description: 'test' },
  tools: [
    { name: 'front', function: { description: 'front', parameters: { type: 'object', properties: { request: { type: 'string' } }, required: ['request'] } }, instructions: 'You are the front.', tools: ['helper', ...(extraFrontTools ?? [])] },
    { name: 'helper', function: { description: 'helper', parameters: { type: 'object', properties: { request: { type: 'string' } }, required: ['request'] } }, instructions: 'You help.', tools: [] },
  ],
});

// ---- A real database and the real server code, for tests ----
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openDb, useDb } from '../lib/db';
import { createStudent, loadCampusData, type Student } from '../lib/store';
import { runTool, toolCatalog } from '../lib/tools';
import { createActions, type ToolCall } from '../src/site/actions';
import { DEFAULT_PROFILE, type Profile } from '../src/data/model';

/** A fresh seeded database in a temp folder and one guest student. Tools run through `runTool`, the code the routes call. */
export async function makeDesk(profile: Profile = DEFAULT_PROFILE, clock?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'campus-desk-'));
  const db = await openDb(`file:${dir}/test.db`);
  useDb(Promise.resolve(db));
  const student: Student = await createStudent(db, { kind: 'guest', profile });
  const data = await loadCampusData(db, 0);
  const call: ToolCall = async (name, args, o) => (await runTool(name, args, { db, student, write: o.confirmed ? 'confirmed' : 'propose', source: 'test', clock })).result;
  const actions = createActions(toolCatalog(data.department), call);
  return { db, dir, student, data, call, actions, catalog: toolCatalog(data.department) };
}
