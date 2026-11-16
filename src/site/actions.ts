// Site actions as the browser runtime sees them (spec sections 2.1 and 3.1): a name, a purpose, an input schema,
// an effect and a handler. The handlers hold no data. Each one hands the call to `call`, which in the page is a
// request to this site's own server (/api/actions/<name>) and in the tests is the same server code run directly.
// Year, section and fee category stay on the server, in the student's record, so they never pass through a prompt.
import type { SiteAction } from '@aw/runtime';
import { formatDate } from '../data/model';
import type { ToolSpec } from './catalog';

export type ToolCall = (name: string, args: Record<string, unknown>, opts: { confirmed: boolean }) => Promise<unknown>;

export function createActions(catalog: ToolSpec[], call: ToolCall): SiteAction[] {
  return catalog.map((t): SiteAction => {
    const action: SiteAction = {
      name: t.name,
      purpose: t.purpose,
      schema: t.schema,
      effect: t.effect,
      // The runtime asks the student to confirm a write before it runs this handler.
      handler: (args) => call(t.name, args as Record<string, unknown>, { confirmed: t.effect === 'write' }),
    };
    if (t.name === 'save_reminder') {
      action.describe = (a) => {
        const r = a as { title: string; date: string; time?: string };
        return `Save the reminder "${r.title}" for ${formatDate(r.date)}${r.time ? ` at ${r.time}` : ''} to your Campus Desk account.`;
      };
    }
    return action;
  });
}

/** The private context names the front agent carries. The values stay on the server. */
export const SLY_FIELDS = ['student_year', 'student_section', 'fee_category'] as const;
