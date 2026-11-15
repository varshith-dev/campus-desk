// Shared types for the Campus Desk browser runtime.
// The shapes follow the Open Agentic Web MVP profile 0.2 (sections 2 and 3).

export type JsonSchema = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchema;
};

/** A reference in an agent's `tools` list: a local agent or action name, a peer network URL, or an MCP descriptor. */
export type ToolRef = string | { url: string; tools?: string[] };

export interface AgentDef {
  name: string;
  function?: { description?: string; parameters?: JsonSchema };
  instructions?: string;
  tools?: ToolRef[];
  /** Neuro SAN coded tools use `class`. This runtime refuses them (section 3.1). */
  class?: string;
  command?: string;
  toolbox?: string;
  /** Model settings are hints. The caller's active router wins. */
  llm_config?: { model_name?: string; temperature?: number };
  max_steps?: number;
  /** Private context rules. Deny by default across network boundaries. */
  allow?: { to_downstream?: { sly_data?: string[] }; from_downstream?: { sly_data?: string[] } };
}

export interface NetworkDef {
  metadata?: { description?: string; sample_queries?: string[]; [k: string]: unknown };
  llm_config?: { model_name?: string; temperature?: number };
  max_steps?: number;
  /** Optional limits, subject to the runtime maximums. */
  limits?: Partial<Limits>;
  /** Names shown on consent cards, keyed by exact peer URL. */
  link_labels?: Record<string, string>;
  tools: AgentDef[];
  [k: string]: unknown;
}

export interface ManifestNetworkEntry {
  name: string;
  front_man: string;
  hocon: string;
  description?: string;
  tags?: string[];
  sample_queries?: string[];
}

export interface Manifest {
  brand?: string;
  networks: ManifestNetworkEntry[];
  llm_router?: { base_url?: string; mock?: boolean; byok_router?: string };
  allowed_peers?: string[];
  peer_policy?: { mode?: 'open' | 'closed'; deny_origins?: string[]; note?: string };
  actions?: { version?: number; scope?: string; agentTools?: string[]; bindings?: Record<string, string[]>; catalog?: unknown[] };
  [k: string]: unknown;
}

export type Effect = 'read' | 'write' | 'irreversible';

/** A site action: owned by the page, registered with the runtime, and called through a schema. */
export interface SiteAction<A = Record<string, unknown>, R = unknown> {
  name: string;
  purpose: string;
  schema: JsonSchema;
  effect: Effect;
  /** Handlers get private context directly. The model never sees it. */
  handler: (args: A, ctx: ActionContext) => Promise<R> | R;
  /** Text for the confirmation dialog on write and irreversible actions. */
  describe?: (args: A) => string;
}

export interface ActionContext {
  sly: Readonly<Record<string, unknown>>;
  origin: string;
}

export interface Limits {
  maxDepth: number;
  maxAgentCalls: number;
  maxRemoteCalls: number;
  maxPerPeer: number;
  maxToolCalls: number;
  maxSteps: number;
  maxMs: number;
  maxHistory: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxDepth: 5,
  maxAgentCalls: 24,
  maxRemoteCalls: 4,
  maxPerPeer: 1,
  maxToolCalls: 24,
  maxSteps: 8,
  maxMs: 90_000,
  maxHistory: 12,
};

/** Runtime maximums. A network may ask for lower limits, never higher. */
export const MAX_LIMITS: Limits = {
  maxDepth: 5,
  maxAgentCalls: 40,
  maxRemoteCalls: 6,
  maxPerPeer: 2,
  maxToolCalls: 40,
  maxSteps: 12,
  maxMs: 120_000,
  maxHistory: 20,
};

// ---- Model interface (OpenAI chat completions shape) ----

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ModelToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ModelToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ModelToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: JsonSchema };
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools: ModelToolSpec[];
  /** The agent this call is for. Used by in-browser demo models and by traces. */
  agent: string;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
}

export interface ChatResult {
  content: string;
  tool_calls: ModelToolCall[];
}

export interface LlmClient {
  /** Short label for traces, such as "Gemini via OpenAI-compatible router". Never includes a key. */
  readonly label: string;
  /** The router base URL, or "browser://demo" for the in-browser demo model. */
  readonly router: string;
  readonly kind: 'byok' | 'default' | 'demo';
  chat(req: ChatRequest): Promise<ChatResult>;
}

// ---- Events ----

export type RuntimeEvent =
  | { type: 'router'; router: string; label: string; kind: LlmClient['kind'] }
  | { type: 'agent_start'; agent: string; network: string; depth: number; request: string }
  | { type: 'agent_end'; agent: string; network: string; ms: number }
  | { type: 'model_call'; agent: string }
  | { type: 'tool_call'; agent: string; tool: string; kind: 'agent' | 'action' | 'peer'; args: unknown }
  | { type: 'tool_result'; agent: string; tool: string; ok: boolean; summary: string }
  | { type: 'consent'; origin: string; purpose: string; decision: 'allowed' | 'denied' | 'remembered' | 'same-origin' }
  | { type: 'confirm'; action: string; decision: 'confirmed' | 'declined'; args: unknown }
  | { type: 'receipt'; action: string; requestId: string; status: 'succeeded' | 'failed' | 'unknown'; detail: string }
  | { type: 'peer_loaded'; origin: string; network: string; agents: number }
  | { type: 'private_context'; direction: 'to_peer' | 'from_peer'; allowed: string[]; withheld: string[] }
  | { type: 'limit'; name: keyof Limits; detail: string }
  | { type: 'error'; where: string; message: string };

export type Consent = (req: { origin: string; url: string; label: string; purpose: string }) => Promise<'allow' | 'allow_session' | 'deny'>;
export type Confirm = (req: { action: string; origin: string; effect: Effect; args: unknown; text: string; requestId: string }) => Promise<boolean>;

export class RuntimeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
  }
}
