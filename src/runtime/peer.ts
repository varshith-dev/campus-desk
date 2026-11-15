// Loading another agent site's network (spec section 3.2).
// Reference, policy, consent, manifest fetch, exact name match, definition fetch, validation. Every step fails closed.
import { isLoopback } from './llm';
import { validateManifest, validateNetwork } from './validate';
import type { Consent, Manifest, NetworkDef } from './types';
import { RuntimeError } from './types';
import type { Trace } from './trace';

export interface PeerRef {
  url: string;
  origin: string;
  /** Site base, ending in a slash. The manifest lives here. */
  base: string;
  /** The requested network name, which is the last path segment. */
  name: string;
}

export function parsePeerUrl(raw: string): PeerRef {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RuntimeError('bad_peer_url', `"${raw}" is not a complete web address.`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url))) {
    throw new RuntimeError('https_required', `${url.origin} is not https. Peer sites must use https, except localhost while developing.`);
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const name = parts.pop();
  if (!name) throw new RuntimeError('bad_peer_url', 'A peer URL must end in the name of a published network.');
  const base = `${url.origin}/${parts.length ? parts.join('/') + '/' : ''}`;
  return { url: `${base}${name}`, origin: url.origin, base, name };
}

export function peerAllowedByPolicy(manifest: Manifest, origin: string): boolean {
  const policy = manifest.peer_policy;
  if (policy?.mode === 'open') {
    return !(policy.deny_origins ?? []).includes(origin);
  }
  return (manifest.allowed_peers ?? []).includes(origin);
}

export interface PeerContext {
  callerManifest: Manifest;
  callerOrigin: string;
  consent: Consent;
  fetchImpl: typeof fetch;
  trace: Trace;
  approved: Set<string>;
  labelFor: (url: string) => string;
  signal?: AbortSignal;
}

export interface LoadedPeer {
  ref: PeerRef;
  network: NetworkDef;
  frontMan: string;
  manifest: Manifest;
}

async function askConsent(ctx: PeerContext, origin: string, url: string, purpose: string): Promise<void> {
  if (origin === ctx.callerOrigin) {
    ctx.trace.emit({ type: 'consent', origin, purpose, decision: 'same-origin' });
    return;
  }
  if (ctx.approved.has(origin)) {
    ctx.trace.emit({ type: 'consent', origin, purpose, decision: 'remembered' });
    return;
  }
  const answer = await ctx.consent({ origin, url, label: ctx.labelFor(url), purpose });
  if (answer === 'deny') {
    ctx.trace.emit({ type: 'consent', origin, purpose, decision: 'denied' });
    throw new RuntimeError('denied', `You did not allow contact with ${origin}, so nothing was sent.`);
  }
  if (answer === 'allow_session') ctx.approved.add(origin);
  ctx.trace.emit({ type: 'consent', origin, purpose, decision: 'allowed' });
}

async function getJson(ctx: PeerContext, url: string, expectedOrigin: string, purpose: string): Promise<unknown> {
  let res: Response;
  try {
    res = await ctx.fetchImpl(url, { credentials: 'omit', cache: 'no-store', redirect: 'follow', referrerPolicy: 'no-referrer', signal: ctx.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new RuntimeError('peer_unreachable', `Could not read ${url}. The site may be down, or it may not allow other sites to read its files (CORS).`);
  }
  // A redirect to a different origin is a new destination. It needs its own policy check and consent.
  if (res.url) {
    const finalOrigin = new URL(res.url).origin;
    if (finalOrigin !== expectedOrigin) {
      if (!peerAllowedByPolicy(ctx.callerManifest, finalOrigin) && finalOrigin !== ctx.callerOrigin) {
        throw new RuntimeError('policy', `${expectedOrigin} redirected to ${finalOrigin}, which this site's policy does not allow.`);
      }
      await askConsent(ctx, finalOrigin, res.url, `${purpose} (redirected from ${expectedOrigin})`);
    }
  }
  if (!res.ok) throw new RuntimeError('peer_http', `${url} answered HTTP ${res.status}.`);
  try {
    return await res.json();
  } catch {
    throw new RuntimeError('peer_bad_json', `${url} did not return valid JSON.`);
  }
}

export async function loadPeer(rawUrl: string, ctx: PeerContext, purpose: string): Promise<LoadedPeer> {
  const ref = parsePeerUrl(rawUrl);
  if (!peerAllowedByPolicy(ctx.callerManifest, ref.origin) && ref.origin !== ctx.callerOrigin) {
    ctx.trace.emit({ type: 'error', where: 'policy', message: `${ref.origin} is not allowed by this site's peer policy.` });
    throw new RuntimeError('policy', `${ref.origin} is not on this site's list of allowed peers, so it was not contacted.`);
  }
  await askConsent(ctx, ref.origin, ref.url, purpose);

  const manifest = (await getJson(ctx, `${ref.base}agent-manifest.json`, ref.origin, purpose)) as Manifest;
  const mv = validateManifest(manifest);
  if (!mv.ok) throw new RuntimeError('peer_manifest', `The peer manifest is not valid: ${mv.errors.join('; ')}`);
  const entry = manifest.networks.find((n) => n.name === ref.name);
  if (!entry) {
    const names = manifest.networks.map((n) => n.name).join(', ');
    throw new RuntimeError('no_such_network', `${ref.origin} publishes no network named "${ref.name}" (it has: ${names}). Refusing to run a different one.`);
  }
  const defUrl = new URL(entry.hocon, ref.base);
  if (defUrl.protocol !== 'https:' && !(defUrl.protocol === 'http:' && isLoopback(defUrl))) {
    throw new RuntimeError('https_required', 'The peer network definition is not served over https.');
  }
  const network = (await getJson(ctx, defUrl.href, defUrl.origin, purpose)) as NetworkDef;
  const nv = validateNetwork(network, entry.front_man);
  if (!nv.ok) throw new RuntimeError('peer_invalid', `The peer network failed validation: ${nv.errors.join('; ')}`);
  ctx.trace.emit({ type: 'peer_loaded', origin: ref.origin, network: ref.name, agents: network.tools.length });
  return { ref, network, frontMan: entry.front_man, manifest };
}
