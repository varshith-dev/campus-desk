import { describe, expect, it } from 'vitest';
import { checkSchema, validateManifest, validateNetwork } from '@aw/runtime';
import { basicManifest, twoAgent } from './helpers';

describe('checkSchema', () => {
  const schema = {
    type: 'object',
    properties: { title: { type: 'string', minLength: 1, maxLength: 5 }, n: { type: 'integer', minimum: 1, maximum: 3 }, kind: { type: 'string', enum: ['a', 'b'] }, d: { type: 'string', pattern: '^\\d{4}$' } },
    required: ['title'],
    additionalProperties: false,
  };
  it('accepts a good value', () => expect(checkSchema(schema, { title: 'ok', n: 2, kind: 'a', d: '2026' })).toEqual([]));
  it('names every problem', () => {
    const errs = checkSchema(schema, { n: 9, kind: 'z', d: 'x', extra: 1 });
    expect(errs.join(' | ')).toMatch(/title is required/);
    expect(errs.join(' | ')).toMatch(/at most 3/);
    expect(errs.join(' | ')).toMatch(/one of/);
    expect(errs.join(' | ')).toMatch(/does not match/);
    expect(errs.join(' | ')).toMatch(/extra is not allowed/);
  });
  it('checks types', () => expect(checkSchema({ type: 'integer' }, 1.5)).toHaveLength(1));
});

describe('validateNetwork', () => {
  it('accepts a two-agent network with a valid front agent', () => expect(validateNetwork(twoAgent(), 'front').ok).toBe(true));
  it('rejects a missing front agent', () => expect(validateNetwork(twoAgent(), 'nope').errors.join()).toMatch(/front agent "nope"/));
  it('rejects duplicate agent names', () => {
    const n = twoAgent();
    n.tools.push({ ...n.tools[1]! });
    expect(validateNetwork(n, 'front').errors.join()).toMatch(/duplicate agent name "helper"/);
  });
  it('rejects a reference to a missing agent', () => {
    const n = twoAgent(['ghost']);
    expect(validateNetwork(n, 'front').errors.join()).toMatch(/missing agent "ghost"/);
  });
  it('rejects coded tools (class, command, toolbox)', () => {
    const n = twoAgent();
    (n.tools[1] as any).class = 'coded_tools.Thing';
    expect(validateNetwork(n, 'front').errors.join()).toMatch(/executable definition/);
  });
  it('rejects a composition cycle among local agents', () => {
    const n = twoAgent();
    n.tools[1]!.tools = ['front'];
    expect(validateNetwork(n, 'front').errors.join()).toMatch(/composition cycle: front -> helper -> front/);
  });
  it('allows the same agent to be called by two parents (not a cycle)', () => {
    const n = twoAgent(['a']);
    n.tools.push({ name: 'a', function: { description: 'a' }, instructions: 'a', tools: ['helper'] });
    expect(validateNetwork(n, 'front').ok).toBe(true);
  });
  it('rejects non-object input and empty tools', () => {
    expect(validateNetwork(null).ok).toBe(false);
    expect(validateNetwork({ tools: [] }).ok).toBe(false);
  });
  it('rejects an MCP url that is not http or https', () => {
    const n = twoAgent([{ url: 'file:///etc/passwd', tools: ['x'] }]);
    expect(validateNetwork(n, 'front').errors.join()).toMatch(/not http or https/);
  });
});

describe('validateManifest', () => {
  it('accepts a manifest with name, front_man and hocon', () => expect(validateManifest(basicManifest()).ok).toBe(true));
  it('requires name, front_man and hocon', () => {
    const m = basicManifest({ networks: [{ name: 'x' } as any] });
    const v = validateManifest(m);
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/front_man is required/);
    expect(v.errors.join()).toMatch(/hocon is required/);
  });
  it('rejects duplicate network names', () => {
    const m = basicManifest();
    m.networks.push({ ...m.networks[0]! });
    expect(validateManifest(m).errors.join()).toMatch(/duplicate network name/);
  });
});
