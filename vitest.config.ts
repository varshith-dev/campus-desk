import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@aw/runtime': fileURLToPath(new URL('./src/runtime/index.ts', import.meta.url)) } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 20000 },
});
