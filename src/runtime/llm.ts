// An OpenAI-compatible chat client that runs in the browser and streams.
// The key is attached only to requests to the selected router (spec section 4).
import { scrub } from './trace';
import type { ChatRequest, ChatResult, LlmClient, ModelToolCall } from './types';
import { RuntimeError } from './types';

export interface RouterConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  kind: 'byok' | 'default';
  label?: string;
  fetchImpl?: typeof fetch;
}

export function isLoopback(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
}

/** HTTPS is required except for loopback during local development. */
export function assertSafeRouterUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RuntimeError('bad_router', 'The router URL is not a complete web address.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url))) {
    throw new RuntimeError('bad_router', 'The router URL must use https. Plain http is only allowed for localhost.');
  }
  return url;
}

export class OpenAICompatClient implements LlmClient {
  readonly kind: 'byok' | 'default';
  readonly router: string;
  readonly label: string;
  private readonly cfg: RouterConfig;

  constructor(cfg: RouterConfig) {
    this.cfg = cfg;
    this.kind = cfg.kind;
    this.router = cfg.baseUrl.replace(/\/+$/, '');
    this.label = cfg.label ?? `${new URL(this.router).host} / ${cfg.model}`;
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const { apiKey, model } = this.cfg;
    if (!apiKey) {
      throw new RuntimeError('setup', 'No API key is set. Open AI settings and add your key, or switch to demo mode.');
    }
    if (!model) throw new RuntimeError('setup', 'No model name is set. Open AI settings and choose a model.');
    assertSafeRouterUrl(this.router);
    const doFetch = this.cfg.fetchImpl ?? fetch;
    const body: Record<string, unknown> = {
      model,
      messages: req.messages,
      stream: true,
    };
    if (req.tools.length) {
      body.tools = req.tools;
      body.tool_choice = 'auto';
    }
    let res: Response;
    try {
      res = await doFetch(`${this.router}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: req.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      throw new RuntimeError(
        'network',
        'Could not reach the model router. Check the URL and your connection. If both are fine, the router may not allow calls from a browser page (CORS).',
      );
    }
    if (!res.ok) {
      const text = scrub((await res.text().catch(() => '')).slice(0, 400), [apiKey]);
      throw new RuntimeError('llm_http', `Model router answered HTTP ${res.status}. ${text}`.trim());
    }
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('text/event-stream') || !res.body) {
      return parseWhole(await res.json());
    }
    return readStream(res.body, req.onText);
  }
}

function parseWhole(json: any): ChatResult {
  const msg = json?.choices?.[0]?.message ?? {};
  return { content: msg.content ?? '', tool_calls: (msg.tool_calls ?? []) as ModelToolCall[] };
}

export async function readStream(body: ReadableStream<Uint8Array>, onText?: (d: string) => void): Promise<ChatResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const calls = new Map<number, ModelToolCall>();
  const handle = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let chunk: any;
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    const delta = chunk?.choices?.[0]?.delta;
    if (!delta) return;
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content;
      onText?.(delta.content);
    }
    for (const tc of delta.tool_calls ?? []) {
      const idx: number = typeof tc.index === 'number' ? tc.index : calls.size;
      const cur = calls.get(idx) ?? { id: '', type: 'function' as const, function: { name: '', arguments: '' } };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.function.name += tc.function.name;
      if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
      calls.set(idx, cur);
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      handle(buffer.slice(0, nl).replace(/\r$/, ''));
      buffer = buffer.slice(nl + 1);
    }
  }
  if (buffer.trim()) handle(buffer.trim());
  const tool_calls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c], i) => ({ ...c, id: c.id || `call_${i}` }));
  return { content, tool_calls };
}
