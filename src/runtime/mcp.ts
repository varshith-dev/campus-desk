// A minimal MCP client for streamable HTTP servers (JSON-RPC over POST). Only the calls an agent needs:
// initialize, tools/list and tools/call. The runtime asks for consent before it reaches here.
import type { JsonSchema } from './types';
import { RuntimeError } from './types';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

interface Rpc {
  jsonrpc: '2.0';
  id?: number;
  method: string;
  params?: unknown;
}

export class McpClient {
  private sessionId: string | null = null;
  private nextId = 1;
  private ready = false;

  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch,
    private readonly signal?: AbortSignal,
  ) {}

  private async post(body: Rpc, expectResult = true): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    let res: Response;
    try {
      res = await this.fetchImpl(this.url, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'omit', signal: this.signal });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      throw new RuntimeError('mcp_unreachable', `Could not reach the MCP server at ${new URL(this.url).origin}. It may not allow browser calls (CORS).`);
    }
    if (!res.ok) throw new RuntimeError('mcp_http', `The MCP server answered HTTP ${res.status}.`);
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (!expectResult) return null;
    const type = res.headers.get('content-type') ?? '';
    const text = await res.text();
    let msg: any;
    if (type.includes('text/event-stream')) {
      const dataLines = text.split(/\r?\n/).filter((l) => l.startsWith('data:'));
      for (const l of dataLines) {
        try {
          const m = JSON.parse(l.slice(5).trim());
          if (m.id === body.id) msg = m;
        } catch {
          /* skip */
        }
      }
    } else {
      try {
        msg = JSON.parse(text);
      } catch {
        msg = null;
      }
    }
    if (!msg) throw new RuntimeError('mcp_bad_reply', 'The MCP server sent a reply this client cannot read.');
    if (msg.error) throw new RuntimeError('mcp_error', `The MCP server reported: ${String(msg.error.message ?? 'error').slice(0, 200)}`);
    return msg.result;
  }

  private async init(): Promise<void> {
    if (this.ready) return;
    await this.post({
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'campus-desk-runtime', version: '1.0.0' } },
    });
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, false);
    this.ready = true;
  }

  async listTools(): Promise<McpTool[]> {
    await this.init();
    const r = await this.post({ jsonrpc: '2.0', id: this.nextId++, method: 'tools/list' });
    return (r?.tools ?? []) as McpTool[];
  }

  async callTool(name: string, args: unknown): Promise<string> {
    await this.init();
    const r = await this.post({ jsonrpc: '2.0', id: this.nextId++, method: 'tools/call', params: { name, arguments: args } });
    const parts = (r?.content ?? []) as Array<{ type: string; text?: string }>;
    const text = parts.filter((p) => p.type === 'text').map((p) => p.text ?? '').join('\n');
    if (r?.isError) throw new RuntimeError('mcp_tool_error', text || 'The MCP tool reported an error.');
    return text;
  }
}
