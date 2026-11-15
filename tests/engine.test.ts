import { describe, expect, it, vi } from 'vitest';
import { AgentRuntime, Trace } from '@aw/runtime';
import type { NetworkDef, SiteAction } from '@aw/runtime';
import { basicManifest, callTools, say, ScriptedLlm, tc, twoAgent } from './helpers';

const consent = async () => 'deny' as const;
const noConfirm = async () => false;

function make(over: Partial<ConstructorParameters<typeof AgentRuntime>[0]> & { network?: NetworkDef }) {
  const trace = new Trace();
  const rt = new AgentRuntime({
    manifest: basicManifest(),
    siteOrigin: 'https://site.example',
    network: twoAgent(),
    networkName: 'home',
    frontMan: 'front',
    llm: new ScriptedLlm([say('hi')]),
    consent,
    confirm: noConfirm,
    trace,
    ...over,
  });
  return { rt, trace };
}

const readAction: SiteAction = {
  name: 'lookup',
  purpose: 'Looks something up',
  effect: 'read',
  schema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
  handler: (args, ctx) => ({ got: args.q, sawSly: ctx.sly.secret }),
};

describe('agent loop', () => {
  it('runs the front agent and returns its answer', async () => {
    const { rt } = make({ llm: new ScriptedLlm([say('Hello there')]) });
    expect((await rt.run('hi')).text).toBe('Hello there');
  });

  it('delegates to a local agent and returns through the tool-result path', async () => {
    const llm = new ScriptedLlm([callTools(tc('helper', { request: 'do it' })), say('helper said ok'), say('front done')]);
    const { rt } = make({ llm });
    const res = await rt.run('go');
    expect(res.text).toBe('front done');
    const helperTurn = llm.seen.find((r) => r.agent === 'helper')!;
    expect(helperTurn.messages.at(-1)!.content).toBe('do it');
    const frontSecond = llm.seen.filter((r) => r.agent === 'front')[1]!;
    expect(frontSecond.messages.at(-1)).toMatchObject({ role: 'tool', content: 'helper said ok' });
  });

  it('refuses to start when the network is invalid, before any model call', async () => {
    const bad = twoAgent(['ghost']);
    const llm = new ScriptedLlm([say('never')]);
    const { rt, trace } = make({ network: bad, llm });
    await expect(rt.run('x')).rejects.toThrow(/did not load/);
    expect(llm.seen).toHaveLength(0);
    expect(trace.events.some((e) => e.type === 'error' && e.where === 'validate')).toBe(true);
  });

  it('tells the model when it calls a tool it was not given', async () => {
    const llm = new ScriptedLlm([callTools(tc('secret_tool', {})), say('ok')]);
    const { rt } = make({ llm });
    await rt.run('x');
    expect(llm.seen[1]!.messages.at(-1)!.content).toMatch(/not a tool this agent may call/);
  });

  it('reports invalid JSON arguments without running anything', async () => {
    const llm = new ScriptedLlm([callTools(tc('helper', '{not json')), say('ok')]);
    const { rt } = make({ llm });
    await rt.run('x');
    expect(llm.seen[1]!.messages.at(-1)!.content).toMatch(/not valid JSON/);
    expect(llm.seen.some((r) => r.agent === 'helper')).toBe(false);
  });

  it('keeps history bounded', async () => {
    const llm = new ScriptedLlm([say('a')]);
    const { rt } = make({ llm, limits: { maxHistory: 2 } });
    const history = Array.from({ length: 6 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `m${i}` }));
    await rt.run('now', history);
    expect(llm.seen[0]!.messages.filter((m) => m.role !== 'system')).toHaveLength(3);
  });
});

