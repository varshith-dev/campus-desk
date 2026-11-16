// Loads the published runtime file, /runtime/agentic-runtime.js, the same way any other site would. The page does not
// bundle its own copy: the file the manifest names is the file that runs. Only types come from the source tree.
import type * as Runtime from '@/src/runtime';

export type RuntimeModule = typeof Runtime;

let loading: Promise<RuntimeModule> | null = null;

export function loadRuntime(): Promise<RuntimeModule> {
  const url: string = '/runtime/agentic-runtime.js';
  loading ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<RuntimeModule>;
  return loading;
}
