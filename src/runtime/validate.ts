// Parse and validate a published manifest and agent network before any model call (spec 3.1).
import type { AgentDef, Manifest, NetworkDef, ToolRef } from './types';

export interface Validation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const NAME = /^[A-Za-z0-9_.-]+$/;
const FORBIDDEN_KEYS = ['class', 'command', 'toolbox'] as const;

export function isUrlRef(ref: ToolRef): boolean {
  const s = typeof ref === 'string' ? ref : ref.url;
  return /^https?:\/\//i.test(s);
}

export function refName(ref: ToolRef): string {
  return typeof ref === 'string' ? ref : ref.url;
}

/** A tool reference that names a site action in the page's catalog, such as website_get_timetable. */
export function isActionRef(ref: ToolRef): boolean {
  return typeof ref === 'string' && ref.startsWith('website_');
}

export function validateNetwork(network: unknown, frontMan?: string): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!network || typeof network !== 'object') return { ok: false, errors: ['network is not an object'], warnings };
  const n = network as NetworkDef;
  if (!Array.isArray(n.tools) || n.tools.length === 0) return { ok: false, errors: ['network.tools must be a non-empty array'], warnings };
  if (!n.metadata?.description) warnings.push('metadata.description is missing');

  const names = new Set<string>();
  for (const [i, agent] of n.tools.entries()) {
    const where = `tools[${i}]`;
    if (!agent || typeof agent !== 'object') {
      errors.push(`${where} is not an object`);
      continue;
    }
    if (typeof agent.name !== 'string' || !agent.name) {
      errors.push(`${where} has no name`);
      continue;
    }
    if (!NAME.test(agent.name)) errors.push(`agent name "${agent.name}" has characters that are not allowed`);
    if (names.has(agent.name)) errors.push(`duplicate agent name "${agent.name}"`);
    names.add(agent.name);
    for (const key of FORBIDDEN_KEYS) {
      if (key in agent) errors.push(`agent "${agent.name}" uses "${key}", which is an executable definition this runtime does not run`);
    }
    if (!agent.function?.description) errors.push(`agent "${agent.name}" needs function.description`);
    const params = agent.function?.parameters;
    if (params && params.type !== 'object') errors.push(`agent "${agent.name}" parameters must be an object schema`);
    if (agent.tools !== undefined && !Array.isArray(agent.tools)) errors.push(`agent "${agent.name}" tools must be an array`);
    if (!agent.instructions) warnings.push(`agent "${agent.name}" has no instructions`);
  }

  const agents = new Map(n.tools.filter((a) => a && typeof a.name === 'string').map((a) => [a.name, a] as const));
  for (const agent of agents.values()) {
    for (const ref of agent.tools ?? []) {
      if (typeof ref === 'object' && ref !== null && typeof ref.url !== 'string') {
        errors.push(`agent "${agent.name}" has a tool descriptor without a url`);
        continue;
      }
      if (isUrlRef(ref) || isActionRef(ref)) continue;
      if (typeof ref === 'object') continue; // MCP descriptor with a non-http url is rejected below
      if (!agents.has(ref)) errors.push(`agent "${agent.name}" references missing agent "${ref}"`);
    }
    for (const ref of agent.tools ?? []) {
      if (typeof ref === 'object' && ref !== null && typeof ref.url === 'string' && !/^https?:\/\//i.test(ref.url)) {
        errors.push(`agent "${agent.name}" has an MCP url that is not http or https`);
      }
    }
  }

  if (frontMan !== undefined) {
    if (!agents.has(frontMan)) errors.push(`front agent "${frontMan}" is not defined in the network`);
  }

  // Composition cycles among local agents.
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (name: string) => {
    if (state.get(name) === 2) return;
    if (state.get(name) === 1) {
      errors.push(`composition cycle: ${[...stack.slice(stack.indexOf(name)), name].join(' -> ')}`);
      return;
    }
    state.set(name, 1);
    stack.push(name);
    for (const ref of agents.get(name)?.tools ?? []) {
      if (typeof ref === 'string' && agents.has(ref)) visit(ref);
    }
    stack.pop();
    state.set(name, 2);
  };
  for (const name of agents.keys()) visit(name);

  return { ok: errors.length === 0, errors, warnings };
}

export function validateManifest(manifest: unknown): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!manifest || typeof manifest !== 'object') return { ok: false, errors: ['manifest is not an object'], warnings };
  const m = manifest as Manifest;
  if (!Array.isArray(m.networks) || m.networks.length === 0) return { ok: false, errors: ['manifest.networks must be a non-empty array'], warnings };
  const seen = new Set<string>();
  for (const [i, entry] of m.networks.entries()) {
    for (const key of ['name', 'front_man', 'hocon'] as const) {
      if (typeof entry?.[key] !== 'string' || !entry[key]) errors.push(`networks[${i}].${key} is required`);
    }
    if (entry?.name) {
      if (seen.has(entry.name)) errors.push(`duplicate network name "${entry.name}"`);
      seen.add(entry.name);
    }
  }
  if (!m.llm_router) warnings.push('llm_router is missing, so no default inference path is published');
  if (!m.peer_policy && !m.allowed_peers) warnings.push('no peer_policy or allowed_peers: calls to other sites will be refused');
  if (m.peer_policy?.mode === 'open') warnings.push('peer_policy.mode is open: any origin the visitor approves may be contacted');
  return { ok: errors.length === 0, errors, warnings };
}