describe('site actions', () => {
  const bindings = { front: ['website_lookup'] };

  it('runs a bound read action, validates arguments, and passes private context to the handler only', async () => {
    const llm = new ScriptedLlm([callTools(tc('website_lookup', { q: 'x' })), say('done')]);
    const { rt } = make({ llm, actions: [readAction], actionBindings: bindings, sly: { secret: 'S3CRET-SECTION' } });
    await rt.run('go');
    const result = JSON.parse(llm.seen[1]!.messages.at(-1)!.content!);
    expect(result).toEqual({ status: 'succeeded', result: { got: 'x', sawSly: 'S3CRET-SECTION' } });
    // The private value reaches the handler, and appears in the result because the handler chose to echo it here.
    // It is never put in a prompt by the runtime:
    for (const req of llm.seen.slice(0, 1)) expect(JSON.stringify(req.messages)).not.toContain('S3CRET-SECTION');
  });

  it('rejects arguments that break the schema and runs nothing', async () => {
    const handler = vi.fn();
    const llm = new ScriptedLlm([callTools(tc('website_lookup', {})), say('done')]);
    const { rt } = make({ llm, actions: [{ ...readAction, handler }], actionBindings: bindings });
    await rt.run('go');
    expect(handler).not.toHaveBeenCalled();
    expect(llm.seen[1]!.messages.at(-1)!.content).toMatch(/q is required/);
  });

  it('does not offer an action that is not bound to the agent', async () => {
    const llm = new ScriptedLlm([say('x')]);
    const { rt } = make({ llm, actions: [readAction], actionBindings: { helper: ['website_lookup'] } });
    await rt.run('go');
    expect(llm.seen[0]!.tools.map((t) => t.function.name)).not.toContain('website_lookup');
  });

  const writeAction = (handler: SiteAction['handler']): SiteAction => ({ name: 'save', purpose: 'Saves', effect: 'write', schema: { type: 'object', properties: { v: { type: 'string' } }, required: ['v'] }, handler, describe: (a) => `Save ${a.v}` });

  it('asks the visitor before a write and does nothing when declined', async () => {
    const handler = vi.fn();
    const confirm = vi.fn(async () => false);
    const llm = new ScriptedLlm([callTools(tc('website_save', { v: 'a' })), say('ok')]);
    const { rt } = make({ llm, actions: [writeAction(handler)], actionBindings: { front: ['website_save'] }, confirm });
    await rt.run('go');
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ action: 'website_save', effect: 'write', text: 'Save a', args: { v: 'a' } }));
    expect(handler).not.toHaveBeenCalled();
    expect(JSON.parse(llm.seen[1]!.messages.at(-1)!.content!).status).toBe('cancelled');
  });

  it('runs a confirmed write and emits a receipt bound to the request id', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const llm = new ScriptedLlm([callTools(tc('website_save', { v: 'a' })), say('ok')]);
    const { rt, trace } = make({ llm, actions: [writeAction(handler)], actionBindings: { front: ['website_save'] }, confirm: async () => true });
    await rt.run('go');
    const r = trace.events.find((e) => e.type === 'receipt');
    expect(r).toMatchObject({ status: 'succeeded', action: 'website_save' });
    expect(JSON.parse(llm.seen[1]!.messages.at(-1)!.content!)).toMatchObject({ status: 'succeeded', requestId: (r as any).requestId });
  });

  it('reports a timed-out write as unknown and never repeats it', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const handler = vi.fn(async () => {
      throw timeout;
    });
    const llm = new ScriptedLlm([callTools(tc('website_save', { v: 'a' })), callTools(tc('website_save', { v: 'a' })), say('ok')]);
    const { rt } = make({ llm, actions: [writeAction(handler)], actionBindings: { front: ['website_save'] }, confirm: async () => true });
    await rt.run('go');
    expect(JSON.parse(llm.seen[1]!.messages.at(-1)!.content!).status).toBe('unknown');
    expect(JSON.parse(llm.seen[2]!.messages.at(-1)!.content!).status).toBe('unknown');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('reports a failed write as failed, not as success', async () => {
    const llm = new ScriptedLlm([callTools(tc('website_save', { v: 'a' })), say('ok')]);
    const { rt } = make({
      llm,
      actions: [
        writeAction(async () => {
          throw new Error('disk full');
        }),
      ],
      actionBindings: { front: ['website_save'] },
      confirm: async () => true,
    });
    await rt.run('go');
    expect(JSON.parse(llm.seen[1]!.messages.at(-1)!.content!)).toMatchObject({ status: 'failed', note: 'disk full' });
  });
});

describe('limits', () => {
  it('stops an agent that keeps calling tools after its step limit', async () => {
    const loop = Array.from({ length: 10 }, () => callTools(tc('helper', { request: 'again' })));
    const llm = new ScriptedLlm([...loop.flatMap((c) => [c, say('h')])]);
    const { rt, trace } = make({ llm, limits: { maxSteps: 2 } });
    const res = await rt.run('go');
    expect(res.partial).toBe(true);
    expect(trace.events.some((e) => e.type === 'limit' && e.name === 'maxSteps')).toBe(true);
  });

  it('stops when there are too many agent calls in one question', async () => {
    const llm = new ScriptedLlm([callTools(tc('helper', { request: '1' }), tc('helper', { request: '2' }), tc('helper', { request: '3' })), say('a'), say('b'), say('c'), say('end')]);
    const { rt, trace } = make({ llm, limits: { maxAgentCalls: 2 } });
    await rt.run('go');
    expect(trace.events.some((e) => e.type === 'limit' && e.name === 'maxAgentCalls')).toBe(true);
  });

  it('stops on the time limit', async () => {
    let t = 0;
    const llm = new ScriptedLlm([
      () => {
        t += 100_000;
        return { content: '', tool_calls: [tc('helper', { request: 'x' })] };
      },
      say('h'),
      say('end'),
    ]);
    const { rt, trace } = make({ llm, now: () => t, limits: { maxMs: 50_000 } });
    const res = await rt.run('go');
    expect(res.partial).toBe(true);
    expect(trace.events.some((e) => e.type === 'limit' && e.name === 'maxMs')).toBe(true);
  });

  it('a network can ask for lower limits but never higher than the runtime maximum', async () => {
    const net = twoAgent();
    net.limits = { maxAgentCalls: 9999 };
    const loop = Array.from({ length: 60 }, () => callTools(tc('helper', { request: 'again' })));
    const llm = new ScriptedLlm(loop.flatMap((c) => [c, say('h')]));
    const { rt, trace } = make({ llm, network: net, limits: { maxSteps: 12 } });
    await rt.run('go');
    expect(trace.events.filter((e) => e.type === 'agent_start').length).toBeLessThanOrEqual(41);
  });
});
