// House style check: no em dashes, no banned names, no buzzwords anywhere in source or docs.
// Run: npm run check:style
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-peer', 'agent-tools']);
const SKIP_FILES = new Set(['package-lock.json']);
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.ico', '.webp', '.woff', '.woff2']);
const EM_DASH = String.fromCharCode(0x2014);

// Words that must never appear in this project. Stored reversed so this file does not contain them.
const rev = (w) => [...w].reverse().join('');
const BANNED = ['ugulet', 'syawkcah', 'sneqo', 'duolc ohce', 'ogvurt', 'tahcxert', 'ia rof mv duolc', 'oiduts etile', 'shcnuba'].map(rev);
const BUZZ = ['leverage', 'seamless', 'revolutionary', 'cutting-edge', 'game-changing', 'game changer', 'supercharge', 'empower', 'synergy', 'next-generation', 'best-in-class', 'unlock the power', 'state-of-the-art', 'paradigm', 'robust', 'holistic', 'delve', 'tapestry'];

export function scan() {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full);
      if (statSync(full).isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(full);
        continue;
      }
      if (SKIP_FILES.has(rel) || BINARY.has(extname(name).toLowerCase())) continue;
      if (rel === 'scripts/check-style.mjs') continue;
      const text = readFileSync(full, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (line.includes(EM_DASH)) hits.push(`${rel}:${i + 1} (em dash)`);
        const lower = line.toLowerCase();
        for (const w of BANNED) if (lower.includes(w)) hits.push(`${rel}:${i + 1} (banned name)`);
        if (rel !== 'LICENSE') for (const w of BUZZ) if (lower.includes(w)) hits.push(`${rel}:${i + 1} (buzzword "${w}")`);
      });
    }
  };
  walk(root);
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hits = scan();
  if (hits.length) {
    console.error(`Found ${hits.length} style problem(s). Fix them:\n${hits.join('\n')}`);
    process.exit(1);
  }
  console.log('Style check passed: no em dashes, banned names or buzzwords.');
}
