// Builds dist-peer/: the sample library site. Static files only, plus one page (study-planner.html) that
// talks to Campus Desk from the visitor's browser with a grant the student approves.
// Usage: tsx scripts/build-peer.ts     env: CAMPUS_DESK_URL (default http://localhost:5173)
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIBRARY_FACTS } from '../network/library-desk';

const root = join(import.meta.dirname, '..');
const out = join(root, 'dist-peer');
const desk = (process.env.CAMPUS_DESK_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'peer/library-desk'), out, { recursive: true });

const facts = LIBRARY_FACTS.map((f) => `<li>${esc(f.replace(/^FACT: /, ''))}</li>`).join('\n');
const head = (title: string, extra = '') => `<!doctype html>
<html lang="en"${extra}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' ${desk}; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'">
<link rel="stylesheet" href="peer.css"><link rel="alternate" type="application/json" href="agent-manifest.json" title="Agent manifest"></head>`;

writeFileSync(
  join(out, 'index.html'),
  `${head('Eastbrook Library Desk (sample peer site)')}
<body><main>
<p class="eyebrow">Sample peer site</p>
<h1>Eastbrook Library Desk</h1>
<p>This is a second, small agentic site. It shows two things. Campus Desk can hand a question to its network, and a tool on this site can use Campus Desk with a student's approval. It publishes <a href="agent-manifest.json">agent-manifest.json</a> and <a href="library_desk.network.json">library_desk.network.json</a>. The library and the institute are made up.</p>
<p><a class="button" href="study-planner.html">Try the study planner</a></p>
<h2>Published facts</h2>
<ul>
${facts}
</ul>
</main></body></html>
`,
);

writeFileSync(
  join(out, 'study-planner.html'),
  `${head('Library study planner (sample peer site)', ` data-desk="${esc(desk)}"`)}
<body><main>
<p class="eyebrow">Sample peer site</p>
<h1>Library study planner</h1>
<p>This page suggests a library day before each of your next exams. To do that it needs your exam dates from Campus Desk, so it asks you first. Open the <strong>Activity</strong> page on Campus Desk, copy your desk code, and paste it here. You then approve or decline on Campus Desk. This page never sees your year, section or fee category.</p>
<div class="row"><label for="code">Desk code</label><input id="code" autocomplete="off" placeholder="EB-XXXXXX" maxlength="9"><button id="go" class="button" type="button">Ask for access</button></div>
<ol id="log" aria-live="polite"></ol>
<section id="result" hidden><h2>Suggested library days</h2><ul id="plans"></ul><p class="note">Based on the library hours published on this site.</p></section>
<p class="note">Campus Desk: <a href="${esc(desk)}/activity">${esc(desk)}</a></p>
<script src="study-planner.js"></script>
</main></body></html>
`,
);

writeFileSync(
  join(out, 'peer.css'),
  `body{margin:0;font-family:system-ui,sans-serif;line-height:1.55;background:#f4efe4;color:#1d1a15}main{max-width:44rem;margin:0 auto;padding:2rem 1rem}h1{margin:.2em 0;font-family:Georgia,serif}.eyebrow{color:#a23b28;font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:.8rem;margin:0}a{color:#2f6f8f}li{margin:.4em 0}.button{display:inline-block;background:#a23b28;color:#fff;border:0;border-radius:6px;padding:.6rem 1rem;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}.button:disabled{opacity:.6}.row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:1rem 0}label{font-weight:600}input{font:1rem ui-monospace,monospace;padding:.55rem .7rem;border:1px solid #8a8070;border-radius:6px;background:#fff;color:inherit;text-transform:uppercase}#log{padding-left:1.2rem}.warn{color:#8a2412}.ok{color:#1d5c3f}.note{color:#5b5446;font-size:.9rem}[hidden]{display:none}@media (prefers-color-scheme:dark){body{background:#12201c;color:#f1ead9}a{color:#8cc3dc}input{background:#0c1714;border-color:#6d7d77}.warn{color:#ff9a86}.ok{color:#8fd6b0}.note{color:#b4b9ae}}
`,
);
const headers = `/*\n  Access-Control-Allow-Origin: *\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`;
writeFileSync(join(out, '_headers'), headers);
writeFileSync(join(out, '.nojekyll'), '');
console.log(`Built dist-peer/ (library peer). Study planner talks to ${desk}`);
