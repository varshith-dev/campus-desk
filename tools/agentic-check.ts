#!/usr/bin/env -S npx tsx
// agentic-check: test whether a site publishes a conforming open agentic website.
// It reads the public files only (agent-manifest.json, the network JSON, the runtime file) from a folder or a URL.
// It checks the data rules in the Open Agentic Web spec (MVP Profile 0.2, sections 2 to 6) that can be checked from files.
// The run-time checks (consent card, key isolation, stopping an over-budget call) are covered by the runtime test suite.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateManifest, validateNetwork, MAX_LIMITS } from '../src/runtime/index';
import type { Manifest, NetworkDef } from '../src/runtime/index';

export type Status = 'pass' | 'fail' | 'warn' | 'skip';
export interface Result {
  id: string;
  spec: string;
  status: Status;
  text: string;
}
export interface Report {
  source: string;
  results: Result[];
  ok: boolean;
  counts: Record<Status, number>;
}
export interface Source {
  label: string;
  /** Returns the file text, or null when it does not exist. */
  read(path: string): Promise<string | null>;
}

export function folderSource(dir: string): Source {
  const base = resolve(dir);
  return {
    label: base,
    async read(path) {
      const file = join(base, path.replace(/^\.\//, ''));
      if (!file.startsWith(base)) return null;
      if (!existsSync(file) || !statSync(file).isFile()) return null;
      return readFileSync(file, 'utf8');
    },
  };
}

export function urlSource(url: string, fetchImpl: typeof fetch = fetch): Source {
  const base = url.endsWith('/') ? url : `${url}/`;
  return {
    label: url,
    async read(path) {
      try {
        const res = await fetchImpl(new URL(path.replace(/^\.\//, ''), base).toString(), { credentials: 'omit', redirect: 'follow' });
        return res.ok ? await res.text() : null;
      } catch {
        return null;
      }
    },
  };
}

const SECRET = /(AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
const CODE_KEYS = ['class', 'command', 'toolbox'];

function parse(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isOrigin(s: string): boolean {
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) && u.origin === s.replace(/\/$/, '');
  } catch {
    return false;
  }
}

function isSafeRouter(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

export async function checkSite(src: Source): Promise<Report> {
  const results: Result[] = [];
  const add = (id: string, spec: string, status: Status, text: string) => results.push({ id, spec, status, text });
  const texts: Array<[string, string]> = [];

  const manifestText = await src.read('agent-manifest.json');
  const manifestJson = parse(manifestText);
  if (manifestText === null) {
    add('manifest.found', '3.3', 'fail', 'agent-manifest.json was not found at the site root.');
    return finish(src, results);
  }
  texts.push(['agent-manifest.json', manifestText]);
  if (manifestJson === undefined) {
    add('manifest.found', '3.3', 'fail', 'agent-manifest.json is not valid JSON.');
    return finish(src, results);
  }
  add('manifest.found', '3.3', 'pass', 'agent-manifest.json is published and is valid JSON.');

  const mv = validateManifest(manifestJson);
  add('manifest.entries', '3.3', mv.ok ? 'pass' : 'fail', mv.ok ? 'Every network entry has name, front_man and hocon.' : mv.errors.join('; '));
  if (!mv.ok) return finish(src, results);
  const manifest = manifestJson as Manifest;
  for (const w of mv.warnings) add('manifest.warning', '3.3', 'warn', w);

  // Networks
  let agentCount = 0;
  const loaded: Array<{ name: string; network: NetworkDef }> = [];
  for (const entry of manifest.networks) {
    const tag = `network "${entry.name}"`;
    const text = await src.read(entry.hocon);
    if (text === null) {
      add('network.found', '3.3', 'fail', `${tag}: ${entry.hocon} was not found.`);
      continue;
    }
    texts.push([entry.hocon, text]);
    const json = parse(text);
    if (json === undefined) {
      add('network.parse', '2.2', 'skip', `${tag}: ${entry.hocon} is not JSON (HOCON?). This tool checks JSON networks only.`);
      continue;
    }
    const nv = validateNetwork(json, entry.front_man);
    add('network.valid', '2.1, 3.1', nv.ok ? 'pass' : 'fail', nv.ok ? `${tag}: valid data-only network, front agent "${entry.front_man}" exists, no composition cycle.` : `${tag}: ${nv.errors.join('; ')}`);
    for (const w of nv.warnings) add('network.warning', '2.1', 'warn', `${tag}: ${w}`);
    if (!nv.ok) continue;
    const network = json as NetworkDef;
    loaded.push({ name: entry.name, network });
    agentCount += network.tools.length;

    const coded = network.tools.filter((a) => CODE_KEYS.some((k) => k in (a as object)));
    add('network.data-only', '2.2', coded.length ? 'fail' : 'pass', coded.length ? `${tag}: coded tools in ${coded.map((a) => a.name).join(', ')}.` : `${tag}: no coded tools.`);

    const lim = network.limits ?? {};
    const over = (Object.keys(lim) as Array<keyof typeof lim>).filter((k) => typeof lim[k] === 'number' && k in MAX_LIMITS && (lim[k] as number) > (MAX_LIMITS as unknown as Record<string, number>)[k]!);
    add('network.limits', '3.1', over.length ? 'warn' : 'pass', over.length ? `${tag}: limits above the runtime ceiling (${over.join(', ')}); the runtime will clamp them.` : `${tag}: ${network.limits ? 'limits are within the runtime ceiling.' : 'no limits set; runtime defaults apply.'}`);

    const front = network.tools.find((a) => a.name === entry.front_man);
    const leaks = front?.allow?.to_downstream?.sly_data ?? [];
    add('private.deny-by-default', '2.1, 5', leaks.length ? 'warn' : 'pass', leaks.length ? `${tag}: the front agent lets these private fields reach other agents: ${leaks.join(', ')}.` : `${tag}: private context is deny by default (the front agent names no field that may leave).`);

    const peers = network.tools.flatMap((a) => (a.tools ?? []).map((t) => (typeof t === 'string' ? t : t.url))).filter((t) => /^https?:\/\//i.test(t));
    const allowed = manifest.allowed_peers ?? [];
    const open = manifest.peer_policy?.mode === 'open';
    const unlisted = peers.filter((p) => !allowed.includes(new URL(p).origin));
    if (peers.length === 0) add('peers.listed', '3.2, 5', 'pass', `${tag}: calls no other site.`);
    else if (unlisted.length && !open) add('peers.listed', '3.2, 5', 'fail', `${tag}: peers not in allowed_peers: ${unlisted.join(', ')}.`);
    else add('peers.listed', '3.2, 5', 'pass', `${tag}: every peer is in allowed_peers or the policy is open.`);

    for (const [agent, acts] of Object.entries(manifest.actions?.bindings ?? {})) {
      if (!network.tools.some((a) => a.name === agent)) add('actions.bound', '2.1', 'fail', `${tag}: actions.bindings names unknown agent "${agent}" (${acts.join(', ')}).`);
    }
  }

  add('agents.two', '6', agentCount >= 2 ? 'pass' : 'fail', agentCount >= 2 ? `${agentCount} agents are published.` : `Only ${agentCount} agent is published. The spec asks for at least two.`);

  // Router
  const r = manifest.llm_router;
  if (!r) add('router.default', '3.3, 4', 'fail', 'llm_router is missing, so there is no default inference path.');
  else {
    add('router.default', '3.3, 4', 'pass', `A default router is published (${r.mock ? 'in-browser, no key needed' : r.base_url}).`);
    if (r.byok_router) add('router.byok', '4', isSafeRouter(r.byok_router) ? 'pass' : 'fail', isSafeRouter(r.byok_router) ? `Visitor-key router: ${r.byok_router} (https).` : `byok_router must be https or loopback: ${r.byok_router}.`);
    else add('router.byok', '4', 'warn', 'No byok_router is named, so visitors cannot bring their own key by default.');
  }

  // Peer policy shape
  const badOrigins = (manifest.allowed_peers ?? []).filter((p) => !isOrigin(p));
  add('peers.shape', '3.2', badOrigins.length ? 'fail' : 'pass', badOrigins.length ? `allowed_peers must be origins with no path: ${badOrigins.join(', ')}.` : 'allowed_peers entries are plain origins.');
  if (manifest.peer_policy?.mode === 'open') add('peers.open', '3.2', 'warn', 'peer_policy.mode is open. Every peer still needs visitor consent.');

  // Runtime file
  const rt = (manifest as { runtime?: { file?: string } }).runtime?.file;
  if (!rt) add('runtime.file', 'contest', 'fail', 'The manifest does not name a runtime file (runtime.file).');
  else {
    const body = await src.read(rt);
    add('runtime.file', 'contest', body && body.length > 1000 ? 'pass' : 'fail', body && body.length > 1000 ? `Runtime file ${rt} loads (${Math.round(body.length / 1024)} KB).` : `Runtime file ${rt} is missing or empty.`);
  }

  // links.json
  const links = await src.read('links.json');
  if (links === null) add('links.json', '3.3', 'skip', 'No links.json (optional).');
  else {
    texts.push(['links.json', links]);
    add('links.json', '3.3', parse(links) === undefined ? 'fail' : 'pass', parse(links) === undefined ? 'links.json is not valid JSON.' : 'links.json is valid JSON.');
  }

  // Secrets in public files
  const leaked = texts.filter(([, t]) => SECRET.test(t)).map(([n]) => n);
  add('secrets', '4, 5', leaked.length ? 'fail' : 'pass', leaked.length ? `Something that looks like a key or token is published in: ${leaked.join(', ')}.` : 'No key or token pattern appears in the published files.');

  return finish(src, results);
}

function finish(src: Source, results: Result[]): Report {
  const counts: Record<Status, number> = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const r of results) counts[r.status]++;
  return { source: src.label, results, ok: counts.fail === 0, counts };
}

export function formatReport(rep: Report): string {
  const tag: Record<Status, string> = { pass: 'PASS', fail: 'FAIL', warn: 'WARN', skip: 'SKIP' };
  const lines = [`agentic-check: ${rep.source}`, ''];
  for (const r of rep.results) lines.push(`${tag[r.status]}  [${r.spec === 'contest' ? 'contest rule' : `spec ${r.spec}`}] ${r.text}`);
  lines.push('', `${rep.counts.pass} passed, ${rep.counts.fail} failed, ${rep.counts.warn} warnings, ${rep.counts.skip} skipped.`);
  lines.push(rep.ok ? 'Result: the published files look like a conforming open agentic website.' : 'Result: not conforming yet. Fix the FAIL lines.');
  return lines.join('\n');
}

async function main(argv: string[]): Promise<number> {
  const args = argv.filter((a) => !a.startsWith('--'));
  const json = argv.includes('--json');
  if (args.length !== 1 || argv.includes('--help')) {
    console.log('Usage: agentic-check <folder-or-url> [--json]\n\nExamples:\n  npx tsx tools/agentic-check.ts dist\n  npx tsx tools/agentic-check.ts https://example.org/');
    return args.length === 1 ? 0 : 2;
  }
  const target = args[0]!;
  const src = /^https?:\/\//i.test(target) ? urlSource(target) : folderSource(target);
  const rep = await checkSite(src);
  console.log(json ? JSON.stringify(rep, null, 2) : formatReport(rep));
  return rep.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((c) => process.exit(c));
}
