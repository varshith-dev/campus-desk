import { runChecks } from './checks';
import type { Manifest } from '@aw/runtime';

export async function initAgents(base: string): Promise<void> {
  for (const n of document.querySelectorAll<HTMLElement>('.origin')) n.textContent = location.origin;
  const list = document.getElementById('checks')!;
  try {
    const manifest = (await (await fetch(new URL('agent-manifest.json', base))).json()) as Manifest;
    const entry = manifest.networks[0]!;
    const network = await (await fetch(new URL(entry.hocon, base))).json();
    const runtime = await fetch(new URL('runtime/agentic-runtime.js', base), { method: 'GET' }).then((r) => r.ok, () => false);
    const checks = runChecks(manifest, network, runtime);
    list.replaceChildren(
      ...checks.map((c) => {
        const li = document.createElement('li');
        li.className = c.status;
        li.dataset.mark = c.status === 'pass' ? '\u2713' : c.status === 'fail' ? '\u2717' : '!';
        const sr = document.createElement('span');
        sr.className = 'sr-only';
        sr.textContent = c.status === 'pass' ? 'Passed: ' : c.status === 'fail' ? 'Failed: ' : 'Note: ';
        li.append(sr, c.text);
        return li;
      }),
    );
  } catch (err) {
    list.textContent = `The checks could not run: ${(err as Error).message}`;
  }
}
