// Optional: offer the read-only site actions to browser agents through WebMCP, when the browser has it.
// WebMCP (navigator.modelContext) is an early browser feature. This function does nothing when it is absent.
import type { SiteAction } from './types';

interface ModelContextLike {
  registerTool?: (tool: {
    name: string;
    description: string;
    inputSchema: unknown;
    execute: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  }) => unknown;
}

export function registerWebMcp(
  actions: SiteAction[],
  getSly: () => Record<string, unknown>,
  origin: string,
  nav: { modelContext?: ModelContextLike } = globalThis.navigator as unknown as { modelContext?: ModelContextLike },
): string[] {
  const mc = nav?.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return [];
  const done: string[] = [];
  for (const a of actions) {
    if (a.effect !== 'read') continue; // writes need the runtime's own confirmation, so they are not offered here
    try {
      mc.registerTool({
        name: a.name,
        description: a.purpose,
        inputSchema: a.schema,
        execute: async (args) => {
          const result = await a.handler(args as never, { sly: Object.freeze({ ...getSly() }), origin });
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        },
      });
      done.push(a.name);
    } catch {
      /* already registered, or the browser refused: skip */
    }
  }
  return done;
}
