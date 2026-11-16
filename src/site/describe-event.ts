// Turns a runtime event into one line for the "What ran" list. Keys never appear: the runtime scrubs them first.
import type { RuntimeEvent } from '@aw/runtime';

export interface EventLine {
  kind: string;
  text: string;
  tone?: 'bad' | 'warn' | 'good';
}

export function describeEvent(e: RuntimeEvent): EventLine | null {
  switch (e.type) {
    case 'router':
      return { kind: 'Model', text: e.label };
    case 'agent_start':
      return { kind: 'Agent', text: `${e.agent} started${e.network ? ` (${e.network})` : ''}` };
    case 'tool_call':
      return { kind: e.kind === 'action' ? 'Action' : e.kind === 'peer' ? 'Other site' : 'Hand off', text: `${e.agent} calls ${e.tool}` };
    case 'tool_result':
      return e.ok ? null : { kind: 'Failed', text: `${e.tool}: ${e.summary}`, tone: 'bad' };
    case 'consent':
      return { kind: 'Consent', text: `${e.origin}: ${e.decision}`, tone: e.decision === 'denied' ? 'bad' : undefined };
    case 'confirm':
      return { kind: 'Confirm', text: `${e.action}: ${e.decision}`, tone: e.decision === 'declined' ? 'warn' : 'good' };
    case 'receipt':
      return { kind: 'Receipt', text: `${e.action} ${e.status} (${e.requestId})`, tone: e.status === 'succeeded' ? 'good' : 'bad' };
    case 'peer_loaded':
      return { kind: 'Other site', text: `Loaded ${e.network} from ${e.origin}, ${e.agents} agents, running in this browser` };
    case 'private_context':
      return { kind: 'Private', text: e.withheld.length ? `Kept from the other site: ${e.withheld.join(', ')}` : 'Nothing private to hold back' };
    case 'limit':
      return { kind: 'Limit', text: e.detail, tone: 'warn' };
    case 'error':
      return { kind: 'Error', text: e.message, tone: 'bad' };
    default:
      return null;
  }
}
