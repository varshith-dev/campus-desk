// Bundles the browser runtime into one ES module and publishes it at /runtime/agentic-runtime.js.
// The manifest names this file (runtime.file) and the Ask page loads it, so the file that is published is the file that runs.
import { build } from 'esbuild';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
await build({
  entryPoints: [join(root, 'src/runtime/index.ts')],
  outfile: join(root, 'public/runtime/agentic-runtime.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: false,
  banner: { js: '// Campus Desk browser runtime. Apache-2.0. Source: src/runtime/. Follows the Open Agentic Web MVP profile 0.2.' },
});
console.log('Wrote public/runtime/agentic-runtime.js');
