import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  resolve: { alias: { '@aw/runtime': at('./src/runtime/index.ts'), '@': at('./') } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 30000 },
});
