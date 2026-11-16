import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkSite, folderSource, formatReport, urlSource } from '../tools/agentic-check';
import { root } from './helpers';

const made: string[] = [];
function copy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ac-'));
  made.push(dir);
  cpSync(join(root, 'public'), dir, { recursive: true });
  return dir;
}
const edit = (dir: string, file: string, fn: (j: any) => void) => {
  const j = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  fn(j);
  writeFileSync(join(dir, file), JSON.stringify(j));
};
const failing = async (dir: string) => (await checkSite(folderSource(dir))).results.filter((r) => r.status === 'fail').map((r) => r.id);
afterEach(() => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('agentic-check on the built site', () => {
  it('passes the published files with no failures and no warnings', async () => {
    const rep = await checkSite(folderSource(join(root, 'public')));
    expect(rep.ok).toBe(true);
    expect(rep.counts).toMatchObject({ fail: 0, warn: 0 });
    expect(rep.results.length).toBeGreaterThanOrEqual(14);
  });
  it('prints a readable report', async () => {
    const text = formatReport(await checkSite(folderSource(join(root, 'public'))));
    expect(text).toMatch(/PASS {2}\[spec 2\.1, 3\.1\] network "campus_desk": valid data-only network/);
    expect(text).toMatch(/look like a conforming open agentic website/);
  });
  it('also reads a site over HTTP', async () => {
    const files = (path: string) => { try { return readFileSync(join(root, 'dist', path), 'utf8'); } catch { return null; } };
    const fetchImpl = (async (u: string) => { const body = files(new URL(u).pathname.slice(1)); return body === null ? new Response('no', { status: 404 }) : new Response(body); }) as unknown as typeof fetch;
    const rep = await checkSite(urlSource('https://site.example/', fetchImpl));
    expect(rep.ok).toBe(true);
  });
});

describe('agentic-check catches what the spec says to stop', () => {
  it('no manifest', async () => {
    const dir = copy();
    rmSync(join(dir, 'agent-manifest.json'));
    expect(await failing(dir)).toEqual(['manifest.found']);
  });
  it('a manifest that is not JSON', async () => {
    const dir = copy();
    writeFileSync(join(dir, 'agent-manifest.json'), '{nope');
    expect(await failing(dir)).toEqual(['manifest.found']);
  });
  it('a network entry missing front_man', async () => {
    const dir = copy();
    edit(dir, 'agent-manifest.json', (m) => delete m.networks[0].front_man);
    expect(await failing(dir)).toEqual(['manifest.entries']);
  });
  it('a network file that is missing', async () => {
    const dir = copy();
    rmSync(join(dir, 'campus_desk.network.json'));
    expect(await failing(dir)).toContain('network.found');
  });
  it('a composition cycle', async () => {
    const dir = copy();
    edit(dir, 'campus_desk.network.json', (n) => n.tools[1].tools = ['campus_desk']);
    const rep = await checkSite(folderSource(dir));
    expect(rep.results.find((r) => r.id === 'network.valid')!.text).toMatch(/composition cycle: campus_desk -> timetable_agent -> campus_desk|cycle/);
  });
  it('a coded tool', async () => {
    const dir = copy();
    edit(dir, 'campus_desk.network.json', (n) => n.tools[1].class = 'my.Tool');
    expect(await failing(dir)).toContain('network.valid');
  });
  it('only one agent', async () => {
    const dir = copy();
    edit(dir, 'campus_desk.network.json', (n) => { n.tools = [{ name: 'campus_desk', function: { description: 'x' }, instructions: 'x' }]; });
    edit(dir, 'agent-manifest.json', (m) => { delete m.actions; });
    expect(await failing(dir)).toEqual(['agents.two']);
  });
  it('a peer that is not allowed', async () => {
    const dir = copy();
    edit(dir, 'agent-manifest.json', (m) => { m.allowed_peers = []; });
    expect(await failing(dir)).toEqual(['peers.listed']);
  });
  it('an allowed peer with a path', async () => {
    const dir = copy();
    edit(dir, 'agent-manifest.json', (m) => { m.allowed_peers = ['http://localhost:5174/library_desk']; });
    expect((await failing(dir)).sort()).toEqual(['peers.listed', 'peers.shape']);
  });
  it('a bring-your-own-key router that is plain http on a public host', async () => {
    const dir = copy();
    edit(dir, 'agent-manifest.json', (m) => { m.llm_router.byok_router = 'http://router.example/v1'; });
    expect(await failing(dir)).toEqual(['router.byok']);
  });
  it('no default router', async () => {
    const dir = copy();
    edit(dir, 'agent-manifest.json', (m) => { delete m.llm_router; });
    expect(await failing(dir)).toEqual(['router.default']);
  });
  it('a missing runtime file', async () => {
    const dir = copy();
    rmSync(join(dir, 'runtime', 'agentic-runtime.js'));
    expect(await failing(dir)).toEqual(['runtime.file']);
  });
  it('a key published by mistake', async () => {
    const dir = copy();
    edit(dir, 'agent-manifest.json', (m) => { m.note = 'AIza' + 'SyA'.repeat(12); });
    expect(await failing(dir)).toEqual(['secrets']);
  });
  it('warns, does not fail, when a private field may leave', async () => {
    const dir = copy();
    edit(dir, 'campus_desk.network.json', (n) => { n.tools[0].allow.to_downstream.sly_data = ['student_year']; });
    const rep = await checkSite(folderSource(dir));
    expect(rep.ok).toBe(true);
    expect(rep.results.find((r) => r.id === 'private.deny-by-default')).toMatchObject({ status: 'warn' });
  });
  it('binding to an unknown agent', async () => {
    const dir = copy();
    edit(dir, 'agent-manifest.json', (m) => { m.actions.bindings.ghost_agent = ['website_x']; });
    expect(await failing(dir)).toEqual(['actions.bound']);
  });
});
