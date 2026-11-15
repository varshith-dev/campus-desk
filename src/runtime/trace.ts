// Observable execution without secrets (spec section 5, last bullet).
import type { RuntimeEvent } from './types';

const SECRET_KEY_NAMES = /^(api[-_]?key|authorization|apikey|token|secret|password)$/i;

/** Replace every known secret and every secret-looking field in a value, deeply. */
export function scrub<T>(value: T, secrets: string[] = []): T {
  const live = secrets.filter((s) => s && s.length >= 4);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      let out = v;
      for (const s of live) out = out.split(s).join('[key hidden]');
      return out.replace(/Bearer\s+[A-Za-z0-9._-]{8,}/g, 'Bearer [key hidden]');
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = SECRET_KEY_NAMES.test(k) ? '[key hidden]' : walk(val);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

export class Trace {
  readonly events: RuntimeEvent[] = [];
  private listeners: Array<(e: RuntimeEvent) => void> = [];
  constructor(private secrets: () => string[] = () => []) {}

  on(fn: (e: RuntimeEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  emit(event: RuntimeEvent): void {
    const clean = scrub(event, this.secrets());
    this.events.push(clean);
    for (const l of this.listeners) l(clean);
  }
}
