// Builds both sites into dist/ (Campus Desk) and dist-peer/ (the sample library peer).
// Usage: tsx scripts/build.ts [--no-peer]    env: PEER_LIBRARY_URL
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { LIBRARY_FACTS } from '../network/library-desk';
import type { CampusData } from '../src/data/model';
import { agentsPage, askPage, feesPage, homePage, defaultView, noticesPage, timetablePage } from '../src/site/pages';
import { esc } from '../src/site/render';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist');
const peerDist = join(root, 'dist-peer');
const noPeer = process.argv.includes('--no-peer');
const peerUrl = noPeer ? undefined : (process.env.PEER_LIBRARY_URL ?? 'http://localhost:5174/library_desk');

// 1. Manifests and networks.
const r = spawnSync(process.execPath, ['--import', 'tsx', join(root, 'scripts/build-network.ts'), ...(noPeer ? ['--no-peer'] : [])], { cwd: root, stdio: 'inherit', env: process.env });
if (r.status !== 0) process.exit(r.status ?? 1);

rmSync(dist, { recursive: true, force: true });
rmSync(peerDist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'public'), dist, { recursive: true });
cpSync(join(root, 'src/site/styles.css'), join(dist, 'styles.css'));

// 2. Browser runtime as its own published file, and the site script that imports it.
await build({
  entryPoints: [join(root, 'src/runtime/index.ts')],
  outfile: join(dist, 'runtime/agentic-runtime.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: false,
  banner: { js: '// Campus Desk browser runtime. Apache-2.0. Source: src/runtime/. Follows the Open Agentic Web MVP profile 0.2.' },
});
await build({
  entryPoints: [join(root, 'src/site/main.ts')],
  outfile: join(dist, 'js/site.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  plugins: [
    {
      name: 'runtime-external',
      setup(b) {
        b.onResolve({ filter: /^@aw\/runtime$/ }, () => ({ path: '../runtime/agentic-runtime.js', external: true }));
      },
    },
  ],
});

// 3. Pages, pre-rendered for the default class.
const read = (f: string) => JSON.parse(readFileSync(join(root, 'public/data', f), 'utf8'));
const data: CampusData = { department: read('department.json'), timetable: read('timetable.json'), notices: read('notices.json').notices, fees: read('fees.json'), exams: read('exams.json') };
const view = defaultView(data);
const net = JSON.parse(readFileSync(join(dist, 'campus_desk.network.json'), 'utf8'));
const manifestOut = JSON.parse(readFileSync(join(dist, 'agent-manifest.json'), 'utf8'));
const pages: Record<string, string> = {
  'index.html': homePage(view),
  'timetable.html': timetablePage(view),
  'notices.html': noticesPage(view),
  'fees-exams.html': feesPage(view),
  'ask.html': askPage(view),
  'agents.html': agentsPage(view, net, peerUrl, manifestOut.actions.bindings),
};
for (const [name, html] of Object.entries(pages)) writeFileSync(join(dist, name), html);

const headers = `/*
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
`;
writeFileSync(join(dist, '_headers'), headers);
writeFileSync(join(dist, '.nojekyll'), '');

// 4. The sample library peer: a static site that publishes files only.
mkdirSync(peerDist, { recursive: true });
cpSync(join(root, 'peer/library-desk'), peerDist, { recursive: true });
const facts = LIBRARY_FACTS.map((f) => `<li>${esc(f.replace(/^FACT: /, ''))}</li>`).join('\n');
writeFileSync(
  join(peerDist, 'index.html'),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Eastbrook Library Desk (sample peer site)</title>
<link rel="stylesheet" href="peer.css"><link rel="alternate" type="application/json" href="agent-manifest.json" title="Agent manifest"></head>
<body><main>
<p class="eyebrow">Sample peer site</p>
<h1>Eastbrook Library Desk</h1>
<p>This is a second, tiny agentic site used to show that Campus Desk can hand a question to another site. It publishes <a href="agent-manifest.json">agent-manifest.json</a> and <a href="library_desk.network.json">library_desk.network.json</a>. Other sites run that network in their own browser. The library and the institute are made up.</p>
<h2>Published facts</h2>
<ul>
${facts}
</ul>
</main></body></html>
`,
);
writeFileSync(
  join(peerDist, 'peer.css'),
  `body{margin:0;font-family:system-ui,sans-serif;line-height:1.55;background:#f6f7fb;color:#14181f}main{max-width:44rem;margin:0 auto;padding:2rem 1rem}h1{margin:.2em 0}.eyebrow{color:#1d4ed8;font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:.8rem;margin:0}a{color:#1d4ed8}li{margin:.4em 0}@media (prefers-color-scheme:dark){body{background:#0e1218;color:#eef1f6}a,.eyebrow{color:#8fb0ff}}
`,
);
writeFileSync(join(peerDist, '_headers'), headers);
writeFileSync(join(peerDist, '.nojekyll'), '');
if (!existsSync(join(dist, 'index.html'))) throw new Error('build failed');
console.log(`Built dist/ (Campus Desk) and dist-peer/ (library peer). Peer link: ${peerUrl ?? 'none'}`);
