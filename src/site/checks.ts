// The checks shown on the "For agents" page. They use the published runtime's own validators, passed in by the page.
import type { Manifest, NetworkDef, Validation } from '@aw/runtime';

export interface Validators {
  validateManifest(m: unknown): Validation;
  validateNetwork(n: unknown, frontMan?: string): Validation;
}

export interface Check {
  status: 'pass' | 'fail' | 'warn';
  text: string;
}

export function runChecks(v: Validators, manifest: unknown, network: unknown, runtimeReachable: boolean): Check[] {
  const { validateManifest, validateNetwork } = v;
  const out: Check[] = [];
  const mv = validateManifest(manifest);
  out.push({ status: mv.ok ? 'pass' : 'fail', text: mv.ok ? 'agent-manifest.json is valid and lists a network with name, front_man and hocon.' : `agent-manifest.json problems: ${mv.errors.join('; ')}` });
  if (!mv.ok) return out;
  const m = manifest as Manifest;
  const entry = m.networks[0]!;
  const nv = validateNetwork(network, entry.front_man);
  out.push({ status: nv.ok ? 'pass' : 'fail', text: nv.ok ? `${entry.hocon.replace('./', '')} is a valid data-only network with ${(network as NetworkDef).tools.length} agents.` : `Network problems: ${nv.errors.join('; ')}` });
  if (nv.ok) {
    const n = network as NetworkDef;
    const front = n.tools.find((a) => a.name === entry.front_man);
    out.push({ status: 'pass', text: `The front agent "${entry.front_man}" exists, and no agent uses a coded tool.` });
    out.push({ status: 'pass', text: 'There is no composition cycle among the agents.' });
    const leaks = front?.allow?.to_downstream?.sly_data ?? [];
    out.push({ status: leaks.length === 0 ? 'pass' : 'warn', text: leaks.length === 0 ? 'Private context is deny by default: no field may leave for another site.' : `Private context fields allowed to leave: ${leaks.join(', ')}.` });
    const peers = (n.tools.flatMap((a) => a.tools ?? []) as Array<string | { url: string }>).filter((t) => typeof t === 'string' && /^https?:\/\//.test(t)) as string[];
    const allowed = new Set(m.allowed_peers ?? []);
    const unlisted = peers.filter((p) => !allowed.has(new URL(p).origin) && m.peer_policy?.mode !== 'open');
    out.push({
      status: unlisted.length ? 'fail' : 'pass',
      text: unlisted.length ? `These peer sites are not in allowed_peers, so calls would be refused: ${unlisted.join(', ')}.` : peers.length ? `Every peer site is listed in allowed_peers (${[...allowed].join(', ')}).` : 'The network calls no other site.',
    });
  }
  out.push({ status: m.llm_router ? 'pass' : 'warn', text: m.llm_router ? `A default router is published (${m.llm_router.mock ? 'in-browser demo model' : m.llm_router.base_url}), and a visitor key router is offered.` : 'No default router is published.' });
  out.push({ status: runtimeReachable ? 'pass' : 'fail', text: runtimeReachable ? 'The browser runtime file loads.' : 'The browser runtime file did not load.' });
  out.push({ status: 'warn', text: 'Other sites are not contacted by this page. The Ask page asks you first.' });
  return out;
}
